// Lista de compras: o que foi falado vira itens; cada item é ligado a um produto já comprado (notas de mercado
// e ingredientes do pudim) para estimar o preço pelo da última compra e, na hora de pagar, dizer se ficou
// mais caro ou mais barato.
import { toCents } from './money.js';
import { chaveProduto, produtoDoItem, nomeBase } from './mercado.js';
import { custoInsumo } from './pudim.js';

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const NUMEROS = {
  um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10,
  onze: 11, doze: 12, quinze: 15, vinte: 20, trinta: 30, meio: 0.5, meia: 0.5,
};
const UNIDADES = { kg: 'kg', quilo: 'kg', quilos: 'kg', kilo: 'kg', kilos: 'kg', g: 'g', gramas: 'g', grama: 'g', l: 'l', litro: 'l', litros: 'l', ml: 'ml' };
// Palavras de pedido que não fazem parte do nome.
const ENCHIMENTO = /^(preciso( de)?|comprar|compra|coloca|colocar|adiciona|adicionar|bota|botar|põe|poe|por|lista|na lista|tambem|também|mais|um pouco de|uns|umas|alguns|algumas)\s+/;
const EMBALAGENS = /^(pacotes?|caixas?|latas?|garrafas?|potes?|duzias?|fardos?|sacos?|unidades?|un)\s+(de\s+)?/;

// Singular aproximado para comparar: "detergentes" → "detergente", "limões" → "limao".
function singular(p) {
  if (p.length <= 3) return p;
  if (p.endsWith('oes') || p.endsWith('aes')) return `${p.slice(0, -3)}ao`;
  if (p.endsWith('ais')) return `${p.slice(0, -3)}al`;
  if (p.endsWith('eis')) return `${p.slice(0, -3)}el`;
  if (p.endsWith('ns')) return `${p.slice(0, -2)}m`;
  if (p.endsWith('s')) return p.slice(0, -1);
  return p;
}
const VAZIAS = new Set(['de', 'do', 'da', 'dos', 'das', 'o', 'a', 'os', 'as', 'com', 'pra', 'para']);
const tokens = (t) => norm(t).split(/[^a-z0-9]+/).filter((p) => p && !VAZIAS.has(p)).map(singular);

const maiuscula = (t) => (t ? t[0].toUpperCase() + t.slice(1) : t);

// Catálogo de produtos conhecidos: nome, origem (Casa/Pudim) e de onde vem o preço.
export function catalogo({ itens = [], insumos = [] }) {
  const porChave = {};
  for (const it of itens) {
    const nome = produtoDoItem(it);
    const k = chaveProduto(nome);
    if (!k) continue;
    const x = (porChave[k] ||= { chave: k, nome, origem: it.origem === 'Pudim' ? 'Pudim' : 'Casa', compras: 0 });
    x.compras += 1;
  }
  for (const ins of insumos) {
    if (ins.ativo === false) continue;
    const nome = ins.produto || ins.nome;
    const k = chaveProduto(nome);
    porChave[k] ||= { chave: k, nome, origem: 'Pudim', compras: 0, insumo: ins };
    porChave[k].insumo ||= ins;
  }
  return Object.values(porChave).map((x) => ({ ...x, tokens: tokens(x.nome) }));
}

// O produto conhecido que mais se parece com o texto: todas as palavras ditas no nome (ou o contrário).
export function acharProduto(texto, cat) {
  const ditas = tokens(texto);
  if (!ditas.length) return null;
  let melhor = null;
  for (const p of cat) {
    const comuns = ditas.filter((t) => p.tokens.includes(t)).length;
    if (!comuns) continue;
    const cobreDito = comuns / ditas.length;
    const cobreNome = comuns / p.tokens.length;
    if (cobreDito < 1 && cobreNome < 1) continue;
    const nota = cobreDito + cobreNome + Math.min(p.compras, 20) / 100;
    if (!melhor || nota > melhor.nota) melhor = { p, nota };
  }
  return melhor?.p || null;
}

// "2 leites condensados, um quilo de banana e detergente" → [{ texto, nome, quantidade, unidade, origem }]
export function interpretarLista(texto, cat = []) {
  let t = norm(texto).replace(/\bmeia duzia\b/g, '6').replace(/\buma duzia\b/g, '12').replace(/\bduas duzias\b/g, '24');
  // "e" separa itens, menos quando faz parte de um nome conhecido ("romeu e julieta").
  const nomesComE = cat.map((p) => norm(p.nome)).filter((n) => / e /.test(n));
  nomesComE.forEach((n, i) => (t = t.split(n).join(`__nome${i}__`)));
  const partes = t.split(/,|;|\n|\s+e\s+|\s+mais\s+/).map((x) => x.trim()).filter(Boolean)
    .map((x) => x.replace(/__nome(\d+)__/g, (_, i) => nomesComE[Number(i)]));
  const out = [];
  for (let p of partes) {
    for (let i = 0; i < 3; i++) p = p.replace(ENCHIMENTO, '');
    let quantidade = 1;
    let unidade = 'un';
    const m = p.match(/^(\d+(?:[.,]\d+)?|[a-z]+)\s+(.*)$/);
    if (m && (/^\d/.test(m[1]) || NUMEROS[m[1]] !== undefined)) {
      quantidade = /^\d/.test(m[1]) ? Number(m[1].replace(',', '.')) : NUMEROS[m[1]];
      p = m[2];
    }
    const u = p.match(/^([a-z]+)\s+(?:de\s+)?(.*)$/);
    if (u && UNIDADES[u[1]]) {
      unidade = UNIDADES[u[1]];
      p = u[2];
    }
    p = p.replace(EMBALAGENS, '').replace(/^de\s+/, '').trim();
    if (!p || !/[a-z]/.test(p)) continue;
    const achado = acharProduto(p, cat);
    out.push({ texto: p, nome: achado ? achado.nome : maiuscula(nomeBase(p) || p), quantidade, unidade, origem: achado?.origem || 'Casa', conhecido: !!achado });
  }
  return out;
}

