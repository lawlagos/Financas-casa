import { render } from '../vendor/preact.module.js';
import { useEffect, useState, useRef } from '../vendor/hooks.module.js';
import { html } from './html.js';
import { Icone } from './icones.js';
import { Toast } from './componentes.js';
import { useStore, init, entrar, abrirFolha, recarregar } from '../data/store.js';
import { CONFIG } from '../config.js';
import { TelaInicio } from './telas/inicio.js';
import { TelaLancamentos } from './telas/lancamentos.js';
import { TelaFuturo } from './telas/futuro.js';
import { TelaNegocios } from './telas/negocios.js';
import { TelaMais, TelaPrevistos, TelaCompromissos, TelaContas, TelaCategorias, TelaAjustes, aplicarTema } from './telas/mais.js';
import { FolhaLancamento, FolhaBaixa } from './folhas/lancamento.js';
import { FolhaPrevisto, FolhaOcorrencia } from './folhas/previsto.js';
import { FolhaConta, FolhaCategoria, FolhaDizimo } from './folhas/outras.js';
import { FolhaLeitura } from './folhas/leitura.js';
import { TelaMercado, FolhaProduto } from './telas/mercado.js';
import { TelaPudim } from './telas/pudim.js';
import { TelaPdv } from './telas/pdv.js';
import { FolhaMovimento, FolhaReceita, FolhaInsumo, FolhaVozEstoque, FolhaCustosPudim } from './folhas/pudim.js';

const TELAS = {
  '/inicio': TelaInicio,
  '/lancamentos': TelaLancamentos,
  '/futuro': TelaFuturo,
  '/negocios': TelaNegocios,
  '/pudim': TelaPudim,
  '/pudim/vender': TelaPdv,
  '/mais': TelaMais,
  '/mais/mercado': TelaMercado,
  '/mais/previstos': TelaPrevistos,
  '/mais/compromissos': TelaCompromissos,
  '/mais/contas': TelaContas,
  '/mais/categorias': TelaCategorias,
  '/mais/ajustes': TelaAjustes,
};

const FOLHAS = {
  lancamento: FolhaLancamento,
  baixa: FolhaBaixa,
  previsto: FolhaPrevisto,
  ocorrencia: FolhaOcorrencia,
  conta: FolhaConta,
  categoria: FolhaCategoria,
  dizimo: FolhaDizimo,
  leitura: FolhaLeitura,
  produto: FolhaProduto,
  movimento: FolhaMovimento,
  receita: FolhaReceita,
  insumo: FolhaInsumo,
  'voz-estoque': FolhaVozEstoque,
  'custos-pudim': FolhaCustosPudim,
};

function lerRota() {
  const h = location.hash.replace(/^#/, '') || '/inicio';
  const [caminho, qs] = h.split('?');
  return { caminho: TELAS[caminho] ? caminho : '/inicio', params: Object.fromEntries(new URLSearchParams(qs || '')), chave: h };
}

function useRota() {
  const [r, setR] = useState(lerRota());
  useEffect(() => {
    const fn = () => {
      setR(lerRota());
      window.scrollTo(0, 0);
    };
    addEventListener('hashchange', fn);
    return () => removeEventListener('hashchange', fn);
  }, []);
  return r;
}

function Nav({ caminho }) {
  const atual = (p) => (caminho === p || (p === '/mais' && caminho.startsWith('/mais')) || (p === '/negocios' && caminho.startsWith('/pudim')) ? 'page' : null);
  const link = (p, icone, rot) => html`<li><a href=${`#${p}`} aria-current=${atual(p)}><${Icone} n=${icone} />${rot}</a></li>`;
  return html`<nav class="nav" aria-label="Navegação principal"><ul>
    ${link('/inicio', 'inicio', 'Início')}
    ${link('/lancamentos', 'lista', 'Lançamentos')}
    <li style="display:grid"><button class="fab" aria-label="Novo lançamento" onClick=${() => abrirFolha('lancamento', {})}><${Icone} n="mais" /></button></li>
    ${link('/futuro', 'futuro', 'Futuro')}
    ${link('/negocios', 'negocios', 'Negócios')}
  </ul></nav>`;
}

function Login() {
  const ref = useRef();
  const [erro, setErro] = useState(null);
  useEffect(() => {
    const iniciar = () => {
      window.google.accounts.id.initialize({
        client_id: CONFIG.googleClientId,
        callback: async (r) => {
          setErro(null);
          try {
            await entrar(r.credential);
          } catch (e) {
            setErro(e.message);
          }
        },
        auto_select: true,
      });
      window.google.accounts.id.renderButton(ref.current, { theme: 'filled_black', size: 'large', shape: 'pill', text: 'continue_with', locale: 'pt-BR' });
    };
    if (window.google?.accounts) iniciar();
    else {
      const sc = document.createElement('script');
      sc.src = 'https://accounts.google.com/gsi/client';
      sc.onload = iniciar;
      sc.onerror = () => setErro('Não foi possível carregar o login do Google. Confira a internet.');
      document.head.appendChild(sc);
    }
  }, []);
  return html`<div class="centro"><div>
    <h1>Finanças da Casa</h1>
    <p>Entre com a conta Google de vocês. Só os dois e-mails cadastrados na planilha têm acesso.</p>
    <div ref=${ref} style="display:flex;justify-content:center;min-height:44px"></div>
    ${erro && html`<p class="neg" role="alert" style="margin-top:16px">${erro}</p>`}
  </div></div>`;
}

function App() {
  const s = useStore();
  const rota = useRota();
  if (s.fase === 'carregando') return html`<div class="centro"><p>Carregando…</p></div>`;
  if (s.fase === 'login') return html`<${Login} />`;
  if (s.fase === 'erro')
    return html`<div class="centro"><div><h1>Não carregou</h1><p>${s.erro}</p><button class="btn btn-pri" onClick=${recarregar}>Tentar de novo</button></div></div>`;
  const Tela = TELAS[rota.caminho];
  const F = s.folha && FOLHAS[s.folha.tipo];
  return html`<div class="app">
    <${Tela} key=${rota.chave} params=${rota.params} />
    <${Nav} caminho=${rota.caminho} />
    ${F && html`<${F} key=${s.folha.id} ...${s.folha.props} />`}
    <${Toast} />
  </div>`;
}

aplicarTema();
render(html`<${App} />`, document.getElementById('raiz'));
init();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
