// Importação em lote: saldos de contas e previstos, num texto JSON gerado fora do app.
// { versao: 1, data_saldo: 'AAAA-MM-DD', contas: { c6: 120.5, ... }, previstos: [ { id, descricao, ... } ],
//   substituir_prefixos: ['imp-'],  (opcional: apaga previstos importados antes com esses prefixos)
//   insumos: [ { id, nome, tipo, qtd_embalagem, unidade, preco_embalagem, ... } ],
//   receitas: [ { id, nome, rendimento, ingredientes: [ { insumo_id, quantidade } ], ... } ],
//   custos_pudim: { salario, decimo, dias, horas, despesas: [ { nome, valor, divisor } ] },
//   desativar_receitas: ['pp-rec-'] }  (opcional: receitas com esses prefixos que não vieram no arquivo são desativadas,
//   não apagadas, porque o estoque pode apontar para elas)
// Reimportar ingrediente ou receita que já existe atualiza só o que veio preenchido: o resto (ex.: preço de venda
// digitado no app) fica como está.
import { SCHEMA } from './schema.js';

const NATUREZAS = ['fixo', 'parcelado', 'variavel', 'unico'];
const TIPOS = ['entrada', 'saida', 'transferencia'];
const DATA = /^\d{4}-\d{2}-\d{2}$/;

const juntar = (nova, antiga) => (antiga ? Object.fromEntries(Object.entries(nova).map(([k, v]) => [k, v === '' && antiga[k] !== '' && antiga[k] != null ? antiga[k] : v])) : nova);