// Compras anteriores do produto (mais nova primeiro), com o preço de uma unidade comprada e o preço por kg/l quando dá.
export function historicoPrecos(nome, itens = []) {
  const k = chaveProduto(nome);
  return itens
    .filter((it) => it.valor && it.data && chaveProduto(produtoDoItem(it)) === k)
    .sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : 0))
    .map((it) => {
      const qtd = Number(it.quantidade) || 1;
      const unidadeCompra = String(it.unidade || 'un').toLowerCase();
      const porUnidade = toCents(it.valor) / qtd;
      const t = Number(it.tamanho) || 0;
      const tu = String(it.tamanho_unidade || '').toLowerCase();
      // preço por kg ou litro: pela embalagem (395 g) ou porque já foi comprado a peso (2 kg)
      const kg = t > 0 && (tu === 'g' || tu === 'kg') ? (tu === 'g' ? t / 1000 : t) : unidadeCompra === 'kg' ? 1 : unidadeCompra === 'g' ? 0.001 : 0;
      const litro = t > 0 && (tu === 'ml' || tu === 'l') ? (tu === 'ml' ? t / 1000 : t) : unidadeCompra === 'l' ? 1 : unidadeCompra === 'ml' ? 0.001 : 0;
      return { data: it.data, mercado: it.mercado || '', porUnidade: Math.round(porUnidade), porKg: kg ? Math.round(porUnidade / kg) : null, porLitro: litro ? Math.round(porUnidade / litro) : null };
    });
}

// Preço estimado do item da lista (centavos), pela última compra; sem compra, pelo cadastro do ingrediente do pudim.
export function estimar(item, { itens = [], insumos = [] } = {}) {
  const hist = historicoPrecos(item.nome, itens);
  const q = Number(item.quantidade) || 1;
  const u = item.unidade || 'un';
  const ultimo = hist[0];
  if (ultimo) {
    if ((u === 'kg' || u === 'g') && ultimo.porKg) return { valor: Math.round(ultimo.porKg * (u === 'g' ? q / 1000 : q)), base: ultimo, fonte: 'compra' };
    if ((u === 'l' || u === 'ml') && ultimo.porLitro) return { valor: Math.round(ultimo.porLitro * (u === 'ml' ? q / 1000 : q)), base: ultimo, fonte: 'compra' };
    if (u === 'un') return { valor: Math.round(ultimo.porUnidade * q), base: ultimo, fonte: 'compra' };
    // Pediu a peso mas só há compra por unidade (ou o contrário): usa o último preço como referência.
    return { valor: Math.round(ultimo.porUnidade * (u === 'g' || u === 'ml' ? q / 1000 : q)), base: ultimo, fonte: 'compra', aproximado: true };
  }
  const ins = insumos.find((x) => x.ativo !== false && chaveProduto(x.produto || x.nome) === chaveProduto(item.nome));
  if (ins) {
    const c = custoInsumo(ins, itens);
    if (c.porBase !== null) {
      const emb = (Number(ins.qtd_embalagem) || 1) * ({ kg: 1000, l: 1000 }[ins.unidade] || 1);
      const porQtd = u === 'un' ? c.porBase * emb * q : u === 'kg' || u === 'l' ? c.porBase * 1000 * q : c.porBase * q;
      return { valor: Math.round(porQtd), base: { data: c.data, mercado: c.mercado || '' }, fonte: 'cadastro' };
    }
  }
  return { valor: null, base: null, fonte: null };
}

// Pago contra o estimado: diferença em centavos e fração (positivo = mais caro).
export function comparar(pago, estimado) {
  if (!(pago > 0) || !(estimado > 0)) return null;
  return { diferenca: pago - estimado, fracao: (pago - estimado) / estimado };
}

// Totais da lista: estimado de tudo, e só dos comprados (estimado × pago) para dizer como a compra está indo.
export function resumoLista(linhas) {
  const soma = (xs, f) => xs.reduce((s, x) => s + (f(x) || 0), 0);
  const comprados = linhas.filter((l) => l.comprado);
  const comparaveis = comprados.filter((l) => l.pago > 0 && l.estimado > 0);
  return {
    estimado: soma(linhas, (l) => l.estimado),
    semPreco: linhas.filter((l) => !l.estimado).length,
    pago: soma(comprados, (l) => l.pago),
    faltaEstimado: soma(linhas.filter((l) => !l.comprado), (l) => l.estimado),
    comparacao: comparar(soma(comparaveis, (l) => l.pago), soma(comparaveis, (l) => l.estimado)),
  };
}
