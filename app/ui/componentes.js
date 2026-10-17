import { useEffect, useRef, useState } from '../vendor/hooks.module.js';
import { html } from './html.js';
import { Icone } from './icones.js';
import { fecharFolha, fecharToast, useStore } from '../data/store.js';
import { brl } from '../core/money.js';

export function Topo({ titulo, sub, voltar, direita }) {
  return html`<header>
    ${voltar && html`<button class="voltar" onClick=${() => (location.hash = voltar)}><span style="width:18px;height:18px;display:inline-flex"><${Icone} n="voltar" /></span>Voltar</button>`}
    <div class="topo">
      <div><h1>${titulo}</h1>${sub && html`<div class="sub">${sub}</div>`}</div>
      ${direita}
    </div>
  </header>`;
}

export function Secao({ titulo, acao, onAcao, children }) {
  return html`<section class="secao">
    ${titulo && html`<div class="secao-cab"><h2>${titulo}</h2>${acao && html`<button class="link" onClick=${onAcao}>${acao}</button>`}</div>`}
    ${children}
  </section>`;
}

export function Segmento({ opcoes, valor, onChange, classe = '', rotulo }) {
  return html`<div class=${`segmento ${classe}`} role="group" aria-label=${rotulo}>
    ${opcoes.map(([v, t]) => html`<button type="button" data-v=${v} aria-pressed=${String(valor === v)} onClick=${() => onChange(v)}>${t}</button>`)}
  </div>`;
}

export function Chips({ opcoes, valor, onChange, rotulo }) {
  return html`<div class="chips" role="group" aria-label=${rotulo}>
    ${opcoes.map(([v, t, cor]) => html`<button type="button" class="chip" aria-pressed=${String(valor === v)} onClick=${() => onChange(valor === v && v !== '' ? '' : v)}>
      ${cor && html`<span class="bolinha" style=${`background:${cor}`}></span>`}${t}
    </button>`)}
  </div>`;
}

export function Campo({ rotulo, ajuda, children }) {
  return html`<label class="campo"><span>${rotulo}</span>${children}${ajuda && html`<div class="ajuda">${ajuda}</div>`}</label>`;
}

export function Valor({ cents, sinal, classe = '' }) {
  const cor = sinal ? (cents < 0 ? 'neg' : cents > 0 ? 'pos' : '') : '';
  return html`<span class=${`${cor} ${classe}`}>${sinal && cents > 0 ? '+' : ''}${brl(cents)}</span>`;
}

export function Marca({ conta }) {
  if (!conta) return html`<span class="marca suave">?</span>`;
  const sigla = conta.nome.replace(/[^A-Za-zÀ-ú0-9 ]/g, '').split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase();
  return html`<span class="marca" style=${`background:${conta.cor || '#7a8597'}`} aria-hidden="true">${sigla}</span>`;
}

export function Folha({ titulo, children, rodape, onFechar = fecharFolha }) {
  const ref = useRef();
  useEffect(() => {
    const esc = (e) => e.key === 'Escape' && onFechar();
    document.addEventListener('keydown', esc);
    document.body.style.overflow = 'hidden';
    ref.current?.focus();
    return () => {
      document.removeEventListener('keydown', esc);
      document.body.style.overflow = '';
    };
  }, []);
  return html`<div>
    <div class="folha-fundo" onClick=${onFechar}></div>
    <div class="folha" role="dialog" aria-modal="true" aria-label=${titulo} tabindex="-1" ref=${ref}>
      <div class="alca"></div>
      <div class="folha-cab"><h2>${titulo}</h2><button class="icone-btn" aria-label="Fechar" onClick=${onFechar}><${Icone} n="fechar" /></button></div>
      ${children}
      ${rodape && html`<div class="folha-rodape">${rodape}</div>`}
    </div>
  </div>`;
}

export function Toast() {
  const s = useStore();
  const t = s.toast;
  if (!t) return null;
  return html`<div class=${`toast ${t.tom === 'erro' ? 'erro' : ''}`} role="status">
    <span>${t.texto}</span>
    ${t.acao && html`<button onClick=${() => { fecharToast(); t.onAcao(); }}>${t.acao}</button>`}
  </div>`;
}

export function Vazio({ titulo, children }) {
  return html`<div class="vazio"><strong>${titulo}</strong>${children}</div>`;
}

// Item que pode ser arrastado para a esquerda para apagar.
export function Arrastavel({ onApagar, children }) {
  const [dx, setDx] = useState(0);
  const [ativo, setAtivo] = useState(false);
  const ini = useRef(null);
  const down = (e) => {
    ini.current = { x: e.clientX, y: e.clientY, moveu: false };
  };
  const move = (e) => {
    if (!ini.current) return;
    const d = e.clientX - ini.current.x;
    if (!ini.current.moveu && Math.abs(e.clientY - ini.current.y) > Math.abs(d)) {
      ini.current = null;
      return;
    }
    if (Math.abs(d) > 8) {
      ini.current.moveu = true;
      setAtivo(true);
    }
    if (ini.current.moveu) setDx(Math.min(0, d));
  };
  // O clique que vem logo depois de arrastar não abre o item.
  const arrastou = useRef(false);
  const up = () => {
    if (ini.current?.moveu) {
      arrastou.current = true;
      setTimeout(() => (arrastou.current = false), 50);
    }
    if (ini.current?.moveu && dx < -110) onApagar();
    ini.current = null;
    setAtivo(false);
    setDx(0);
  };
  const clickCapture = (e) => {
    if (ativo || dx !== 0 || arrastou.current) {
      e.stopPropagation();
      e.preventDefault();
    }
  };
  return html`<div class="arrastavel" onPointerDown=${down} onPointerMove=${move} onPointerUp=${up} onPointerCancel=${up} onClickCapture=${clickCapture}>
    <div class="fundo-apagar" aria-hidden="true">Apagar</div>
    <div style=${`transform:translateX(${dx}px)`} class=${`deslizante ${ativo ? 'arrastando' : ''}`}>${children}</div>
  </div>`;
}
