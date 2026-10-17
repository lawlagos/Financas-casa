import { toCents } from './money.js';
import { addDays, dateInMonth, monthIndex, monthKey, weekday } from './dates.js';

// Ocorrências de um previsto até `ate`, desde o início dele. Cada ocorrência:
// { ref, janelaInicio, data, parcela: {k, n} | null }
// `ref` identifica a ocorrência de forma estável (é a chave usada nas baixas).
export function rawOccurrences(p, ate) {
  const out = [];
  if (!p || p.ativo === false) return out;
  if (p.natureza === 'unico') {
    if (p.data_unica && p.data_unica <= ate) out.push({ ref: p.data_unica, janelaInicio: p.data_unica, data: p.data_unica, parcela: null });
    return out;
  }
  const inicio = p.inicio;
  if (!inicio) return out;
  const total = p.natureza === 'parcelado' ? Number(p.parcelas_total) : Infinity;
  let k = p.natureza === 'parcelado' ? Number(p.parcela_no_inicio || 1) : null;
  const push = (janelaInicio, data) => {
    if (k !== null && k > total) return false;
    out.push({ ref: janelaInicio, janelaInicio, data, parcela: k !== null ? { k, n: total } : null });
    if (k !== null) k += 1;
    return true;
  };

  if (p.recorrencia === 'semanal') {
    // Vazio (como vem da planilha) é o dia da semana do início, não domingo.
    const alvo = p.dia_semana === '' || p.dia_semana == null ? weekday(inicio) : Number(p.dia_semana);
    let d = addDays(inicio, (alvo - weekday(inicio) + 7) % 7);
    while (d <= ate) {
      if (!push(d, d)) break;
      d = addDays(d, 7);
    }
    return out;
  }

  const passo = Math.max(1, Number(p.a_cada || 1));
  const ano = Number(inicio.slice(0, 4));
  const ancora = ano * 12 + (Number(p.mes_ancora || inicio.slice(5, 7)) - 1);
  const diaIni = Number(p.dia_inicio || inicio.slice(8, 10));
  const diaFim = Number(p.dia_fim || diaIni);
  for (let mi = monthIndex(monthKey(inicio)); mi <= monthIndex(monthKey(ate)); mi++) {
    if ((((mi - ancora) % passo) + passo) % passo !== 0) continue;
    const y = Math.floor(mi / 12);
    const m = (mi % 12) + 1;
    const data = dateInMonth(y, m, diaFim);
    if (data < inicio) continue;
    if (data > ate) break;
    if (!push(dateInMonth(y, m, diaIni), data)) break;
  }
  return out;
}

// Valor projetado em centavos. Variável: média dos 3 últimos lançamentos reais ligados ao previsto.
export function projectedValue(p, lancs) {
  if (p.natureza !== 'variavel') return toCents(p.valor);
  const reais = lancs
    .filter((l) => l.previsto_id === p.id)
    .sort((a, b) => (a.data < b.data ? 1 : -1))
    .slice(0, 3);
  if (!reais.length) return toCents(p.valor);
  return Math.round(reais.reduce((s, l) => s + toCents(l.valor), 0) / reais.length);
}

export function baixaIndex(baixas) {
  const idx = {};
  for (const b of baixas) idx[`${b.previsto_id}|${b.ref}`] = b;
  return idx;
}

// Ocorrências em aberto (sem baixa e não puladas) com data efetiva entre `de` e `ate`.
// Atrasadas (data < hoje) vêm marcadas. Adiadas usam a nova data.
export function openOccurrences({ previstos, baixas = [], lancs = [], de, ate, hoje }) {
  const idx = baixaIndex(baixas);
  const out = [];
  for (const p of previstos) {
    if (p.ativo === false) continue;
    const valor = projectedValue(p, lancs);
    for (const o of rawOccurrences(p, ate)) {
      const b = idx[`${p.id}|${o.ref}`];
      if (b && (b.status === 'baixado' || b.status === 'pulado')) continue;
      // Renovação confirmada pode ter sido adiada também: vale a nova data e continua certa.
      const data = b && (b.status === 'adiado' || b.status === 'renovou') && b.nova_data ? b.nova_data : o.data;
      if (data < de || data > ate) continue;
      let confianca = p.confianca || 'certo';
      if (p.renovacao) confianca = b && b.status === 'renovou' ? 'certo' : 'provavel';
      out.push({
        previsto: p,
        ref: o.ref,
        janelaInicio: o.janelaInicio,
        data,
        valor,
        parcela: o.parcela,
        confianca,
        atrasado: data < hoje,
        baixa: b || null,
      });
    }
  }
  return out.sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0));
}
