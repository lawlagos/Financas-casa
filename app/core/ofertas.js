// Pesquisa de preços SIMULADA dos insumos do pudim (estilo Google Shopping), até existir uma fonte real de ofertas.
// Os preços partem do que o casal já pagou (nota de mercado ou cadastro) e variam por loja de forma
// determinística: a mesma pesquisa dá o mesmo resultado durante 3 dias, depois as "ofertas" mudam.
import { addDays, diffDays } from './dates.js';
import { custoInsumo } from './pudim.js';
import { chaveProduto, produtoDoItem } from './mercado.js';

export const LOJAS = [
  { id: 'assai', nome: 'Assaí Atacadista', entrega: 'Retirar na loja', online: false },
  { id: 'atacadao', nome: 'Atacadão', entrega: 'Retirar na loja', online: false },
  { id: 'carrefour', nome: 'Carrefour', entrega: 'Entrega em 2 h', online: true },
  { id: 'tenda', nome: 'Tenda Atacado', entrega: 'Retirar na loja', online: false },
  { id: 'mercadolivre', nome: 'Mercado Livre', entrega: 'Frete grátis amanhã', online: true },
  { id: 'shopee', nome: 'Shopee', entrega: 'Chega em 3 dias', online: true },
];
// Embalagens costumam ser compradas em loja de festa e online; ingredientes, no atacado.
const LOJAS_POR_TIPO = { ingrediente: ['assai', 'atacadao', 'carrefour', 'tenda', 'mercadolivre'], embalagem: ['mercadolivre', 'shopee', 'assai', 'carrefour'] };
const CICLO_DIAS = 3;

