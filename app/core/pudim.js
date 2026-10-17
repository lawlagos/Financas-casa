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
export const MARKUP_PADRAO = 0.3;

// Mão de obra e despesas fixas do pudim (Config "custos_pudim"), como na Base Cadastros da planilha:
// { salario, decimo, dias, horas, despesas: [{ nome, valor (por mês), divisor }] }.
// Cada despesa entra como valor ÷ divisor (ex.: água 120 ÷ 6 = 20 é a parte do pudim).
export const CUSTOS_PADRAO = { salario: 0, decimo: 0, dias: 20, horas: 8, despesas: [] };

export function lerCustos(v) {
  let c = v;
  if (typeof v === 'string') {
    try {
      c = JSON.parse(v || '{}');
    } catch {
      c = {};
    }
  }
  c = c && typeof c === 'object' ? c : {};
  return { ...CUSTOS_PADRAO, ...c, despesas: Array.isArray(c.despesas) ? c.despesas : [] };
}

// Valor do minuto de trabalho (salário + 13º) e das despesas fixas, em centavos por minuto.
export function valorMinuto(custos) {
  const c = lerCustos(custos);
  const minutosMes = (Number(c.dias) || 0) * (Number(c.horas) || 0) * 60;
  const despesasMes = c.despesas.reduce((s, d) => s + toCents(d.valor || 0) / (Number(d.divisor) || 1), 0);
  const salarioMes = toCents(c.salario || 0) + toCents(c.decimo || 0);
  return {
    maoDeObra: minutosMes ? salarioMes / minutosMes : 0,
    despesas: minutosMes ? despesasMes / minutosMes : 0,
    despesasMes: Math.round(despesasMes),
    salarioMes,
  };
}

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
  const temPreco = insumo.preco_embalagem !== '' && insumo.preco_embalagem !== null && insumo.preco_embalagem !== undefined && toCents(insumo.preco_embalagem) >= 0;
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
// Custo da receita como na ficha técnica: (A) mão de obra + (B) ingredientes + (C) embalagens + (D) despesas fixas.
// A e D são o tempo de preparo vezes o valor do minuto. "porUnidade" é só B + C (o que vai no pudim);
// "completoUnidade" soma tudo; o preço sugerido é o completo mais o markup.
// Produto de um sabor (ex.: Tradicional 150): usa os ingredientes e o tempo da receita do sabor e soma as
// embalagens do tamanho; o rendimento é o do tamanho (quantas unidades uma receita do sabor dá).
export function custoReceita(receita, insumosPorId, itens = [], custos = null, receitasPorId = {}) {
  const sabor = receita.sabor_id ? receitasPorId[receita.sabor_id] : null;
  const doSabor = sabor ? ingredientesDe(sabor).map((x) => ({ ...x, doSabor: true })) : [];
  const linhas = [...doSabor, ...ingredientesDe(receita)].map((x) => {
    const insumo = insumosPorId[x.insumo_id];
    const c = insumo ? custoInsumo(insumo, itens) : { porBase: null };
    const qtd = Number(x.quantidade) || 0;
    return { insumo, quantidade: qtd, custo: c.porBase === null ? null : Math.round(c.porBase * qtd), preco: c, doSabor: !!x.doSabor };
  });
  const total = linhas.reduce((s, l) => s + (l.custo || 0), 0);
  const ingredientes = linhas.filter((l) => l.insumo?.tipo !== 'embalagem').reduce((s, l) => s + (l.custo || 0), 0);
  const rendimento = Math.max(1, Number(receita.rendimento) || 1);
  const porUnidade = Math.round(total / rendimento);
  const minuto = valorMinuto(custos);
  const tempo = Number(receita.tempo_preparo) || Number(sabor?.tempo_preparo) || 0;
  const maoDeObra = Math.round(tempo * minuto.maoDeObra);
  const despesas = Math.round(tempo * minuto.despesas);
  const completo = total + maoDeObra + despesas;
  const completoUnidade = Math.round(completo / rendimento);
  const vazio = (v) => v === '' || v === undefined || v === null;
  const markup = !vazio(receita.markup) ? Number(receita.markup) || 0 : sabor && !vazio(sabor.markup) ? Number(sabor.markup) || 0 : MARKUP_PADRAO;
  const preco = toCents(receita.preco_venda || 0);
  const ref = toCents(receita.custo_ref || 0);
  return {
    linhas,
    total,
    ingredientes,
    embalagens: total - ingredientes,
    maoDeObra,
    despesas,
    completo,
    porUnidade,
    fixoUnidade: completoUnidade - porUnidade,
    completoUnidade,
    sugerido: Math.round((completo * (1 + markup)) / rendimento),
    markup,
    faltando: linhas.filter((l) => l.custo === null && l.quantidade > 0).map((l) => l.insumo?.nome || 'ingrediente apagado'),
    preco,
    // Lucro e margem "livres no bolso", como na planilha: depois de mão de obra e despesas fixas.
    lucroUnidade: preco ? preco - completoUnidade : null,
    margem: preco ? (preco - completoUnidade) / preco : null,
    subiu: ref > 0 && porUnidade >= ref * (1 + ALERTA_CUSTO) ? (porUnidade - ref) / ref : 0,
  };
}

// Sabor = a receita de uma fornada (ingredientes e tempo), que não se vende sozinha; os produtos são os tamanhos.
export const ehSabor = (r) => r?.tipo === 'sabor';

