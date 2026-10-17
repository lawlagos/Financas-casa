// Estoque de ingredientes e embalagens do pudim, e estoque mínimo.
// Movimentos (aba "Estoque de ingredientes"): entrada (compra), saida (produção), contagem (o que tem em casa agora).
// Quantidades sempre na unidade base do ingrediente: g, ml ou un.
import { ingredientesDe, idPreparo, LOCAIS_PADRAO, ehGeladinho } from './pudim.js';
import { chaveProduto, produtoDoItem } from './mercado.js';

const BASE = { g: 'g', kg: 'g', ml: 'ml', l: 'ml', un: 'un' };
const FATOR = { g: 1, kg: 1000, ml: 1, l: 1000, un: 1 };

export const baseDe = (insumo) => BASE[insumo?.unidade] || 'un';
// Conteúdo de uma embalagem do ingrediente, na unidade base (lata de 395 g → 395; 1 kg → 1000).
export const embalagemBase = (insumo) => (Number(insumo?.qtd_embalagem) || 1) * (FATOR[insumo?.unidade] || 1);

// Quanto de cada ingrediente uma fornada do produto gasta: receita do sabor + linhas do próprio produto,
// abrindo os preparos (calda) nos ingredientes deles na proporção usada.
export function porFornada(receita, receitasPorId = {}, fator = 1, out = {}, profundidade = 0) {
  if (!receita || profundidade > 3) return out;
  const sabor = receita.sabor_id ? receitasPorId[receita.sabor_id] : null;
  for (const x of [...(sabor ? ingredientesDe(sabor) : []), ...ingredientesDe(receita)]) {
    const q = (Number(x.quantidade) || 0) * fator;
    const pid = idPreparo(x.insumo_id);
    if (pid) {
      const prep = receitasPorId[pid];
      if (prep) porFornada(prep, receitasPorId, q / (Number(prep.rendimento) || 1), out, profundidade + 1);
      continue;
    }
    out[x.insumo_id] = (out[x.insumo_id] || 0) + q;
  }
  return out;
}

// Gasto de ingredientes de uma produção de `unidades` do produto (proporcional ao rendimento).
export function gastoDaProducao(receita, unidades, receitasPorId) {
  const rend = Number(receita?.rendimento) || 1;
  return porFornada(receita, receitasPorId, (Number(unidades) || 0) / rend);
}

// Saldo de cada ingrediente: a última contagem mais o que entrou e saiu depois dela.
export function saldos(movimentos = []) {
  const ordem = [...movimentos].sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : String(a.criado_em || '') < String(b.criado_em || '') ? -1 : 1));
  const s = {};
  const contado = {};
  for (const m of ordem) {
    const q = Number(m.quantidade) || 0;
    if (m.tipo === 'contagem') {
      s[m.insumo_id] = q;
      contado[m.insumo_id] = m.data;
    } else if (m.tipo === 'entrada') s[m.insumo_id] = (s[m.insumo_id] || 0) + q;
    else if (m.tipo === 'saida') s[m.insumo_id] = (s[m.insumo_id] || 0) - q;
  }
  return { saldo: s, contadoEm: contado };
}

// Locais que trabalham com o produto (Ibiúna não tem geladinho).
export const locaisDoProduto = (p, locais = LOCAIS_PADRAO) => locais.filter((l) => !(l.soPudim && ehGeladinho(p)));

// Estoque mínimo de ingredientes: o que precisa para repor o mínimo de cada produto em todos os locais
// (o mínimo do produto vale para o primeiro local; os outros pedem a fração deles, ex.: Ibiúna metade).
export function minimos(produtos, receitasPorId, locais = LOCAIS_PADRAO) {
  const out = {};
  for (const p of produtos) {
    const n = (Number(p.estoque_minimo) || 0) * locaisDoProduto(p, locais).reduce((t, l) => t + (Number(l.fator) || 0), 0);
    if (n > 0) porFornada(p, receitasPorId, n, out);
  }
  return out;
}

// O que falta para chegar no mínimo, em embalagens para comprar.
export function faltas({ saldo = {}, minimo = {}, insumosPorId = {} }) {
  return Object.entries(minimo)
    .map(([id, min]) => {
      const insumo = insumosPorId[id];
      const tem = Math.max(0, saldo[id] || 0);
      const falta = min - tem;
      if (!insumo || falta <= 0.0001) return null;
      return { insumo, tem, minimo: min, falta, embalagens: Math.ceil(falta / embalagemBase(insumo) - 1e-9) };
    })
    .filter(Boolean)
    .sort((a, b) => b.falta / b.minimo - a.falta / a.minimo || a.insumo.nome.localeCompare(b.insumo.nome));
}

// Pudins prontos abaixo do mínimo em cada local (mínimo em fornadas × rendimento × fator do local).
// `prontos`: { local: { receita_id: unidades } }. Se outro local tem de sobra, sugere enviar em vez de produzir.
export function pudinsAbaixo(produtos, prontos = {}, locais = LOCAIS_PADRAO) {
  const out = [];
  for (const p of produtos) {
    const n = Number(p.estoque_minimo) || 0;
    if (!(n > 0)) continue;
    const rend = Number(p.rendimento) || 1;
    const doLocal = locaisDoProduto(p, locais).map((l) => ({ local: l, minimo: Math.ceil(n * rend * (Number(l.fator) || 0)), tem: prontos[l.id]?.[p.id] || 0 }));
    for (const x of doLocal) {
      if (x.tem >= x.minimo) continue;
      const falta = x.minimo - x.tem;
      const sobra = doLocal.filter((o) => o !== x && o.tem - o.minimo > 0).map((o) => ({ local: o.local, sobra: o.tem - o.minimo }))[0] || null;
      out.push({ receita: p, local: x.local, tem: x.tem, minimo: x.minimo, falta, fornadas: Math.ceil(falta / rend), enviarDe: sobra ? { local: sobra.local, quantidade: Math.min(sobra.sobra, falta) } : null });
    }
  }
  return out;
}

// Quanto entrou de um ingrediente numa compra (item de nota, da lista ou da pesquisa), na unidade base.
export function quantidadeComprada(item, insumo) {
  const base = baseDe(insumo);
  const qtd = Number(item.quantidade) || 1;
  const tu = String(item.tamanho_unidade || '').toLowerCase();
  if (Number(item.tamanho) > 0 && BASE[tu] === base) return qtd * Number(item.tamanho) * FATOR[tu];
  const u = String(item.unidade || 'un').toLowerCase();
  if (u !== 'un' && BASE[u] === base) return qtd * FATOR[u];
  return qtd * embalagemBase(insumo);
}

// Entradas de estoque a partir de itens comprados que são ingredientes do pudim (pelo nome do produto).
export function entradasDeItens(itens, insumos, { data, ref = '', origem = 'compra' } = {}) {
  const porChave = {};
  for (const ins of insumos || []) if (ins.ativo !== false) porChave[chaveProduto(ins.produto || ins.nome)] ||= ins;
  const out = [];
  for (const it of itens || []) {
    const insumo = porChave[chaveProduto(produtoDoItem(it))];
    if (!insumo) continue;
    out.push({ data: it.data || data, insumo_id: insumo.id, tipo: 'entrada', quantidade: Math.round(quantidadeComprada(it, insumo) * 1000) / 1000, origem, ref: it.id || ref, obs: '' });
  }
  return out;
}
