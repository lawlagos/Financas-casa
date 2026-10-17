// Pudim: custo dos ingredientes (pela última nota ou pelo preço cadastrado), custo das receitas
// e estoque de pudins prontos (produção, venda e perda), com validade e saída pelo mais antigo primeiro.
import { toCents } from './money.js';
import { addDays, businessWeekStart } from './dates.js';
import { chaveProduto, produtoDoItem } from './mercado.js';

export const TIPOS_MOVIMENTO = ['producao', 'venda', 'perda'];
export const VALIDADE_PADRAO = 5;
// Alerta quando o custo da receita sobe isso ou mais desde que o preço foi definido.
export const ALERTA_CUSTO = 0.05;
// iFood: a taxa sai do valor da venda; o padrão vem da conta dela e muda em Ajustes.
export const TAXA_IFOOD_PADRAO = 26.2;
export const CANAIS = { direta: 'Venda direta', ifood: 'iFood' };
export const CATEGORIA_TAXA_IFOOD = 'cat-taxa-ifood';
export const CONTA_IFOOD = 'ifood';

const BASE = { g: 'g', kg: 'g', ml: 'ml', l: 'ml', un: 'un' };
const FATOR = { g: 1, kg: 1000, ml: 1, l: 1000, un: 1 };

export function ingredientesDe(receita) {
  const v = receita?.ingredientes;
  if (Array.isArray(v)) return v;
  try {
    const lista = JSON.parse(v || '[]');
    return Array.isArray(lista) ? lista : [];
  } catch {
    return [];
  }
}

// Custo (centavos) de 1 g, 1 ml ou 1 unidade do insumo. Usa a nota mais recente do produto
// quando ela é mais nova que o preço digitado no cadastro.
export function custoInsumo(insumo, itens = []) {
  const base = BASE[insumo.unidade] || 'un';
  // Item por unidade sem conteúdo informado (embalagem, ovo avulso) conta como 1 por embalagem.
  const qtdEmb = (Number(insumo.qtd_embalagem) || (base === 'un' ? 1 : 0)) * (FATOR[insumo.unidade] || 1);
  // Preço zero digitado (água da torneira) é preço, não falta de preço.
  const temPreco = insumo.preco_embalagem !== '' && insumo.preco_embalagem !== null && insumo.preco_embalagem !== undefined && Number(insumo.preco_embalagem) >= 0;
  const manual = temPreco && qtdEmb > 0
    ? { porBase: toCents(insumo.preco_embalagem) / qtdEmb, fonte: 'cadastro', data: insumo.data_preco || '' }
    : null;
  const chave = chaveProduto(insumo.produto || insumo.nome);
  const nota = (itens || [])
    .filter((it) => it.valor && it.data && chaveProduto(produtoDoItem(it)) === chave)
    .sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : 0))
    .map((it) => {
      const precoUn = toCents(it.valor) / (Number(it.quantidade) || 1);
      const u = String(it.tamanho_unidade || '').toLowerCase();
      const vendidoPor = String(it.unidade || '').toLowerCase();
      // Tamanho da embalagem na nota; item vendido por peso (2 kg de açúcar) já é preço por kg; senão, a embalagem do cadastro.
      const tam = Number(it.tamanho) > 0 && BASE[u] === base ? Number(it.tamanho) * FATOR[u]
        : vendidoPor !== 'un' && BASE[vendidoPor] === base ? FATOR[vendidoPor]
          : qtdEmb;
      return tam > 0 ? { porBase: precoUn / tam, fonte: 'nota', data: it.data, mercado: it.mercado || '', marca: it.marca || '' } : null;
    })
    .find(Boolean);
  if (nota && (!manual || !manual.data || nota.data >= manual.data)) return { ...nota, base };
  if (manual) return { ...manual, base };
  return { porBase: null, fonte: null, data: '', base };
}

// Custo da receita inteira e por unidade (centavos), com o que faltou preço.
export function custoReceita(receita, insumosPorId, itens = []) {
  const linhas = ingredientesDe(receita).map((x) => {
    const insumo = insumosPorId[x.insumo_id];
    const c = insumo ? custoInsumo(insumo, itens) : { porBase: null };
    const qtd = Number(x.quantidade) || 0;
    return { insumo, quantidade: qtd, custo: c.porBase === null ? null : Math.round(c.porBase * qtd), preco: c };
  });
  const total = linhas.reduce((s, l) => s + (l.custo || 0), 0);
  const rendimento = Math.max(1, Number(receita.rendimento) || 1);
  const porUnidade = Math.round(total / rendimento);
  const preco = toCents(receita.preco_venda || 0);
  const ref = toCents(receita.custo_ref || 0);
  return {
    linhas,
    total,
    porUnidade,
    faltando: linhas.filter((l) => l.custo === null && l.quantidade > 0).map((l) => l.insumo?.nome || 'ingrediente apagado'),
    preco,
    lucroUnidade: preco ? preco - porUnidade : null,
    margem: preco ? (preco - porUnidade) / preco : null,
    subiu: ref > 0 && porUnidade >= ref * (1 + ALERTA_CUSTO) ? (porUnidade - ref) / ref : 0,
  };
}

