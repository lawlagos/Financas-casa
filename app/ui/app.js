// Finanças da Casa: lançamentos, futuro, contas, negócios (resumo do pudim e dízimo) e casa (compras e tarefas).
// O pudim é gerenciado no app Pudins (pudim/), com a mesma planilha.
import { useEffect } from '../vendor/hooks.module.js';
import { html } from './html.js';
import { Icone } from './icones.js';
import { abrirFolha } from '../data/store.js';
import { montarApp } from './shell.js';
import { definirApp, urlDoApp } from './apps.js';
import { TelaInicio } from './telas/inicio.js';
import { TelaLancamentos } from './telas/lancamentos.js';
import { TelaFuturo } from './telas/futuro.js';
import { TelaNegocios } from './telas/negocios.js';
import { TelaMais, TelaPrevistos, TelaCompromissos, TelaContas, TelaCategorias, TelaAjustes } from './telas/mais.js';
import { TelaMercado } from './telas/mercado.js';
import { TelaLista, TelaTarefas } from './telas/lista.js';

definirApp('financas');

// Endereços antigos do pudim (favoritos, avisos) abrem no app Pudins.
function IrParaPudins({ caminho, params }) {
  useEffect(() => {
    const qs = new URLSearchParams(params).toString();
    location.replace(urlDoApp('pudim', `${caminho}${qs ? `?${qs}` : ''}`));
  }, []);
  return html`<main><p class="muted">Abrindo o app Pudins…</p></main>`;
}
const irPara = (caminho) => ({ params }) => html`<${IrParaPudins} caminho=${caminho} params=${params} />`;

const TELAS = {
  '/inicio': TelaInicio,
  '/lancamentos': TelaLancamentos,
  '/futuro': TelaFuturo,
  '/contas': TelaContas,
  '/negocios': TelaNegocios,
  '/dizimo': TelaNegocios,
  '/lista': TelaLista,
  '/tarefas': TelaTarefas,
  '/mais': TelaMais,
  '/mais/mercado': TelaMercado,
  '/mais/previstos': TelaPrevistos,
  '/mais/compromissos': TelaCompromissos,
  '/mais/contas': TelaContas,
  '/mais/categorias': TelaCategorias,
  '/mais/ajustes': TelaAjustes,
  '/pudim': irPara('/pudim'),
  '/pudim/vender': irPara('/pudim/vender'),
  '/pudim/compras': irPara('/pudim/compras'),
};

// Menu: Início, Negócios (pudim e empresa, dízimo), lançar, Dinheiro (lançamentos, futuro, contas) e Casa.
const SECOES = {
  '/negocios': (c) => c === '/negocios' || c === '/dizimo',
  '/lancamentos': (c) => ['/lancamentos', '/futuro', '/contas', '/mais/contas'].includes(c),
  '/lista': (c) => c === '/lista' || c === '/tarefas',
};
function Nav({ caminho }) {
  const atual = (p) => (caminho === p || SECOES[p]?.(caminho) ? 'page' : null);
  const link = (p, icone, rot) => html`<li><a href=${`#${p}`} aria-current=${atual(p)}><${Icone} n=${icone} />${rot}</a></li>`;
  return html`<nav class="nav" aria-label="Navegação principal"><ul>
    ${link('/inicio', 'inicio', 'Início')}
    ${link('/negocios', 'negocios', 'Negócios')}
    <li style="display:grid"><button class="fab" aria-label="Novo lançamento" onClick=${() => abrirFolha('lancamento', {})}><${Icone} n="mais" /></button></li>
    ${link('/lancamentos', 'dinheiro', 'Dinheiro')}
    ${link('/lista', 'casa', 'Casa')}
  </ul></nav>`;
}

montarApp({ titulo: 'Finanças da Casa', telas: TELAS, Nav });
