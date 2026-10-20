// Campo de frase com microfone (reconhecimento de voz do navegador, em português).
// A fala só escreve o texto no campo; quem usa decide quando aplicar (botão ao lado ou Enter).
import { useEffect, useRef, useState } from '../vendor/hooks.module.js';
import { html } from './html.js';
import { Icone } from './icones.js';
import { toast } from '../data/store.js';

export const temVoz = () => typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition);

export function CampoFala({ frase, setFrase, onPronto, placeholder, rotulo = 'Frase', id }) {
  const [ouvindo, setOuvindo] = useState(false);
  const rec = useRef(null);
  useEffect(() => () => rec.current?.abort?.(), []);
  const ouvir = () => {
    if (ouvindo) {
      rec.current?.stop();
      return;
    }
    const R = window.SpeechRecognition || window.webkitSpeechRecognition;
    const r = new R();
    r.lang = 'pt-BR';
    r.interimResults = true;
    r.onresult = (e) => {
      const t = Array.from(e.results).map((x) => x[0].transcript).join(' ');
      setFrase(t);
    };
    r.onerror = (e) => {
      setOuvindo(false);
      if (e.error === 'not-allowed') toast('O microfone está bloqueado. Libere nas permissões do navegador ou digite a frase.', { tom: 'erro' });
    };
    r.onend = () => setOuvindo(false);
    rec.current = r;
    setOuvindo(true);
    r.start();
  };
  return html`<div class="fala">
    <textarea id=${id} rows="2" aria-label=${rotulo} placeholder=${placeholder} value=${frase}
      onInput=${(e) => setFrase(e.target.value)}
      onKeyDown=${(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (frase.trim()) onPronto(frase); } }}></textarea>
    ${temVoz() && html`<button class=${`mic ${ouvindo ? 'ouvindo' : ''}`} onClick=${ouvir} aria-label=${ouvindo ? 'Parar de ouvir' : 'Falar'}><${Icone} n="mic" /></button>`}
  </div>`;
}