// Gerador pseudoaleatório com semente (mulberry32), para o resultado não mudar a cada toque.
function sorteador(texto) {
  let h = 1779033703 ^ texto.length;
  for (let i = 0; i < texto.length; i++) {
    h = Math.imul(h ^ texto.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Início do ciclo de 3 dias de `hoje` (as ofertas mudam no começo de cada ciclo).
export function cicloDe(hoje) {
  return addDays('2026-01-01', Math.floor(diffDays(hoje, '2026-01-01') / CICLO_DIAS) * CICLO_DIAS);
}

// Marcas que aparecem nas notas para o mesmo produto, mais a do cadastro.
function marcasDe(insumo, itens) {
  const chave = chaveProduto(insumo.produto || insumo.nome);
  const m = new Set();
  if (insumo.marca && insumo.marca !== '-') m.add(insumo.marca);
  for (const it of itens || []) if (it.marca && chaveProduto(produtoDoItem(it)) === chave) m.add(it.marca);
  return [...m];
}

const UN_TXT = { g: 'g', kg: 'kg', ml: 'ml', l: 'l', un: 'un' };
function tamanhoTxt(qtd, unidade) {
  if (unidade === 'g' && qtd >= 1000) return `${String(qtd / 1000).replace('.', ',')} kg`;
  if (unidade === 'ml' && qtd >= 1000) return `${String(qtd / 1000).replace('.', ',')} l`;
  if (unidade === 'un') return qtd === 1 ? '1 unidade' : `${qtd} unidades`;
  return `${String(qtd).replace('.', ',')} ${UN_TXT[unidade] || unidade}`;
}

// Ofertas de um insumo. Sem preço de referência, não há o que simular.
// Cada oferta: { id, insumo_id, loja, titulo, marca, qtd (na unidade do cadastro), preco (centavos), porMedida (centavos por kg/l/un),
//   medida ('kg'|'l'|'un'), diferenca (fração vs. o que já pagaram, negativa = mais barato), maisBarato, referencia }
export function ofertasDe(insumo, { itens = [], hoje }) {
  const ref = custoInsumo(insumo, itens);
  if (ref.porBase === null || !(ref.porBase > 0)) return [];
  const qtdBase = (Number(insumo.qtd_embalagem) || 1) * ({ kg: 1000, l: 1000 }[insumo.unidade] || 1); // em g, ml ou un
  const precoRef = ref.porBase * qtdBase;
  const rnd = sorteador(`${insumo.id}|${cicloDe(hoje)}`);
  const marcas = marcasDe(insumo, itens);
  const lojas = (LOJAS_POR_TIPO[insumo.tipo] || LOJAS_POR_TIPO.ingrediente).map((id) => LOJAS.find((l) => l.id === id));
  const ofertas = [];
  for (const loja of lojas) {
    if (rnd() < 0.18) continue; // nem toda loja tem o item no ciclo
    // Às vezes a loja vende embalagem maior (pacote com 2, caixa com 10), um pouco mais barata por unidade.
    const mult = rnd() < 0.25 ? (ref.base === 'un' && qtdBase === 1 ? 10 : 2) : 1;
    const variacao = 0.86 + rnd() * 0.28 - (mult > 1 ? 0.05 : 0); // de −14% a +14%
    const preco = Math.max(1, Math.round(precoRef * mult * variacao));
    const qtd = (Number(insumo.qtd_embalagem) || 1) * mult;
    const marca = marcas.length ? marcas[Math.floor(rnd() * marcas.length)] : rnd() < 0.5 ? 'Marca própria' : '';
    const fator = ref.base === 'un' ? 1 : 1000; // preço por kg ou litro
    ofertas.push({
      id: `${insumo.id}|${loja.id}`,
      insumo_id: insumo.id,
      loja,
      titulo: `${insumo.nome}${marca ? ` ${marca}` : ''} ${tamanhoTxt(qtd, insumo.unidade)}`,
      marca,
      qtd,
      preco,
      porMedida: Math.round((preco / (qtdBase * mult)) * fator),
      medida: ref.base === 'g' ? 'kg' : ref.base === 'ml' ? 'l' : 'un',
      diferenca: variacao - 1,
      nota: Math.round((3.8 + rnd() * 1.2) * 10) / 10,
      avaliacoes: Math.floor(20 + rnd() * 2000),
      referencia: { preco: Math.round(precoRef), fonte: ref.fonte, data: ref.data, mercado: ref.mercado || '' },
    });
  }
  ofertas.sort((a, b) => a.porMedida - b.porMedida);
  if (ofertas.length) ofertas[0].maisBarato = true;
  return ofertas;
}

const semAcento = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// Pesquisa: insumos ativos cujo nome casa com o texto; sem texto, os mais usados nas receitas primeiro.
export function pesquisar(texto, { insumos = [], receitas = [], itens = [], hoje, tipo = '' }) {
  const termos = semAcento(texto).split(/\s+/).filter(Boolean);
  const uso = {};
  for (const r of receitas) {
    if (r.ativo === false) continue;
    let lista = [];
    try {
      lista = Array.isArray(r.ingredientes) ? r.ingredientes : JSON.parse(r.ingredientes || '[]');
    } catch {
      lista = [];
    }
    for (const x of lista) uso[x.insumo_id] = (uso[x.insumo_id] || 0) + 1;
  }
  return insumos
    .filter((x) => x.ativo !== false && (!tipo || (x.tipo || 'ingrediente') === tipo))
    .filter((x) => termos.every((t) => semAcento(`${x.nome} ${x.marca || ''} ${x.produto || ''}`).includes(t)))
    .map((insumo) => ({ insumo, usadoEm: uso[insumo.id] || 0, ofertas: ofertasDe(insumo, { itens, hoje }) }))
    .sort((a, b) => b.usadoEm - a.usadoEm || a.insumo.nome.localeCompare(b.insumo.nome));
}

// Link da pesquisa de verdade no Google Shopping.
export function linkGoogleShopping(insumo) {
  return `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(`${insumo.nome} ${insumo.marca && insumo.marca !== '-' ? insumo.marca : ''}`.trim())}`;
}

// Texto da lista de compras para mandar no WhatsApp, agrupado por loja.
export function textoCompra(linhas, fmt) {
  const porLoja = {};
  for (const l of linhas) (porLoja[l.oferta.loja.nome] ||= []).push(l);
  const partes = ['Compras do pudim'];
  for (const [loja, ls] of Object.entries(porLoja)) {
    partes.push('', `*${loja}*`);
    for (const l of ls) partes.push(`• ${l.quantidade}× ${l.oferta.titulo}: ${fmt(l.oferta.preco * l.quantidade)}`);
  }
  partes.push('', `Total: ${fmt(linhas.reduce((s, l) => s + l.oferta.preco * l.quantidade, 0))}`);
  return partes.join('\n');
}
