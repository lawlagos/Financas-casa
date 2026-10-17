// O estoque arrumado como o cardápio: pudim no copo, pudim para compartilhar (1 kg e 500 g) e geladinhos.
// Um cartão por produto, com o que tem pronto em cada local, o mínimo e o que vence.
import { ehGeladinho, LOCAIS_PADRAO } from './pudim.js';
import { addDays } from './dates.js';
import { locaisDoProduto } from './estoqueinsumos.js';

export const CATEGORIAS = [
  ['copo', 'Pudim no copo'],
  ['grande', 'Pudim para compartilhar'],
  ['geladinho', 'Geladinhos'],
  ['outros', 'Outros'],
];

export function categoriaDoProduto(r) {
  if (ehGeladinho(r)) return 'geladinho';
  const p = Number(r?.porcao) || 0;
  if (p === 150 || /\bno copo$/i.test(r?.nome || '')) return 'copo';
  if (p >= 500) return 'grande';
  return 'outros';
}

// Nome como no cardápio, sem repetir a categoria: "Tradicional no copo" → "Tradicional", "Geladinho de pudim" → "Pudim".
export function nomeCurto(r) {
  const n = String(r?.nome || '');
  const c = categoriaDoProduto(r);
  if (c === 'copo') return n.replace(/\s+no copo$/i, '').replace(/\s+150$/, '');
  if (c === 'geladinho') {
    const x = n.replace(/^geladinhos?\s+(de\s+)?/i, '');
    return x ? x.charAt(0).toUpperCase() + x.slice(1) : n;
  }
  return n;
}

const preco = (r) => Number(r?.preco_venda) || 0;

// Mínimo do produto num local, em unidades: fornadas × rendimento × fator do local (Ibiúna metade).
export const minimoNoLocal = (p, l) => Math.ceil((Number(p.estoque_minimo) || 0) * (Number(p.rendimento) || 1) * (Number(l.fator) || 0));

// Cartões do estoque. `local`: só aquele local (ou null para todos).
// status: zerado (sem nenhum e com mínimo), baixo (algum local abaixo do mínimo), vence (vencido ou vence até amanhã),
// ok, ou vazio (sem nenhum e sem mínimo, ex.: feito por encomenda).
export function cartoesEstoque(produtos, lotes, hoje, { local = null, locais = LOCAIS_PADRAO } = {}) {
  const amanha = addDays(hoje, 1);
  // Ordem do cardápio: no copo e geladinho pelo preço; 1 kg e 500 g pelo sabor (na ordem do copo) e do maior para o menor.
  const copoDoSabor = {};
  for (const p of produtos) if (categoriaDoProduto(p) === 'copo' && p.sabor_id) copoDoSabor[p.sabor_id] = preco(p);
  const ordem = (p) => (categoriaDoProduto(p) === 'grande' ? copoDoSabor[p.sabor_id] ?? preco(p) : preco(p));
  const cartoes = [];
  for (const p of produtos) {
    const dos = locaisDoProduto(p, locais).filter((l) => !local || l.id === local);
    if (!dos.length) continue;
    const porLocal = dos.map((l) => ({ local: l, quantidade: 0, vencidos: 0, minimo: minimoNoLocal(p, l) }));
    const c = { receita: p, categoria: categoriaDoProduto(p), nome: nomeCurto(p), total: 0, vencidos: 0, venceLogo: 0, proximaValidade: null, porLocal, minimo: 0 };
    for (const lt of lotes) {
      if (lt.receita_id !== p.id) continue;
      const pl = porLocal.find((x) => x.local.id === lt.local);
      if (!pl) continue;
      if (lt.validade < hoje) {
        pl.vencidos += lt.restante;
        c.vencidos += lt.restante;
        continue;
      }
      pl.quantidade += lt.restante;
      c.total += lt.restante;
      if (lt.validade <= amanha) c.venceLogo += lt.restante;
      if (!c.proximaValidade || lt.validade < c.proximaValidade) c.proximaValidade = lt.validade;
    }
    c.minimo = porLocal.reduce((t, x) => t + x.minimo, 0);
    const baixo = porLocal.some((x) => x.minimo > 0 && x.quantidade < x.minimo);
    c.status = !c.total ? (c.minimo > 0 ? 'zerado' : 'vazio') : baixo ? 'baixo' : c.vencidos || c.venceLogo ? 'vence' : 'ok';
    cartoes.push(c);
  }
  cartoes.sort((a, b) => {
    const ca = CATEGORIAS.findIndex(([k]) => k === a.categoria);
    const cb = CATEGORIAS.findIndex(([k]) => k === b.categoria);
    return ca - cb || ordem(a.receita) - ordem(b.receita) || String(a.receita.sabor_id || a.nome).localeCompare(String(b.receita.sabor_id || b.nome)) || (Number(b.receita.porcao) || 0) - (Number(a.receita.porcao) || 0) || a.nome.localeCompare(b.nome);
  });
  return CATEGORIAS.map(([k, titulo]) => ({ categoria: k, titulo, cartoes: cartoes.filter((c) => c.categoria === k) })).filter((g) => g.cartoes.length);
}
