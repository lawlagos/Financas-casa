import { test } from 'node:test';
import assert from 'node:assert/strict';
import { montarContexto, conferirLeitura, pendenciasLancamento, resumoNota, lancamentosDaNota } from '../../app/core/leitura.js';
import { baseContas, baseCategorias } from '../../app/core/seed.js';

const tables = { contas: baseContas('2026-10-01'), categorias: baseCategorias(), lancamentos: [] };
const hoje = '2026-10-17';

test('contexto leva contas, categorias e exemplos recentes', () => {
  const t = { ...tables, lancamentos: [{ descricao: 'Assaí', tipo: 'saida', valor: 87.5, conta_id: 'nubank-pj', categoria_id: 'cat-ingrediente', origem: 'Pudim', data: '2026-10-10' }] };
  const c = montarContexto(t, hoje);
  assert.equal(c.contas.length, 9);
  assert.equal(c.exemplos[0].descricao, 'Assaí');
  assert.equal(c.hoje, hoje);
});

test('comprovante: ids desconhecidos viram pendência; origem vem da categoria', () => {
  const r = conferirLeitura({
    tipo_documento: 'comprovante', data: '2026-10-16',
    lancamentos: [{ tipo: 'saida', valor: '87,50', descricao: 'Pix Assaí', conta_id: 'banco-x', categoria_id: 'cat-ingrediente', origem: null, confianca: 0.9 }],
  }, tables, hoje);
  assert.equal(r.tipo, 'lancamentos');
  const [l] = r.lancamentos;
  assert.equal(l.valor, 87.5);
  assert.equal(l.data, '2026-10-16');
  assert.equal(l.conta_id, '');
  assert.equal(l.origem, 'Pudim');
  assert.deepEqual(pendenciasLancamento(l), ['conta']);
});

test('categoria de outro tipo é descartada; data ilegível vira pendência; confiança baixa avisa', () => {
  const r = conferirLeitura({ lancamentos: [{ tipo: 'entrada', valor: 100, categoria_id: 'cat-mercado', conta_id: 'inter', origem: 'Consultoria', confianca: 0.4 }] }, tables, hoje);
  const [l] = r.lancamentos;
  assert.equal(l.categoria_id, '');
  assert.equal(l.data, hoje);
  assert.deepEqual(pendenciasLancamento(l), ['data (confira)']);
  assert.match(l.duvidaIa, /não ficou segura/);
});

test('transferência entre contas próprias', () => {
  const r = conferirLeitura({ data: '2026-10-17', lancamentos: [{ tipo: 'transferencia', valor: 2000, conta_id: 'c6', conta_destino_id: 'itau', confianca: 1 }] }, tables, hoje);
  assert.deepEqual(pendenciasLancamento(r.lancamentos[0]), []);
  assert.equal(r.lancamentos[0].origem, '');
});

test('nota de mercado: soma por origem, diferença do total e lançamentos pudim/casa', () => {
  const nota = conferirLeitura({
    tipo_documento: 'nota_mercado', estabelecimento: 'Assaí', data: '2026-10-16', total: 60,
    itens: [
      { descricao: 'Leite condensado', quantidade: 6, valor_total: 38.34, origem: 'Pudim', confianca: 0.95 },
      { descricao: 'Detergente', quantidade: 1, valor_total: 2.99, origem: 'Casa', confianca: 0.95 },
      { descricao: 'Leite integral', quantidade: 2, valor_total: 10.58, origem: null, duvida: 'Pudim ou casa?' },
    ],
  }, tables, hoje);
  assert.equal(nota.tipo, 'nota');
  let r = resumoNota(nota);
  assert.equal(r.semOrigem, 1);
  nota.itens[2].origem = 'Pudim';
  r = resumoNota(nota);
  assert.equal(r.soma.Pudim, 3834 + 1058);
  assert.equal(r.diferenca, 6000 - (3834 + 299 + 1058));
  assert.equal(r.soma.Casa, 299 + r.diferenca);
  const ls = lancamentosDaNota(nota, { conta_id: 'nubank-pj', data: '2026-10-16', diferencaEm: 'Casa' });
  assert.equal(ls.length, 2);
  assert.equal(ls[0].origem, 'Pudim');
  assert.equal(ls[0].valor, 48.92);
  assert.equal(ls[0].descricao, 'Assaí — pudim');
  assert.match(ls[0].detalhe, /Leite condensado, Leite integral/);
  assert.equal(Math.round((ls[0].valor + ls[1].valor) * 100), 6000);
  const sem = lancamentosDaNota(nota, { conta_id: 'x', data: hoje, diferencaEm: '' });
  assert.equal(Math.round((sem[0].valor + sem[1].valor) * 100), 3834 + 299 + 1058);
});

test('itens da nota ficam ligados ao lançamento da origem, com preço unitário', async () => {
  const { itensDaNota } = await import('../../app/core/leitura.js');
  const nota = conferirLeitura({ tipo_documento: 'nota_mercado', estabelecimento: 'Assaí', itens: [
    { descricao: 'Leite condensado Moça 395g', quantidade: 6, unidade: 'UN', valor_total: 38.34, origem: 'Pudim', confianca: 1 },
    { descricao: 'Batata', quantidade: 1.275, unidade: 'KG', valor_total: 12.74, origem: 'Casa', confianca: 1 },
    { descricao: 'Ilegível', quantidade: 1, valor_total: null, origem: null },
  ] }, tables, hoje);
  const itens = itensDaNota(nota, [{ id: 'lp', origem: 'Pudim' }, { id: 'lc', origem: 'Casa' }], { data: '2026-10-16', grupo_id: 'g1', criado_em: 'x' });
  assert.equal(itens.length, 2);
  assert.deepEqual([itens[0].lancamento_id, itens[0].preco_unitario, itens[0].unidade, itens[0].mercado], ['lp', 6.39, 'un', 'Assaí']);
  assert.deepEqual([itens[1].lancamento_id, itens[1].unidade, itens[1].preco_unitario], ['lc', 'kg', 9.99]);
});
