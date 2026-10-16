import { toCents, sum } from './money.js';
import { monthKey } from './dates.js';

export const GRUPOS = ['Pessoal', 'Empresa', 'Pudim'];

// Efeito de um lançamento no saldo de uma conta, em centavos.
export function effectOn(lanc, contaId) {
  const v = toCents(lanc.valor);
  if (lanc.tipo === 'entrada') return lanc.conta_id === contaId ? v : 0;
  if (lanc.tipo === 'saida') return lanc.conta_id === contaId ? -v : 0;
  if (lanc.tipo === 'transferencia') {
    let e = 0;
    if (lanc.conta_id === contaId) e -= v;
    if (lanc.conta_destino_id === contaId) e += v;
    return e;
  }
  return 0;
}

// Saldo de cada conta até `ate` (inclusive). Lançamentos anteriores ao saldo inicial da conta não contam.
export function balances(contas, lancs, ate = '9999-12-31') {
  const out = {};
  for (const c of contas) out[c.id] = toCents(c.saldo_inicial);
  const byId = Object.fromEntries(contas.map((c) => [c.id, c]));
  const conta = (id, data) => {
    const c = byId[id];
    return c && !(c.data_saldo_inicial && data < c.data_saldo_inicial);
  };
  for (const l of lancs) {
    if (l.data > ate) continue;
    for (const id of new Set([l.conta_id, l.conta_destino_id])) {
      if (conta(id, l.data)) out[id] += effectOn(l, id);
    }
  }
  return out;
}

export function groupTotals(contas, saldos) {
  const totals = { Tudo: 0 };
  for (const g of GRUPOS) totals[g] = 0;
  for (const c of contas) {
    if (c.ativa === false) continue;
    totals[c.grupo] = (totals[c.grupo] || 0) + (saldos[c.id] || 0);
    totals.Tudo += saldos[c.id] || 0;
  }
  return totals;
}

// Entradas e saídas do mês (sem transferências), em centavos.
export function monthSummary(lancs, key) {
  const doMes = lancs.filter((l) => monthKey(l.data) === key && l.tipo !== 'transferencia');
  const entradas = sum(doMes.filter((l) => l.tipo === 'entrada'), (l) => toCents(l.valor));
  const saidas = sum(doMes.filter((l) => l.tipo === 'saida'), (l) => toCents(l.valor));
  return { entradas, saidas, resultado: entradas - saidas };
}
