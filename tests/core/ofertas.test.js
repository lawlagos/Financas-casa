import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ofertasDe, pesquisar, cicloDe, textoCompra, linkGoogleShopping } from '../../app/core/ofertas.js';

const hoje = '2026-10-17';
const lc = { id: 'lc', nome: 'Leite condensado', tipo: 'ingrediente', marca: 'Moça', qtd_embalagem: 395, unidade: 'g', preco_embalagem: 6.39, data_preco: '2026-10-01', ativo: true };
const tampa = { id: 'tampa', nome: 'Tampa Rojek', tipo: 'embalagem', qtd_embalagem: 1, unidade: 'un', preco_embalagem: 1.26, ativo: true };
const sacola = { id: 'sacola', nome: 'Sacola', tipo: 'embalagem', qtd_embalagem: 1, unidade: 'un', preco_embalagem: '', ativo: true };

test('ofertas simuladas: perto do preço pago, ordenadas por preço por kg, a mais barata marcada', () => {
  const o = ofertasDe(lc, { hoje });
  assert.ok(o.length >= 2);
  for (const x of o) {
    assert.ok(Math.abs(x.diferenca) <= 0.2, 'variação de até uns 15%');
    assert.equal(x.medida, 'kg');
  }
  assert.ok(o.every((x, i) => i === 0 || x.porMedida >= o[i - 1].porMedida));
  assert.equal(o.filter((x) => x.maisBarato).length, 1);
  assert.equal(o[0].referencia.preco, 639);
  assert.match(o[0].titulo, /Leite condensado Moça (395 g|790 g)/);
});

test('mesma pesquisa, mesmo resultado no ciclo de 3 dias; muda no ciclo seguinte; sem preço não simula', () => {
  assert.equal(cicloDe('2026-10-17'), cicloDe('2026-10-18'));
  const a = ofertasDe(lc, { hoje: '2026-10-17' });
  assert.deepEqual(ofertasDe(lc, { hoje: cicloDe('2026-10-17') }), a);
  const outra = ofertasDe(lc, { hoje: addTres(cicloDe('2026-10-17')) });
  assert.notDeepEqual(outra.map((x) => x.preco), a.map((x) => x.preco));
  assert.deepEqual(ofertasDe(sacola, { hoje }), []);
});

function addTres(d) {
  const [y, m, dd] = d.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, dd + 3)).toISOString().slice(0, 10);
}

test('pesquisa por nome sem acento, mais usados nas receitas primeiro, filtro por tipo', () => {
  const receitas = [{ ativo: true, ingredientes: JSON.stringify([{ insumo_id: 'tampa', quantidade: 6 }]) }, { ativo: true, ingredientes: [{ insumo_id: 'tampa', quantidade: 1 }, { insumo_id: 'lc', quantidade: 395 }] }];
  const r = pesquisar('', { insumos: [lc, tampa, sacola], receitas, hoje });
  assert.deepEqual(r.map((x) => [x.insumo.id, x.usadoEm]), [['tampa', 2], ['lc', 1], ['sacola', 0]]);
  assert.deepEqual(pesquisar('condensado moca', { insumos: [lc, tampa], receitas, hoje }).map((x) => x.insumo.id), ['lc']);
  assert.deepEqual(pesquisar('', { insumos: [lc, tampa], receitas, hoje, tipo: 'embalagem' }).map((x) => x.insumo.id), ['tampa']);
});

test('lista para o WhatsApp agrupa por loja; link do Google Shopping de verdade', () => {
  const [o] = ofertasDe(lc, { hoje });
  const t = textoCompra([{ oferta: o, quantidade: 2 }], (c) => `R$ ${(c / 100).toFixed(2)}`);
  assert.match(t, new RegExp(`\\*${o.loja.nome}\\*`));
  assert.match(t, /Total: R\$ /);
  assert.equal(linkGoogleShopping(lc), 'https://www.google.com/search?tbm=shop&q=Leite%20condensado%20Mo%C3%A7a');
});
