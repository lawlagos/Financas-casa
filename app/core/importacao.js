// Importação em lote: saldos de contas e previstos, num texto JSON gerado fora do app.
// { versao: 1, data_saldo: 'AAAA-MM-DD', contas: { c6: 120.5, ... }, previstos: [ { id, descricao, ... } ],
//   substituir_prefixos: ['imp-'] }  (opcional: apaga previstos importados antes com esses prefixos)
import { SCHEMA } from './schema.js';

const NATUREZAS = ['fixo', 'parcelado', 'variavel', 'unico'];
const TIPOS = ['entrada', 'saida', 'transferencia'];
const DATA = /^\d{4}-\d{2}-\d{2}$/;

export function prepararImportacao(texto, contasExistentes, previstosExistentes = []) {
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
    previstos.push(Object.fromEntries(SCHEMA.previstos.map((c) => [c, p[c] ?? ''])));
  });
  if (!erros.length && !contas.length && !previstos.length) erros.push('A importação está vazia.');
  // Previstos de uma importação anterior (pelo prefixo do id) que não estão nesta saem, para não duplicar.
  const novos = new Set(previstos.map((p) => p.id));
  const prefixos = [].concat(dados?.substituir_prefixos || []).filter(Boolean);
  const remover = prefixos.length
    ? (previstosExistentes || []).filter((p) => prefixos.some((x) => String(p.id).startsWith(x)) && !novos.has(p.id)).map((p) => p.id)
    : [];
  return { erros, contas, previstos, remover };
}
