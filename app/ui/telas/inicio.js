import { html } from '../html.js';
import { urlDoApp } from '../apps.js';
import { Icone } from '../icones.js';
import { Secao, Marca, Topo } from '../componentes.js';
import { GraficoSaldo } from '../graficos.js';
import { useStore, abrirFolha } from '../../data/store.js';
import { brl, brlSigned } from '../../core/money.js';
import { fmtDay, fmtDayLong, monthKey, addMonthsKey, monthName } from '../../core/dates.js';
import { monthSummary, GRUPOS } from '../../core/balances.js';
import { businessWeeks, monthlyTithe, refSemana, refMes } from '../../core/tithe.js';
import { receivables } from '../../core/planning.js';
import { saldosHoje, contasAtivas, fimPadrao, projetar } from '../derivados.js';
import { dadosPudim } from './pudim.js';

export function FaixaDemo() {
  const s = useStore();
  if (s.modo !== 'demo') return null;
  return html`<div class="faixa-demo"><${Icone} n="info" /><span>Modo demonstração: dados de exemplo, salvos só neste aparelho.</span></div>`;
}

function Termometro({ s }) {
  const ate = fimPadrao(s.hoje);
  const p = projetar(s, ate);
  const real = saldosHoje(s).grupos.Tudo;
  const pendente = p.dias[0].saldo - real;
  const nPendentes = p.dias[0].itens.length;
  const negativo = p.precisaFazer > 0;
  return html`<section class="termometro" aria-label="Termômetro do saldo">
    <div class="rotulo">Saldo hoje, todas as contas</div>
    <div class=${`saldo ${real < 0 ? 'neg' : ''}`}>${brl(real)}</div>
    ${nPendentes > 0 && html`<div class="rotulo" style="margin-top:4px">${nPendentes} ${nPendentes === 1 ? 'previsto de hoje ou atrasado ainda não lançado' : 'previstos de hoje ou atrasados ainda não lançados'}: <b style="color:var(--hero-ink)">${brlSigned(pendente)}</b></div>`}
    <div class="grafico">
      <${GraficoSaldo} dias=${p.dias} minimo=${p.minimo} altura=${118}
        cores=${{ linha: 'var(--hero-line)', prov: '#aab3ff', neg: 'var(--hero-neg)', grade: 'var(--hero-grid)', texto: 'var(--hero-ink-2)', fundo: 'var(--hero-bg)' }} />
    </div>
    <div class="linha-info">
      <div>Ponto mais baixo<b class=${p.minimo.valor < 0 ? 'neg' : ''}>${brl(p.minimo.valor)}</b>${fmtDay(p.minimo.data)}</div>
      <div>Em ${fmtDay(ate)}<b class=${p.final < 0 ? 'neg' : ''}>${brl(p.final)}</b>só o que é certo</div>
    </div>
    <div class=${`alerta-meta ${negativo ? '' : 'ok'}`}>
      ${negativo
        ? html`Você precisa fazer <strong>${brl(p.precisaFazer)}</strong> até <strong>${fmtDay(p.minimo.data)}</strong> para não ficar no vermelho.`
        : html`Até ${fmtDay(ate)} o saldo não fica negativo. A menor folga é de <strong>${brl(p.minimo.valor)}</strong> em ${fmtDay(p.minimo.data)}.`}
    </div>
    <button class="abrir" aria-label="Abrir o Futuro" onClick=${() => (location.hash = '#/futuro')}></button>
  </section>`;
}

// Pudim abaixo do mínimo ou ingrediente faltando: aviso curto que leva para a tela do pudim.
function AvisoPudim({ s }) {
  if (!(s.tables.receitas || []).length) return null;
  const d = dadosPudim(s);
  if (!d.abaixo.length && !d.faltas.length && !d.estoque.vencidos) return null;
  const partes = [
    d.abaixo.length ? `${d.abaixo.length} pudi${d.abaixo.length > 1 ? 'ns' : 'm'} abaixo do mínimo` : '',
    d.faltas.length ? `${d.faltas.length} ingrediente${d.faltas.length > 1 ? 's' : ''} faltando` : '',
    d.estoque.vencidos ? `${d.estoque.vencidos} vencido${d.estoque.vencidos > 1 ? 's' : ''}` : '',
  ].filter(Boolean);
  return html`<a class="painel painel-pad cartao-pudim aviso-minimo" href=${urlDoApp('pudim', '/pudim?aba=estoque')} style="margin-top:12px">
    <div class="corpo"><div class="rot-mercado">Pudim</div><div style="font-weight:700;margin-top:2px">${partes.join(' · ')}</div></div>
    <span style="width:18px;color:var(--ink-3)"><${Icone} n="seta" /></span></a>`;
}

