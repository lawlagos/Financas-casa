// Simulação de entradas e saídas em dois locais, com lotes de vários sabores e correções.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { processarEstoque, estoqueAtual, lotesNaGeladeira, LOCAIS_PADRAO } from '../../app/core/pudim.js';

const hoje = '2026-10-17';
const R = { trad: { id: 'trad', nome: 'Pudim tradicional 150', preco_venda: 12 }, brig: { id: 'brig', nome: 'Brigadeirão 150', preco_venda: 13 }, gel: { id: 'gel', nome: 'Geladinho de pudim', preco_venda: 5 } };
let n = 0;
const M = (data, tipo, receita_id, quantidade, extra = {}) => ({ id: `m${++n}`, data, tipo, receita_id, quantidade, criado_em: `${data}T${String(10 + (n % 10)).padStart(2, '0')}:00:${String(n).padStart(2, '0')}`, ...extra });
const qtd = (movs, local) => {
  const { lotes } = processarEstoque(movs, () => 300, LOCAIS_PADRAO);
  const e = estoqueAtual(lotes, R, hoje, local);
  return Object.fromEntries(e.lista.map((x) => [x.receita_id, [x.quantidade, x.vencidos]]));
};

test('lote com vários sabores e a mesma validade; envio para Ibiúna leva a validade; vendas em cada local', () => {
  const lote = { lote_id: 'L1', validade: '2026-10-21', local: 'sao-roque', custo_unitario: 3 };
  const movs = [
    M('2026-10-16', 'producao', 'trad', 12, lote),
    M('2026-10-16', 'producao', 'brig', 6, lote),
    M('2026-10-16', 'producao', 'gel', 15, lote),
    M('2026-10-16', 'transferencia', 'trad', 6, { local: 'sao-roque', local_destino: 'ibiuna' }),
    M('2026-10-17', 'venda', 'trad', 3, { local: 'ibiuna', preco_unitario: 12 }),
    M('2026-10-17', 'venda', 'trad', 2, { local: 'sao-roque', preco_unitario: 12 }),
  ];
  assert.deepEqual(qtd(movs, 'sao-roque'), { trad: [4, 0], brig: [6, 0], gel: [15, 0] });
  assert.deepEqual(qtd(movs, 'ibiuna'), { trad: [3, 0] });
  assert.deepEqual(qtd(movs), { trad: [7, 0], brig: [6, 0], gel: [15, 0] });
  const { lotes, saidas } = processarEstoque(movs, () => 300);
  // o envio não é custo; a venda em Ibiúna custa o do lote
  assert.equal(saidas.m4.custo, 0);
  assert.equal(saidas.m5.custo, 900);
  const g = lotesNaGeladeira(lotes, hoje, 'ibiuna');
  assert.deepEqual(g.map((x) => [x.lote, x.validade, x.produzidoEm, x.itens]), [['L1', '2026-10-21', '2026-10-16', { trad: 3 }]]);
  const sr = lotesNaGeladeira(lotes, hoje, 'sao-roque');
  assert.deepEqual(sr[0].itens, { trad: 4, brig: 6, gel: 15 });
});

test('correção: saída lançada em Ibiúna que era de São Roque — editar o local devolve para um e tira do outro', () => {
  const base = [
    M('2026-10-15', 'producao', 'trad', 12, { local: 'sao-roque', validade: '2026-10-20' }),
    M('2026-10-15', 'transferencia', 'trad', 6, { local: 'sao-roque', local_destino: 'ibiuna' }),
  ];
  const venda = M('2026-10-16', 'venda', 'trad', 3, { local: 'ibiuna', preco_unitario: 12 });
  assert.deepEqual([qtd([...base, venda], 'sao-roque').trad, qtd([...base, venda], 'ibiuna').trad], [[6, 0], [3, 0]]);
  const corrigida = { ...venda, local: 'sao-roque' };
  assert.deepEqual([qtd([...base, corrigida], 'sao-roque').trad, qtd([...base, corrigida], 'ibiuna').trad], [[3, 0], [6, 0]]);
});

test('vencido fica no local onde está; baixa de vencido em Ibiúna não mexe em São Roque', () => {
  const movs = [
    M('2026-10-10', 'producao', 'trad', 6, { validade: '2026-10-14' }), // sem local = São Roque
    M('2026-10-11', 'transferencia', 'trad', 4, { local: 'sao-roque', local_destino: 'ibiuna' }),
    M('2026-10-15', 'producao', 'trad', 6, { local: 'sao-roque', validade: '2026-10-20' }),
  ];
  assert.deepEqual(qtd(movs, 'ibiuna').trad, [0, 4]);
  assert.deepEqual(qtd(movs, 'sao-roque').trad, [6, 2]);
  const comBaixa = [...movs, M('2026-10-17', 'perda', 'trad', 4, { local: 'ibiuna', obs: 'vencido' })];
  assert.equal(qtd(comBaixa, 'ibiuna').trad, undefined);
  assert.deepEqual(qtd(comBaixa, 'sao-roque').trad, [6, 2]);
});

