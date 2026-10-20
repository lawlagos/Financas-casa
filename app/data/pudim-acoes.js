// Gravações do pudim que mexem em mais de uma aba: venda (estoque + caixa), movimentos ditos por voz e apagar venda.
import { state, salvar, salvarVarias, apagar, config } from './store.js';
import { uid } from '../core/schema.js';
import { addDays, fmtDay } from '../core/dates.js';
import { totaisCarrinho, taxaUnitaria, TAXA_IFOOD_PADRAO, CONTA_IFOOD, VALIDADE_PADRAO } from '../core/pudim.js';
import { gastoDaProducao, entradasDeItens } from '../core/estoqueinsumos.js';

const porIdDe = (lista) => Object.fromEntries((lista || []).map((x) => [x.id, x]));

// Produção gasta ingredientes: uma saída por ingrediente, ligada à produção (ref) para voltar se ela for apagada.
async function saidasDaProducao(producoes, feitos) {
  const receitasPorId = porIdDe(state.tables.receitas);
  const agora = new Date().toISOString();
  const linhas = [];
  for (const m of producoes) {
    const gasto = gastoDaProducao(receitasPorId[m.receita_id], m.quantidade, receitasPorId);
    for (const [insumo_id, q] of Object.entries(gasto)) {
      if (q > 0) linhas.push({ data: m.data, insumo_id, tipo: 'saida', quantidade: Math.round(q * 1000) / 1000, origem: 'producao', ref: m.id, obs: '', criado_em: agora });
    }
  }
  if (!linhas.length) return [];
  const salvas = await salvarVarias('estoque_insumos', linhas);
  if (feitos) for (const x of salvas) feitos.push({ tabela: 'estoque_insumos', id: x.id });
  return salvas;
}

// Compra de ingredientes do pudim soma no estoque de ingredientes (itens já gravados, com id).
export async function entradasDaCompra(itensSalvos, { data, feitos } = {}) {
  const linhas = entradasDeItens(itensSalvos, state.tables.insumos, { data }).map((x) => ({ ...x, criado_em: new Date().toISOString() }));
  if (!linhas.length) return [];
  const salvas = await salvarVarias('estoque_insumos', linhas);
  if (feitos) for (const x of salvas) feitos.push({ tabela: 'estoque_insumos', id: x.id });
  return salvas;
}

const reais = (cents) => Math.round(cents) / 100;
const qtdTxt = (n) => String(n).replace('.', ',');

export function taxaIfood() {
  const v = Number(config('taxa_ifood', TAXA_IFOOD_PADRAO));
  return Number.isFinite(v) && v >= 0 && v < 100 ? v : TAXA_IFOOD_PADRAO;
}

// Contas do pudim: "Vendas diretas" recebe as vendas do PDV; "iFood" só recebe o pagamento que o iFood faz na quarta,
// lançado à mão (as vendas do iFood mexem só no estoque). As outras entradas da empresa vão para a Nubank PJ.
export const CONTA_VENDAS_DIRETAS = 'vendas-diretas';
const CONTAS_PUDIM = {
  [CONTA_VENDAS_DIRETAS]: { nome: 'Vendas diretas', cor: '#c10118' },
  [CONTA_IFOOD]: { nome: 'iFood', cor: '#ea1d2c' },
};
export async function garantirConta(id) {
  if (state.tables.contas.some((c) => c.id === id) || !CONTAS_PUDIM[id]) return;
  await salvar('contas', { id, ...CONTAS_PUDIM[id], dono: 'Esposa', grupo: 'Pudim', saldo_inicial: 0, data_saldo_inicial: '2000-01-01', ativa: true });
}

// Contas para escolher na venda direta: as ativas, com a "Vendas diretas" no topo (ela nasce na primeira venda).
export function contasDaVenda(contas) {
  const sem = contas.filter((c) => c.id !== CONTA_VENDAS_DIRETAS && c.id !== CONTA_IFOOD);
  return [contas.find((c) => c.id === CONTA_VENDAS_DIRETAS) || { id: CONTA_VENDAS_DIRETAS, ...CONTAS_PUDIM[CONTA_VENDAS_DIRETAS], grupo: 'Pudim', dono: 'Esposa' }, ...sem];
}

