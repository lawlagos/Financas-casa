import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, businessWeek, businessWeekStart, dateInMonth, addMonthsKey, diffDays, weekday } from '../../app/core/dates.js';
import { toCents, parseBRL, brl, brlCompact } from '../../app/core/money.js';

test('semana de apuração vai de sábado a sexta', () => {
  // 2026-10-16 é sexta
  assert.equal(weekday('2026-10-16'), 5);
  assert.equal(businessWeekStart('2026-10-16'), '2026-10-10');
  // sábado começa semana nova
  assert.equal(businessWeekStart('2026-10-17'), '2026-10-17');
  assert.deepEqual(businessWeek('2026-10-12'), { inicio: '2026-10-10', fim: '2026-10-16', pagarEm: '2026-10-17' });
});

test('datas: soma de dias, diferença, mês limitado', () => {
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(diffDays('2026-11-01', '2026-10-30'), 2);
  assert.equal(dateInMonth(2027, 2, 30), '2027-02-28');
  assert.equal(addMonthsKey('2026-11', 3), '2027-02');
  assert.equal(addMonthsKey('2026-01', -1), '2025-12');
});

test('dinheiro: parse e formato brasileiro', () => {
  assert.equal(parseBRL('1.234,56'), 1234.56);
  assert.equal(parseBRL('R$ 87,50'), 87.5);
  assert.equal(parseBRL('1234.5'), 1234.5);
  assert.equal(parseBRL('1.500'), 1500);
  assert.equal(parseBRL('12.50'), 12.5);
  assert.equal(toCents(0.1 + 0.2), 30);
  assert.equal(brl(123456), 'R$ 1.234,56');
  assert.equal(brl(-500), '-R$ 5,00');
  assert.equal(brlCompact(1243000), '12,4 mil');
});
