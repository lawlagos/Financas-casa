// Leituras prontas das tabelas para as telas.
import { balances, groupTotals } from '../core/balances.js';
import { ORIGEM_LABEL } from '../core/schema.js';
import { weekdayName, monthName } from '../core/dates.js';
import { brl, toCents } from '../core/money.js';
import { project } from '../core/projection.js';
import { addDays, diffDays } from '../core/dates.js';
import { config } from '../data/store.js';

export function porId(lista) {
  return Object.fromEntries(lista.map((x) => [x.id, x]));
}

export function saldosHoje(s) {
  const saldos = balances(s.tables.contas, s.tables.lancamentos, s.hoje);
  return { saldos, grupos: groupTotals(s.tables.contas, saldos) };
}

export function contasAtivas(s) {
  return s.tables.contas.filter((c) => c.ativa !== false && c.ativa !== 'FALSE');
}

export const origemLabel = (o) => ORIGEM_LABEL[o] || o || '';

export const FREQUENCIAS = [
  ['1', 'Mensal'],
  ['2', 'A cada 2 meses'],
  ['3', 'A cada 3 meses'],
  ['6', 'A cada 6 meses'],
  ['12', 'Anual'],
  ['semanal', 'Semanal'],
];

// "todo dia 30", "dia 8 a 10, todo mês", "a cada 3 meses (jan, abr, jul, out), dia 20", "anual em abril, dia 10".
export function agendaTexto(p) {
  if (p.natureza === 'unico') return p.data_unica ? `em ${p.data_unica.split('-').reverse().join('/')}` : 'data única';
  if (p.recorrencia === 'semanal') return `toda ${weekdayName(Number(p.dia_semana || 0))}`;
  const ini = Number(p.dia_inicio || 1);
  const fim = Number(p.dia_fim || ini);
  const dia = fim > ini ? `dia ${ini} a ${fim}` : `dia ${ini}`;
  const n = Number(p.a_cada || 1);
  if (n === 1) return fim > ini ? `${dia}, todo mês` : `todo ${dia}`;
  const ancora = Number(p.mes_ancora || (p.inicio || '2000-01').slice(5, 7));
  if (n === 12) return `anual em ${monthName(`2000-${String(ancora).padStart(2, '0')}`)}, ${dia}`;
  const meses = [];
  for (let m = 0; m < 12; m += n) meses.push(monthName(`2000-${String(((ancora - 1 + m) % 12) + 1).padStart(2, '0')}`, true));
  return `a cada ${n} meses (${meses.join(', ')}), ${dia}`;
}

export function valorPrevistoTexto(p, centavos) {
  const v = centavos ?? toCents(p.valor);
  return `${p.natureza === 'variavel' ? '≈ ' : ''}${brl(v)}`;
}

export function rotuloGrupo(g) {
  return { Tudo: 'Tudo', Pessoal: 'Pessoal', Empresa: 'Empresa', Pudim: 'Pudim' }[g] || g;
}

// Data-limite padrão do Futuro: 31/12 do ano; em dezembro, 31/12 do ano seguinte.
export function fimPadrao(hoje) {
  const fim = `${hoje.slice(0, 4)}-12-31`;
  return diffDays(fim, hoje) < 30 ? `${Number(hoje.slice(0, 4)) + 1}-12-31` : fim;
}

export function projetar(s, ate, grupo = 'Tudo') {
  return project({
    contas: s.tables.contas,
    lancs: s.tables.lancamentos,
    previstos: s.tables.previstos,
    baixas: s.tables.baixas,
    config: { gasto_diario: config('gasto_diario', 0), reserva_minima: config('reserva_minima', 0) },
    hoje: s.hoje,
    ate: ate < s.hoje ? addDays(s.hoje, 1) : ate,
    grupo,
  });
}
