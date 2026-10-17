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

test('revisão: números compostos, dúzias e cem', () => {
  assert.deepEqual(resumo(ler('vendi vinte e cinco tradicionais 1100')), [['venda', 25, 'trad1100']]);
  assert.deepEqual(resumo(ler('vendi vinte e dois de limão e trinta e um de ninho')), [['venda', 22, 'limao'], ['venda', 31, 'ninho']]);
  assert.deepEqual(resumo(ler('vendi uma dúzia de limão')), [['venda', 12, 'limao']]);
  assert.deepEqual(resumo(ler('fizemos duas dúzias de limão')), [['producao', 24, 'limao']]);
  assert.deepEqual(resumo(ler('vendi cem de limão')), [['venda', 100, 'limao']]);
});

test('revisão: verbo diferente no meio da frase separa os itens', () => {
  assert.deepEqual(resumo(ler('vendi um de limão e dei um de ninho')), [['venda', 1, 'limao'], ['perda', 1, 'ninho']]);
  assert.deepEqual(resumo(ler('vendi 2 de limão e comi 1 de ninho')), [['venda', 2, 'limao'], ['perda', 1, 'ninho']]);
});

test('revisão: palavra de enchimento antes da quantidade não vira tamanho', () => {
  assert.deepEqual(resumo(ler('vendi ontem 30 de limão')), [['venda', 30, 'limao']]);
  assert.deepEqual(resumo(ler('vendi só 25 de limão')), [['venda', 25, 'limao']]);
  assert.deepEqual(resumo(ler('vendi tradicional 1100')), [['venda', 1, 'trad1100']]);
});

test('revisão: trecho sem nome de pudim usa o pudim do item anterior', () => {
  assert.deepEqual(resumo(ler('vendemos 5 de limão e comemos dois')), [['venda', 5, 'limao'], ['perda', 2, 'limao']]);
  assert.deepEqual(resumo(ler('vendi 2 e mais nada')), []);
});

test('tamanho falado do jeito de casa: mini/copinho = 150, médio = 550, grande = 1100; só o tamanho mostra os daquele tamanho', () => {
  const rs = [R('t150', 'Pudim tradicional 150', 6), R('t1100', 'Pudim tradicional 1100'), R('n150', 'Pudim ninho com Nutella 150', 6), R('n550', 'Pudim ninho com Nutella 550', 2)];
  const l = (t) => interpretarEstoque(t, { receitas: rs, hoje });
  const res = (r) => r.itens.map((i) => [i.tipo, i.quantidade, i.receita_id || i.candidatos.join('|')]);
  assert.deepEqual(res(l('vendi 3 mini tradicionais')), [['venda', 3, 't150']]);
  assert.deepEqual(res(l('vendi um ninho médio')), [['venda', 1, 'n550']]);
  assert.deepEqual(res(l('vendi um tradicional grande')), [['venda', 1, 't1100']]);
  assert.deepEqual(res(l('fiz uma fornada de copinho')), [['producao', null, 't150|n150']]);
});

test('revisão: "mini", "pequeno", "grande" não escondem receitas antigas sem tamanho no nome', () => {
  const rs = [R('mt', 'Mini pudim tradicional', 8), R('romeu', 'Pudim Romeu e Julieta'), R('t150', 'Pudim tradicional 150', 6), R('gel', 'Geladinho de pudim', 15)];
  const res = (t) => interpretarEstoque(t, { receitas: rs, hoje }).itens.map((i) => [i.tipo, i.quantidade, i.receita_id || i.candidatos.join('|')]);
  assert.deepEqual(res('fiz uma fornada de mini'), [['producao', 8, 'mt']]); // "mini" bate pelo nome da receita antiga
  assert.deepEqual(res('vendi um romeu e julieta pequeno'), [['venda', 1, 'romeu']]);
  assert.deepEqual(res('vendi 3 geladinhos'), [['venda', 3, 'gel']]);
  assert.deepEqual(res('vendi 2 tradicionais mini'), [['venda', 2, 'mt']]);
});

test('local e envio: "em Ibiúna", "mandei pra Ibiúna", "de São Roque"', () => {
  const rs = [R('t150', 'Pudim tradicional 150', 6), R('b150', 'Pudim brigadeirão 150', 6)];
  const l = (t) => interpretarEstoque(t, { receitas: rs, hoje });
  const res = (r) => r.itens.map((i) => [i.tipo, i.quantidade, i.receita_id, i.local, i.para]);
  assert.deepEqual(res(l('vendi 3 tradicionais 150 em Ibiúna')), [['venda', 3, 't150', 'ibiuna', '']]);
  assert.equal(l('em ibiúna vendi 3 tradicionais 150 e 2 brigadeirão 150').local, 'ibiuna');
  assert.deepEqual(res(l('em ibiúna vendi 3 tradicionais 150 e 2 brigadeirão 150')), [['venda', 3, 't150', 'ibiuna', ''], ['venda', 2, 'b150', 'ibiuna', '']]);
  assert.deepEqual(res(l('mandei 6 tradicionais 150 pra Ibiúna e 4 brigadeirão 150')), [['transferencia', 6, 't150', 'sao-roque', 'ibiuna'], ['transferencia', 4, 'b150', 'sao-roque', 'ibiuna']]);
  assert.deepEqual(res(l('levei 2 brigadeirão 150 de ibiuna para são roque')), [['transferencia', 2, 'b150', 'ibiuna', 'sao-roque']]);
  // Sem local dito: vazio (a tela usa o local escolhido).
  assert.deepEqual(res(l('vendi 1 tradicional 150')), [['venda', 1, 't150', '', '']]);
  // Local dito no trecho não atrapalha herdar o pudim anterior.
  assert.deepEqual(res(l('vendi 5 tradicional 150 em são roque e perdi 2 em ibiúna')), [['venda', 5, 't150', 'sao-roque', ''], ['perda', 2, 't150', 'ibiuna', '']]);
});