function Dizimo({ s }) {
  const semanas = businessWeeks(s.tables.lancamentos, s.hoje);
  const atual = semanas[semanas.length - 1];
  const pendentes = semanas.filter((w) => w.fim < s.hoje && w.dizimo > 0 && !w.pago);
  const mes = monthKey(s.hoje);
  const mesAnt = addMonthsKey(mes, -1);
  const mAtual = monthlyTithe(s.tables.lancamentos, mes);
  const mAnt = monthlyTithe(s.tables.lancamentos, mesAnt);
  const pagar = (referencia, valor, titulo) => abrirFolha('dizimo', { referencia, valor, titulo });
  // O que ainda falta pagar: o dízimo menos o que já foi pago para aquela semana ou mês (pagar zera).
  const falta = (x) => Math.max(0, x.dizimo - (x.pago?.valor || 0));
  const faltaSemana = falta(atual);
  const faltaMes = falta(mAtual);
  return html`<${Secao} titulo="Dízimo" acao="Detalhes" onAcao=${() => (location.hash = '#/negocios')}>
    ${pendentes.slice(-1).map((w) => html`<div class="painel dizimo-card" style="border-color:var(--caramel)">
      <div class="corpo"><div class="rot">A pagar, semana de ${fmtDay(w.inicio)} a ${fmtDay(w.fim)}</div>
        <div class="meta">Lucro do casal ${brl(w.lucro)}${w.carryIn ? `, com ${brl(w.carryIn)} da semana anterior` : ''}</div></div>
      <div style="text-align:right"><div class="num">${brl(w.dizimo)}</div>
        <button class="btn btn-pri btn-mini" style="margin-top:6px" onClick=${() => pagar(refSemana(w.inicio), w.dizimo, `Dízimo dos negócios, semana de ${fmtDay(w.inicio)} a ${fmtDay(w.fim)}`)}>Pagar</button></div>
    </div>`)}
    ${pendentes.length > 1 && html`<p class="muted" style="font-size:13px;margin:8px 2px 0">Mais ${pendentes.length - 1} ${pendentes.length === 2 ? 'semana' : 'semanas'} sem pagamento marcado. <a href="#/negocios" style="color:var(--caramel-ink);font-weight:700">Ver em Negócios</a></p>`}
    <div class="dupla" style=${pendentes.length ? 'margin-top:10px' : ''}>
      <div class="painel mini" aria-label="Dízimo dos negócios desta semana">
        <div class="rot">Negócios, esta semana</div>
        <div class="num">${brl(faltaSemana)}</div>
        <div class="rod">${atual.pago ? html`<span class="etiqueta pago">Pago ${brl(atual.pago.valor)}</span> ` : ''}Lucro ${brlSigned(atual.lucro)}${atual.carryIn ? `, prejuízo anterior ${brl(atual.carryIn)}` : ''}. Vence ${fmtDay(atual.pagarEm)}.</div>
        ${faltaSemana > 0 && html`<button class="btn btn-pri btn-mini" style="margin-top:8px" onClick=${() => pagar(refSemana(atual.inicio), faltaSemana, `Dízimo dos negócios, semana de ${fmtDay(atual.inicio)} a ${fmtDay(atual.fim)}`)}>Pagar</button>`}
      </div>
      <div class="painel mini" aria-label="Dízimo do salário deste mês">
        <div class="rot">Salário e consultoria, ${monthName(mes)}</div>
        <div class="num">${brl(faltaMes)}</div>
        <div class="rod">${mAtual.pago ? html`<span class="etiqueta pago">Pago ${brl(mAtual.pago.valor)}</span>` : `10% de ${brl(mAtual.bruto)}`}</div>
        ${faltaMes > 0 && html`<button class="btn btn-pri btn-mini" style="margin-top:8px" onClick=${() => pagar(refMes(mes), faltaMes, `Dízimo de ${monthName(mes)} (salário e consultoria)`)}>Pagar</button>`}
      </div>
    </div>
    ${mAnt.dizimo > 0 && !mAnt.pago && html`<div class="painel dizimo-card" style="margin-top:10px">
      <div class="corpo"><div class="rot">Falta pagar ${monthName(mesAnt)}</div><div class="meta">10% de ${brl(mAnt.bruto)} de salário, consultoria e YouTube</div></div>
      <div style="text-align:right"><div class="num">${brl(mAnt.dizimo)}</div>
        <button class="btn btn-pri btn-mini" style="margin-top:6px" onClick=${() => pagar(refMes(mesAnt), mAnt.dizimo, `Dízimo de ${monthName(mesAnt)} (salário e consultoria)`)}>Pagar</button></div>
    </div>`}
  <//>`;
}