// Pagamentos do iFood já lançados (entradas na conta iFood), do mais novo para o mais antigo.
export const pagamentosIfood = (lancs) => (lancs || []).filter((l) => l.conta_id === CONTA_IFOOD && l.tipo === 'entrada' && l.canal !== 'pdv')
  .sort((a, b) => (a.data < b.data ? 1 : -1));

// Lança o pagamento de quarta do iFood na conta iFood.
export async function lancarPagamentoIfood({ data, valor, obs = '' }) {
  await garantirConta(CONTA_IFOOD);
  // Na quarta, o iFood paga as vendas de segunda a domingo da semana anterior.
  const segunda = new Date(`${data}T12:00:00Z`).getUTCDay() === 3 ? addDays(data, -9) : '';
  return salvar('lancamentos', {
    tipo: 'entrada', valor, data, descricao: (segunda ? `Pagamento iFood (vendas de ${fmtDay(segunda)} a ${fmtDay(addDays(segunda, 6))})` : 'Pagamento iFood') + (obs ? ` · ${obs}` : ''),
    conta_id: CONTA_IFOOD, conta_destino_id: '', categoria_id: 'cat-venda-pudim', origem: 'Pudim', canal: 'ifood', grupo_id: '', previsto_id: '',
  });
}

// Limpeza única: vendas do iFood lançadas no caixa pelo jeito antigo (entrada, taxa e repasse previsto) saem do saldo.
// O estoque continua com as vendas; só perdem a ligação com o lançamento.
export function ifoodAntigoNoSaldo(tables) {
  const lancs = (tables.lancamentos || []).filter((l) => l.conta_id === CONTA_IFOOD && l.canal === 'pdv');
  const recebidos = new Set((tables.baixas || []).map((b) => b.previsto_id));
  const repasses = (tables.previstos || []).filter((p) => String(p.id).startsWith('repasse-ifood-') && !recebidos.has(p.id));
  return { lancs, repasses };
}
export async function tirarIfoodAntigoDoSaldo() {
  const { lancs, repasses } = ifoodAntigoNoSaldo(state.tables);
  const ids = new Set(lancs.map((l) => l.id));
  for (const m of state.tables.estoque.filter((x) => ids.has(x.lancamento_id))) await salvar('estoque', { ...m, lancamento_id: '' });
  for (const l of lancs) await apagar('lancamentos', l.id);
  for (const p of repasses) await apagar('previstos', p.id);
  return { lancamentos: lancs.length, repasses: repasses.length };
}

// Venda de um carrinho. linhas: [{ receita, quantidade, preco (centavos), custo (centavos por unidade) }].
// Venda direta lança a entrada no caixa (conta Vendas diretas). Venda do iFood mexe só no estoque: o dinheiro entra
// quando o iFood paga, na quarta, lançado à mão na conta iFood.
// Tudo ou nada: se uma das gravações falhar, as que já foram são desfeitas, para não sobrar venda pela metade.
export async function tudoOuNada(fn) {
  const feitos = [];
  try {
    return await fn(feitos);
  } catch (e) {
    for (const { tabela, id } of feitos.reverse()) await apagar(tabela, id).catch(() => {});
    throw e;
  }
}

export function registrarVenda(args) {
  return tudoOuNada((feitos) => gravarVenda(args, feitos));
}

