import { test } from 'node:test';
import assert from 'node:assert/strict';
import { interpretarEstoque } from '../../app/core/vozestoque.js';

const hoje = '2026-10-17';
const R = (id, nome, rendimento = 1) => ({ id, nome, rendimento });
const receitas = [
  R('trad1100', 'Pudim tradicional 1100'),
  R('trad500', 'Pudim tradicional 500', 2),
  R('mini150', 'Mini pudim tradicional 150', 6),
  R('mini120', 'Mini pudim tradicional 120', 11),
  R('ninho', 'Pudim ninho com Nutella'),
  R('gelninho', 'Geladinho de ninho com Nutella', 15),
  R('romeu', 'Pudim Romeu e Julieta'),
  R('limao', 'Pudim limão'),
  R('choc500', 'Pudim chocolate branco e morango 500', 2),
];
const ler = (texto, estoque) => interpretarEstoque(texto, { receitas, hoje, estoque });
const resumo = (r) => r.itens.map((i) => [i.tipo, i.quantidade, i.receita_id || i.candidatos.join('|')]);

test('venda com tamanho e canal iFood', () => {
  const r = ler('Vendi 3 pudins tradicionais 1100 no iFood');
  assert.equal(r.canal, 'ifood');
  assert.deepEqual(resumo(r), [['venda', 3, 'trad1100']]);
});

test('vários itens na mesma frase, números por extenso, nomes com "e" no meio', () => {
  const r = ler('vendi dois de ninho com nutella e um romeu e julieta, mais três de limão');
  assert.equal(r.canal, 'direta');
  assert.deepEqual(resumo(r), [['venda', 2, 'ninho'], ['venda', 1, 'romeu'], ['venda', 3, 'limao']]);
});

test('fornada vira o rendimento da receita; produção e venda na mesma frase', () => {
  const r = ler('fiz uma fornada de mini pudim 150 e vendi 4 mini 150');
  assert.deepEqual(resumo(r), [['producao', 6, 'mini150'], ['venda', 4, 'mini150']]);
  assert.deepEqual(resumo(ler('fizemos duas fornadas de mini pudim 120')), [['producao', 22, 'mini120']]);
});

test('perda: motivo e data', () => {
  const r = ler('ontem perdi 2 de ninho que venceram');
  assert.equal(r.data, '2026-10-16');
  assert.equal(r.motivo, 'vencido');
  assert.deepEqual(resumo(r), [['perda', 2, 'ninho']]);
  assert.equal(ler('caiu um pudim limão no chão').motivo, 'quebrou');
});

test('ambíguo sem tamanho: devolve candidatos, ou desempata pelo que tem no estoque', () => {
  assert.deepEqual(resumo(ler('vendi 3 tradicionais')), [['venda', 3, 'trad1100|trad500']]);
  assert.deepEqual(resumo(ler('vendi 3 tradicionais', { trad500: 4 })), [['venda', 3, 'trad500']]);
});

test('sem quantidade vale 1; trecho sem receita conhecida é ignorado', () => {
  assert.deepEqual(resumo(ler('vendi um pudim de chocolate branco 500 e um de abacaxi')), [['venda', 1, 'choc500']]);
  assert.deepEqual(resumo(ler('meia dúzia de limão vendidos')), [['venda', 6, 'limao']]);
});