function AReceber({ s }) {
  const r = receivables({ ...s.tables, lancs: s.tables.lancamentos, hoje: s.hoje, dias: 30 });
  const lembretes = r.renovacoes.filter((x) => x.lembrar);
  const lista = [...r.atrasados, ...lembretes, ...r.proximos.filter((o) => !o.previsto.renovacao)].slice(0, 5);
  if (!lista.length) return null;
  return html`<${Secao} titulo="A receber" acao="Ver tudo" onAcao=${() => (location.hash = '#/mais/compromissos')}>
    <ul class="lista painel">
      ${lista.map((o) => html`<li><button class="item item-btn" onClick=${() => abrirFolha('ocorrencia', { occ: o })}>
        <div class="corpo">
          <div class="tit">${o.previsto.descricao}</div>
          <div class="meta">${o.atrasado ? html`<span class="etiqueta atraso">Atrasado desde ${fmtDay(o.data)}</span>`
            : o.previsto.renovacao ? html`<span class="etiqueta pendente">Renova em ${fmtDay(o.data)}. Confirmou?</span>`
            : `${fmtDay(o.janelaInicio)}${o.janelaInicio !== o.data ? ` a ${fmtDay(o.data)}` : ''}`}</div>
        </div>
        <div class=${`valor ${o.confianca === 'certo' ? 'pos' : 'prov'}`}>${o.previsto.natureza === 'variavel' ? '≈ ' : ''}${brl(o.valor)}
          <small>${o.confianca === 'certo' ? 'certo' : 'provável'}</small></div>
      </button></li>`)}
    </ul>
    <div class="legenda" style="margin-top:8px">Nos próximos 30 dias: ${brl(r.totalCerto)} certos e ${brl(r.totalProvavel)} prováveis${r.totalAtrasado ? `, ${brl(r.totalAtrasado)} atrasados` : ''}.</div>
  <//>`;
}

function Contas({ s }) {
  const { saldos, grupos } = saldosHoje(s);
  const contas = contasAtivas(s);
  return html`<${Secao} titulo="Contas" acao="Editar" onAcao=${() => (location.hash = '#/mais/contas')}>
    <ul class="lista painel">
      ${GRUPOS.map((g) => {
        const doGrupo = contas.filter((c) => c.grupo === g);
        if (!doGrupo.length) return null;
        return html`<li class="grupo-cab"><span>${g}</span><span>${brl(grupos[g])}</span></li>
          ${doGrupo.map((c) => html`<li><a class="item" href=${`#/lancamentos?conta=${c.id}`} style="text-decoration:none">
            <${Marca} conta=${c} />
            <div class="corpo"><div class="tit">${c.nome}</div><div class="meta">${c.dono === 'Esposa' ? 'Esposa' : 'Marido'}</div></div>
            <div class=${`valor ${saldos[c.id] < 0 ? 'neg' : ''}`}>${brl(saldos[c.id])}</div>
          </a></li>`)}`;
      })}
    </ul>
  <//>`;
}

function Mes({ s }) {
  const k = monthKey(s.hoje);
  const atual = monthSummary(s.tables.lancamentos, k);
  const ant = monthSummary(s.tables.lancamentos, addMonthsKey(k, -1));
  const comp = (a, b) => (b ? `${a >= b ? '+' : ''}${Math.round(((a - b) / b) * 100)}% que ${monthName(addMonthsKey(k, -1), true)}` : '');
  return html`<${Secao} titulo=${`${monthName(k)[0].toUpperCase()}${monthName(k).slice(1)} até agora`}>
    <div class="dupla">
      <div class="painel mini"><div class="rot">Entrou</div><div class="num pos">${brl(atual.entradas)}</div><div class="rod">${comp(atual.entradas, ant.entradas)}</div></div>
      <div class="painel mini"><div class="rot">Saiu</div><div class="num neg">${brl(atual.saidas)}</div><div class="rod">${comp(atual.saidas, ant.saidas)}</div></div>
    </div>
    <div class="painel mini" style="margin-top:10px;display:flex;justify-content:space-between;align-items:center">
      <div><div class="rot">Performance do mês</div><div class="rod">entradas menos saídas, sem transferências</div></div>
      <div class=${`num ${atual.resultado < 0 ? 'neg' : 'pos'}`} style="white-space:nowrap">${brlSigned(atual.resultado)}</div>
    </div>
  <//>`;
}

export function TelaInicio() {
  const s = useStore();
  return html`<main>
    <${Topo} titulo=${monthName(s.hoje)[0].toUpperCase() + monthName(s.hoje).slice(1)} sub=${fmtDayLong(s.hoje)}
      direita=${html`<a class="icone-btn" href="#/mais" aria-label="Mais opções"><${Icone} n="engrenagem" /></a>`} />
    <${FaixaDemo} />
    <${Termometro} s=${s} />
    <${AReceber} s=${s} />
    <${AvisoPudim} s=${s} />
    <${Dizimo} s=${s} />
    <${Contas} s=${s} />
    <${Mes} s=${s} />
  </main>`;
}
