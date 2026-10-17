import { toCents, sum } from './money.js';
import { businessWeekStart, addDays, monthKey } from './dates.js';

export const ORIGENS_NEGOCIO = ['Pudim', 'Hotmart'];
export const ORIGENS_MENSAIS = ['Salario', 'Consultoria', 'YouTube'];
export const CATEGORIA_DIZIMO = 'cat-dizimo';

export const refSemana = (inicio) => `dizimo:semana:${inicio}`;
export const refMes = (key) => `dizimo:mes:${key}`;

const conta = (l) => l.tipo !== 'transferencia' && l.categoria_id !== CATEGORIA_DIZIMO;

function pagamento(lancs, ref) {
  const pagos = lancs.filter((l) => l.id_externo === ref);
  return pagos.length ? { valor: sum(pagos, (l) => toCents(l.valor)), data: pagos[0].data, ids: pagos.map((l) => l.id) } : null;
}

// Semanas de negócio (sáb→sex) desde a primeira movimentação até a semana de `hoje`, com prejuízo carregado.
export function businessWeeks(lancs, hoje) {
  const atual = businessWeekStart(hoje);
  // Lançamentos de semanas futuras (data adiantada) ficam de fora até a semana chegar.
  const neg = lancs.filter((l) => conta(l) && ORIGENS_NEGOCIO.includes(l.origem) && l.data <= addDays(atual, 6));
  if (!neg.length) return [semana(atual, [], 0, lancs)];
  let inicio = businessWeekStart(neg.reduce((m, l) => (l.data < m ? l.data : m), neg[0].data));
  const out = [];
  let carry = 0;
  while (inicio <= atual) {
    const fim = addDays(inicio, 6);
    const daSemana = neg.filter((l) => l.data >= inicio && l.data <= fim);
    const s = semana(inicio, daSemana, carry, lancs);
    out.push(s);
    carry = s.carregaParaProxima;
    inicio = addDays(inicio, 7);
  }
  return out;
}

function semana(inicio, daSemana, carryIn, todos) {
  const por = (origem, tipo) => sum(daSemana.filter((l) => l.origem === origem && l.tipo === tipo), (l) => toCents(l.valor));
  const detalhe = {};
  for (const o of ORIGENS_NEGOCIO) {
    detalhe[o] = { entradas: por(o, 'entrada'), saidas: por(o, 'saida') };
    detalhe[o].lucro = detalhe[o].entradas - detalhe[o].saidas;
  }
  const lucro = sum(ORIGENS_NEGOCIO, (o) => detalhe[o].lucro);
  const base = lucro + carryIn;
  const dizimo = base > 0 ? Math.round(base * 0.1) : 0;
  const pago = pagamento(todos, refSemana(inicio));
  return {
    inicio,
    fim: addDays(inicio, 6),
    pagarEm: addDays(inicio, 7),
    detalhe,
    lucro,
    carryIn,
    base,
    dizimo,
    carregaParaProxima: base > 0 ? 0 : base,
    pago,
    mudouDepoisDePago: !!pago && pago.valor !== dizimo,
  };
}

export function monthlyTithe(lancs, key) {
  const doMes = lancs.filter((l) => conta(l) && l.tipo === 'entrada' && monthKey(l.data) === key && ORIGENS_MENSAIS.includes(l.origem));
  const detalhe = {};
  for (const o of ORIGENS_MENSAIS) {
    const bruto = sum(doMes.filter((l) => l.origem === o), (l) => toCents(l.valor));
    detalhe[o] = { bruto, dizimo: Math.round(bruto * 0.1) };
  }
  const bruto = sum(ORIGENS_MENSAIS, (o) => detalhe[o].bruto);
  const dizimo = sum(ORIGENS_MENSAIS, (o) => detalhe[o].dizimo);
  const pago = pagamento(lancs, refMes(key));
  return { mes: key, detalhe, bruto, dizimo, pago, mudouDepoisDePago: !!pago && pago.valor !== dizimo };
}
