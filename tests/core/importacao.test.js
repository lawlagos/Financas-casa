import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepararImportacao } from '../../app/core/importacao.js';
import { baseContas } from '../../app/core/seed.js';

const contas = baseContas('2026-10-01');
const prev = (extra = {}) => ({ id: 'imp-1', descricao: 'Aluguel', tipo: 'saida', natureza: 'fixo', valor: 8470, conta_id: 'itau', inicio: '2026-11-01', dia_inicio: 30, ...extra });

test('importa saldos e previstos válidos, com todas as colunas do esquema', () => {
  const r = prepararImportacao(JSON.stringify({ versao: 1, data_saldo: '2026-10-17', contas: { inter: 49, hotmart: 1462.55 }, previstos: [prev()] }), contas);
  assert.deepEqual(r.erros, []);
  assert.equal(r.contas.length, 2);
  assert.equal(r.contas.find((c) => c.id === 'hotmart').saldo_inicial, 1462.55);
  assert.equal(r.contas[0].data_saldo_inicial, '2026-10-17');
  assert.equal(r.contas[0].nome, 'Inter');
  assert.equal(r.previstos[0].parcelas_total, '');
  assert.equal(r.previstos[0].dia_inicio, 30);
});

test('recusa texto quebrado, conta inexistente e previsto incompleto', () => {
  assert.match(prepararImportacao('{"versao":1,', contas).erros[0], /não é uma importação válida/);
  const r = prepararImportacao({ versao: 1, data_saldo: '2026-10-17', contas: { santander: 10 }, previstos: [prev({ conta_id: 'x' }), prev({ id: 'b', natureza: 'parcelado' }), prev({ id: 'c', natureza: 'unico' })] }, contas);
  assert.equal(r.erros.length, 4);
  assert.match(r.erros.join(' '), /santander/);
  assert.match(r.erros.join(' '), /conta desconhecida/);
  assert.match(r.erros.join(' '), /total de parcelas/);
  assert.match(r.erros.join(' '), /data inválida/);
});
