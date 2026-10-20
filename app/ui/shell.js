// Casca dos apps (Finanças e Pudins): login, rotas, folhas, aviso e menu de baixo.
// Cada app diz quais telas tem, qual é a de início, o menu e o título; a planilha e o login são os mesmos.
import { render } from '../vendor/preact.module.js';
import { useEffect, useState, useRef } from '../vendor/hooks.module.js';
import { html } from './html.js';
import { Toast } from './componentes.js';
import { useStore, init, entrar, recarregar } from '../data/store.js';
import { CONFIG } from '../config.js';
import { aplicarTema } from './telas/mais.js';
import { FolhaLancamento, FolhaBaixa } from './folhas/lancamento.js';
import { FolhaPrevisto, FolhaOcorrencia } from './folhas/previsto.js';
import { FolhaConta, FolhaCategoria, FolhaDizimo } from './folhas/outras.js';
import { FolhaLeitura } from './folhas/leitura.js';
import { FolhaProduto } from './telas/mercado.js';
import { FolhaMovimento, FolhaReceita, FolhaInsumo, FolhaVozEstoque, FolhaCustosPudim, FolhaContagem, FolhaLote, FolhaEnvio, FolhaEditarMovimento, FolhaEstoqueProduto, FolhaEntrada, FolhaVerLote, FolhaLotes, FolhaPagamentoIfood } from './folhas/pudim.js';

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
  contagem: FolhaContagem,
  lote: FolhaLote,
  envio: FolhaEnvio,
  'editar-movimento': FolhaEditarMovimento,
  'estoque-produto': FolhaEstoqueProduto,
  entrada: FolhaEntrada,
  'ver-lote': FolhaVerLote,
  lotes: FolhaLotes,
  'pagamento-ifood': FolhaPagamentoIfood,
};

let TELAS = {};
let INICIO = '/inicio';

function lerRota() {
  const h = location.hash.replace(/^#/, '') || INICIO;
  const [caminho, qs] = h.split('?');
  return { caminho: TELAS[caminho] ? caminho : INICIO, params: Object.fromEntries(new URLSearchParams(qs || '')), chave: h };
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

let TITULO = 'Finanças da Casa';

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
    <h1>${TITULO}</h1>
    <p>Entre com a conta Google de vocês. Só os dois e-mails cadastrados na planilha têm acesso.</p>
    <div ref=${ref} style="display:flex;justify-content:center;min-height:44px"></div>
    ${erro && html`<p class="neg" role="alert" style="margin-top:16px">${erro}</p>`}
  </div></div>`;
}

function App({ Nav }) {
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
    ${s.ocupado > 0 && html`<div class="barra-ocupado" role="progressbar" aria-label="Salvando na planilha"></div>`}
  </div>`;
}


// Monta um app: { titulo, telas, inicio, Nav, sw (endereço do service worker) }.
export function montarApp({ titulo, telas, inicio = '/inicio', Nav, sw = './sw.js' }) {
  TITULO = titulo;
  TELAS = telas;
  INICIO = inicio;
  aplicarTema();
  // iPhone: depois que o teclado fecha, a página às vezes fica deslocada e o menu de baixo "solta".
  // Um empurrãozinho na rolagem faz o navegador recolocar o que é fixo.
  addEventListener('focusout', () => setTimeout(() => {
    if (!document.activeElement?.matches?.('input, textarea, select')) window.scrollTo(window.scrollX, window.scrollY);
  }, 60));
  render(html`<${App} Nav=${Nav} />`, document.getElementById('raiz'));
  init();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register(sw).catch(() => {});
}
