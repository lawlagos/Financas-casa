// Entende uma frase falada sobre o estoque de pudins, sem IA:
// "fiz uma fornada de mini pudim 150 e vendi 3 tradicionais no ifood", "perdi 2 de ninho que venceram ontem".
// Cada trecho vira um item com tipo, quantidade e a receita mais provável; o que ficar em dúvida vai com candidatos.
import { addDays } from './dates.js';
import { LOCAIS_PADRAO } from './pudim.js';

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const NUMEROS = {
  um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10,
  onze: 11, doze: 12, treze: 13, quatorze: 14, catorze: 14, quinze: 15, dezesseis: 16, dezessete: 17, dezoito: 18,
  dezenove: 19, vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50, sessenta: 60, setenta: 70, oitenta: 80, noventa: 90, cem: 100,
};
const DEZENAS = 'vinte|trinta|quarenta|cinquenta|sessenta|setenta|oitenta|noventa';
const UNIDADES = 'um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove';
// Jeitos de falar o tamanho sem dizer os ml.
// Os números antigos (1100, 550) também valem para os tamanhos de agora (1 kg, 500 g): `TAMANHO_EQUIVALENTE`.
const TAMANHO_POR_PALAVRA = { mini: '150', copinho: '150', copo: '150', pequeno: '150', pequena: '150', medio: '500', media: '500', grande: '1000', quilo: '1000', kilo: '1000', kg: '1000' };
const TAMANHO_EQUIVALENTE = { 1100: ['1100', '1000'], 1000: ['1000', '1100'], 550: ['550', '500'], 500: ['500', '550'] };
// Jeitos diferentes de dizer o mesmo sabor.
const SINONIMOS = { brigadeiro: 'brigadeirao' };
// Palavras que podem vir entre o verbo e a quantidade sem mudar o sentido ("vendi ontem 30 de café").
const ENCHIMENTO = new Set(['ontem', 'hoje', 'anteontem', 'so', 'mais', 'ja', 'eu', 'ela', 'nos', 'a', 'o', 'tambem', 'agora']);

// Números por extenso viram algarismos antes de cortar a frase: "vinte e cinco" → 25, "duas duzias" → 24.
function numerosEmAlgarismos(t) {
  return t
    .replace(/\bmeio (quilo|kilo|kg)\b/g, '500')
    .replace(new RegExp(`\\b(${DEZENAS}) e (${UNIDADES})\\b`, 'g'), (_, d, u) => String(NUMEROS[d] + NUMEROS[u]))
    .replace(/\bmeia duzia\b/g, '6')
    .replace(new RegExp(`\\b(\\d+|${Object.keys(NUMEROS).join('|')}) duzias?\\b`, 'g'), (_, n) => String((/^\\d+$/.test(n) ? Number(n) : NUMEROS[n]) * 12))
    .replace(/\bduzias?\b/g, '12')
    .replace(new RegExp(`\\b(${Object.keys(NUMEROS).join('|')})\\b`, 'g'), (n) => String(NUMEROS[n]))
    // "1 kg", "um quilo" e "500 g" são tamanho, não quantidade.
    .replace(/\b1 ?(quilo|kilo|kg)s?\b/g, '1000')
    .replace(/\b(\d{3,4}) ?(g|gramas|ml)\b/g, '$1');
}

const VERBOS = [
  ['producao', ['produzi', 'produzimos', 'fiz', 'fizemos', 'fez', 'assei', 'assamos', 'preparei', 'fornada', 'fornadas', 'produzido', 'feitos', 'feito']],
  ['venda', ['vendi', 'vendemos', 'vendeu', 'venda', 'vendas', 'vendido', 'vendidos', 'saiu', 'sairam', 'entreguei', 'pedido', 'pedidos']],
  ['transferencia', ['mandei', 'mandamos', 'mandou', 'enviei', 'enviamos', 'enviou', 'levei', 'levamos', 'levou', 'transferi', 'transferimos']],
  ['perda', ['perdi', 'perdemos', 'perda', 'venceu', 'venceram', 'vencido', 'vencidos', 'estragou', 'estragaram', 'quebrou', 'quebraram', 'caiu', 'joguei', 'descartei', 'comemos', 'comi', 'dei', 'brinde']],
];
const MOTIVOS = [['quebrou', ['quebrou', 'quebraram', 'caiu', 'estragou', 'estragaram', 'derreteu']], ['consumo', ['comemos', 'comi', 'dei', 'brinde', 'presente', 'provamos']], ['vencido', ['venceu', 'venceram', 'vencido', 'vencidos', 'validade']]];
// Palavras que não ajudam a achar a receita.
const VAZIAS = new Set(['de', 'do', 'da', 'dos', 'das', 'com', 'e', 'o', 'a', 'os', 'as', 'no', 'na', 'nos', 'nas', 'um', 'uma', 'pudim', 'kg', 'copo', 'quilo', 'que', 'pro', 'pra', 'para', 'em', 'ml', 'g', 'gramas', 'hoje', 'ontem', 'anteontem', 'mais', 'ja', 'unidade', 'unidades', 'eu', 'ela', 'nos']);

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
const palavras = (t) => norm(t).split(/[^a-z0-9]+/).filter(Boolean).map(raiz).map((p) => SINONIMOS[p] || p);
// Compara já no singular aproximado dos dois lados ("fizemos" e "comemos" perdem o "s" como a frase).
const tem = (lista, ps) => ps.some((p) => lista.includes(raiz(p)));

