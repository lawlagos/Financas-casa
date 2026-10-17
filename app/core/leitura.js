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
    origem: it.origem === 'Pudim' || it.origem === 'Casa' ? it.origem : '',
    duvidaIa: it.duvida || (Number(it.confianca) < CONFIANCA_MINIMA && it.origem ? 'Confira se é pudim ou casa.' : ''),
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

// Nota de mercado: soma por origem e confere com o total impresso.
export function resumoNota(nota, { diferencaEm = 'Casa' } = {}) {
  const soma = { Pudim: 0, Casa: 0 };
  let semOrigem = 0;
  for (const it of nota.itens) {
    if (!it.valor) continue;
    if (it.origem) soma[it.origem] += toCents(it.valor);
    else semOrigem += 1;
  }
  const somaItens = soma.Pudim + soma.Casa;
  const total = nota.total ? toCents(nota.total) : null;
  const diferenca = total !== null ? total - somaItens : 0;
  if (diferenca && Math.abs(diferenca) > 5 && diferencaEm) soma[diferencaEm] += diferenca;
  return { soma, somaItens, total, diferenca: Math.abs(diferenca) > 5 ? diferenca : 0, semOrigem, semValor: nota.itens.filter((i) => !i.valor).length };
}

// Lançamentos a gravar a partir da nota: um para a parte do pudim, outro para a parte da casa.
export function lancamentosDaNota(nota, { conta_id, data, diferencaEm }) {
  const r = resumoNota(nota, { diferencaEm });
  const nome = nota.estabelecimento || 'Mercado';
  const lista = (origem) => nota.itens.filter((i) => i.origem === origem).map((i) => i.descricao).join(', ').slice(0, 300);
  const out = [];
  if (r.soma.Pudim > 0) out.push({ tipo: 'saida', valor: r.soma.Pudim / 100, data, descricao: `${nome} — pudim`, conta_id, categoria_id: 'cat-ingrediente', origem: 'Pudim', detalhe: lista('Pudim') });
  if (r.soma.Casa > 0) out.push({ tipo: 'saida', valor: r.soma.Casa / 100, data, descricao: `${nome} — casa`, conta_id, categoria_id: 'cat-mercado', origem: 'Casa', detalhe: lista('Casa') });
  return out;
}

// Itens da nota para guardar na aba Itens, ligados ao lançamento da sua origem (pudim ou casa).
export function itensDaNota(nota, lancamentosSalvos, { data, grupo_id, criado_em }) {
  const porOrigem = Object.fromEntries(lancamentosSalvos.map((l) => [l.origem, l.id]));
  return nota.itens
    .filter((i) => i.origem && i.descricao)
    .map((i) => ({
      data,
      mercado: nota.estabelecimento || '',
      descricao: i.descricao,
      quantidade: i.quantidade,
      unidade: i.unidade,
      valor: i.valor ?? '',
      preco_unitario: i.valor ? Math.round((i.valor / (i.quantidade || 1)) * 100) / 100 : '',
      origem: i.origem,
      lancamento_id: porOrigem[i.origem] || '',
      grupo_id,
      criado_em,
    }));
}
