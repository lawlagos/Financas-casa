import { html } from '../html.js';
import { Topo, Secao } from '../componentes.js';
import { BarrasSemanas } from '../graficos.js';
import { useStore, abrirFolha } from '../../data/store.js';
import { brl, brlSigned } from '../../core/money.js';
import { fmtDay, monthKey, addMonthsKey, monthName } from '../../core/dates.js';
import { businessWeeks, monthlyTithe, refSemana, refMes } from '../../core/tithe.js';
import { origemLabel } from '../derivados.js';
import { FaixaDemo } from './inicio.js';
import { CartaoPudim } from './pudim.js';

function Status({ w, hoje }) {
  if (w.pago) return html`<span class="etiqueta pago">Pago ${brl(w.pago.valor)}</span>${w.mudouDepoisDePago ? html` <span class="etiqueta atraso">Valor mudou depois</span>` : ''}`;
  if (w.dizimo === 0) return html`<span class="etiqueta">Sem dízimo</span>`;
  if (w.fim >= hoje) return html`<span class="etiqueta">Acumulando</span>`;
  return html`<span class="etiqueta pendente">A pagar</span>`;
}

export function TelaNegocios() {
  const s = useStore();
  const semanas = businessWeeks(s.tables.lancamentos, s.hoje);
  const atual = semanas[semanas.length - 1];
  const ultimas = semanas.slice(-12);
  const pagarSemana = (w) => abrirFolha('dizimo', { referencia: refSemana(w.inicio), valor: w.dizimo, titulo: `Dízimo dos negócios, semana de ${fmtDay(w.inicio)} a ${fmtDay(w.fim)}` });
  const mes = monthKey(s.hoje);
  const meses = [0, -1, -2].map((n) => monthlyTithe(s.tables.lancamentos, addMonthsKey(mes, n)));

  const Coluna = ({ o }) => {
    const d = atual.detalhe[o];
    return html`<div class="painel mini">
      <div class="rot">${origemLabel(o)}</div>
      <div class=${`num ${d.lucro < 0 ? 'neg' : 'pos'}`}>${brlSigned(d.lucro)}</div>
      <div class="rod">Entrou ${brl(d.entradas)}<br />Saiu ${brl(d.saidas)}${o === 'Hotmart' ? ' (anúncio e taxas)' : ' (ingredientes e custos)'}</div>
    </div>`;
  };

  return html`<main>
    <${Topo} titulo="Negócios" sub=${`Semana de ${fmtDay(atual.inicio)} a ${fmtDay(atual.fim)}, paga ${fmtDay(atual.pagarEm)}`} />
    <${FaixaDemo} />
    <div class="dupla"><${Coluna} o="Pudim" /><${Coluna} o="Hotmart" /></div>
    <${CartaoPudim} />
    <div class="painel painel-pad" style="margin-top:10px">
      <div style="display:flex;justify-content:space-between"><span>Lucro do casal na semana</span><strong class=${atual.lucro < 0 ? 'neg' : ''}>${brlSigned(atual.lucro)}</strong></div>
      ${atual.carryIn !== 0 && html`<div style="display:flex;justify-content:space-between;margin-top:6px"><span>Prejuízo que veio da semana anterior</span><strong class="neg">${brl(atual.carryIn)}</strong></div>`}
      <div style="display:flex;justify-content:space-between;margin-top:6px"><span>Base do dízimo</span><strong>${brl(Math.max(0, atual.base))}</strong></div>
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-top:10px;padding-top:10px;border-top:1px solid var(--line)">
        <span style="font-weight:700">Dízimo até agora</span><span style="font:700 26px var(--display)">${brl(atual.dizimo)}</span></div>
      ${atual.base < 0 && html`<p class="muted" style="font-size:13px;margin:8px 0 0">Se a semana fechar assim, ${brl(-atual.base)} de prejuízo passam para a próxima semana.</p>`}
    </div>

    <${Secao} titulo="Lucro por semana">
      <div class="painel painel-pad barras"><${BarrasSemanas} semanas=${ultimas} /></div>
    <//>

    <${Secao} titulo="Semanas anteriores">
      <ul class="lista painel">
        ${[...semanas].reverse().slice(1, 13).map((w) => html`<li class="item">
          <div class="corpo"><div class="tit">${fmtDay(w.inicio)} a ${fmtDay(w.fim)}</div>
            <div class="meta">Lucro ${brlSigned(w.lucro)}${w.carryIn ? `, prejuízo anterior ${brl(w.carryIn)}` : ''}</div>
            <div style="margin-top:4px"><${Status} w=${w} hoje=${s.hoje} /></div></div>
          <div class="valor">${brl(w.dizimo)}
            ${!w.pago && w.dizimo > 0 && html`<div><button class="btn btn-pri btn-mini" style="margin-top:6px" onClick=${() => pagarSemana(w)}>Pagar</button></div>`}</div>
        </li>`)}
        ${semanas.length < 2 && html`<li class="item muted">As semanas fechadas aparecem aqui.</li>`}
      </ul>
    <//>

    <${Secao} titulo="Salário, consultoria e YouTube">
      <ul class="lista painel">
        ${meses.map((m) => html`<li class="item">
          <div class="corpo"><div class="tit" style="text-transform:capitalize">${monthName(m.mes)}</div>
            <div class="meta">${m.bruto ? `10% de ${brl(m.bruto)}: salário ${brl(m.detalhe.Salario.bruto)}, consultoria ${brl(m.detalhe.Consultoria.bruto)}, YouTube ${brl(m.detalhe.YouTube.bruto)}` : 'Nenhuma entrada de salário, consultoria ou YouTube lançada'}</div>
            <div style="margin-top:4px">${m.pago ? html`<span class="etiqueta pago">Pago ${brl(m.pago.valor)}</span>${m.mudouDepoisDePago ? html` <span class="etiqueta atraso">Valor mudou depois</span>` : ''}` : m.dizimo ? html`<span class="etiqueta pendente">${m.mes === mes ? 'Mês em andamento' : 'A pagar'}</span>` : html`<span class="etiqueta">Sem entradas</span>`}</div></div>
          <div class="valor">${brl(m.dizimo)}
            ${!m.pago && m.dizimo > 0 && html`<div><button class="btn btn-pri btn-mini" style="margin-top:6px" onClick=${() => abrirFolha('dizimo', { referencia: refMes(m.mes), valor: m.dizimo, titulo: `Dízimo de ${monthName(m.mes)} (salário e consultoria)` })}>Pagar</button></div>`}</div>
        </li>`)}
      </ul>
    <//>
  </main>`;
}