async function gravarVenda({ linhas, canal, data, conta_id, lancar, local = '' }, feitos) {
  const itens = linhas.filter((l) => l.receita && l.quantidade > 0);
  if (!itens.length) return null;
  const taxaPct = taxaIfood();
  const t = totaisCarrinho(itens, canal, taxaPct);
  const agora = new Date().toISOString();
  let lancamento_id = '';
  if (lancar && canal !== 'ifood') {
    const grupo_id = uid('ven');
    const conta = conta_id || CONTA_VENDAS_DIRETAS;
    await garantirConta(conta);
    const resumo = itens.map((l) => `${qtdTxt(l.quantidade)} ${l.receita.nome}`).join(', ');
    const entrada = await salvar('lancamentos', {
      tipo: 'entrada', valor: reais(t.bruto), data, descricao: `Venda direta: ${resumo}`.slice(0, 120),
      conta_id: conta, conta_destino_id: '', categoria_id: 'cat-venda-pudim', origem: 'Pudim', canal: 'pdv', grupo_id, previsto_id: '',
    });
    lancamento_id = entrada.id;
    feitos.push({ tabela: 'lancamentos', id: entrada.id });
  }
  const salvos = await salvarVarias('estoque', itens.map((l) => ({
    data, local: l.local || local, receita_id: l.receita.id, tipo: 'venda', quantidade: l.quantidade, custo_unitario: '', preco_unitario: reais(l.preco),
    taxa_unitaria: canal === 'ifood' ? Math.round(taxaUnitaria(l.preco, taxaPct) * 100) / 10000 : '', canal, validade: '', lancamento_id, obs: '', criado_em: agora,
  })));
  for (const x of salvos) feitos.push({ tabela: 'estoque', id: x.id });
  return { ...t, lancado: !!lancamento_id };
}

// Produção, perda e envio entre locais (vários de uma vez, como vêm da fala).
// itens: [{ tipo, receita, quantidade, custo (ingredientes e embalagem), fixo (mão de obra e despesas), em centavos por unidade,
//   local (opcional, senão o de `opcoes`), validade (produção), para (envio: local de destino) }].
// Lote: produções gravadas com o mesmo `lote_id` e a mesma validade (vários sabores na mesma leva).
export async function registrarMovimentos(itens, { data, motivo = 'vencido', local = '', lote_id = '' }, feitos = null) {
  const agora = new Date().toISOString();
  const linhas = itens.filter((i) => i.receita && i.quantidade > 0 && ['producao', 'perda', 'transferencia'].includes(i.tipo)).map((i) => ({
    data, local: i.local || local, local_destino: i.tipo === 'transferencia' ? i.para : '', lote_id: i.tipo === 'producao' ? lote_id : '',
    receita_id: i.receita.id, tipo: i.tipo, quantidade: i.quantidade,
    custo_unitario: i.tipo === 'producao' ? reais(i.custo || 0) : '', custo_fixo_unitario: i.tipo === 'producao' ? reais(i.fixo || 0) : '', preco_unitario: '',
    validade: i.tipo === 'producao' ? i.validade || addDays(data, Number(i.receita.validade_dias) || VALIDADE_PADRAO) : '',
    lancamento_id: '', obs: i.tipo === 'perda' ? motivo : '', criado_em: agora, canal: '', taxa_unitaria: '',
  }));
  if (!linhas.length) return [];
  const salvos = await salvarVarias('estoque', linhas);
  if (feitos) for (const x of salvos) feitos.push({ tabela: 'estoque', id: x.id });
  await saidasDaProducao(salvos.filter((x) => x.tipo === 'producao'), feitos);
  return salvos;
}

// Produção/perda/envio e venda ditos na mesma frase: se a venda falhar, o resto também é desfeito.
export function registrarFala({ movimentos, venda, data, motivo, local = '' }) {
  return tudoOuNada(async (feitos) => {
    const salvos = await registrarMovimentos(movimentos, { data, motivo, local }, feitos);
    const v = venda ? await gravarVenda({ local, ...venda, data }, feitos) : null;
    return { movimentos: salvos.length, venda: v };
  });
}

// Um lote: vários sabores feitos juntos, no mesmo local e com a mesma validade.
export function registrarLote({ itens, data, validade, local }) {
  const lote_id = uid('lote');
  return tudoOuNada((feitos) => registrarMovimentos(itens.map((i) => ({ ...i, tipo: 'producao', validade })), { data, local, lote_id }, feitos));
}

