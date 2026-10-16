// Interpreta uma frase curta ("gastei 87,50 no mercado pro pudim no nubank dela") num rascunho de lançamento.
// É um interpretador local, sem IA: acha valor, tipo, contas, categoria e origem por palavras-chave.
// Campos que não deu para descobrir ficam vazios e a tela pergunta.

import { parseBRL } from './money.js';
import { addDays } from './dates.js';

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const PALAVRAS_ENTRADA = ['recebi', 'entrou', 'ganhei', 'vendi', 'venda', 'caiu', 'pagou', 'pagaram', 'me pagou'];
const PALAVRAS_TRANSF = ['transferi', 'passei', 'mandei da', 'saquei', 'saque', 'transferencia'];

const DICAS_ORIGEM = [
  ['Pudim', ['pudim', 'pudins', 'ingrediente', 'embalagem', 'confeitaria', 'leite condensado', 'ovos']],
  ['Hotmart', ['hotmart', 'anuncio', 'meta', 'facebook', 'instagram', 'trafego', 'curso']],
  ['Consultoria', ['consultoria', 'mentoria']],
  ['Salario', ['salario', 'pagamento do mes']],
  ['YouTube', ['youtube', 'adsense']],
];

export function parseQuick(texto, { contas = [], categorias = [], hoje }) {
  const t = norm(texto);
  const out = { tipo: null, valor: null, descricao: '', conta_id: null, conta_destino_id: null, categoria_id: null, origem: null, data: hoje };

  // valor: "87,50", "87.50", "1.200", "2 mil", "87 reais"
  const mil = t.match(/(\d+(?:[.,]\d+)?)\s*mil\b/);
  const num = t.match(/(?:r\$\s*)?(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)/);
  if (mil) out.valor = parseBRL(mil[1]) * 1000;
  else if (num) out.valor = parseBRL(num[1]);

  if (PALAVRAS_TRANSF.some((p) => t.includes(p))) out.tipo = 'transferencia';
  else if (PALAVRAS_ENTRADA.some((p) => t.includes(p))) out.tipo = 'entrada';
  else if (out.valor !== null) out.tipo = 'saida';

  if (/\bontem\b/.test(t)) out.data = addDays(hoje, -1);
  else if (/\banteontem\b/.test(t)) out.data = addDays(hoje, -2);

  // contas: procura nomes na ordem em que aparecem; "dela"/"pj"/"pf" ajudam a desempatar Nubank.
  const achadas = [];
  for (const c of contas) {
    const nome = norm(c.nome);
    const base = nome.split(' ')[0];
    let pos = t.indexOf(nome);
    if (pos < 0) pos = t.indexOf(base);
    if (pos >= 0) achadas.push({ c, pos, exato: t.includes(nome) });
  }
  const escolher = (lista) => {
    if (!lista.length) return null;
    const exatos = lista.filter((x) => x.exato);
    if (exatos.length === 1) return exatos[0].c;
    const candidatos = exatos.length ? exatos : lista;
    const dela = /\bdela\b|\besposa\b|\bmulher\b/.test(t);
    const pj = /\bpj\b|\bempresa\b/.test(t);
    const pref = candidatos.find((x) => (dela ? x.c.dono === 'Esposa' : x.c.dono !== 'Esposa') && (pj ? x.c.grupo !== 'Pessoal' : true));
    return (pref || candidatos[0]).c;
  };
  achadas.sort((a, b) => a.pos - b.pos);
  // Agrupa por banco ("nubank" junta Nubank, Nubank PF, Nubank PJ), na ordem em que aparecem na frase.
  const bancos = [];
  for (const x of achadas) {
    const banco = norm(x.c.nome).split(' ')[0];
    const g = bancos.find((b) => b.banco === banco);
    if (g) g.lista.push(x);
    else bancos.push({ banco, lista: [x] });
  }
  if (out.tipo === 'transferencia' && bancos.length >= 2) {
    out.conta_id = escolher(bancos[0].lista)?.id || null;
    out.conta_destino_id = escolher(bancos[1].lista)?.id || null;
  } else {
    out.conta_id = escolher(achadas)?.id || null;
  }

  for (const [origem, palavras] of DICAS_ORIGEM) {
    if (palavras.some((p) => t.includes(p))) {
      out.origem = origem;
      break;
    }
  }

  if (out.tipo && out.tipo !== 'transferencia') {
    const doTipo = categorias.filter((c) => c.tipo === out.tipo && c.ativa !== false);
    const cat =
      doTipo.find((c) => t.includes(norm(c.nome))) ||
      doTipo.find((c) => norm(c.nome).split(' ').some((w) => w.length > 3 && t.includes(w))) ||
      (out.origem ? doTipo.find((c) => c.origem_padrao === out.origem) : null);
    if (cat) {
      out.categoria_id = cat.id;
      if (!out.origem) out.origem = cat.origem_padrao || null;
    }
  }
  if (!out.origem && out.tipo === 'saida') out.origem = 'Casa';

  out.descricao = descricao(texto);
  return out;
}

function descricao(texto) {
  const limpo = String(texto || '')
    .replace(/r\$\s*/gi, '')
    .replace(/\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?(\s*mil)?(\s*reais)?/gi, '')
    .replace(/\b(gastei|paguei|recebi|entrou|comprei|transferi|passei|hoje|ontem|anteontem|no|na|de|do|da|pro|pra|para|com|em|reais|conto|contos)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return limpo ? limpo[0].toUpperCase() + limpo.slice(1) : '';
}
