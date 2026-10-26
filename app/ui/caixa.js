// "Caixa" de cada lançamento (a origem): de qual parte da vida o dinheiro é. Ela decide o dízimo, então as opções
// aparecem agrupadas pela regra: negócios (lucro da semana), renda do mês (10% do que entrou) e sem dízimo.
import { html } from './html.js';
import { origemLabel } from './derivados.js';

const NEGOCIOS = ['Negócios', 'dízimo do lucro da semana', ['Pudim', 'Hotmart']];
const GRUPOS = {
  saida: [['Sem dízimo', 'casa e outros gastos', ['Casa', 'Outros']], NEGOCIOS],
  entrada: [NEGOCIOS, ['Renda do mês', 'dízimo de 10%', ['Salario', 'Consultoria', 'YouTube']], ['Sem dízimo', '', ['Outros']]],
};
const EXPLICA = {
  Casa: 'Gasto da casa. Não entra no dízimo.',
  Pudim: 'Negócio do pudim: entra no lucro da semana (entradas menos saídas do pudim).',
  Hotmart: 'Empresa (Hotmart): entra no lucro da semana (entradas menos saídas da empresa).',
  Salario: 'Renda do mês: o dízimo é 10% do que entrou.',
  Consultoria: 'Renda do mês: o dízimo é 10% do que entrou.',
  YouTube: 'Renda do mês: o dízimo é 10% do que entrou.',
  Outros: 'Fica fora do dízimo (ex.: reembolso, presente, venda de algo usado).',
};

// Caixa sugerida pela conta: conta do pudim → Pudim, da empresa → Hotmart, pessoal → Casa (só em saídas).
export function caixaDaConta(conta, tipo) {
  if (!conta) return '';
  if (conta.grupo === 'Pudim') return 'Pudim';
  if (conta.grupo === 'Empresa') return 'Hotmart';
  return tipo === 'saida' ? 'Casa' : '';
}

export function EscolheCaixa({ tipo, valor, onChange, rotulo = 'Caixa', explicar = true }) {
  const grupos = GRUPOS[tipo] || GRUPOS.saida;
  const todas = grupos.flatMap((g) => g[2]);
  // Um valor antigo fora das opções deste tipo (ex.: entrada da Casa) continua aparecendo para não sumir.
  const extra = valor && !todas.includes(valor) ? [['Atual', '', [valor]]] : [];
  return html`<div class="campo caixa-campo"><span>${rotulo}</span>
    <div class="caixas" role="group" aria-label=${rotulo}>
      ${[...grupos, ...extra].map(([titulo, regra, ops]) => html`<div class="caixa-grupo">
        <div class="caixa-tit">${titulo}${regra ? html` <small>· ${regra}</small>` : ''}</div>
        <div class="caixa-ops">${ops.map((o) => html`<button type="button" class="chip" aria-pressed=${String(valor === o)} onClick=${() => onChange(o)}>${origemLabel(o)}</button>`)}</div>
      </div>`)}
    </div>
    ${explicar && valor && EXPLICA[valor] && html`<div class="ajuda">${EXPLICA[valor]}</div>`}
  </div>`;
}
