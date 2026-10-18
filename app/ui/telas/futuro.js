import { useState } from '../../vendor/hooks.module.js';
import { html } from '../html.js';
import { Icone } from '../icones.js';
import { Topo, Segmento, Chips, AbasSecao } from '../componentes.js';
import { GraficoSaldo } from '../graficos.js';
import { useStore, abrirFolha } from '../../data/store.js';
import { brl, num } from '../../core/money.js';
import { addDays, fmtDay, monthKey, monthName, weekdayName, weekday, addMonthsKey } from '../../core/dates.js';
import { GRUPOS } from '../../core/balances.js';
import { fimPadrao, projetar } from '../derivados.js';

function preset(hoje, v) {
  if (v === 'fim') return fimPadrao(hoje);
  const k = addMonthsKey(monthKey(hoje), Number(v));
  return addDays(`${addMonthsKey(k, 1)}-01`, -1);
}

export function TelaFuturo() {
  const s = useStore();
  const [periodo, setPeriodo] = useState('fim');
  const [ateLivre, setAteLivre] = useState(fimPadrao(s.hoje));
  const [grupo, setGrupo] = useState('Tudo');
  const [todos, setTodos] = useState(false);
  const [aberto, setAberto] = useState(null);
  const ate = periodo === 'data' ? ateLivre : preset(s.hoje, periodo);
  const p = projetar(s, ate, grupo);
  const temProv = p.dias.some((d) => d.saldoProvavel !== d.saldo);

  const linhas = [];
  let mesAtual = null;
  for (const d of p.dias) {
    const mov = d.itens.length > 0 || d.data === s.hoje || d.data === p.minimo.data || d.data === ate;
    if (!todos && !mov) continue;
    const k = monthKey(d.data);
    if (k !== mesAtual) {
      mesAtual = k;
      if (d.data !== s.hoje) linhas.push({ mes: k });
    }
    linhas.push(d);
  }

  return html`<main>
    <${Topo} titulo="Futuro" sub="Saldo dia a dia, só com o que é certo"
      direita=${html`<a class="icone-btn" href="#/mais/previstos" aria-label="Previstos"><${Icone} n="repetir" /></a>`} />
    <${AbasSecao} secao="dinheiro" atual="/futuro" />
    <${Chips} rotulo="Até quando" valor=${periodo} onChange=${(v) => setPeriodo(v || 'fim')}
      opcoes=${[['fim', `Até ${fmtDay(fimPadrao(s.hoje))}`], ['1', 'Próximo mês'], ['3', '3 meses'], ['6', '6 meses'], ['data', 'Outra data']]} />
    ${periodo === 'data' && html`<label class="campo" style="margin-top:6px"><span>Até</span><input type="date" value=${ateLivre} min=${addDays(s.hoje, 1)} onInput=${(e) => e.target.value && setAteLivre(e.target.value)} /></label>`}
    <div style="margin-top:10px"><${Segmento} rotulo="Contas" valor=${grupo} onChange=${setGrupo} opcoes=${[['Tudo', 'Tudo'], ...GRUPOS.map((g) => [g, g])]} /></div>

    <div class="resumo-futuro" style="margin-top:14px">
      <div class="painel mini"><div class="rot">Ponto mais baixo</div><div class=${`num ${p.minimo.valor < 0 ? 'neg' : ''}`}>${brl(p.minimo.valor)}</div><div class="rod">em ${fmtDay(p.minimo.data)}</div></div>
      <div class="painel mini"><div class="rot">Precisa fazer</div><div class=${`num ${p.precisaFazer ? 'neg' : 'pos'}`}>${brl(p.precisaFazer)}</div>
        <div class="rod">${p.precisaFazer ? `até ${fmtDay(p.minimo.data)} para não ficar negativo` : 'nada: o saldo não fica negativo'}</div></div>
    </div>
    ${p.reserva > 0 && html`<div class="painel mini" style="margin-top:10px">Para manter a reserva de ${brl(p.reserva)}: <strong class=${p.precisaReserva ? 'neg' : 'pos'}>${p.precisaReserva ? `faltam ${brl(p.precisaReserva)}` : 'tudo certo'}</strong></div>`}
    ${temProv && html`<div class="painel mini" style="margin-top:10px">Se os prováveis entrarem: ponto mais baixo <strong class=${p.minimoProvavel.valor < 0 ? 'neg' : 'prov'}>${brl(p.minimoProvavel.valor)}</strong> em ${fmtDay(p.minimoProvavel.data)}${p.precisaFazerProvavel ? `, precisaria de ${brl(p.precisaFazerProvavel)}` : ''}.</div>`}

    <div class="painel painel-pad grafico" style="margin-top:10px">
      <${GraficoSaldo} dias=${p.dias} minimo=${p.minimo} altura=${170} comProvavel=${temProv} />
      <div class="legenda"><span><i></i>Só o certo</span>${temProv && html`<span><i class="tr"></i>Com os prováveis</span>`}<span>Diário de ${brl(p.dias[1]?.diario ?? 0)} a partir de amanhã</span></div>
    </div>

    <div class="secao-cab" style="margin-top:22px"><h2>Dia a dia</h2>
      <button class="link" onClick=${() => setTodos(!todos)}>${todos ? 'Só dias com movimento' : 'Mostrar todos os dias'}</button></div>
    <div class="painel rolagem">
      <table class="tabela-futuro">
        <thead><tr><th>Data</th><th>Entra</th><th>Sai</th><th>Diário</th><th>Saldo (R$)</th></tr></thead>
        <tbody>
          ${linhas.map((d) => {
            if (d.mes) return html`<tr class="mes"><td colspan="5">${monthName(d.mes)} ${d.mes.slice(0, 4)}</td></tr>`;
            const hoje = d.data === s.hoje;
            const cls = [hoje ? 'hoje' : 'previsto', d.saldo < 0 ? 'negativo' : '', d.data === p.minimo.data ? 'minimo' : '', d.itens.length ? 'clicavel' : ''].join(' ');
            const atras = d.itens.some((i) => i.atrasado);
            return html`<tr class=${cls} onClick=${() => d.itens.length && setAberto(aberto === d.data ? null : d.data)}>
                <td><span class="d">${fmtDay(d.data)}</span><span class="wd">${hoje ? 'hoje' : weekdayName(weekday(d.data))}</span>${atras ? ' ⚠️' : ''}</td>
                <td class="pos">${d.entra ? num(d.entra) : ''}${d.entraProv ? html`<div class="prov" style="font-size:12px">+${num(d.entraProv)}?</div>` : ''}</td>
                <td class="neg">${d.sai ? num(d.sai) : ''}</td>
                <td class="muted">${d.diario ? num(d.diario) : ''}</td>
                <td class="saldo">${num(d.saldo)}</td>
              </tr>
              ${aberto === d.data && html`<tr class="det"><td colspan="5">
                <ul class="lista" style="margin:2px 0 6px">
                  ${d.itens.map((it) => html`<li><button class="item item-btn" style="padding:8px 4px;min-height:0;background:none" onClick=${(e) => { e.stopPropagation(); if (it.pagarDizimo) abrirFolha('dizimo', it.pagarDizimo); else abrirFolha('ocorrencia', { occ: it.occ }); }}>
                    <div class="corpo"><div class="tit" style="font-size:14px">${it.descricao}${it.parcela ? ` ${it.parcela.k}/${it.parcela.n}` : ''}</div>
                      <div class="meta">${it.atrasado ? `atrasado desde ${fmtDay(it.dataOriginal)}` : it.confianca === 'certo' ? 'certo' : 'provável'}${it.variavel ? ', média dos últimos' : ''}</div></div>
                    <div class=${`valor ${it.efeito > 0 ? (it.confianca === 'certo' ? 'pos' : 'prov') : 'neg'}`} style="font-size:14px">${it.efeito > 0 ? '+' : ''}${brl(it.efeito)}</div>
                  </button></li>`)}
                </ul></td></tr>`}`;
          })}
        </tbody>
      </table>
    </div>
    <p class="muted" style="font-size:12.5px;margin-top:10px">Toque num dia para ver o que entra e sai. Vendas futuras da Hotmart e do pudim não entram: o "precisa fazer" é a sua meta.</p>
  </main>`;
}
