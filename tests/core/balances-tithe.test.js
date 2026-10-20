import { test } from 'node:test';
import assert from 'node:assert/strict';
import { balances, groupTotals, monthSummary } from '../../app/core/balances.js';
import { businessWeeks, monthlyTithe, refSemana, refMes, CATEGORIA_DIZIMO } from '../../app/core/tithe.js';

const contas = [
  { id: 'c6', grupo: 'Empresa', saldo_inicial: 1000, data_saldo_inicial: '2026-10-01' },
  { id: 'itau', grupo: 'Pessoal', saldo_inicial: 500, data_saldo_inicial: '2026-10-01' },
];
let n = 0;
const L = (data, tipo, valor, extra = {}) => ({ id: `l${++n}`, data, tipo, valor, conta_id: 'c6', ...extra });

test('saldo: entradas, saídas, transferências e corte pelo saldo inicial', () => {
  const lancs = [
    L('2026-09-30', 'entrada', 999), // antes do saldo inicial: ignorado
    L('2026-10-02', 'entrada', 200),
    L('2026-10-03', 'saida', 50.5),
    L('2026-10-04', 'transferencia', 300, { conta_destino_id: 'itau' }),
  ];
  const s = balances(contas, lancs);
  assert.equal(s.c6, 100000 + 20000 - 5050 - 30000);
  assert.equal(s.itau, 50000 + 30000);
  const g = groupTotals(contas, s);
  assert.equal(g.Tudo, s.c6 + s.itau);
  assert.equal(g.Empresa, s.c6);
  assert.equal(balances(contas, lancs, '2026-10-02').c6, 120000);
});

test('resumo do mês ignora transferências', () => {
  const lancs = [L('2026-10-02', 'entrada', 100), L('2026-10-03', 'saida', 40), L('2026-10-04', 'transferencia', 70, { conta_destino_id: 'itau' })];
  assert.deepEqual(monthSummary(lancs, '2026-10'), { entradas: 10000, saidas: 4000, resultado: 6000 });
});

test('dízimo semanal: Pudim+Hotmart somados, prejuízo carrega, sábado é semana nova', () => {
  const lancs = [
    // semana 03/10 (sáb) a 09/10 (sex): lucro -300
    L('2026-10-05', 'entrada', 200, { origem: 'Hotmart' }),
    L('2026-10-06', 'saida', 500, { origem: 'Hotmart' }),
    // semana 10/10 a 16/10: Hotmart -500, Pudim +1500 => +1000; base 700; dízimo 70
    L('2026-10-10', 'saida', 500, { origem: 'Hotmart' }),
    L('2026-10-12', 'entrada', 1700, { origem: 'Pudim' }),
    L('2026-10-13', 'saida', 200, { origem: 'Pudim' }),
    L('2026-10-14', 'entrada', 9999, { origem: 'Casa' }), // fora dos negócios
    L('2026-10-14', 'transferencia', 9999, { origem: 'Pudim', conta_destino_id: 'itau' }), // transferência não conta
  ];
  const semanas = businessWeeks(lancs, '2026-10-16');
  assert.equal(semanas.length, 2);
  const [s1, s2] = semanas;
  assert.equal(s1.inicio, '2026-10-03');
  assert.equal(s1.lucro, -30000);
  assert.equal(s1.dizimo, 0);
  assert.equal(s1.carregaParaProxima, -30000);
  assert.equal(s2.inicio, '2026-10-10');
  assert.equal(s2.pagarEm, '2026-10-17');
  assert.equal(s2.lucro, 100000);
  assert.equal(s2.detalhe.Pudim.lucro, 150000);
  assert.equal(s2.detalhe.Hotmart.lucro, -50000);
  assert.equal(s2.base, 70000);
  assert.equal(s2.dizimo, 7000);
  assert.equal(s2.pago, null);
});

test('dízimo semanal pago e alterado depois', () => {
  const lancs = [
    L('2026-10-12', 'entrada', 1000, { origem: 'Pudim' }),
    L('2026-10-17', 'saida', 100, { origem: 'Casa', categoria_id: CATEGORIA_DIZIMO, id_externo: refSemana('2026-10-10') }),
  ];
  let [s] = businessWeeks(lancs, '2026-10-16');
  assert.equal(s.pago.valor, 10000);
  assert.equal(s.mudouDepoisDePago, false);
  lancs.push(L('2026-10-13', 'entrada', 500, { origem: 'Pudim' }));
  [s] = businessWeeks(lancs, '2026-10-16');
  assert.equal(s.mudouDepoisDePago, true);
});

test('dízimo mensal: 10% bruto de salário, consultoria e YouTube', () => {
  const lancs = [
    L('2026-10-06', 'entrada', 4500, { origem: 'Salario' }),
    L('2026-10-10', 'entrada', 1000, { origem: 'Consultoria' }),
    L('2026-10-20', 'entrada', 333.33, { origem: 'YouTube' }),
    L('2026-11-06', 'entrada', 4500, { origem: 'Salario' }),
    L('2026-10-07', 'entrada', 800, { origem: 'Pudim' }),
  ];
  const m = monthlyTithe(lancs, '2026-10');
  assert.equal(m.bruto, 583333);
  assert.equal(m.dizimo, 45000 + 10000 + 3333);
  lancs.push(L('2026-10-31', 'saida', 583.33, { categoria_id: CATEGORIA_DIZIMO, id_externo: refMes('2026-10') }));
  assert.equal(monthlyTithe(lancs, '2026-10').pago.valor, 58333);
});

test('dízimo lançado à mão conta para o mais antigo em aberto', async () => {
  const { dizimoEmAberto, refSemana } = await import('../../app/core/tithe.js');
  const L = (data, tipo, valor, origem, extra = {}) => ({ id: `${data}${valor}`, data, tipo, valor, origem, categoria_id: 'x', ...extra });
  // semana 10/10 a 16/10 com lucro 1000 (dízimo 100), semana atual 17/10 com lucro 500 (dízimo 50)
  const lancs = [L('2026-10-12', 'entrada', 1000, 'Pudim'), L('2026-10-18', 'entrada', 500, 'Pudim')];
  const hoje = '2026-10-20';
  assert.deepEqual(dizimoEmAberto(lancs, hoje), { referencia: refSemana('2026-10-10'), titulo: 'semana de 2026-10-10', falta: 10000 });
  // depois de pagar a semana fechada, o próximo é a semana atual
  const pago = [...lancs, L('2026-10-19', 'saida', 100, 'Casa', { categoria_id: 'cat-dizimo', id_externo: refSemana('2026-10-10') })];
  assert.equal(dizimoEmAberto(pago, hoje).referencia, refSemana('2026-10-17'));
  assert.equal(dizimoEmAberto(pago, hoje).falta, 5000);
});
