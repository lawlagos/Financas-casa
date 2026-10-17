import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cartoesEstoque, nomeCurto, categoriaDoProduto } from '../../app/core/cardapio.js';

const hoje = '2026-10-17';
const P = (id, nome, porcao, preco, extra = {}) => ({ id, nome, porcao, preco_venda: preco, rendimento: porcao === '150' ? 6 : porcao === '500' ? 2 : porcao === '' ? 15 : 1, ...extra });
const produtos = [
  P('bc', 'Brigadeirão no copo', '150', 18.9, { sabor_id: 'b', estoque_minimo: 2 }),
  P('tc', 'Tradicional no copo', '150', 16.9, { sabor_id: 't', estoque_minimo: 2 }),
  P('tk', 'Tradicional 1 kg', '1000', 79, { sabor_id: 't' }),
  P('tm', 'Tradicional 500 g', '500', 46, { sabor_id: 't' }),
  P('bk', 'Brigadeirão 1 kg', '1000', 105, { sabor_id: 'b' }),
  P('gp', 'Geladinho de pudim', '', 10, { estoque_minimo: 2 }),
  P('gn', 'Geladinho ninho com Nutella', '', 12),
];
const L = (receita_id, local, restante, validade) => ({ receita_id, local, restante, validade });

test('nome e categoria como no cardápio', () => {
  assert.deepEqual(produtos.map((p) => [categoriaDoProduto(p), nomeCurto(p)]), [
    ['copo', 'Brigadeirão'], ['copo', 'Tradicional'], ['grande', 'Tradicional 1 kg'], ['grande', 'Tradicional 500 g'],
    ['grande', 'Brigadeirão 1 kg'], ['geladinho', 'Pudim'], ['geladinho', 'Ninho com Nutella'],
  ]);
});

test('cartões na ordem do cardápio, por local, com mínimo, vencidos e status', () => {
  const lotes = [
    L('tc', 'sao-roque', 10, '2026-11-01'), L('tc', 'ibiuna', 4, '2026-11-01'), L('tc', 'ibiuna', 2, '2026-10-10'),
    L('bc', 'sao-roque', 12, '2026-10-18'), L('bc', 'ibiuna', 6, '2026-11-01'),
    L('gp', 'sao-roque', 40, '2026-12-01'),
  ];
  const g = cartoesEstoque(produtos, lotes, hoje);
  assert.deepEqual(g.map((x) => [x.titulo, x.cartoes.map((c) => c.receita.id)]), [
    ['Pudim no copo', ['tc', 'bc']], ['Pudim para compartilhar', ['tk', 'tm', 'bk']], ['Geladinhos', ['gp', 'gn']],
  ]);
  const tc = g[0].cartoes[0];
  // São Roque precisa de 12 (2 fornadas de 6), Ibiúna de 6: tem 10 e 4 → baixo; 2 vencidos em Ibiúna
  assert.deepEqual(tc.porLocal.map((x) => [x.local.id, x.quantidade, x.vencidos, x.minimo]), [['sao-roque', 10, 0, 12], ['ibiuna', 4, 2, 6]]);
  assert.deepEqual([tc.total, tc.vencidos, tc.minimo, tc.status], [14, 2, 18, 'baixo']);
  const bc = g[0].cartoes[1];
  assert.deepEqual([bc.total, bc.venceLogo, bc.status, bc.proximaValidade], [18, 12, 'vence', '2026-10-18']);
  assert.equal(g[1].cartoes[0].status, 'vazio'); // 1 kg sem mínimo: por encomenda
  // geladinho só em São Roque
  assert.deepEqual(g[2].cartoes[0].porLocal.map((x) => x.local.id), ['sao-roque']);
  assert.equal(g[2].cartoes[0].status, 'ok');
  // só Ibiúna: sem geladinho
  const ib = cartoesEstoque(produtos, lotes, hoje, { local: 'ibiuna' });
  assert.deepEqual(ib.map((x) => x.titulo), ['Pudim no copo', 'Pudim para compartilhar']);
  assert.deepEqual([ib[0].cartoes[0].total, ib[0].cartoes[0].status], [4, 'baixo']);
});