function numero(p) {
  if (/^\d+$/.test(p)) return Number(p);
  return NUMEROS[p] ?? null;
}

// Pontua cada receita para um trecho. Tamanho dito ("150") precisa bater; palavra da receita que não foi dita pesa contra.
// `tamanhos`: ditos em número (150) — a receita precisa ter esse tamanho. `porPalavra`: ditos como "mini"/"grande" —
// só filtram receitas que têm tamanho; receita antiga sem tamanho no nome continua valendo.
function candidatos(trecho, receitas, tamanhos, porPalavra = []) {
  const ditas = new Set(palavras(trecho).filter((p) => !VAZIAS.has(p) && !/^\d+$/.test(p)));
  const out = [];
  for (const r of receitas) {
    const ps = palavras(r.nome).filter((p) => !VAZIAS.has(p));
    const tamanhoReceita = ps.filter((p) => /^\d+$/.test(p)).concat(r.porcao ? [String(r.porcao)] : []);
    const nomes = ps.filter((p) => !/^\d+$/.test(p));
    const bate = (t) => (TAMANHO_EQUIVALENTE[t] || [t]).some((x) => tamanhoReceita.includes(x));
    if (tamanhos.length && !tamanhos.some(bate)) continue;
    const temTamanho = tamanhoReceita.length > 0;
    const bateTamanhoPalavra = porPalavra.length && temTamanho && porPalavra.some(bate);
    if (porPalavra.length && temTamanho && !bateTamanhoPalavra) continue;
    const acertos = nomes.filter((p) => ditas.has(p)).length;
    // Só o tamanho dito ("uma fornada de 150"): entram todos daquele tamanho, para escolher.
    if (!acertos && !tamanhos.length && !bateTamanhoPalavra) continue;
    // Sem nenhuma palavra do nome, só o tamanho: todos empatam (o app pergunta qual).
    out.push({ r, nota: acertos ? acertos - 0.3 * (nomes.length - acertos) + (tamanhos.length ? 0.5 : 0) : 0 });
  }
  return out.sort((a, b) => b.nota - a.nota);
}

// Locais ditos no trecho: "pra Ibiúna" é destino, "de São Roque" é origem; sem preposição, é onde aconteceu.
function locaisNoTrecho(trecho, locais) {
  const out = { origem: '', destino: '', onde: '' };
  for (const l of locais) {
    const n = norm(l.nome).replace(/[^a-z0-9]+/g, ' ').trim();
    const m = new RegExp(`(?:\\b(\\w+)\\s+)?\\b${n.replace(/ /g, '\\s+')}\\b`).exec(trecho);
    if (!m) continue;
    const prep = m[1] || '';
    if (['pra', 'para', 'pro', 'ate'].includes(prep)) out.destino ||= l.id;
    else if (['de', 'do', 'da', 'dos', 'das'].includes(prep)) out.origem ||= l.id;
    else out.onde ||= l.id;
  }
  return out;
}