test('venda em Ibiúna sem estoque lá fica devendo e o próximo envio cobre; envio maior que o estoque chega inteiro', () => {
  const movs = [
    M('2026-10-14', 'producao', 'brig', 6, { local: 'sao-roque', validade: '2026-10-19' }),
    M('2026-10-15', 'venda', 'brig', 2, { local: 'ibiuna', preco_unitario: 13 }),
    M('2026-10-16', 'transferencia', 'brig', 4, { local: 'sao-roque', local_destino: 'ibiuna' }),
  ];
  assert.equal(processarEstoque(movs, () => 300).saidas[movs[1].id].semProducao, 2);
  // Ibiúna: chegaram 4, mas 2 já tinham sido vendidos antes de chegarem → sobram 2.
  assert.deepEqual(qtd(movs, 'ibiuna').brig, [2, 0]);
  assert.deepEqual(qtd(movs, 'sao-roque').brig, [2, 0]);
  const demais = [M('2026-10-14', 'producao', 'gel', 3, { local: 'sao-roque', validade: '2026-10-19' }), M('2026-10-15', 'transferencia', 'gel', 5, { local: 'sao-roque', local_destino: 'ibiuna' })];
  assert.deepEqual(qtd(demais, 'ibiuna').gel, [5, 0]);
  assert.equal(qtd(demais, 'sao-roque').gel, undefined);
});

test('mesmo dia, lançado fora de ordem: produção, depois envio, depois venda', () => {
  const movs = [
    M('2026-10-17', 'venda', 'trad', 2, { local: 'ibiuna', preco_unitario: 12 }),
    M('2026-10-17', 'transferencia', 'trad', 3, { local: 'sao-roque', local_destino: 'ibiuna' }),
    M('2026-10-17', 'producao', 'trad', 6, { local: 'sao-roque', validade: '2026-10-22' }),
  ];
  const { saidas } = processarEstoque(movs, () => 300);
  assert.deepEqual(Object.values(saidas).map((x) => x.semProducao), [0, 0]);
  assert.deepEqual([qtd(movs, 'sao-roque').trad, qtd(movs, 'ibiuna').trad], [[3, 0], [1, 0]]);
});

test('simulação aleatória (500 sequências): em cada local, o que tem − o que deve = produzido + recebido − enviado − vendido − perdido', () => {
  let semente = 42;
  const rnd = () => ((semente = (semente * 1103515245 + 12345) % 2147483648) / 2147483648);
  const escolhe = (xs) => xs[Math.floor(rnd() * xs.length)];
  const locais = ['sao-roque', 'ibiuna'];
  for (let rodada = 0; rodada < 500; rodada++) {
    const movs = [];
    const conta = {}; // receita|local → saldo esperado
    const soma = (k, v) => (conta[k] = (conta[k] || 0) + v);
    for (let i = 0; i < 25; i++) {
      const data = `2026-10-${String(1 + Math.floor(rnd() * 16)).padStart(2, '0')}`;
      const receita = escolhe(['trad', 'brig', 'gel']);
      const local = escolhe(locais);
      const q = 1 + Math.floor(rnd() * 8);
      const tipo = escolhe(['producao', 'producao', 'venda', 'venda', 'perda', 'transferencia']);
      const extra = { local };
      if (tipo === 'producao') extra.validade = `2026-10-${String(Math.min(28, Number(data.slice(8)) + 1 + Math.floor(rnd() * 6))).padStart(2, '0')}`;
      if (tipo === 'perda') extra.obs = escolhe(['vencido', 'quebrou']);
      if (tipo === 'transferencia') extra.local_destino = local === 'sao-roque' ? 'ibiuna' : 'sao-roque';
      movs.push(M(data, tipo, receita, q, extra));
      if (tipo === 'producao') soma(`${receita}|${local}`, q);
      else if (tipo === 'transferencia') {
        soma(`${receita}|${local}`, -q);
        soma(`${receita}|${extra.local_destino}`, q);
      } else soma(`${receita}|${local}`, -q);
    }
    const { lotes, devendo } = processarEstoque(movs, () => 300);
    assert.ok(lotes.every((l) => l.restante > 0), 'nenhum lote negativo');
    for (const receita of ['trad', 'brig', 'gel']) {
      for (const local of locais) {
        const k = `${receita}|${local}`;
        const tem = lotes.filter((l) => l.receita_id === receita && l.local === local).reduce((t, l) => t + l.restante, 0);
        assert.equal(tem - (devendo[k] || 0), conta[k] || 0, `rodada ${rodada}, ${k}`);
      }
    }
  }
});

test('envio leva os mais novos; o que vence logo fica no local que vende mais', () => {
  const movs = [
    M('2026-10-14', 'producao', 'trad', 4, { validade: '2026-10-18' }),
    M('2026-10-17', 'producao', 'trad', 6, { validade: '2026-10-22' }),
    M('2026-10-17', 'transferencia', 'trad', 6, { local: 'sao-roque', local_destino: 'ibiuna' }),
  ];
  const { lotes } = processarEstoque(movs, () => 0);
  assert.deepEqual(lotesNaGeladeira(lotes, hoje).map((g) => [g.local, g.validade, g.total]), [['sao-roque', '2026-10-18', 4], ['ibiuna', '2026-10-22', 6]]);
});
