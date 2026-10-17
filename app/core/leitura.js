// Prepara o que vai para a IA e confere o que volta dela, marcando o que precisa de resposta antes de salvar.
import { ORIGENS } from './schema.js';
import { toCents } from './money.js';

const DATA = /^\d{4}-\d{2}-\d{2}$/;
const CONFIANCA_MINIMA = 0.7;

export function montarContexto(tables, hoje) {
  const ultimos = [...tables.lancamentos]
    .sort((a, b) => (a.data < b.data ? 1 : -1))
    .slice(0, 30)
    .map((l) => ({ descricao: l.descricao, tipo: l.tipo, valor: Number(l.valor), conta_id: l.conta_id, categoria_id: l.categoria_id, origem: l.origem }));
  return {
    hoje,
    contas: tables.contas.filter((c) => c.ativa !== false).map((c) => ({ id: c.id, nome: c.nome, dono: c.dono, grupo: c.grupo })),
    categorias: tables.categorias.filter((c) => c.ativa !== false).map((c) => ({ id: c.id, nome: c.nome, tipo: c.tipo, origem_padrao: c.origem_padrao })),
    exemplos: ultimos,
  };
}

const num = (v) => {
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
};

// Rascunho conferido: lançamentos (comprovante/extrato) ou itens (nota de mercado), com as dúvidas de cada um.
export function conferirLeitura(resp, tables, hoje) {
  const contas = new Set(tables.contas.map((c) => c.id));
  const cats = Object.fromEntries(tables.categorias.map((c) => [c.id, c]));
  const r = resp && typeof resp === 'object' ? resp : {};
  const dataDoc = DATA.test(r.data || '') ? r.data : null;

  const lancamentos = (Array.isArray(r.lancamentos) ? r.lancamentos : []).map((l, i) => {
    const tipo = ['entrada', 'saida', 'transferencia'].includes(l.tipo) ? l.tipo : 'saida';
    const cat = cats[l.categoria_id] && cats[l.categoria_id].tipo === tipo ? l.categoria_id : '';
    let origem = ORIGENS.includes(l.origem) ? l.origem : '';
    if (!origem && cat && tipo !== 'transferencia') origem = cats[cat].origem_padrao || '';
    const data = DATA.test(l.data || '') ? l.data : dataDoc;
    const x = {
      chave: `l${i}`,
      salvar: true,
      tipo,
      valor: num(l.valor),
      data: data || hoje,
      descricao: String(l.descricao || r.estabelecimento || '').slice(0, 80),
      conta_id: contas.has(l.conta_id) ? l.conta_id : '',
      conta_destino_id: tipo === 'transferencia' && contas.has(l.conta_destino_id) ? l.conta_destino_id : '',
      categoria_id: tipo === 'transferencia' ? '' : cat,
      origem: tipo === 'transferencia' ? '' : origem,
      duvidaIa: l.duvida || (Number(l.confianca) < CONFIANCA_MINIMA ? 'A leitura não ficou segura. Confira os campos.' : ''),
      dataLida: !!data,
    };
    return x;
  });

  const itens = (Array.isArray(r.itens) ? r.itens : []).map((it, i) => ({
    chave: `i${i}`,
    descricao: String(it.descricao || '').slice(0, 60),
    quantidade: Number(it.quantidade) || 1,
    unidade: ['un', 'kg', 'g', 'l', 'ml'].includes(String(it.unidade || '').toLowerCase()) ? String(it.unidade).toLowerCase() : 'un',
    valor: num(it.valor_total),
    categoria_id: categoriaDoItem(it, cats),
    duvidaIa: it.duvida || (Number(it.confianca) < CONFIANCA_MINIMA && it.origem ? 'Confira a categoria.' : ''),
  }));

  return {
    tipo: r.tipo_documento === 'nota_mercado' || (itens.length && !lancamentos.length) ? 'nota' : 'lancamentos',
    estabelecimento: r.estabelecimento || '',
    data: dataDoc || hoje,
    dataLida: !!dataDoc,
    total: num(r.total),
    lancamentos,
    itens,
  };
}

// O que falta responder num lançamento antes de salvar.
export function pendenciasLancamento(l) {
  const p = [];
  if (!l.valor) p.push('valor');
  if (!l.conta_id) p.push(l.tipo === 'transferencia' ? 'conta de origem' : 'conta');
  if (l.tipo === 'transferencia' && !l.conta_destino_id) p.push('conta de destino');
  if (l.tipo === 'transferencia' && l.conta_destino_id && l.conta_destino_id === l.conta_id) p.push('contas diferentes');
  if (l.tipo !== 'transferencia' && !l.origem) p.push('origem');
  if (!l.dataLida) p.push('data (confira)');
  return p;
}