// `estoque` (opcional): { receita_id: quantidade pronta }, para desempatar venda e perda pelo que existe.
// `locais`: onde fica o estoque (São Roque, Ibiúna). Cada item sai com `local` (onde foi, ou de onde saiu o envio)
// e, no envio, `para`; vazio quando a frase não diz.
export function interpretarEstoque(texto, { receitas = [], hoje, estoque = {}, locais = LOCAIS_PADRAO }) {
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

  const palavrasLocal = new Set(locais.flatMap((l) => palavras(l.nome)));
  let tipo = null;
  let local = '';
  let para = '';
  let localFrase = '';
  const itens = [];
  for (const trecho of trechos) {
    const ps = palavras(trecho);
    const verbo = VERBOS.find(([, vs]) => tem(ps, vs));
    if (verbo) tipo = verbo[0];
    // O local dito vale para os trechos seguintes até outro ser dito ("em Ibiúna vendi 3 de limão e 2 de ninho").
    const lt = locaisNoTrecho(trecho, locais);
    if (tipo === 'transferencia') {
      if (lt.destino || lt.onde) para = lt.destino || lt.onde;
      if (lt.origem) local = lt.origem;
    } else if (lt.onde || lt.destino || lt.origem) {
      local = lt.onde || lt.destino || lt.origem;
      localFrase ||= local;
    }
    // Quantidade: o primeiro número do trecho; os outros números são tamanho (150, 1100).
    const nums = ps.map((p, i) => ({ p, i, n: numero(p) })).filter((x) => x.n !== null);
    const primeiro = nums[0];
    let quantidade = primeiro ? primeiro.n : null;
    const tamanhos = nums.slice(primeiro ? 1 : 0).map((x) => String(x.n)).filter((n) => Number(n) >= 20);
    // "pudim 150" sem quantidade: o único número é tamanho. Mas "vendi ontem 30 de café" é quantidade.
    let antes = primeiro ? primeiro.i - 1 : -1;
    while (antes >= 0 && ENCHIMENTO.has(ps[antes])) antes -= 1;
    const depois = primeiro ? ps[primeiro.i + 1] : '';
    // Número sozinho que é um tamanho de pudim (1000, 500, 150...) também é tamanho: "vendi 1 kg de tradicional".
    const ehTamanho = primeiro && nums.length === 1 && primeiro.n >= 20 && ((antes >= 0
      && !VERBOS.some(([, vs]) => vs.map(raiz).includes(ps[antes])) && !['de', 'do', 'da'].includes(depois)) || [150, 500, 550, 1000, 1100].includes(primeiro.n));
    if (ehTamanho) {
      tamanhos.push(String(primeiro.n));
      quantidade = null;
    }
    const porPalavra = tamanhos.length ? [] : ps.filter((p) => TAMANHO_POR_PALAVRA[p]).map((p) => TAMANHO_POR_PALAVRA[p]);
    let lista = candidatos(trecho, receitas, tamanhos, porPalavra);
    // "vendemos 28 vidrinhos e comemos dois": sem nome de pudim, é o mesmo do item anterior.
    const anterior = itens[itens.length - 1];
    const todosVerbos = VERBOS.flatMap(([, vs]) => vs.map(raiz));
    const outrasPalavras = ps.filter((p) => !VAZIAS.has(p) && !palavrasLocal.has(p) && !['pra', 'pro', 'para', 'ate'].includes(p) && !ENCHIMENTO.has(p) && numero(p) === null && !todosVerbos.includes(p) && !MOTIVOS.some(([, m]) => m.map(raiz).includes(p)));
    if (!lista.length && primeiro && anterior?.receita_id && !outrasPalavras.length) lista = [{ r: receitas.find((x) => x.id === anterior.receita_id), nota: 1 }];
    if (!lista.length) continue;
    let melhores = lista.filter((c) => c.nota >= lista[0].nota - 0.01).map((c) => c.r);
    if (melhores.length > 1 && tipo !== 'producao') {
      const comEstoque = melhores.filter((r) => (estoque[r.id] || 0) > 0);
      if (comEstoque.length === 1) melhores = comEstoque;
    }
    const receita = melhores.length === 1 ? melhores[0] : null;
    const fornadas = /\bfornada/.test(trecho);
    // "uma fornada": vira unidades pelo rendimento; se o pudim ainda não é certo, guarda as fornadas para depois.
    const numFornadas = fornadas ? quantidade || 1 : 0;
    if (fornadas) quantidade = receita ? numFornadas * (Number(receita.rendimento) || 1) : null;
    itens.push({
      trecho,
      tipo,
      local: tipo === 'transferencia' ? local || locais.find((l) => l.id !== para)?.id || '' : local,
      para: tipo === 'transferencia' ? para : '',
      quantidade: quantidade || (fornadas ? null : 1),
      numFornadas,
      receita_id: receita?.id || '',
      candidatos: receita ? [] : melhores.slice(0, 6).map((r) => r.id),
      fornadas: fornadas && !receita,
    });
  }
  // Trechos sem verbo antes do primeiro verbo herdam o primeiro tipo dito.
  const primeiroTipo = itens.find((i) => i.tipo)?.tipo || null;
  for (const i of itens) if (!i.tipo) i.tipo = primeiroTipo;
  return { data, canal, motivo, itens, local: localFrase };
}
