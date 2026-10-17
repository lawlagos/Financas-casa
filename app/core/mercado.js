// Assistente de mercado: agrupa os itens das notas por produto, acha o ritmo de compra de cada um,
// sugere a lista do que deve estar acabando e estima o gasto de mercado do mês que vem.
import { toCents } from './money.js';
import { addDays, diffDays, monthKey, addMonthsKey, daysInMonth } from './dates.js';

// Categorias que contam como "mercado" quando ainda não há itens daquele grupo.
export const CATEGORIAS_MERCADO_PADRAO = { Casa: ['cat-mercado'], Pudim: ['cat-ingrediente', 'cat-embalagem'] };
// Dias antes da data prevista em que o item já entra na lista.
const ANTECEDENCIA = 3;

const semAcento = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

// Nome do produto sem tamanho, números e embalagem: "Leite condensado Moça 395g" -> "Leite condensado Moça".
export function nomeBase(descricao) {
  return String(descricao || '')
    .replace(/\b\d+([.,]\d+)?\s*(kg|g|gr|mg|ml|l|lt|lts|un|und|unid|x)\b/gi, ' ')
    .replace(/\b(pct|pacote|cx|caixa|fd|fardo|lata|garrafa|pote)\b/gi, ' ')
    .replace(/\d+/g, ' ')
    .replace(/[^\p{L}\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function chaveProduto(nome) {
  return semAcento(String(nome || '').toLowerCase()).replace(/\s+/g, ' ').trim();
}

export function produtoDoItem(it) {
  return String(it.produto || '').trim() || nomeBase(it.descricao) || String(it.descricao || '').trim();
}

// Tamanho em kg ou litros, para comparar preço por kg/l entre marcas e embalagens.
export function tamanhoBase(it) {
  const t = Number(it.tamanho);
  const u = String(it.tamanho_unidade || '').toLowerCase();
  if (!(t > 0)) return null;
  if (u === 'g') return { qtd: t / 1000, unidade: 'kg' };
  if (u === 'kg') return { qtd: t, unidade: 'kg' };
  if (u === 'ml') return { qtd: t / 1000, unidade: 'l' };
  if (u === 'l') return { qtd: t, unidade: 'l' };
  return null;
}

const maisComum = (lista) => {
  const n = {};
  for (const x of lista) if (x) n[x] = (n[x] || 0) + 1;
  return Object.entries(n).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
};

// Um resumo por produto, só dos itens do grupo pedido (origem), do mais comprado para o menos.
export function produtos(itens, { origem = 'Casa', hoje }) {
  const grupos = {};
  for (const it of itens || []) {
    if ((it.origem || 'Casa') !== origem || !it.data) continue;
    const nome = produtoDoItem(it);
    const k = chaveProduto(nome);
    if (!k) continue;
    (grupos[k] ||= []).push({ ...it, _nome: nome });
  }
  return Object.entries(grupos)
    .map(([chave, lista]) => resumoProduto(chave, lista, hoje))
    .sort((a, b) => b.compras - a.compras || b.gasto - a.gasto || a.nome.localeCompare(b.nome));
}

function resumoProduto(chave, lista, hoje) {
  lista.sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0));
  const datas = [...new Set(lista.map((i) => i.data))];
  const ultimo = lista[lista.length - 1];
  const precoUn = (i) => (i.valor ? toCents(i.valor) / (Number(i.quantidade) || 1) : null);
  const comPreco = lista.filter((i) => precoUn(i) !== null);

  // Preço por kg/l quando o tamanho é conhecido; senão, por unidade comprada.
  const porMedida = (i) => {
    const t = tamanhoBase(i);
    const p = precoUn(i);
    return t && p !== null ? { valor: Math.round(p / t.qtd), unidade: t.unidade } : null;
  };

  // Mercado mais barato: menor preço da última compra em cada mercado.
  const ultimoPorMercado = {};
  for (const i of comPreco) if (i.mercado) ultimoPorMercado[i.mercado] = { preco: Math.round(precoUn(i)), data: i.data, medida: porMedida(i) };
  const mercados = Object.entries(ultimoPorMercado).map(([mercado, x]) => ({ mercado, ...x })).sort((a, b) => a.preco - b.preco);

  // Ritmo: média dos intervalos entre dias de compra (precisa de pelo menos 2 compras).
  let intervalo = null;
  if (datas.length >= 2) intervalo = Math.max(1, Math.round(diffDays(datas[datas.length - 1], datas[0]) / (datas.length - 1)));
  const ultimaData = datas[datas.length - 1];
  const proxima = intervalo ? addDays(ultimaData, intervalo) : null;
  const qtdPorCompra = Math.round((lista.reduce((s, i) => s + (Number(i.quantidade) || 1), 0) / datas.length) * 100) / 100;
  const gasto = lista.reduce((s, i) => s + (i.valor ? toCents(i.valor) : 0), 0);

  return {
    chave,
    nome: maisComum(lista.map((i) => i._nome)),
    marcas: [...new Set(lista.map((i) => i.marca).filter(Boolean))],
    compras: datas.length,
    gasto,
    gastoPorCompra: Math.round(gasto / datas.length),
    qtdPorCompra,
    unidade: maisComum(lista.map((i) => i.unidade)) || 'un',
    ultimaData,
    ultimoPreco: comPreco.length ? Math.round(precoUn(comPreco[comPreco.length - 1])) : null,
    precoMedio: comPreco.length ? Math.round(comPreco.reduce((s, i) => s + precoUn(i), 0) / comPreco.length) : null,
    medida: comPreco.length ? porMedida(comPreco[comPreco.length - 1]) : null,
    mercados,
    maisBarato: mercados.length > 1 ? mercados[0] : null,
    intervalo,
    proxima,
    diasParaProxima: proxima ? diffDays(proxima, hoje) : null,
    historico: [...lista].reverse(),
  };
}

// Lista sugerida: o que pelo ritmo deve acabar até daqui a ANTECEDENCIA dias (os atrasados primeiro).
export function listaSugerida(lista, { antecedencia = ANTECEDENCIA } = {}) {
  const itens = lista
    .filter((p) => p.diasParaProxima !== null && p.diasParaProxima <= antecedencia)
    // Comprou uma vez faz muito tempo e nunca mais: provavelmente não é mais de compra frequente.
    .filter((p) => p.diasParaProxima > -3 * p.intervalo)
    .sort((a, b) => a.diasParaProxima - b.diasParaProxima);
  return { itens, total: itens.reduce((s, p) => s + p.gastoPorCompra, 0) };
}

// Categorias de saída que contam como mercado para o grupo: as usadas nos itens dele mais as padrão.
export function categoriasMercado(itens, origem = 'Casa') {
  const s = new Set(CATEGORIAS_MERCADO_PADRAO[origem] || []);
  for (const it of itens || []) if ((it.origem || 'Casa') === origem && it.categoria_id) s.add(it.categoria_id);
  return s;
}

// Gasto de mercado por mês (centavos), olhando os lançamentos nas categorias de mercado.
export function gastoPorMes(lancamentos, cats) {
  const out = {};
  for (const l of lancamentos) {
    if (l.tipo !== 'saida' || !cats.has(l.categoria_id) || !l.data) continue;
    const m = monthKey(l.data);
    out[m] = (out[m] || 0) + toCents(l.valor);
  }
  return out;
}

// Estimativa do mês que vem.
//  - "media": média dos últimos (até 3) meses fechados que tiveram gasto;
//  - "ritmo": sem mês fechado ainda, projeta o gasto deste mês (pelo menos 7 dias de dados) para o mês seguinte;
//  - null: dados insuficientes.
export function previsaoMes({ lancamentos, itens, origem = 'Casa', hoje }) {
  const cats = categoriasMercado(itens, origem);
  const porMes = gastoPorMes(lancamentos, cats);
  const atual = monthKey(hoje);
  const proximo = addMonthsKey(atual, 1);
  const noMes = porMes[atual] || 0;
  const fechados = [1, 2, 3].map((n) => addMonthsKey(atual, -n)).filter((m) => porMes[m] > 0);
  const [py, pm] = proximo.split('-').map(Number);
  const diasProximo = daysInMonth(py, pm);
  const base = { mes: proximo, noMes, porMes, categorias: [...cats] };
  if (fechados.length) {
    const valor = Math.round(fechados.reduce((s, m) => s + porMes[m], 0) / fechados.length);
    return { ...base, valor, como: 'media', meses: fechados };
  }
  const datas = lancamentos.filter((l) => l.tipo === 'saida' && cats.has(l.categoria_id) && l.data && l.data <= hoje).map((l) => l.data).sort();
  if (!datas.length) return { ...base, valor: null, como: null, meses: [] };
  const desde = datas[0] > `${atual}-01` ? datas[0] : `${atual}-01`;
  const dias = diffDays(hoje, desde) + 1;
  if (dias < 7) return { ...base, valor: null, como: null, meses: [], diasDeDados: dias };
  const valor = Math.round((noMes / dias) * diasProximo);
  return { ...base, valor, como: 'ritmo', meses: [], diasDeDados: dias };
}

// Texto para copiar e mandar no WhatsApp.
export function textoLista(itens, fmt) {
  return ['Lista do mercado', ...itens.map((p) => `• ${p.nome}${p.qtdPorCompra > 1 ? ` (${String(p.qtdPorCompra).replace('.', ',')} ${p.unidade})` : ''}${p.maisBarato ? `: mais barato no ${p.maisBarato.mercado}, ${fmt(p.maisBarato.preco)}` : ''}`)].join('\n');
}
