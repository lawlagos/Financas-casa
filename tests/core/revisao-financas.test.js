// Casos achados na revisão geral dos cálculos (outubro/2026).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { businessWeeks, monthlyTithe, CATEGORIA_DIZIMO, refMes } from '../../app/core/tithe.js';
import { project, dizimosPendentes } from '../../app/core/projection.js';
import { parseQuick } from '../../app/core/quickparse.js';
import { commitments } from '../../app/core/planning.js';
import { rawOccurrences, openOccurrences } from '../../app/core/recurrence.js';
import { prepararImportacao } from '../../app/core/importacao.js';
import { conferirLeitura } from '../../app/core/leitura.js';
import { baseContas, baseCategorias } from '../../app/core/seed.js';

const hoje = '2026-10-17'; // sábado
const contas = baseContas('2026-10-01');
const L = (data, tipo, valor, origem, extra = {}) => ({ id: `${data}-${valor}`, data, tipo, valor, origem, conta_id: 'itau', ...extra });

test('lançamento de negócio só em semana futura não derruba o Início', () => {
  const w = businessWeeks([L('2026-10-25', 'entrada', 100, 'Pudim')], hoje);
  assert.equal(w.length, 1);
  assert.equal(w[0].inicio, '2026-10-17');
  assert.equal(w[0].dizimo, 0);
});

test('Futuro desconta o dízimo de salário já recebido e de semana fechada ainda não pagos', () => {
  const lancs = [
    L('2026-10-05', 'entrada', 10000, 'Salario'),
    L('2026-10-10', 'entrada', 500, 'Pudim'), // semana 10/10 a 16/10: dízimo 50, paga hoje
    L('2026-10-17', 'entrada', 300, 'Pudim'), // semana atual: 30, paga 24/10
  ];
  const p = dizimosPendentes({ contas, lancs, hoje });
  assert.deepEqual(p.map((x) => [x.data, x.valor]).sort(), [['2026-10-17', 5000], ['2026-10-17', 100000], ['2026-10-24', 3000]].sort());
  const sem = project({ contas, lancs, previstos: [], baixas: [], hoje, ate: '2026-10-31' });
  const pagos = [...lancs, { ...L('2026-10-17', 'saida', 1000, 'Casa'), categoria_id: CATEGORIA_DIZIMO, id_externo: refMes('2026-10') }];
  const com = project({ contas, lancs: pagos, previstos: [], baixas: [], hoje, ate: '2026-10-31' });
  // pagar o dízimo do mês tira ele da lista de pendentes e o saldo final fica igual
  assert.equal(com.final, sem.final);
  assert.equal(monthlyTithe(pagos, '2026-10').pago.valor, 100000);
});

test('valor falado não vem do nome da conta ("no c6 230 reais")', () => {
  const r = parseQuick('paguei a luz no c6 230 reais', { contas, categorias: baseCategorias(), hoje });
  assert.equal(r.valor, 230);
  assert.equal(r.conta_id, 'c6');
  assert.equal(parseQuick('gastei 1.500 no mercado', { contas, categorias: baseCategorias(), hoje }).valor, 1500);
  assert.equal(parseQuick('recebi 2 mil de consultoria', { contas, categorias: baseCategorias(), hoje }).valor, 2000);
});

test('parcelado quitado não conta em Comprometido por mês', () => {
  const p = { id: 'emp', natureza: 'parcelado', tipo: 'saida', valor: 500, inicio: '2025-01-05', dia_inicio: 5, a_cada: 1, parcelas_total: 3, parcela_no_inicio: 1, ativo: true };
  const baixas = rawOccurrences(p, '2100-01-01').map((o) => ({ previsto_id: 'emp', ref: o.ref, status: 'baixado' }));
  const c = commitments({ previstos: [p], baixas, lancs: [], hoje });
  assert.equal(c.total, 0);
  assert.equal(c.parcelas[0].quitado, true);
});

test('previsto semanal sem dia da semana cai no dia do início, não no domingo', () => {
  const p = { id: 's', natureza: 'fixo', tipo: 'saida', valor: 10, recorrencia: 'semanal', dia_semana: '', inicio: '2026-10-14', ativo: true };
  assert.deepEqual(rawOccurrences(p, '2026-10-28').map((o) => o.data), ['2026-10-14', '2026-10-21', '2026-10-28']);
});

test('renovação adiada pode ser confirmada e continua certa na data nova', () => {
  const p = { id: 'r', natureza: 'fixo', tipo: 'entrada', valor: 100, a_cada: 12, mes_ancora: 11, dia_inicio: 10, inicio: '2026-01-01', renovacao: true, confianca: 'provavel', ativo: true };
  const baixas = [{ previsto_id: 'r', ref: '2026-11-10', status: 'renovou', nova_data: '2026-11-20' }];
  const [o] = openOccurrences({ previstos: [p], baixas, de: hoje, ate: '2026-12-31', hoje });
  assert.deepEqual([o.data, o.confianca], ['2026-11-20', 'certo']);
});

test('previsto importado sem "ativo" entra ativo', () => {
  const imp = { versao: 1, previstos: [{ id: 'x', descricao: 'Internet', tipo: 'saida', natureza: 'fixo', valor: 312, conta_id: 'itau', inicio: '2026-11-08' }] };
  const r = prepararImportacao(JSON.stringify(imp), contas, []);
  assert.deepEqual([r.previstos[0].ativo, r.previstos[0].renovacao], [true, false]);
});

test('leitura de print aceita valores no formato brasileiro', () => {
  const r = conferirLeitura({ tipo_documento: 'comprovante', data: '2026-10-16', lancamentos: [{ tipo: 'saida', valor: '1.234,56', descricao: 'x' }, { tipo: 'saida', valor: '1.234', descricao: 'y' }] }, { contas, categorias: baseCategorias(), lancamentos: [] }, hoje);
  assert.deepEqual(r.lancamentos.map((l) => l.valor), [1234.56, 1234]);
});