// Tamanhos de sempre: quantas unidades uma receita rende em cada um e a embalagem de cada unidade
// (procurada pelo nome entre os ingredientes/embalagens cadastrados).
export const TAMANHOS_PADRAO = [
  { porcao: '1100', rendimento: 1, embalagens: [['embalagem pudim 1100', 1]] },
  { porcao: '550', rendimento: 2, embalagens: [['embalagem pudim 500', 1]] },
  { porcao: '150', rendimento: 6, embalagens: [['copo americano', 1], ['tampa rojek', 1]] },
];

const semAcento = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();

// Linhas dos produtos de um sabor nos tamanhos pedidos (as embalagens entram por receita: unidades × rendimento).
export function produtosDoSabor(sabor, insumos, tamanhos = TAMANHOS_PADRAO) {
  const porNome = Object.fromEntries((insumos || []).filter((x) => x.ativo !== false).map((x) => [semAcento(x.nome), x]));
  return tamanhos.map((t) => ({
    id: `${sabor.id}-${t.porcao}`.replace(/^pp-sab-/, 'pp-pro-'),
    nome: `${sabor.nome} ${t.porcao}`,
    tipo: 'produto',
    sabor_id: sabor.id,
    porcao: t.porcao,
    rendimento: t.rendimento,
    validade_dias: sabor.validade_dias || VALIDADE_PADRAO,
    preco_venda: '',
    preco_ifood: '',
    custo_ref: '',
    tempo_preparo: '',
    markup: '',
    ingredientes: JSON.stringify(t.embalagens.map(([nome, porUnidade]) => porNome[semAcento(nome)] && { insumo_id: porNome[semAcento(nome)].id, quantidade: porUnidade * t.rendimento }).filter(Boolean)),
    ativo: true,
  }));
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
  // Saída sem lote (venda com data antes da produção): a próxima produção da receita já nasce descontada.
  const devendo = {};
  for (const m of ordem) {
    const qtd = Number(m.quantidade) || 0;
    if (m.tipo === 'producao') {
      const desconta = Math.min(devendo[m.receita_id] || 0, qtd);
      if (desconta) devendo[m.receita_id] -= desconta;
      lotes.push({ mov: m, receita_id: m.receita_id, restante: qtd - desconta, custo: toCents(m.custo_unitario || 0), fixo: toCents(m.custo_fixo_unitario || 0), validade: m.validade || m.data });
      continue;
    }
    let falta = qtd;
    let custo = 0;
    let fixo = 0;
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
      fixo += usa * l.fixo;
    }
    if (falta) {
      devendo[m.receita_id] = (devendo[m.receita_id] || 0) + falta;
      const hoje = custoAtual(m.receita_id);
      custo += falta * (typeof hoje === 'number' ? hoje : hoje?.direto || 0);
      fixo += falta * (typeof hoje === 'number' ? 0 : hoje?.fixo || 0);
    }
    saidas[m.id] = { custo, fixo, semProducao: falta };
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
  // Taxa guardada por unidade sem arredondar: soma tudo e arredonda uma vez, como o lançamento da venda.
  const taxaDe = (m) => (Number(m.quantidade) || 0) * Number(m.taxa_unitaria || 0) * 100;
  const taxas = Math.round(vendidos.reduce((s, m) => s + taxaDe(m), 0));
  const porCanal = {};
  for (const m of vendidos) {
    const c = (porCanal[m.canal === 'ifood' ? 'ifood' : 'direta'] ||= { quantidade: 0, vendas: 0, taxas: 0 });
    c.quantidade += Number(m.quantidade) || 0;
    c.vendas += valorDe(m, 'preco_unitario');
    c.taxas += taxaDe(m);
  }
  const custoVendido = vendidos.reduce((s, m) => s + (saidas[m.id]?.custo || 0), 0);
  const custoPerdido = perdidos.reduce((s, m) => s + (saidas[m.id]?.custo || 0), 0);
  // Mão de obra e despesas fixas que estavam dentro do que foi vendido ou perdido.
  const fixoSaidas = vendidos.concat(perdidos).reduce((s, m) => s + (saidas[m.id]?.fixo || 0), 0);
  const comprasCaixa = lancamentos
    .filter((l) => l.tipo === 'saida' && l.origem === 'Pudim' && l.categoria_id !== CATEGORIA_TAXA_IFOOD && l.data >= inicio && l.data <= fim)
    .reduce((s, l) => s + toCents(l.valor), 0);
  for (const c of Object.values(porCanal)) c.taxas = Math.round(c.taxas);
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
    fixoSaidas,
    lucroLivre: vendas - taxas - custoVendido - custoPerdido - fixoSaidas,
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
  // A taxa é sobre o valor da venda inteira, arredondada uma vez só.
  const taxa = canal === 'ifood' ? Math.round((bruto * taxaPct) / 100) : 0;
  const custo = linhas.reduce((s, l) => s + Math.round(l.quantidade * (l.custo || 0)), 0);
  const fixo = linhas.reduce((s, l) => s + Math.round(l.quantidade * (l.fixo || 0)), 0);
  return { bruto, taxa, liquido: bruto - taxa, custo, fixo, lucro: bruto - taxa - custo, lucroLivre: bruto - taxa - custo - fixo, quantidade: linhas.reduce((s, l) => s + l.quantidade, 0) };
}

// Taxa de uma unidade em centavos, sem arredondar (para guardar no estoque e somar depois).
export function taxaUnitaria(precoCents, taxaPct = TAXA_IFOOD_PADRAO) {
  return (precoCents * taxaPct) / 100;
}