// Categoria do item: a que a IA escolheu (se for de saída) ou a padrão do grupo que ela indicou.
const PADRAO_POR_ORIGEM = { Pudim: 'cat-ingrediente', Casa: 'cat-mercado' };
function categoriaDoItem(it, cats) {
  if (cats[it.categoria_id] && cats[it.categoria_id].tipo === 'saida') return it.categoria_id;
  const padrao = PADRAO_POR_ORIGEM[it.origem];
  return padrao && cats[padrao] ? padrao : '';
}

// Nota de mercado: soma por categoria e confere com o total impresso.
// `diferencaEm` é o id da categoria que recebe a diferença entre itens e total (vazio = ignorar).
export function resumoNota(nota, { diferencaEm = '' } = {}) {
  const soma = {};
  let semCategoria = 0;
  for (const it of nota.itens) {
    if (!it.valor) continue;
    if (it.categoria_id) soma[it.categoria_id] = (soma[it.categoria_id] || 0) + toCents(it.valor);
    else semCategoria += 1;
  }
  const somaItens = Object.values(soma).reduce((a, b) => a + b, 0);
  const total = nota.total ? toCents(nota.total) : null;
  const dif = total !== null ? total - somaItens : 0;
  const diferenca = Math.abs(dif) > 5 ? dif : 0;
  if (diferenca && diferencaEm) soma[diferencaEm] = (soma[diferencaEm] || 0) + diferenca;
  return { soma, somaItens, total, diferenca, semCategoria, semValor: nota.itens.filter((i) => !i.valor).length };
}

// Lançamentos a gravar a partir da nota: um por categoria, com a origem do grupo da categoria.
export function lancamentosDaNota(nota, { conta_id, data, diferencaEm, categorias }) {
  const r = resumoNota(nota, { diferencaEm });
  const cats = Object.fromEntries(categorias.map((c) => [c.id, c]));
  const nome = nota.estabelecimento || 'Mercado';
  return Object.entries(r.soma)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([cat, v]) => ({
      tipo: 'saida',
      valor: v / 100,
      data,
      descricao: `${nome} — ${(cats[cat]?.nome || 'Outros').toLowerCase()}`,
      conta_id,
      categoria_id: cat,
      origem: cats[cat]?.origem_padrao || 'Casa',
      detalhe: nota.itens.filter((i) => i.categoria_id === cat).map((i) => i.descricao).join(', ').slice(0, 300),
    }));
}

// Itens da nota para guardar na aba Itens, ligados ao lançamento da sua categoria.
export function itensDaNota(nota, lancamentosSalvos, { data, grupo_id, criado_em }) {
  const porCategoria = Object.fromEntries(lancamentosSalvos.map((l) => [l.categoria_id, l]));
  return nota.itens
    .filter((i) => i.categoria_id && i.descricao)
    .map((i) => ({
      data,
      mercado: nota.estabelecimento || '',
      descricao: i.descricao,
      quantidade: i.quantidade,
      unidade: i.unidade,
      valor: i.valor ?? '',
      preco_unitario: i.valor ? Math.round((i.valor / (i.quantidade || 1)) * 100) / 100 : '',
      categoria_id: i.categoria_id,
      origem: porCategoria[i.categoria_id]?.origem || '',
      lancamento_id: porCategoria[i.categoria_id]?.id || '',
      grupo_id,
      criado_em,
    }));
}

// Categorias de saída mais usadas (lançamentos e itens), para os botões rápidos.
export function categoriasMaisUsadas(tables, limite = 5) {
  const conta = {};
  for (const l of tables.lancamentos) if (l.tipo === 'saida' && l.categoria_id) conta[l.categoria_id] = (conta[l.categoria_id] || 0) + 1;
  for (const i of tables.itens || []) if (i.categoria_id) conta[i.categoria_id] = (conta[i.categoria_id] || 0) + 1;
  const ativas = tables.categorias.filter((c) => c.tipo === 'saida' && c.ativa !== false && c.id !== 'cat-dizimo');
  return ativas
    .map((c) => ({ c, n: (conta[c.id] || 0) + (c.id === 'cat-mercado' || c.id === 'cat-ingrediente' ? 0.5 : 0) }))
    .sort((a, b) => b.n - a.n)
    .slice(0, limite)
    .map((x) => x.c);
}
