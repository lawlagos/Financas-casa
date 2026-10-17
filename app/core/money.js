// Cálculo sempre em centavos inteiros; reais só na borda (planilha e tela).

export function toCents(reais) {
  const n = typeof reais === 'string' ? parseBRL(reais) : Number(reais || 0);
  return Math.round(n * 100);
}

export function toReais(cents) {
  return Math.round(cents) / 100;
}

// Aceita "1.234,56", "1234,56", "1234.56", "R$ 87,50".
// Valor falado com os centavos separados: "54 e 96" → "54,96"; "54 reais e 9 centavos" → "54,09"; "96 centavos" → "0,96".
export function juntarCentavos(t) {
  return String(t)
    .replace(/(?<![\d.,])(\d+)\s*(?:reais?\s+)?e\s+(\d{1,2})\s*centavos?\b/gi, (_, r, c) => `${r},${c.padStart(2, '0')}`)
    .replace(/(?<![\d.,])(\d+)\s*(?:reais?\s+)?e\s+(\d{2})(?![\d.,]|\s*mil\b)/gi, '$1,$2')
    .replace(/(?<![\d.,])(\d{1,2})\s*centavos?\b/gi, (_, c) => `0,${c.padStart(2, '0')}`);
}

export function parseBRL(text) {
  if (typeof text === 'number') return text;
  // No campo de valor, "54 96" ditado sem o "e" também são reais e centavos.
  let s = juntarCentavos(String(text || '')).replace(/^(\D*\d+)\s+(\d{2})(\D*)$/, '$1,$2$3').replace(/[^\d,.-]/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

const fmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtShort = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });

export function brl(cents) {
  return fmt.format(toReais(cents)).replace(/ /g, ' ');
}

// Só o número, sem "R$": para tabelas apertadas.
export function num(cents) {
  return (Math.round(cents) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
