import { test } from 'node:test';
import assert from 'node:assert/strict';
import { porFornada, gastoDaProducao, saldos, minimos, faltas, pudinsAbaixo, quantidadeComprada, entradasDeItens } from '../../app/core/estoqueinsumos.js';
import { custoReceita } from '../../app/core/pudim.js';

const insumos = {
  lc: { id: 'lc', nome: 'Leite condensado', tipo: 'ingrediente', qtd_embalagem: 395, unidade: 'g', preco_embalagem: 6.32 },
  leite: { id: 'leite', nome: 'Leite integral', tipo: 'ingrediente', qtd_embalagem: 1, unidade: 'l', preco_embalagem: 5.29, produto: 'Leite' },
  morango: { id: 'morango', nome: 'Morango', tipo: 'ingrediente', qtd_embalagem: 1020, unidade: 'g', preco_embalagem: 19.99 },
  acucar: { id: 'acucar', nome: 'Açúcar', tipo: 'ingrediente', qtd_embalagem: 1, unidade: 'kg', preco_embalagem: 3.79 },
  saq: { id: 'saq', nome: 'Saquinho', tipo: 'embalagem', qtd_embalagem: 400, unidade: 'un', preco_embalagem: 38 },
};
const L = (xs) => xs.map(([insumo_id, quantidade]) => ({ insumo_id, quantidade }));
const receitas = {
  calda: { id: 'calda', nome: 'Calda de morango', tipo: 'preparo', rendimento: 400, ingredientes: L([['morango', 220], ['acucar', 200]]) },
  base: { id: 'base', nome: 'Geladinho de ninho com morango', tipo: 'sabor', ingredientes: L([['lc', 790], ['leite', 1000], ['preparo:calda', 225]]) },
  gel: { id: 'gel', nome: 'Geladinho de ninho com morango', tipo: 'produto', sabor_id: 'base', rendimento: 15, estoque_minimo: 1, ingredientes: L([['saq', 15]]) },
  t150: { id: 't150', nome: 'Pudim tradicional 150', tipo: 'produto', sabor_id: 'tbase', rendimento: 6, estoque_minimo: 2, ingredientes: [] },
  tbase: { id: 'tbase', nome: 'Pudim tradicional', tipo: 'sabor', ingredientes: L([['lc', 395], ['leite', 300]]) },
};

test('uma fornada abre o preparo (225 g de calda que rende 400 g) nos ingredientes dele', () => {
  const f = porFornada(receitas.gel, receitas);
  assert.deepEqual(Object.keys(f).sort(), ['acucar', 'lc', 'leite', 'morango', 'saq']);
  assert.equal(f.lc, 790);
  assert.equal(f.saq, 15);
  assert.ok(Math.abs(f.morango - (220 * 225) / 400) < 1e-9);
  assert.ok(Math.abs(f.acucar - (200 * 225) / 400) < 1e-9);
  // produzir 30 geladinhos = 2 fornadas
  assert.equal(gastoDaProducao(receitas.gel, 30, receitas).lc, 1580);
});

test('custo do preparo entra pelo que foi usado dele', () => {
  const c = custoReceita(receitas.gel, insumos, [], null, receitas);
  const caldaInteira = Math.round((1999 / 1020) * 220) + Math.round((379 / 1000) * 200);
  const usada = Math.round((caldaInteira / 400) * 225);
  assert.equal(c.ingredientes, Math.round((632 / 395) * 790) + Math.round((529 / 1000) * 1000) + usada);
  assert.deepEqual(c.faltando, []);
});

test('saldo: última contagem mais entradas e menos saídas depois dela', () => {
  const m = [
    { data: '2026-10-01', insumo_id: 'lc', tipo: 'entrada', quantidade: 395 },
    { data: '2026-10-10', insumo_id: 'lc', tipo: 'contagem', quantidade: 1185 },
    { data: '2026-10-12', insumo_id: 'lc', tipo: 'entrada', quantidade: 2370 },
    { data: '2026-10-13', insumo_id: 'lc', tipo: 'saida', quantidade: 790 },
  ];
  const s = saldos(m);
  assert.equal(s.saldo.lc, 1185 + 2370 - 790);
  assert.equal(s.contadoEm.lc, '2026-10-10');
});

test('mínimo de ingredientes vem do mínimo de fornadas; faltas em embalagens; pudins abaixo do mínimo', () => {
  const produtos = [receitas.gel, receitas.t150];
  const min = minimos(produtos, receitas);
  assert.equal(min.lc, 790 + 2 * 395);
  const f = faltas({ saldo: { lc: 400, leite: 5000 }, minimo: min, insumosPorId: insumos });
  const lc = f.find((x) => x.insumo.id === 'lc');
  assert.deepEqual([lc.falta, lc.embalagens], [1180, 3]);
  assert.ok(!f.some((x) => x.insumo.id === 'leite'));
  const abaixo = pudinsAbaixo(produtos, { t150: 5, gel: 15 });
  assert.deepEqual(abaixo.map((x) => [x.receita.id, x.tem, x.minimo, x.fornadas]), [['t150', 5, 12, 2]]);
});

test('compra vira entrada na unidade do ingrediente', () => {
  assert.equal(quantidadeComprada({ quantidade: 6, tamanho: 395, tamanho_unidade: 'g' }, insumos.lc), 2370);
  assert.equal(quantidadeComprada({ quantidade: 2, unidade: 'kg' }, insumos.acucar), 2000);
  assert.equal(quantidadeComprada({ quantidade: 3, unidade: 'un' }, insumos.leite), 3000);
  const e = entradasDeItens([{ id: 'i1', data: '2026-10-17', produto: 'Leite', quantidade: 2 }, { id: 'i2', produto: 'Detergente', quantidade: 1 }], Object.values(insumos), { data: '2026-10-17' });
  assert.deepEqual(e.map((x) => [x.insumo_id, x.quantidade, x.ref]), [['leite', 2000, 'i1']]);
});