export function prepararImportacao(texto, contasExistentes, previstosExistentes = [], insumosExistentes = [], receitasExistentes = []) {
  let dados;
  try {
    dados = typeof texto === 'string' ? JSON.parse(texto) : texto;
  } catch {
    return { erros: ['O texto não é uma importação válida. Copie o arquivo inteiro, do primeiro { ao último }.'] };
  }
  const erros = [];
  if (!dados || dados.versao !== 1) erros.push('Formato de importação desconhecido.');
  const ids = new Set(contasExistentes.map((c) => c.id));
  const contas = [];
  if (dados?.contas) {
    if (!DATA.test(dados.data_saldo || '')) erros.push('Falta a data dos saldos (data_saldo).');
    for (const [id, saldo] of Object.entries(dados.contas)) {
      const conta = contasExistentes.find((c) => c.id === id);
      if (!conta) erros.push(`Conta desconhecida: ${id}.`);
      else if (!Number.isFinite(Number(saldo))) erros.push(`Saldo inválido na conta ${conta.nome}.`);
      else contas.push({ ...conta, saldo_inicial: Number(saldo), data_saldo_inicial: dados.data_saldo });
    }
  }
  const previstos = [];
  (dados?.previstos || []).forEach((p, i) => {
    const onde = `Previsto ${i + 1} (${p?.descricao || 'sem descrição'})`;
    if (!p?.id || !p.descricao) return erros.push(`${onde}: falta id ou descrição.`);
    if (!TIPOS.includes(p.tipo)) return erros.push(`${onde}: tipo inválido.`);
    if (!NATUREZAS.includes(p.natureza)) return erros.push(`${onde}: natureza inválida.`);
    if (!(Number(p.valor) > 0)) return erros.push(`${onde}: valor inválido.`);
    if (!ids.has(p.conta_id)) return erros.push(`${onde}: conta desconhecida.`);
    if (p.natureza === 'unico' ? !DATA.test(p.data_unica || '') : !DATA.test(p.inicio || '')) return erros.push(`${onde}: data inválida.`);
    if (p.natureza === 'parcelado' && !(Number(p.parcelas_total) > 0)) return erros.push(`${onde}: falta o total de parcelas.`);
    // Sem "ativo" no arquivo, entra ativo: vazio vira "falso" na planilha e o previsto sumiria.
    previstos.push(Object.fromEntries(SCHEMA.previstos.map((c) => [c, p[c] ?? (c === 'ativo' ? true : c === 'renovacao' ? false : '')])));
  });
  const insumos = [];
  (dados?.insumos || []).forEach((x, i) => {
    if (!x?.id || !x.nome) return erros.push(`Ingrediente ${i + 1}: falta id ou nome.`);
    if (!['g', 'kg', 'ml', 'l', 'un'].includes(x.unidade)) return erros.push(`Ingrediente ${x.nome}: unidade inválida.`);
    // Sem "ativo" no arquivo: novo entra ativo, existente fica como está (não reativa o que foi desligado).
    const linha = juntar(Object.fromEntries(SCHEMA.insumos.map((c) => [c, x[c] ?? ''])), insumosExistentes.find((e) => e.id === x.id));
    insumos.push({ ...linha, ativo: linha.ativo === '' ? true : linha.ativo });
  });
  const idsInsumos = new Set([...(dados?.insumos || []).map((x) => x?.id), ...insumosExistentes.map((x) => x.id)]);
  const receitas = [];
  const idsReceitas = new Set([...(dados?.receitas || []).map((r) => r?.id), ...receitasExistentes.map((r) => r.id)]);
  (dados?.receitas || []).forEach((r, i) => {
    if (!r?.id || !r.nome) return erros.push(`Receita ${i + 1}: falta id ou nome.`);
    if (r.sabor_id && !idsReceitas.has(r.sabor_id)) return erros.push(`Receita ${r.nome}: sabor desconhecido (${r.sabor_id}).`);
    const ings = Array.isArray(r.ingredientes) ? r.ingredientes : null;
    // Ingrediente pode ser um preparo (calda, base): "preparo:<id da receita>".
    const sem = (ings || []).filter((x) => !idsInsumos.has(x.insumo_id) && !(String(x.insumo_id).startsWith('preparo:') && idsReceitas.has(String(x.insumo_id).slice(8))));
    if (sem.length) return erros.push(`Receita ${r.nome}: ingrediente desconhecido (${sem[0].insumo_id}).`);
    // Sem lista de ingredientes no arquivo, mantém a que já existe.
    const linha = juntar({ ...Object.fromEntries(SCHEMA.receitas.map((c) => [c, r[c] ?? ''])), ingredientes: ings ? JSON.stringify(ings) : '' }, receitasExistentes.find((e) => e.id === r.id));
    receitas.push({ ...linha, ativo: linha.ativo === '' ? true : linha.ativo, ingredientes: linha.ingredientes || '[]' });
  });
  const prefixosReceitas = [].concat(dados?.desativar_receitas || []).filter(Boolean);
  const vieram = new Set(receitas.map((r) => r.id));
  for (const r of receitasExistentes) {
    if (r.ativo !== false && !vieram.has(r.id) && prefixosReceitas.some((x) => String(r.id).startsWith(x))) receitas.push({ ...r, ativo: false });
  }
  const config = [];
  if (dados?.custos_pudim) {
    const c = dados.custos_pudim;
    if (typeof c !== 'object' || !Array.isArray(c.despesas || [])) erros.push('Custos do pudim em formato inválido.');
    else config.push({ id: 'custos_pudim', valor: JSON.stringify(c) });
  }
  if (!erros.length && !contas.length && !previstos.length && !insumos.length && !receitas.length && !config.length) erros.push('A importação está vazia.');
  // Previstos de uma importação anterior (pelo prefixo do id) que não estão nesta saem, para não duplicar.
  const novos = new Set(previstos.map((p) => p.id));
  const prefixos = [].concat(dados?.substituir_prefixos || []).filter(Boolean);
  const remover = prefixos.length
    ? (previstosExistentes || []).filter((p) => prefixos.some((x) => String(p.id).startsWith(x)) && !novos.has(p.id)).map((p) => p.id)
    : [];
  return { erros, contas, previstos, remover, insumos, receitas, config };
}
