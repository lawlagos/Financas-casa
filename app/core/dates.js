// Datas ISO 'AAAA-MM-DD' tratadas como dias civis (sem fuso), usando UTC internamente.

const DAY = 86400000;

export function toDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function toIso(date) {
  return date.toISOString().slice(0, 10);
}

export function addDays(iso, n) {
  return toIso(new Date(toDate(iso).getTime() + n * DAY));
}

export function diffDays(a, b) {
  return Math.round((toDate(a) - toDate(b)) / DAY);
}

// 0 = domingo ... 6 = sábado
export function weekday(iso) {
  return toDate(iso).getUTCDay();
}

export function todayIso(timeZone = 'America/Sao_Paulo') {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date());
  const get = (t) => parts.find((p) => p.type === t).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

// Semana de apuração dos negócios: sábado → sexta. Pagamento no sábado seguinte.
export function businessWeekStart(iso) {
  const offset = (weekday(iso) - 6 + 7) % 7;
  return addDays(iso, -offset);
}

export function businessWeek(iso) {
  const inicio = businessWeekStart(iso);
  return { inicio, fim: addDays(inicio, 6), pagarEm: addDays(inicio, 7) };
}

export function monthKey(iso) {
  return iso.slice(0, 7);
}

export function daysInMonth(year, month1) {
  return new Date(Date.UTC(year, month1, 0)).getUTCDate();
}

// Data no mês (ano, mês 1-12) com o dia limitado ao último dia do mês.
export function dateInMonth(year, month1, day) {
  const d = Math.min(day, daysInMonth(year, month1));
  return `${year}-${String(month1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function addMonthsKey(key, n) {
  const [y, m] = key.split('-').map(Number);
  const idx = y * 12 + (m - 1) + n;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`;
}

export function monthIndex(key) {
  const [y, m] = key.split('-').map(Number);
  return y * 12 + (m - 1);
}

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

export function monthName(key, short = false) {
  const m = Number(key.slice(5, 7)) - 1;
  return (short ? MESES_CURTOS : MESES)[m];
}

export function fmtDay(iso) {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

export function fmtDayLong(iso) {
  return `${DIAS[weekday(iso)]}, ${Number(iso.slice(8, 10))} de ${monthName(iso)}`;
}

export function fmtMonthYear(iso) {
  return `${monthName(iso, true)}/${iso.slice(0, 4)}`;
}

export function weekdayName(n) {
  return DIAS[n];
}
