// Gravações do pudim que mexem em mais de uma aba: venda (estoque + caixa), movimentos ditos por voz e apagar venda.
import { state, salvar, salvarVarias, apagar, config } from './store.js';
import { uid } from '../core/schema.js';
import { addDays } from '../core/dates.js';
import { totaisCarrinho, taxaUnitaria, TAXA_IFOOD_PADRAO, CATEGORIA_TAXA_IFOOD, CONTA_IFOOD, VALIDADE_PADRAO } from '../core/pudim.js';

const reais = (cents) => Math.round(cents) / 100;
const qtdTxt = (n) => String(n).replace('.', ',');

export function taxaIfood() {
  const v = Number(config('taxa_ifood', TAXA_IFOOD_PADRAO));
  return Number.isFinite(v) && v >= 0 && v < 100 ? v : TAXA_IFOOD_PADRAO;
}

// A conta iFood (onde o dinheiro fica até o repasse) e a categoria da taxa nascem na primeira venda pelo iFood.
async function garantirIfood(data) {
  if (!state.tables.contas.some((c) => c.id === CONTA_IFOOD)) {
    await salvar('contas', { id: CONTA_IFOOD, nome: 'iFood', dono: 'Esposa', grupo: 'Pudim', saldo_inicial: 0, data_saldo_inicial: data, cor: '#ea1d2c', ativa: true });
  }
  if (!state.tables.categorias.some((c) => c.id === CATEGORIA_TAXA_IFOOD)) {
    await salvar('categorias', { id: CATEGORIA_TAXA_IFOOD, nome: 'Taxa iFood', tipo: 'saida', origem_padrao: 'Pudim', ativa: true });
  }
}

// Venda de um carrinho. linhas: [{ receita, quantidade, preco (centavos), custo (centavos por unidade) }].
// No iFood a entrada é o valor cheio na conta iFood e a taxa sai como gasto do Pudim, ligadas pelo mesmo grupo.
export async function registrarVenda({ linhas, canal, data, conta_id, lancar }) {
  const itens = linhas.filter((l) => l.receita && l.quantidade > 0);
  if (!itens.length) return null;
  const taxaPct = taxaIfood();
  const t = totaisCarrinho(itens, canal, taxaPct);
  const agora = new Date().toISOString();
  let lancamento_id = '';
  if (lancar) {
    const grupo_id = uid('ven');
    const conta = canal === 'ifood' ? CONTA_IFOOD : conta_id;
    if (canal === 'ifood') await garantirIfood(data);
    const resumo = itens.map((l) => `${qtdTxt(l.quantidade)} ${l.receita.nome}`).join(', ');
    const entrada = await salvar('lancamentos', {
      tipo: 'entrada', valor: reais(t.bruto), data, descricao: `${canal === 'ifood' ? 'iFood' : 'Venda direta'}: ${resumo}`.slice(0, 120),
      conta_id: conta, conta_destino_id: '', categoria_id: 'cat-venda-pudim', origem: 'Pudim', canal: 'pdv', grupo_id, previsto_id: '',
    });
    lancamento_id = entrada.id;
    if (canal === 'ifood' && t.taxa > 0) {
      await salvar('lancamentos', {
        tipo: 'saida', valor: reais(t.taxa), data, descricao: `Taxa iFood (${qtdTxt(taxaPct)}%)`, conta_id: CONTA_IFOOD, conta_destino_id: '',
        categoria_id: CATEGORIA_TAXA_IFOOD, origem: 'Pudim', canal: 'pdv', grupo_id, previsto_id: '',
      });
    }
  }
  await salvarVarias('estoque', itens.map((l) => ({
    data, receita_id: l.receita.id, tipo: 'venda', quantidade: l.quantidade, custo_unitario: '', preco_unitario: reais(l.preco),
    taxa_unitaria: canal === 'ifood' ? reais(taxaUnitaria(l.preco, taxaPct)) : '', canal, validade: '', lancamento_id, obs: '', criado_em: agora,
  })));
  return { ...t, lancado: !!lancamento_id };
}

// Produção e perda (vários de uma vez, como vêm da fala). itens: [{ tipo, receita, quantidade, custo (centavos) }].
export async function registrarMovimentos(itens, { data, motivo = 'vencido' }) {
  const agora = new Date().toISOString();
  const linhas = itens.filter((i) => i.receita && i.quantidade > 0 && (i.tipo === 'producao' || i.tipo === 'perda')).map((i) => ({
    data, receita_id: i.receita.id, tipo: i.tipo, quantidade: i.quantidade,
    custo_unitario: i.tipo === 'producao' ? reais(i.custo || 0) : '', preco_unitario: '',
    validade: i.tipo === 'producao' ? addDays(data, Number(i.receita.validade_dias) || VALIDADE_PADRAO) : '',
    lancamento_id: '', obs: i.tipo === 'perda' ? motivo : '', criado_em: agora, canal: '', taxa_unitaria: '',
  }));
  if (linhas.length) await salvarVarias('estoque', linhas);
  return linhas.length;
}

// Apagar um movimento de venda apaga a venda inteira: todos os itens do carrinho e os lançamentos dela (entrada e taxa).
export async function apagarMovimento(m) {
  if (!m.lancamento_id) {
    await apagar('estoque', m.id);
    return { itens: 1, lancamentos: 0 };
  }
  const irmaos = state.tables.estoque.filter((x) => x.lancamento_id === m.lancamento_id);
  const entrada = state.tables.lancamentos.find((l) => l.id === m.lancamento_id);
  const lancs = state.tables.lancamentos.filter((l) => l.id === m.lancamento_id || (entrada?.grupo_id && l.grupo_id === entrada.grupo_id));
  for (const x of irmaos) await apagar('estoque', x.id);
  for (const l of lancs) await apagar('lancamentos', l.id);
  return { itens: irmaos.length, lancamentos: lancs.length };
}