// Repassa os movimentos em ordem e devolve os lotes que sobraram e o custo de cada venda/perda.
// `custoAtual(receita_id)` dá o custo de hoje para saídas sem produção registrada antes.
// Venda sai do que ainda está na validade, o que vence primeiro; perda por vencimento sai do que já venceu.
// No mesmo dia, a produção conta antes das vendas e perdas, em qualquer ordem que tenham sido lançadas.
export function processarEstoque(movimentos, custoAtual = () => 0) {
  const peso = (m) => (m.tipo === 'producao' ? 0 : 1);
  const ordem = [...movimentos].sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : peso(a) - peso(b) || (String(a.criado_em || '') < String(b.criado_em || '') ? -1 : 1)));
  const lotes = [];
  const saidas = {};
  for (const m of ordem) {
    const qtd = Number(m.quantidade) || 0;
    if (m.tipo === 'producao') {
      lotes.push({ mov: m, receita_id: m.receita_id, restante: qtd, custo: toCents(m.custo_unitario || 0), validade: m.validade || m.data });
      continue;
    }
    let falta = qtd;
    let custo = 0;
    const vencido = (l) => (l.validade < m.data ? 1 : 0);
    const primeiroVencidos = m.tipo === 'perda' && (m.obs || 'vencido') === 'vencido';
    const fila = lotes
      .filter((l) => l.receita_id === m.receita_id && l.restante)
      .sort((a, b) => (primeiroVencidos ? vencido(b) - vencido(a) : vencido(a) - vencido(b)) || (a.validade < b.validade ? -1 : a.validade > b.validade ? 1 : 0));
    for (const l of fila) {
      if (!falta) break;
      const usa = Math.min(l.restante, falta);
      l.restante -= usa;
      falta -= usa;
      custo += usa * l.custo;
    }
    if (falta) custo += falta * custoAtual(m.receita_id);
    saidas[m.id] = { custo, semProducao: falta };
  }
  return { lotes: lotes.filter((l) => l.restante > 0), saidas };
}

// O que está pronto agora, por receita: quantidade, quanto vale vendido, custo, vencidos e o que vence logo.
export function estoqueAtual(lotes, receitasPorId, hoje) {
  const por = {};
  for (const l of lotes) {
    const r = receitasPorId[l.receita_id];
    const x = (por[l.receita_id] ||= { receita: r, receita_id: l.receita_id, quantidade: 0, custo: 0, potencial: 0, vencidos: 0, custoVencido: 0, venceLogo: 0, proximaValidade: null });
    const vencido = l.validade < hoje;
    const preco = toCents(r?.preco_venda || 0);
    if (vencido) {
      x.vencidos += l.restante;
      x.custoVencido += l.restante * l.custo;
      continue;
    }
    x.quantidade += l.restante;
    x.custo += l.restante * l.custo;
    x.potencial += l.restante * preco;
    if (l.validade <= addDays(hoje, 1)) x.venceLogo += l.restante;
    if (!x.proximaValidade || l.validade < x.proximaValidade) x.proximaValidade = l.validade;
  }
  const lista = Object.values(por).sort((a, b) => b.quantidade - a.quantidade || b.vencidos - a.vencidos);
  const soma = (k) => lista.reduce((s, x) => s + x[k], 0);
  return {
    lista,
    quantidade: soma('quantidade'),
    custo: soma('custo'),
    potencial: soma('potencial'),
    lucroPotencial: soma('potencial') - soma('custo'),
    vencidos: soma('vencidos'),
    custoVencido: soma('custoVencido'),
    venceLogo: soma('venceLogo'),
    semPreco: lista.filter((x) => x.quantidade > 0 && !toCents(x.receita?.preco_venda || 0)).map((x) => x.receita?.nome || '?'),
  };
}

