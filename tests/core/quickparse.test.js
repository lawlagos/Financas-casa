import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseQuick } from '../../app/core/quickparse.js';
import { demoTables } from '../../app/core/seed.js';

const { contas, categorias } = demoTables('2026-10-16');
const ctx = { contas, categorias, hoje: '2026-10-16' };
const nome = (id) => contas.find((c) => c.id === id)?.nome;

test('saída de mercado pro pudim no nubank dela', () => {
  const r = parseQuick('gastei 87,50 no mercado pro pudim no nubank pj dela', ctx);
  assert.equal(r.tipo, 'saida');
  assert.equal(r.valor, 87.5);
  assert.equal(r.origem, 'Pudim');
  assert.equal(nome(r.conta_id), 'Nubank PJ');
  assert.ok(r.categoria_id);
});

test('transferência entre contas com "mil"', () => {
  const r = parseQuick('passei 2 mil da C6 pro Itaú', ctx);
  assert.equal(r.tipo, 'transferencia');
  assert.equal(r.valor, 2000);
  assert.equal(nome(r.conta_id), 'C6');
  assert.equal(nome(r.conta_destino_id), 'Itaú');
});

test('entrada de consultoria ontem', () => {
  const r = parseQuick('recebi 1.500 da consultoria do Danilo no inter ontem', ctx);
  assert.equal(r.tipo, 'entrada');
  assert.equal(r.valor, 1500);
  assert.equal(r.origem, 'Consultoria');
  assert.equal(nome(r.conta_id), 'Inter');
  assert.equal(r.data, '2026-10-15');
});

test('sem conta reconhecida fica vazio para a tela perguntar', () => {
  const r = parseQuick('paguei 40 de uber', ctx);
  assert.equal(r.tipo, 'saida');
  assert.equal(r.conta_id, null);
  assert.equal(r.origem, 'Casa');
});

test('palavra inteira: "gastei" não vira categoria Gás; nome mais específico de conta vence', () => {
  const r = parseQuick('gastei 87,50 no assaí pro pudim no nubank pj', ctx);
  assert.equal(nome(r.conta_id), 'Nubank PJ');
  assert.equal(categorias.find((c) => c.id === r.categoria_id)?.nome, 'Ingrediente');
  assert.equal(r.origem, 'Pudim');
  assert.equal(r.descricao, 'Assaí pudim');
});

test('categoria pelo nome quando citada', () => {
  const r = parseQuick('paguei 120 de luz no itaú', ctx);
  assert.equal(categorias.find((c) => c.id === r.categoria_id)?.nome, 'Luz');
  assert.equal(nome(r.conta_id), 'Itaú');
});

test('valor falado com centavos separados: "54 e 96" é 54,96', async () => {
  const { parseQuick } = await import('../../app/core/quickparse.js');
  const v = (t) => parseQuick(t, { contas: [], categorias: [], hoje: '2026-10-17' }).valor;
  assert.equal(v('gastei 54 e 96 no mercado'), 54.96);
  assert.equal(v('mercado 54 e 96'), 54.96);
  assert.equal(v('paguei 54 reais e 96 centavos de luz'), 54.96);
  assert.equal(v('padaria 12 e 5 centavos'), 12.05);
  assert.equal(v('chiclete 96 centavos'), 0.96);
  assert.equal(v('gastei 54 no mercado'), 54);
  assert.equal(v('mercado 87,50'), 87.5);
  assert.equal(v('recebi 2 mil e 50'), 2000);
});
