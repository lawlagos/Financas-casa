// Entende uma frase falada sobre o estoque de pudins, sem IA:
// "fiz uma fornada de mini pudim 150 e vendi 3 tradicionais no ifood", "perdi 2 de ninho que venceram ontem".
// Cada trecho vira um item com tipo, quantidade e a receita mais provável; o que ficar em dúvida vai com candidatos.
import { addDays } from './dates.js';

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const NUMEROS = {
  um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10,
  onze: 11, doze: 12, treze: 13, quatorze: 14, catorze: 14, quinze: 15, dezesseis: 16, dezessete: 17, dezoito: 18,
  dezenove: 19, vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50, sessenta: 60, setenta: 70, oitenta: 80, noventa: 90, cem: 100,
};
const DEZENAS = 'vinte|trinta|quarenta|cinquenta|sessenta|setenta|oitenta|noventa';
const UNIDADES = 'um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove';
// Palavras que podem vir entre o verbo e a quantidade sem mudar o sentido ("vendi ontem 30 de café").
const ENCHIMENTO = new Set(['ontem', 'hoje', 'anteontem', 'so', 'mais', 'ja', 'eu', 'ela', 'nos', 'a', 'o', 'tambem', 'agora']);

// Números por extenso viram algarismos antes de cortar a frase: "vinte e cinco" → 25, "duas duzias" → 24.
function numerosEmAlgarismos(t) {
  return t
    .replace(new RegExp(`\\b(${DEZENAS}) e (${UNIDADES})\\b`, 'g'), (_, d, u) => String(NUMEROS[d] + NUMEROS[u]))
    .replace(/\bmeia duzia\b/g, '6')
    .replace(new RegExp(`\\b(\\d+|${Object.keys(NUMEROS).join('|')}) duzias?\\b`, 'g'), (_, n) => String((/^\\d+$/.test(n) ? Number(n) : NUMEROS[n]) * 12))
    .replace(/\bduzias?\b/g, '12')
    .replace(new RegExp(`\\b(${Object.keys(NUMEROS).join('|')})\\b`, 'g'), (n) => String(NUMEROS[n]));
}

const VERBOS = [
  ['producao', ['produzi', 'produzimos', 'fiz', 'fizemos', 'fez', 'assei', 'assamos', 'preparei', 'fornada', 'fornadas', 'produzido', 'feitos', 'feito']],
  ['venda', ['vendi', 'vendemos', 'vendeu', 'venda', 'vendas', 'vendido', 'vendidos', 'saiu', 'sairam', 'entreguei', 'pedido', 'pedidos']],
  ['perda', ['perdi', 'perdemos', 'perda', 'venceu', 'venceram', 'vencido', 'vencidos', 'estragou', 'estragaram', 'quebrou', 'quebraram', 'caiu', 'joguei', 'descartei', 'comemos', 'comi', 'dei', 'brinde']],
];
const MOTIVOS = [['quebrou', ['quebrou', 'quebraram', 'caiu', 'estragou', 'estragaram', 'derreteu']], ['consumo', ['comemos', 'comi', 'dei', 'brinde', 'presente', 'provamos']], ['vencido', ['venceu', 'venceram', 'vencido', 'vencidos', 'validade']]];
// Palavras que não ajudam a achar a receita.
const VAZIAS = new Set(['de', 'do', 'da', 'dos', 'das', 'com', 'e', 'o', 'a', 'os', 'as', 'no', 'na', 'nos', 'nas', 'um', 'uma', 'pudim', 'que', 'pro', 'pra', 'para', 'em', 'ml', 'g', 'gramas', 'hoje', 'ontem', 'anteontem', 'mais', 'ja', 'unidade', 'unidades', 'eu', 'ela', 'nos']);

// Singular aproximado: "tradicionais" → "tradicional", "pudins" → "pudim", "limões" → "limao".
function raiz(p) {
  if (/^\d+$/.test(p) || p.length <= 3 || p in NUMEROS) return p;
  if (p.endsWith('oes') || p.endsWith('aes')) return `${p.slice(0, -3)}ao`;
  if (p.endsWith('ais')) return `${p.slice(0, -3)}al`;
  if (p.endsWith('eis')) return `${p.slice(0, -3)}el`;
  if (p.endsWith('ns')) return `${p.slice(0, -2)}m`;
  if (p.endsWith('s')) return p.slice(0, -1);
  return p;
}
const palavras = (t) => norm(t).split(/[^a-z0-9]+/).filter(Boolean).map(raiz);
// Compara já no singular aproximado dos dois lados ("fizemos" e "comemos" perdem o "s" como a frase).
const tem = (lista, ps) => ps.some((p) => lista.includes(raiz(p)));

function numero(p) {
  if (/^\d+$/.test(p)) return Number(p);
  return NUMEROS[p] ?? null;
}

