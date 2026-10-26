import { useState } from '../vendor/hooks.module.js';
import { html } from './html.js';
import { brlCompact, brl } from '../core/money.js';
import { monthName, fmtDay, weekdayName, weekday } from '../core/dates.js';

// Curva do saldo projetado. `cores` permite usar o mesmo gráfico no painel escuro (termômetro) e nas telas claras.
// Passando o mouse (ou arrastando o dedo) aparece a etiqueta do dia: data, saldo e o que entra e sai.
export function GraficoSaldo({ dias, minimo, altura = 130, comProvavel = true, cores = {}, eixo = true }) {
  const [foco, setFoco] = useState(null);
  if (!dias || dias.length < 2) return null;
  const W = 340;
  const H = altura;
  const padT = 14;
  const padB = eixo ? 20 : 8;
  const c = {
    linha: 'var(--caramel)',
    prov: 'var(--prov)',
    neg: 'var(--neg)',
    grade: 'var(--line)',
    texto: 'var(--ink-3)',
    ...cores,
  };
  const vals = dias.flatMap((d) => (comProvavel ? [d.saldo, d.saldoProvavel] : [d.saldo]));
  let max = Math.max(0, ...vals);
  let min = Math.min(0, ...vals);
  if (max === min) max = min + 100;
  const folga = (max - min) * 0.08;
  max += folga;
  min -= folga;
  const x = (i) => (i / (dias.length - 1)) * W;
  const y = (v) => padT + ((max - v) / (max - min)) * (H - padT - padB);
  const path = (key) => dias.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(d[key]).toFixed(1)}`).join('');
  const zeroY = y(0);
  const area = `${path('saldo')}L${W},${zeroY}L0,${zeroY}Z`;
  const id = `neg-${altura}-${dias.length}`;
  const meses = [];
  dias.forEach((d, i) => {
    if (i > 0 && d.data.endsWith('-01')) meses.push({ i, rot: monthName(d.data, true) });
  });
  const iMin = minimo ? dias.findIndex((d) => d.data === minimo.data) : -1;
  const temNeg = dias.some((d) => d.saldo < 0);
  const mover = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.round(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * (dias.length - 1));
    if (i !== foco) setFoco(i);
  };
  const sair = (e) => e.pointerType === 'mouse' && setFoco(null);
  const f = foco !== null && dias[foco] ? dias[foco] : null;
  const pct = f ? (x(foco) / W) * 100 : 0;
  return html`<div class="grafico-area" onPointerMove=${mover} onPointerDown=${mover} onPointerLeave=${sair}>
  <svg viewBox=${`0 0 ${W} ${H}`} role="img" aria-label=${`Saldo projetado até ${fmtDay(dias[dias.length - 1].data)}. Ponto mais baixo ${brl(minimo?.valor ?? 0)} em ${fmtDay(minimo?.data ?? dias[0].data)}.`}>
    <defs><clipPath id=${id}><rect x="0" y=${zeroY} width=${W} height=${Math.max(0, H - zeroY)} /></clipPath></defs>
    ${meses.map((m) => html`<g>
      <line x1=${x(m.i)} x2=${x(m.i)} y1=${padT - 6} y2=${H - padB} stroke=${c.grade} stroke-width="1" />
      ${eixo && html`<text x=${x(m.i) + 4} y=${H - 5} font-size="10.5" fill=${c.texto} font-weight="600">${m.rot}</text>`}
    </g>`)}
    <line x1="0" x2=${W} y1=${zeroY} y2=${zeroY} stroke=${c.grade} stroke-width="1.2" stroke-dasharray="2 3" />
    ${temNeg && html`<path d=${area} fill=${c.neg} opacity="0.28" clip-path=${`url(#${id})`} />`}
    ${comProvavel && html`<path d=${path('saldoProvavel')} fill="none" stroke=${c.prov} stroke-width="1.8" stroke-dasharray="4 4" stroke-linejoin="round" />`}
    <path d=${path('saldo')} fill="none" stroke=${c.linha} stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round" />
    ${iMin >= 0 && html`<g>
      <circle cx=${x(iMin)} cy=${y(dias[iMin].saldo)} r="4.5" fill=${minimo.valor < 0 ? c.neg : c.linha} stroke=${c.fundo || 'var(--surface)'} stroke-width="2" />
      <text x=${Math.min(Math.max(x(iMin), 30), W - 30)} y=${Math.min(y(dias[iMin].saldo) + 17, H - padB - 2)} font-size="10.5" font-weight="700" text-anchor="middle" fill=${minimo.valor < 0 ? c.neg : c.texto}>${brlCompact(minimo.valor)}</text>
    </g>`}
    ${f && html`<g class="grafico-foco">
      <line x1=${x(foco)} x2=${x(foco)} y1=${padT - 6} y2=${H - padB} stroke=${c.texto} stroke-width="1" stroke-dasharray="3 3" />
      ${comProvavel && f.saldoProvavel !== f.saldo && html`<circle cx=${x(foco)} cy=${y(f.saldoProvavel)} r="3.5" fill=${c.prov} />`}
      <circle cx=${x(foco)} cy=${y(f.saldo)} r="4.5" fill=${f.saldo < 0 ? c.neg : c.linha} stroke=${c.fundo || 'var(--surface)'} stroke-width="2" />
    </g>`}
  </svg>
  ${f && html`<div class=${`grafico-etiqueta ${pct > 60 ? 'esq' : ''}`} style=${`left:${pct}%`} role="status">
    <div class="ge-data">${weekdayName(weekday(f.data))}, ${fmtDay(f.data)}</div>
    <div class=${`ge-saldo ${f.saldo < 0 ? 'neg' : ''}`}>${brl(f.saldo)}</div>
    ${comProvavel && f.saldoProvavel !== f.saldo && html`<div class="ge-linha prov">com prováveis ${brl(f.saldoProvavel)}</div>`}
    ${(f.entra > 0 || f.entraProv > 0) && html`<div class="ge-linha pos">entra ${brl(f.entra || 0)}${f.entraProv ? ` (+${brl(f.entraProv)}?)` : ''}</div>`}
    ${f.sai > 0 && html`<div class="ge-linha neg">sai ${brl(f.sai)}</div>`}
  </div>`}
  </div>`;
}

// Barras do lucro semanal (positivo verde, negativo vermelho), com o rótulo do sábado de início.
export function BarrasSemanas({ semanas }) {
  if (!semanas.length) return null;
  const W = 340;
  const H = 120;
  const padB = 18;
  const vals = semanas.map((s) => s.lucro);
  const max = Math.max(1, ...vals);
  const min = Math.min(0, ...vals);
  const y = (v) => 6 + ((max - v) / (max - min)) * (H - padB - 6);
  const bw = W / semanas.length;
  return html`<svg viewBox=${`0 0 ${W} ${H}`} role="img" aria-label="Lucro do casal por semana">
    <line x1="0" x2=${W} y1=${y(0)} y2=${y(0)} stroke="var(--line)" />
    ${semanas.map((s, i) => {
      const y0 = y(0);
      const y1 = y(s.lucro);
      return html`<g>
        <rect x=${i * bw + bw * 0.18} width=${bw * 0.64} y=${Math.min(y0, y1)} height=${Math.max(1.5, Math.abs(y1 - y0))} rx="3" fill=${s.lucro < 0 ? 'var(--neg)' : 'var(--pos)'} opacity=${i === semanas.length - 1 ? 0.55 : 1}>
          <title>${fmtDay(s.inicio)}: ${brl(s.lucro)}</title>
        </rect>
        ${(i % 2 === semanas.length % 2 || semanas.length < 7) && html`<text x=${i * bw + bw / 2} y=${H - 4} font-size="10" text-anchor="middle" fill="var(--ink-3)">${fmtDay(s.inicio)}</text>`}
      </g>`;
    })}
  </svg>`;
}
