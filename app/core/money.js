// Cálculo sempre em centavos inteiros; reais só na borda (planilha e tela).

export function toCents(reais) {
  const n = typeof reais === 'string' ? parseBRL(reais) : Number(reais || 0);
  return Math.round(n * 100);
}

export function toReais(cents) {
  return Math.round(cents) / 100;
}

// Aceita "1.234,56", "1234,56", "1234.56", "R$ 87,50".
export function parseBRL(text) {
  if (typeof text === 'number') return text;
  let s = String(text || '').replace(/[^\d,.-]/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

const fmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtShort = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });

export function brl(cents) {
  return fmt.format(toReais(cents)).replace(/ /g, ' ');
}

export function brlSigned(cents) {
  return (cents > 0 ? '+' : '') + brl(cents);
}

// Para eixos e chips: "12,4 mil", "980".
export function brlCompact(cents) {
  const r = toReais(cents);
  const abs = Math.abs(r);
  if (abs >= 1000) return `${(r / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`;
  return fmtShort.format(r);
}

export function sum(list, fn = (x) => x) {
  return list.reduce((acc, x) => acc + fn(x), 0);
}