// Pontua cada receita para um trecho. Tamanho dito ("150") precisa bater; palavra da receita que não foi dita pesa contra.
function candidatos(trecho, receitas, tamanhos) {
  const ditas = new Set(palavras(trecho).filter((p) => !VAZIAS.has(p) && !/^\d+$/.test(p)));
  const out = [];
  for (const r of receitas) {
    const ps = palavras(r.nome).filter((p) => !VAZIAS.has(p));
    const tamanhoReceita = ps.filter((p) => /^\d+$/.test(p));
    const nomes = ps.filter((p) => !/^\d+$/.test(p));
    if (tamanhos.length && !tamanhos.some((t) => tamanhoReceita.includes(t))) continue;
    const bate = nomes.filter((p) => ditas.has(p)).length;
    if (!bate) continue;
    out.push({ r, nota: bate - 0.3 * (nomes.length - bate) + (tamanhos.length ? 0.5 : 0) });
  }
  return out.sort((a, b) => b.nota - a.nota);
}

// `estoque` (opcional): { receita_id: quantidade pronta }, para desempatar venda e perda pelo que existe.
export function interpretarEstoque(texto, { receitas = [], hoje, estoque = {} }) {
  const t = norm(texto);
  const todas = palavras(t);
  const data = /\banteontem\b/.test(t) ? addDays(hoje, -2) : /\bontem\b/.test(t) ? addDays(hoje, -1) : hoje;
  const canal = /\bi\s?food\b|\baifood\b/.test(t) ? 'ifood' : 'direta';
  const motivo = (MOTIVOS.find(([, ps]) => tem(todas, ps)) || ['vencido'])[0];

  // Corta em trechos: vírgula, "mais", ou " e " seguido de quantidade ("2 de ninho e 1 de café") ou de outro verbo
  // ("vendi um de café e dei um de doce de leite").
  const verbos = VERBOS.flatMap(([, vs]) => vs).join('|');
  const trechos = numerosEmAlgarismos(t)
    .split(new RegExp(`,|;|\\bmais\\b|\\be\\s+(?=\\d+\\b)|\\be\\s+(?=(?:${verbos})\\b)`))
    .map((x) => x.trim())
    .filter(Boolean);

  let tipo = null;
  const itens = [];
  for (const trecho of trechos) {
    const ps = palavras(trecho);
    const verbo = VERBOS.find(([, vs]) => tem(ps, vs));
    if (verbo) tipo = verbo[0];
    // Quantidade: o primeiro número do trecho; os outros números são tamanho (150, 1100).
    const nums = ps.map((p, i) => ({ p, i, n: numero(p) })).filter((x) => x.n !== null);
    const primeiro = nums[0];
    let quantidade = primeiro ? primeiro.n : null;
    const tamanhos = nums.slice(primeiro ? 1 : 0).map((x) => String(x.n)).filter((n) => Number(n) >= 20);
    // "pudim 150" sem quantidade: o único número é tamanho. Mas "vendi ontem 30 de café" é quantidade.
    let antes = primeiro ? primeiro.i - 1 : -1;
    while (antes >= 0 && ENCHIMENTO.has(ps[antes])) antes -= 1;
    const depois = primeiro ? ps[primeiro.i + 1] : '';
    const ehTamanho = primeiro && nums.length === 1 && primeiro.n >= 20 && antes >= 0
      && !VERBOS.some(([, vs]) => vs.map(raiz).includes(ps[antes])) && !['de', 'do', 'da'].includes(depois);
    if (ehTamanho) {
      tamanhos.push(String(primeiro.n));
      quantidade = null;
    }
    let lista = candidatos(trecho, receitas, tamanhos);
    // "vendemos 28 vidrinhos e comemos dois": sem nome de pudim, é o mesmo do item anterior.
    const anterior = itens[itens.length - 1];
    const todosVerbos = VERBOS.flatMap(([, vs]) => vs.map(raiz));
    const outrasPalavras = ps.filter((p) => !VAZIAS.has(p) && !ENCHIMENTO.has(p) && numero(p) === null && !todosVerbos.includes(p) && !MOTIVOS.some(([, m]) => m.map(raiz).includes(p)));
    if (!lista.length && primeiro && anterior?.receita_id && !outrasPalavras.length) lista = [{ r: receitas.find((x) => x.id === anterior.receita_id), nota: 1 }];
    if (!lista.length) continue;
    let melhores = lista.filter((c) => c.nota >= lista[0].nota - 0.01).map((c) => c.r);
    if (melhores.length > 1 && tipo !== 'producao') {
      const comEstoque = melhores.filter((r) => (estoque[r.id] || 0) > 0);
      if (comEstoque.length === 1) melhores = comEstoque;
    }
    const receita = melhores.length === 1 ? melhores[0] : null;
    const fornadas = /\bfornada/.test(trecho);
    if (fornadas && receita) quantidade = (quantidade || 1) * (Number(receita.rendimento) || 1);
    itens.push({
      trecho,
      tipo,
      quantidade: quantidade || (fornadas ? null : 1),
      receita_id: receita?.id || '',
      candidatos: receita ? [] : melhores.slice(0, 6).map((r) => r.id),
      fornadas: fornadas && !receita,
    });
  }
  // Trechos sem verbo antes do primeiro verbo herdam o primeiro tipo dito.
  const primeiroTipo = itens.find((i) => i.tipo)?.tipo || null;
  for (const i of itens) if (!i.tipo) i.tipo = primeiroTipo;
  return { data, canal, motivo, itens };
}