// Entrada de um pudim em um ou mais lotes, cada um com a sua quantidade e validade (o rendimento varia,
// então é o que saiu de verdade). lotes: [{ quantidade, validade }]. Cada lote ganha o seu lote_id.
export function registrarEntradas({ receita, custo = 0, fixo = 0, local, data, lotes }) {
  return tudoOuNada(async (feitos) => {
    const salvos = [];
    for (const l of lotes.filter((x) => x.quantidade > 0)) {
      salvos.push(...(await registrarMovimentos([{ tipo: 'producao', receita, quantidade: l.quantidade, custo, fixo, validade: l.validade }], { data, local, lote_id: uid('lote') }, feitos)));
    }
    return salvos;
  });
}

// Envio de pudins de um local para outro (levam a validade e o custo dos lotes de onde saíram).
export function registrarEnvio({ itens, de, para, data }) {
  return tudoOuNada((feitos) => registrarMovimentos(itens.map((i) => ({ ...i, tipo: 'transferencia', local: de, para })), { data }, feitos));
}

// Venda do mesmo carrinho: mesmo lançamento no caixa ou, sem lançamento, gravada junto (mesmo dia e mesma hora).
export function itensDaVenda(m) {
  if (m.tipo !== 'venda') return [m];
  return state.tables.estoque.filter((x) => x.tipo === 'venda' && (m.lancamento_id ? x.lancamento_id === m.lancamento_id : !x.lancamento_id && x.data === m.data && x.criado_em === m.criado_em));
}
// Produções do mesmo lote.
export const itensDoLote = (m) => (m.tipo === 'producao' && m.lote_id ? state.tables.estoque.filter((x) => x.tipo === 'producao' && x.lote_id === m.lote_id) : [m]);

// Corrige um movimento. Os saldos são refeitos a partir dos movimentos, então trocar o local de uma saída
// devolve ao local antigo e tira do novo, sem lançar nada a mais.
// mudancas: { receita_id (com custo_unitario e custo_fixo_unitario na produção), local, local_destino, data, quantidade, validade, obs, loteTodo (validade/local/dia valem para o lote inteiro) }.
// Venda: só o local muda (vale para o carrinho inteiro); quantidade e dia estão ligados ao valor no caixa.
export async function editarMovimento(m, mudancas) {
  const { loteTodo, ...mud } = mudancas;
  return tudoOuNada(async (feitos) => {
    const anteriores = [];
    const apagados = [];
    const gravar = async (linhas) => {
      for (const l of linhas) anteriores.push(state.tables.estoque.find((x) => x.id === l.id));
      return salvarVarias('estoque', linhas);
    };
    try {
      if (m.tipo === 'venda') {
        await gravar(itensDaVenda(m).map((x) => ({ ...x, local: mud.local ?? x.local ?? '' })));
        return;
      }
      const atual = { ...m, ...mud };
      const grupo = m.tipo === 'producao' && loteTodo ? itensDoLote(m) : [m];
      const comuns = {};
      for (const k of ['local', 'validade', 'data']) if (k in mud) comuns[k] = mud[k];
      const linhas = grupo.map((x) => (x.id === m.id ? atual : { ...x, ...comuns }));
      await gravar(linhas);
      // Produção com outra quantidade, outro dia ou outro pudim: refaz a saída de ingredientes dela.
      for (const x of linhas.filter((l) => l.tipo === 'producao')) {
        const antes = grupo.find((g) => g.id === x.id);
        if (Number(antes.quantidade) === Number(x.quantidade) && antes.data === x.data && antes.receita_id === x.receita_id) continue;
        for (const e of (state.tables.estoque_insumos || []).filter((e) => e.ref === x.id && e.origem === 'producao')) {
          await apagar('estoque_insumos', e.id);
          apagados.push(e);
        }
        await saidasDaProducao([x], feitos);
      }
    } catch (e) {
      // Volta as linhas que já tinham sido regravadas.
      const voltar = anteriores.filter(Boolean);
      if (voltar.length) await salvarVarias('estoque', voltar).catch(() => {});
      if (apagados.length) await salvarVarias('estoque_insumos', apagados).catch(() => {});
      throw e;
    }
  });
}

