// Gravações da lista de compras: itens falados entram com o preço estimado; a compra finalizada vira gasto
// (Casa no Mercado, Pudim em Ingrediente) e itens de nota, que alimentam o histórico de preços.
import { state, salvar, salvarVarias, apagar, quem } from './store.js';
import { uid } from '../core/schema.js';
import { estimar } from '../core/listacompras.js';
import { tudoOuNada, entradasDaCompra } from './pudim-acoes.js';

const reais = (cents) => Math.round(cents) / 100;

export function adicionarItens(itens) {
  const agora = new Date().toISOString();
  return salvarVarias('lista', itens.map((x) => {
    const e = estimar(x, { itens: state.tables.itens, insumos: state.tables.insumos });
    return {
      nome: x.nome, quantidade: x.quantidade, unidade: x.unidade || 'un', origem: x.origem || 'Casa', preco_estimado: e.valor ? reais(e.valor) : '',
      preco_pago: '', comprado: false, texto: x.texto || '', criado_em: agora, criado_por: quem(), comprado_em: '',
    };
  }));
}

// Recalcula a estimativa (depois de mudar quantidade, unidade ou nome).
export function atualizarItem(item, mudancas) {
  const novo = { ...item, ...mudancas };
  const e = estimar(novo, { itens: state.tables.itens, insumos: state.tables.insumos });
  return salvar('lista', { ...novo, preco_estimado: e.valor ? reais(e.valor) : '' });
}

const CATEGORIA = { Casa: 'cat-mercado', Pudim: 'cat-ingrediente' };

// Finaliza: um gasto por origem com o que foi pago, os itens com o preço de cada um e tira da lista o que foi comprado.
export function finalizarCompra({ itens, mercado, data, conta_id }) {
  return tudoOuNada(async (feitos) => {
    const comprados = itens.filter((x) => x.comprado && Number(x.preco_pago) > 0);
    const grupo_id = uid('lis');
    const porOrigem = {};
    for (const x of comprados) (porOrigem[x.origem === 'Pudim' ? 'Pudim' : 'Casa'] ||= []).push(x);
    const lancPorOrigem = {};
    for (const [origem, xs] of Object.entries(porOrigem)) {
      const total = xs.reduce((s, x) => s + Math.round(Number(x.preco_pago) * 100), 0);
      const l = await salvar('lancamentos', {
        tipo: 'saida', valor: reais(total), data, descricao: `${mercado || 'Mercado'} — ${origem === 'Pudim' ? 'pudim' : 'casa'}`.slice(0, 120),
        conta_id, conta_destino_id: '', categoria_id: CATEGORIA[origem], origem, canal: 'lista', grupo_id, previsto_id: '',
      });
      feitos.push({ tabela: 'lancamentos', id: l.id });
      lancPorOrigem[origem] = l.id;
    }
    const agora = new Date().toISOString();
    const salvos = await salvarVarias('itens', comprados.map((x) => {
      const origem = x.origem === 'Pudim' ? 'Pudim' : 'Casa';
      const q = Number(x.quantidade) || 1;
      return {
        data, mercado: mercado || '', descricao: x.nome, produto: x.nome, marca: '', quantidade: q, unidade: x.unidade || 'un',
        valor: Number(x.preco_pago), preco_unitario: Math.round((Number(x.preco_pago) / q) * 100) / 100, origem, categoria_id: CATEGORIA[origem],
        lancamento_id: lancPorOrigem[origem], grupo_id, criado_em: agora, tamanho: '', tamanho_unidade: '',
      };
    }));
    for (const x of salvos) feitos.push({ tabela: 'itens', id: x.id });
    await entradasDaCompra(salvos.filter((x) => x.origem === 'Pudim'), { data, feitos });
    for (const x of comprados) await apagar('lista', x.id);
    return { total: comprados.reduce((s, x) => s + Math.round(Number(x.preco_pago) * 100), 0), itens: comprados.length };
  });
}

// Tarefas da casa.
export function adicionarTarefas(titulos) {
  const agora = new Date().toISOString();
  return salvarVarias('tarefas', titulos.map((titulo) => ({ titulo: titulo.slice(0, 200), criado_em: agora, criado_por: quem(), feita: false, feita_em: '', feita_por: '' })));
}
export function marcarTarefa(t, feita) {
  return salvar('tarefas', { ...t, feita, feita_em: feita ? new Date().toISOString() : '', feita_por: feita ? quem() : '' });
}
