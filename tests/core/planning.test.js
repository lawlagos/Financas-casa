import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rawOccurrences, openOccurrences, projectedValue } from '../../app/core/recurrence.js';
import { project } from '../../app/core/projection.js';
import { findMatch, commitments, receivables } from '../../app/core/planning.js';

const P = (extra) => ({ id: 'p', tipo: 'saida', natureza: 'fixo', recorrencia: 'meses', a_cada: 1, valor: 100, conta_id: 'itau', inicio: '2026-10-01', ativo: true, confianca: 'certo', ...extra });

test('fixo mensal com dia 31 limita ao fim do mês', () => {
  const occ = rawOccurrences(P({ dia_inicio: 31 }), '2027-02-28');
  assert.deepEqual(occ.map((o) => o.data), ['2026-10-31', '2026-11-30', '2026-12-31', '2027-01-31', '2027-02-28']);
});

test('janela de dias: projeta no último dia, ref no primeiro', () => {
  const [o] = rawOccurrences(P({ tipo: 'entrada', dia_inicio: 8, dia_fim: 10 }), '2026-10-31');
  assert.equal(o.ref, '2026-10-08');
  assert.equal(o.data, '2026-10-10');
});

test('parcelado para na última parcela e numera k/N', () => {
  const occ = rawOccurrences(P({ natureza: 'parcelado', dia_inicio: 5, parcelas_total: 12, parcela_no_inicio: 10, inicio: '2026-11-01' }), '2027-12-31');
  assert.deepEqual(occ.map((o) => `${o.data} ${o.parcela.k}/${o.parcela.n}`), ['2026-11-05 10/12', '2026-12-05 11/12', '2027-01-05 12/12']);
});

test('a cada N meses com mês âncora (anual em abril, trimestral)', () => {
  const anual = rawOccurrences(P({ a_cada: 12, mes_ancora: 4, dia_inicio: 15 }), '2028-12-31');
  assert.deepEqual(anual.map((o) => o.data), ['2027-04-15', '2028-04-15']);
  const tri = rawOccurrences(P({ a_cada: 3, mes_ancora: 1, dia_inicio: 20 }), '2027-08-01');
  assert.deepEqual(tri.map((o) => o.data), ['2026-10-20', '2027-01-20', '2027-04-20', '2027-07-20']);
});

test('semanal e único', () => {
  assert.deepEqual(rawOccurrences(P({ recorrencia: 'semanal', dia_semana: 6 }), '2026-10-20').map((o) => o.data), ['2026-10-03', '2026-10-10', '2026-10-17']);
  assert.deepEqual(rawOccurrences(P({ natureza: 'unico', data_unica: '2027-01-15' }), '2027-12-31').map((o) => o.data), ['2027-01-15']);
});

test('variável usa média dos 3 últimos reais', () => {
  const p = P({ natureza: 'variavel', valor: 250 });
  assert.equal(projectedValue(p, []), 25000);
  const lancs = [200, 300, 280, 999].map((v, i) => ({ previsto_id: 'p', valor: v, data: `2026-0${9 - i}-10` }));
  assert.equal(projectedValue(p, lancs), Math.round((20000 + 30000 + 28000) / 3));
});

test('baixas: baixado/pulado somem, adiado muda data, atrasado marcado', () => {
  const p = P({ dia_inicio: 5 });
  const baixas = [
    { previsto_id: 'p', ref: '2026-10-05', status: 'baixado' },
    { previsto_id: 'p', ref: '2026-11-05', status: 'adiado', nova_data: '2026-11-20' },
    { previsto_id: 'p', ref: '2026-12-05', status: 'pulado' },
  ];
  const occ = openOccurrences({ previstos: [p], baixas, de: '2026-09-01', ate: '2027-01-31', hoje: '2026-11-25' });
  assert.deepEqual(occ.map((o) => [o.data, o.atrasado]), [['2026-11-20', true], ['2027-01-05', false]]);
});

test('renovação conta como provável até confirmar', () => {
  const p = P({ tipo: 'entrada', renovacao: true, a_cada: 12, mes_ancora: 4, dia_inicio: 10 });
  let [o] = openOccurrences({ previstos: [p], de: '2026-10-01', ate: '2027-12-31', hoje: '2026-10-16' });
  assert.equal(o.confianca, 'provavel');
  [o] = openOccurrences({ previstos: [p], baixas: [{ previsto_id: 'p', ref: '2027-04-10', status: 'renovou' }], de: '2026-10-01', ate: '2027-12-31', hoje: '2026-10-16' });
  assert.equal(o.confianca, 'certo');
});

test('projeção: saldo inicial, previstos, diário, dízimo previsto, prováveis à parte, mínimo', () => {
  const contas = [{ id: 'itau', grupo: 'Pessoal', saldo_inicial: 1000, data_saldo_inicial: '2026-10-01' }];
  const previstos = [
    P({ id: 'aluguel', valor: 2000, dia_inicio: 20 }),
    P({ id: 'sal', tipo: 'entrada', origem: 'Salario', valor: 4500, dia_inicio: 25 }),
    P({ id: 'eduardo', tipo: 'entrada', origem: 'Consultoria', valor: 3000, dia_inicio: 22, confianca: 'provavel' }),
  ];
  const r = project({ contas, lancs: [], previstos, baixas: [], config: { gasto_diario: 10, reserva_minima: 500 }, hoje: '2026-10-16', ate: '2026-10-31' });
  assert.equal(r.inicial, 100000);
  const d20 = r.dias.find((d) => d.data === '2026-10-20');
  // 4 dias de diário (17..20) + aluguel
  assert.equal(d20.saldo, 100000 - 4 * 1000 - 200000);
  const d22 = r.dias.find((d) => d.data === '2026-10-22');
  assert.equal(d22.saldoProvavel - d22.saldo, 300000 - 30000); // provável com dízimo provável
  const d25 = r.dias.find((d) => d.data === '2026-10-25');
  assert.equal(d25.entra, 450000);
  assert.equal(d25.sai, 45000); // dízimo do salário
  assert.equal(r.minimo.data, '2026-10-24');
  assert.equal(r.precisaFazer, -r.minimo.valor);
  assert.equal(r.precisaReserva, 50000 - r.minimo.valor);
});

