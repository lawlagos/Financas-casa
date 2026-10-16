import { toCents } from './money.js';
import { addDays } from './dates.js';
import { balances, groupTotals } from './balances.js';
import { openOccurrences } from './recurrence.js';
import { ORIGENS_MENSAIS } from './tithe.js';

const ATRASO_MAX_DIAS = 60;

export function accountsInGroup(contas, grupo) {
  return new Set(contas.filter((c) => c.ativa !== false && (grupo === 'Tudo' || c.grupo === grupo)).map((c) => c.id));
}

function groupEffect(tipo, valor, contaId, destinoId, ids) {
  if (tipo === 'entrada') return ids.has(contaId) ? valor : 0;
  if (tipo === 'saida') return ids.has(contaId) ? -valor : 0;
  if (tipo === 'transferencia') return (ids.has(destinoId) ? valor : 0) - (ids.has(contaId) ? valor : 0);
  return 0;
}

// Itens previstos (com dízimo previsto) a partir das ocorrências em aberto.
export function plannedItems(occs, hoje) {
  const items = [];
  for (const o of occs) {
    const p = o.previsto;
    const base = {
      data: o.atrasado ? hoje : o.data,
      dataOriginal: o.data,
      confianca: o.confianca,
      atrasado: o.atrasado,
      parcela: o.parcela,
      previsto_id: p.id,
      ref: o.ref,
      conta_id: p.conta_id,
      conta_destino_id: p.conta_destino_id,
    };
    items.push({ ...base, tipo: p.tipo, valor: o.valor, descricao: p.descricao, variavel: p.natureza === 'variavel' });
    if (p.tipo === 'entrada' && ORIGENS_MENSAIS.includes(p.origem)) {
      items.push({ ...base, tipo: 'saida', valor: Math.round(o.valor * 0.1), descricao: `Dízimo · ${p.descricao}`, dizimo: true });
    }
  }
  return items;
}

// Saldo projetado dia a dia de `hoje` até `ate`, em dois cenários: só o certo, e com os prováveis.
export function project({ contas, lancs, previstos, baixas, config = {}, hoje, ate, grupo = 'Tudo' }) {
  const ids = accountsInGroup(contas, grupo);
  const inicial = groupTotals(contas, balances(contas, lancs, hoje))[grupo] || 0;
  const occs = openOccurrences({ previstos, baixas, lancs, de: addDays(hoje, -ATRASO_MAX_DIAS), ate, hoje });
  const items = plannedItems(occs, hoje)
    .map((it) => ({ ...it, efeito: groupEffect(it.tipo, it.valor, it.conta_id, it.conta_destino_id, ids) }))
    .filter((it) => it.efeito !== 0);
  const diario = grupo === 'Tudo' || grupo === 'Pessoal' ? toCents(config.gasto_diario || 0) : 0;
  const reserva = toCents(config.reserva_minima || 0);

  const porDia = {};
  for (const it of items) (porDia[it.data] ||= []).push(it);

  const dias = [];
  let certo = inicial;
  let prov = inicial;
  for (let d = hoje; d <= ate; d = addDays(d, 1)) {
    const doDia = porDia[d] || [];
    const diarioDia = d === hoje ? 0 : diario;
    let entra = 0;
    let sai = 0;
    let entraProv = 0;
    let saiProv = 0;
    for (const it of doDia) {
      if (it.confianca === 'certo') {
        if (it.efeito > 0) entra += it.efeito;
        else sai -= it.efeito;
      } else if (it.efeito > 0) entraProv += it.efeito;
      else saiProv -= it.efeito;
    }
    certo += entra - sai - diarioDia;
    prov += entra + entraProv - sai - saiProv - diarioDia;
    dias.push({ data: d, entra, sai, entraProv, saiProv, diario: diarioDia, saldo: certo, saldoProvavel: prov, itens: doDia });
  }

  const minOf = (key) => dias.reduce((m, x) => (x[key] < m.valor ? { valor: x[key], data: x.data } : m), { valor: dias[0][key], data: dias[0].data });
  const minimo = minOf('saldo');
  const minimoProvavel = minOf('saldoProvavel');
  return {
    inicial,
    dias,
    minimo,
    minimoProvavel,
    final: dias[dias.length - 1].saldo,
    finalProvavel: dias[dias.length - 1].saldoProvavel,
    precisaFazer: Math.max(0, -minimo.valor),
    precisaFazerProvavel: Math.max(0, -minimoProvavel.valor),
    precisaReserva: Math.max(0, reserva - minimo.valor),
    reserva,
  };
}