// Apagar um movimento de venda apaga a venda inteira: todos os itens do carrinho e os lançamentos dela (entrada e taxa).
export async function apagarMovimento(m) {
  if (!m.lancamento_id) {
    // Venda sem lançamento no caixa: os itens do mesmo carrinho foram gravados juntos (mesmo dia e mesma hora).
    const juntos = itensDaVenda(m);
    for (const x of juntos) await apagar('estoque', x.id);
    // Produção apagada devolve os ingredientes que ela tinha gastado.
    if (m.tipo === 'producao') for (const x of (state.tables.estoque_insumos || []).filter((e) => e.ref === m.id && e.origem === 'producao')) await apagar('estoque_insumos', x.id);
    return { itens: juntos.length, lancamentos: 0 };
  }
  const irmaos = state.tables.estoque.filter((x) => x.lancamento_id === m.lancamento_id);
  const entrada = state.tables.lancamentos.find((l) => l.id === m.lancamento_id);
  const lancs = state.tables.lancamentos.filter((l) => l.id === m.lancamento_id || (entrada?.grupo_id && l.grupo_id === entrada.grupo_id));
  for (const x of irmaos) await apagar('estoque', x.id);
  for (const l of lancs) await apagar('lancamentos', l.id);
  return { itens: irmaos.length, lancamentos: lancs.length };
}

// Compra feita a partir da pesquisa de preços: um gasto do Pudim por categoria (ingrediente, embalagem) e os itens,
// como numa nota de mercado. Os itens fazem o custo das receitas usar o preço pago.
// linhas: [{ insumo, oferta, quantidade (embalagens), preco (centavos por embalagem, o que foi pago) }]
export function registrarCompra({ linhas, data, conta_id }) {
  return tudoOuNada(async (feitos) => {
    const validas = linhas.filter((l) => l.insumo && l.quantidade > 0 && l.preco > 0);
    const grupo_id = uid('cmp');
    const porCategoria = {};
    for (const l of validas) (porCategoria[l.insumo.tipo === 'embalagem' ? 'cat-embalagem' : 'cat-ingrediente'] ||= []).push(l);
    const lancPorCat = {};
    for (const [categoria_id, ls] of Object.entries(porCategoria)) {
      const lojas = [...new Set(ls.map((l) => l.oferta.loja.nome))].join(', ');
      const l = await salvar('lancamentos', {
        tipo: 'saida', valor: reais(ls.reduce((s, x) => s + x.preco * x.quantidade, 0)), data,
        descricao: `${lojas} — ${categoria_id === 'cat-embalagem' ? 'embalagens' : 'ingredientes'}`.slice(0, 120),
        conta_id, conta_destino_id: '', categoria_id, origem: 'Pudim', canal: 'compras', grupo_id, previsto_id: '',
      });
      feitos.push({ tabela: 'lancamentos', id: l.id });
      lancPorCat[categoria_id] = l.id;
    }
    const agora = new Date().toISOString();
    const itens = await salvarVarias('itens', validas.map((l) => {
      const categoria_id = l.insumo.tipo === 'embalagem' ? 'cat-embalagem' : 'cat-ingrediente';
      const porPeso = ['g', 'kg', 'ml', 'l'].includes(l.insumo.unidade);
      return {
        data, mercado: l.oferta.loja.nome, descricao: l.oferta.titulo, quantidade: l.quantidade, unidade: 'un',
        valor: reais(l.preco * l.quantidade), preco_unitario: reais(l.preco), origem: 'Pudim', categoria_id,
        lancamento_id: lancPorCat[categoria_id], grupo_id, criado_em: agora,
        produto: l.insumo.produto || l.insumo.nome, marca: l.oferta.marca || '',
        tamanho: porPeso ? l.oferta.qtd : '', tamanho_unidade: porPeso ? l.insumo.unidade : '',
      };
    }));
    for (const x of itens) feitos.push({ tabela: 'itens', id: x.id });
    await entradasDaCompra(itens, { data, feitos });
    return { total: validas.reduce((s, x) => s + x.preco * x.quantidade, 0), itens: itens.length };
  });
}
