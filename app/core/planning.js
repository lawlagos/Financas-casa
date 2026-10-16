import { toCents } from './money.js';
import { addDays, diffDays, monthKey, addMonthsKey } from './dates.js';
import { openOccurrences, projectedValue, rawOccurrences, baixaIndex } from './recurrence.js';

const LEMBRETE_RENOVACAO_DIAS = 30;

// Procura a ocorrência prevista que um lançamento real provavelmente quita.
export function findMatch(lanc, occs) {
  const v = toCents(lanc.valor);
  let best = null;
  for (const o of occs) {
    const p = o.previsto;
    if (p.tipo !== lanc.tipo) continue;
    if (p.conta_id && lanc.conta_id && p.conta_id !== lanc.conta_id) continue;
    if (p.categoria_id && lanc.categoria_id && p.categoria_id !== lanc.categoria_id) continue;
    const tol = p.natureza === 'variavel' ? 0.5 : 0.1;
    const dv = Math.abs(v - o.valor) / Math.max(o.valor, 1);
    if (dv > tol) continue;
    const dd = lanc.data < o.janelaInicio ? diffDays(o.janelaInicio, lanc.data) : lanc.data > o.data ? diffDays(lanc.data, o.data) : 0;
    if (dd > 5) continue;
    const score = dd + dv * 10;
    if (!best || score < best.score) best = { occ: o, score };
  }
  return best ? best.occ : null;
}

export function matchCandidates({ previstos, baixas, lancs, hoje, lanc }) {
  return openOccurrences({ previstos, baixas, lancs, de: addDays(lanc.data, -40), ate: addDays(lanc.data, 40), hoje });
}

function monthlyEquivalent(p, lancs) {
  const v = projectedValue(p, lancs);
  if (p.recorrencia === 'semanal') return Math.round((v * 52) / 12);
  return Math.round(v / Math.max(1, Number(p.a_cada || 1)));
}

// Tela Compromissos.
export function commitments({ previstos, baixas, lancs, hoje }) {
  const ativos = previstos.filter((p) => p.ativo !== false && p.natureza !== 'unico');
  const saidas = ativos.filter((p) => p.tipo === 'saida');
  const idx = baixaIndex(baixas);
  const porNatureza = { fixo: 0, parcelado: 0, variavel: 0 };
  const listas = { fixo: [], parcelado: [], variavel: [] };
  for (const p of saidas) {
    const eq = monthlyEquivalent(p, lancs);
    porNatureza[p.natureza] += eq;
    listas[p.natureza].push({ previsto: p, mensal: eq });
  }
  const parcelas = [];
  for (const p of saidas.filter((x) => x.natureza === 'parcelado')) {
    const todas = rawOccurrences(p, '2100-01-01');
    const abertas = todas.filter((o) => {
      const b = idx[`${p.id}|${o.ref}`];
      return !(b && (b.status === 'baixado' || b.status === 'pulado'));
    });
    if (!todas.length) continue;
    const ultima = todas[todas.length - 1];
    const proxima = abertas[0] || null;
    parcelas.push({
      previsto: p,
      proxima,
      parcelaAtual: proxima ? proxima.parcela : ultima.parcela,
      restantes: abertas.length,
      faltaPagar: abertas.length * toCents(p.valor),
      termina: ultima.data,
      quitado: abertas.length === 0,
    });
  }
  parcelas.sort((a, b) => (a.termina < b.termina ? -1 : 1));
  const alivio = parcelas
    .filter((x) => !x.quitado)
    .map((x) => ({ mes: addMonthsKey(monthKey(x.termina), 1), valor: toCents(x.previsto.valor), descricao: x.previsto.descricao }));
  return {
    total: porNatureza.fixo + porNatureza.parcelado + porNatureza.variavel,
    porNatureza,
    listas,
    parcelas,
    alivio,
  };
}

// Entradas previstas: atrasadas, próximos `dias` dias (certo/provável) e renovações.
export function receivables({ previstos, baixas, lancs, hoje, dias = 60 }) {
  const entradas = previstos.filter((p) => p.tipo === 'entrada');
  const occs = openOccurrences({ previstos: entradas, baixas, lancs, de: addDays(hoje, -60), ate: addDays(hoje, dias), hoje });
  const atrasados = occs.filter((o) => o.atrasado);
  const proximos = occs.filter((o) => !o.atrasado);
  const soma = (list) => list.reduce((s, o) => s + o.valor, 0);
  const renov = openOccurrences({ previstos: entradas.filter((p) => p.renovacao), baixas, lancs, de: hoje, ate: addDays(hoje, 366), hoje });
  const vistas = new Set();
  const renovacoes = [];
  for (const o of renov) {
    if (vistas.has(o.previsto.id)) continue;
    vistas.add(o.previsto.id);
    const confirmada = o.baixa && o.baixa.status === 'renovou';
    renovacoes.push({ ...o, confirmada, lembrar: !confirmada && diffDays(o.data, hoje) <= LEMBRETE_RENOVACAO_DIAS });
  }
  return {
    atrasados,
    proximos,
    totalCerto: soma(proximos.filter((o) => o.confianca === 'certo')),
    totalProvavel: soma(proximos.filter((o) => o.confianca !== 'certo')),
    totalAtrasado: soma(atrasados),
    renovacoes,
  };
}