test('projeção por grupo ignora contas de fora e transferências entram/saem', () => {
  const contas = [
    { id: 'itau', grupo: 'Pessoal', saldo_inicial: 0 },
    { id: 'c6', grupo: 'Empresa', saldo_inicial: 0 },
  ];
  const previstos = [P({ id: 't', tipo: 'transferencia', conta_id: 'c6', conta_destino_id: 'itau', valor: 1000, dia_inicio: 20 })];
  const pess = project({ contas, lancs: [], previstos, baixas: [], hoje: '2026-10-16', ate: '2026-10-31', grupo: 'Pessoal' });
  assert.equal(pess.final, 100000);
  const tudo = project({ contas, lancs: [], previstos, baixas: [], hoje: '2026-10-16', ate: '2026-10-31' });
  assert.equal(tudo.final, 0);
});

test('baixa automática: encontra previsto por conta, valor e data', () => {
  const previstos = [P({ id: 'luz', natureza: 'variavel', valor: 250, dia_inicio: 10, categoria_id: 'luz' }), P({ id: 'aluguel', valor: 8470, dia_inicio: 30 })];
  const occs = openOccurrences({ previstos, de: '2026-10-01', ate: '2026-11-30', hoje: '2026-10-16' });
  const m = findMatch({ tipo: 'saida', valor: 287, conta_id: 'itau', categoria_id: 'luz', data: '2026-10-12' }, occs);
  assert.equal(m.previsto.id, 'luz');
  assert.equal(m.ref, '2026-10-10');
  assert.equal(findMatch({ tipo: 'saida', valor: 8470, conta_id: 'itau', data: '2026-10-29' }, occs).previsto.id, 'aluguel');
  assert.equal(findMatch({ tipo: 'saida', valor: 5000, conta_id: 'itau', data: '2026-10-29' }, occs), null);
  assert.equal(findMatch({ tipo: 'saida', valor: 8470, conta_id: 'nubank', data: '2026-10-29' }, occs), null);
});

test('compromissos: totais mensais, parcelas com falta pagar e alívio', () => {
  const previstos = [
    P({ id: 'aluguel', valor: 8470, dia_inicio: 30 }),
    P({ id: 'emp', natureza: 'parcelado', valor: 850, dia_inicio: 5, parcelas_total: 12, parcela_no_inicio: 7, inicio: '2026-10-01' }),
    P({ id: 'luz', natureza: 'variavel', valor: 250, dia_inicio: 10 }),
    P({ id: 'anual', valor: 1200, a_cada: 12, dia_inicio: 1 }),
  ];
  const baixas = [{ previsto_id: 'emp', ref: '2026-10-05', status: 'baixado' }];
  const c = commitments({ previstos, baixas, lancs: [], hoje: '2026-10-16' });
  assert.equal(c.porNatureza.fixo, 847000 + 10000);
  assert.equal(c.porNatureza.parcelado, 85000);
  assert.equal(c.porNatureza.variavel, 25000);
  const [emp] = c.parcelas;
  assert.equal(emp.parcelaAtual.k, 8);
  assert.equal(emp.restantes, 5);
  assert.equal(emp.faltaPagar, 5 * 85000);
  assert.equal(emp.termina, '2027-03-05');
  assert.deepEqual(c.alivio[0], { mes: '2027-04', valor: 85000, descricao: undefined });
});

test('a receber: atrasados, certos, prováveis e lembrete de renovação', () => {
  const previstos = [
    P({ id: 'kat', tipo: 'entrada', valor: 2000, dia_inicio: 8, dia_fim: 10, inicio: '2026-09-01' }),
    P({ id: 'dan', tipo: 'entrada', valor: 1500, dia_inicio: 13, dia_fim: 14, inicio: '2026-09-01' }),
    P({ id: 'mon', tipo: 'entrada', valor: 6000, a_cada: 12, mes_ancora: 11, dia_inicio: 10, renovacao: true }),
  ];
  const baixas = [
    { previsto_id: 'kat', ref: '2026-09-08', status: 'baixado' },
    { previsto_id: 'kat', ref: '2026-10-08', status: 'baixado' },
    { previsto_id: 'dan', ref: '2026-09-13', status: 'baixado' },
  ];
  const r = receivables({ previstos, baixas, lancs: [], hoje: '2026-10-16', dias: 60 });
  assert.deepEqual(r.atrasados.map((o) => o.previsto.id), ['dan']);
  assert.equal(r.totalProvavel, 600000);
  assert.equal(r.totalCerto, 200000 * 2 + 150000 * 2);
  assert.equal(r.renovacoes[0].lembrar, true);
});