// Semana do pudim (sábado a sexta, a mesma do dízimo): o que produziu, vendeu e perdeu, e o ganho real.
// Ganho real = vendas − taxas do iFood − custo do que foi vendido − custo do que foi perdido.
// `comprasCaixa` é o que saiu do caixa em gastos do Pudim na semana, para comparar.
export function semanaPudim({ movimentos, saidas, lancamentos = [], data }) {
  const inicio = businessWeekStart(data);
  const fim = addDays(inicio, 6);
  const daSemana = movimentos.filter((m) => m.data >= inicio && m.data <= fim);
  const de = (tipo) => daSemana.filter((m) => m.tipo === tipo);
  const qtd = (lista) => lista.reduce((s, m) => s + (Number(m.quantidade) || 0), 0);
  const produzidos = de('producao');
  const vendidos = de('venda');
  const perdidos = de('perda');
  const custoProduzido = produzidos.reduce((s, m) => s + (Number(m.quantidade) || 0) * toCents(m.custo_unitario || 0), 0);
  const valorDe = (m, col) => Math.round((Number(m.quantidade) || 0) * toCents(m[col] || 0));
  const vendas = vendidos.reduce((s, m) => s + valorDe(m, 'preco_unitario'), 0);
  const taxas = vendidos.reduce((s, m) => s + valorDe(m, 'taxa_unitaria'), 0);
  const porCanal = {};
  for (const m of vendidos) {
    const c = (porCanal[m.canal === 'ifood' ? 'ifood' : 'direta'] ||= { quantidade: 0, vendas: 0, taxas: 0 });
    c.quantidade += Number(m.quantidade) || 0;
    c.vendas += valorDe(m, 'preco_unitario');
    c.taxas += valorDe(m, 'taxa_unitaria');
  }
  const custoVendido = vendidos.reduce((s, m) => s + (saidas[m.id]?.custo || 0), 0);
  const custoPerdido = perdidos.reduce((s, m) => s + (saidas[m.id]?.custo || 0), 0);
  const comprasCaixa = lancamentos
    .filter((l) => l.tipo === 'saida' && l.origem === 'Pudim' && l.categoria_id !== CATEGORIA_TAXA_IFOOD && l.data >= inicio && l.data <= fim)
    .reduce((s, l) => s + toCents(l.valor), 0);
  return {
    inicio,
    fim,
    produzidos: qtd(produzidos),
    custoProduzido,
    vendidos: qtd(vendidos),
    vendas,
    taxas,
    porCanal,
    custoVendido,
    perdidos: qtd(perdidos),
    custoPerdido,
    ganho: vendas - taxas - custoVendido - custoPerdido,
    comprasCaixa,
    semProducao: vendidos.concat(perdidos).reduce((s, m) => s + (saidas[m.id]?.semProducao || 0), 0),
  };
}

// Preço de cada unidade no canal (centavos). Sem preço de iFood cadastrado, calcula o que deixa
// o mesmo líquido da venda direta depois da taxa, arredondado para cima em 10 centavos.
export function precoNoCanal(receita, canal, taxaPct = TAXA_IFOOD_PADRAO) {
  const direta = toCents(receita?.preco_venda || 0);
  if (canal !== 'ifood') return { preco: direta, calculado: false };
  const ifood = toCents(receita?.preco_ifood || 0);
  if (ifood > 0) return { preco: ifood, calculado: false };
  if (!direta) return { preco: 0, calculado: false };
  return { preco: Math.ceil(direta / (1 - taxaPct / 100) / 10) * 10, calculado: true };
}

// Totais do carrinho: bruto, taxa do iFood, líquido, custo dos ingredientes e lucro (centavos).
// linhas: [{ quantidade, preco (centavos), custo (centavos por unidade) }]
export function totaisCarrinho(linhas, canal, taxaPct = TAXA_IFOOD_PADRAO) {
  const bruto = linhas.reduce((s, l) => s + Math.round(l.quantidade * l.preco), 0);
  const taxa = canal === 'ifood' ? linhas.reduce((s, l) => s + Math.round(l.quantidade * taxaUnitaria(l.preco, taxaPct)), 0) : 0;
  const custo = linhas.reduce((s, l) => s + Math.round(l.quantidade * (l.custo || 0)), 0);
  return { bruto, taxa, liquido: bruto - taxa, custo, lucro: bruto - taxa - custo, quantidade: linhas.reduce((s, l) => s + l.quantidade, 0) };
}

export function taxaUnitaria(precoCents, taxaPct = TAXA_IFOOD_PADRAO) {
  return Math.round((precoCents * taxaPct) / 100);
}
