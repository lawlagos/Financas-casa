// Extrato do mês: quanto entrou, quanto saiu e o que ainda vai sair (e entrar), num lugar só e fácil de ver.
// Transferências entre contas não entram nos totais (o dinheiro só muda de conta).
import { useState } from '../../vendor/hooks.module.js';
import { html } from '../html.js';
import { Icone } from '../icones.js';
import { Topo, Chips, AbasSecao } from '../componentes.js';
import { useStore, abrirFolha } from '../../data/store.js';
import { brl, toCents } from '../../core/money.js';
import { monthKey, addMonthsKey, monthName, fmtDay } from '../../core/dates.js';
import { openOccurrences } from '../../core/recurrence.js';
import { porId } from '../derivados.js';
import { FaixaDemo } from './inicio.js';

const fimDoMes = (mes) => {
  const [a, m] = mes.split('-').map(Number);
  return `${mes}-${String(new Date(Date.UTC(a, m, 0)).getUTCDate()).padStart(2, '0')}`;
};
const diaSemana = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('pt-BR', { weekday: 'short', timeZone: 'UTC' }).replace('.', '');

export function TelaExtrato() {
  const s = useStore();
  const [mes, setMes] = useState(monthKey(s.hoje));
  const [filtro, setFiltro] = useState('');
  const cats = porId(s.tables.categorias);
  const contas = porId(s.tables.contas);
  const inicio = `${mes}-01`;
  const fim = fimDoMes(mes);
  const doMes = s.tables.lancamentos.filter((l) => l.data >= inicio && l.data <= fim && l.tipo !== 'transferencia');
  const entrou = doMes.filter((l) => l.tipo === 'entrada').reduce((t, l) => t + toCents(l.valor), 0);
  const saiu = doMes.filter((l) => l.tipo === 'saida').reduce((t, l) => t + toCents(l.valor), 0);
  // O que ainda vai acontecer no mês (previstos em aberto), só do mês atual em diante; atrasados do mês contam também.
  const futuro = mes >= monthKey(s.hoje)
    ? openOccurrences({ ...s.tables, lancs: s.tables.lancamentos, de: inicio, ate: fim, hoje: s.hoje }).filter((o) => o.previsto.tipo !== 'transferencia')
    : [];
  const vaiSair = futuro.filter((o) => o.previsto.tipo === 'saida').reduce((t, o) => t + o.valor, 0);
  const vaiEntrar = futuro.filter((o) => o.previsto.tipo === 'entrada').reduce((t, o) => t + o.valor, 0);
  const saldoMes = entrou - saiu;
  const fechaEm = saldoMes + vaiEntrar - vaiSair;

  const passa = (tipo) => !filtro || filtro === tipo;
  const pendentes = futuro.filter((o) => passa(o.previsto.tipo)).sort((a, b) => (a.data < b.data ? -1 : 1));
  const feitos = doMes.filter((l) => passa(l.tipo)).sort((a, b) => (a.data === b.data ? (a.criado_em < b.criado_em ? 1 : -1) : a.data < b.data ? 1 : -1));
  const dias = [];
  for (const l of feitos) {
    const ult = dias[dias.length - 1];
    if (ult && ult.data === l.data) ult.itens.push(l);
    else dias.push({ data: l.data, itens: [l] });
  }
  const linha = (l) => html`<li><button class="item item-btn" onClick=${() => abrirFolha('lancamento', { lanc: l })}>
    <div class="corpo"><div class="tit">${l.descricao || cats[l.categoria_id]?.nome || '(sem descrição)'}</div>
      <div class="meta">${[cats[l.categoria_id]?.nome, contas[l.conta_id]?.nome].filter(Boolean).join(' · ')}</div></div>
    <div class=${`valor ${l.tipo === 'entrada' ? 'pos' : 'neg'}`}>${l.tipo === 'entrada' ? '+' : '−'} ${brl(toCents(l.valor))}</div>
  </button></li>`;

  return html`<main>
    <${Topo} titulo="Extrato" sub="O que entrou, o que saiu e o que vai sair no mês" />
    <${AbasSecao} secao="dinheiro" atual="/extrato" />
    <${FaixaDemo} />
    <div style="display:flex;align-items:center;justify-content:space-between;margin:2px 0 12px">
      <button class="icone-btn" aria-label="Mês anterior" onClick=${() => setMes(addMonthsKey(mes, -1))}><${Icone} n="voltar" /></button>
      <strong style="font:700 18px var(--display);text-transform:capitalize">${monthName(mes)} ${mes.slice(0, 4)}</strong>
      <button class="icone-btn" aria-label="Próximo mês" onClick=${() => setMes(addMonthsKey(mes, 1))}><${Icone} n="seta" /></button>
    </div>
    <div class="extrato-resumo" aria-label="Resumo do mês">
      <button class=${`painel extrato-num ${filtro === 'entrada' ? 'ativo' : ''}`} onClick=${() => setFiltro(filtro === 'entrada' ? '' : 'entrada')}>
        <span class="rot">Entrou</span><span class="num pos">${brl(entrou)}</span>${vaiEntrar > 0 && html`<span class="rod">+ ${brl(vaiEntrar)} a receber</span>`}</button>
      <button class=${`painel extrato-num ${filtro === 'saida' ? 'ativo' : ''}`} onClick=${() => setFiltro(filtro === 'saida' ? '' : 'saida')}>
        <span class="rot">Saiu</span><span class="num neg">${brl(saiu)}</span>${vaiSair > 0 && html`<span class="rod">+ ${brl(vaiSair)} vai sair</span>`}</button>
    </div>
    <div class="painel painel-pad" style="margin-top:8px">
      <div style="display:flex;justify-content:space-between"><span>Saldo do mês até agora</span><strong class=${saldoMes < 0 ? 'neg' : 'pos'}>${saldoMes < 0 ? '−' : '+'} ${brl(Math.abs(saldoMes))}</strong></div>
      ${futuro.length > 0 && html`<div style="display:flex;justify-content:space-between;margin-top:6px"><span>Fecha o mês em</span><strong class=${fechaEm < 0 ? 'neg' : 'pos'}>${fechaEm < 0 ? '−' : '+'} ${brl(Math.abs(fechaEm))}</strong></div>
        <div class="muted" style="font-size:12.5px;margin-top:4px">Contando o que ainda vai sair e entrar pelos previstos.</div>`}
    </div>
    <div style="margin-top:10px"><${Chips} rotulo="Mostrar" valor=${filtro} onChange=${setFiltro} opcoes=${[['', 'Tudo'], ['entrada', 'Só entradas'], ['saida', 'Só saídas']]} /></div>

    ${pendentes.length > 0 && html`<section aria-label="Vai acontecer">
      <div class="dia-cab"><span class="d">${filtro === 'entrada' ? 'Vai entrar' : filtro === 'saida' ? 'Vai sair' : 'Ainda vai acontecer'}</span><span class="t">${pendentes.length}</span></div>
      <ul class="lista painel extrato-futuro">${pendentes.map((o) => html`<li><button class="item item-btn" onClick=${() => abrirFolha('ocorrencia', { occ: o })}>
        <div class="extrato-data"><b>${o.data.slice(8)}</b><span>${diaSemana(o.data)}</span></div>
        <div class="corpo"><div class="tit">${o.previsto.descricao}${o.parcela ? ` · ${o.parcela.k}/${o.parcela.n}` : ''}</div>
          <div class="meta">${o.atrasado ? html`<span class="etiqueta atraso">Atrasado</span> ` : ''}${contas[o.previsto.conta_id]?.nome || ''}${o.confianca !== 'certo' ? ' · provável' : ''}</div></div>
        <div class=${`valor ${o.previsto.tipo === 'entrada' ? 'pos' : 'neg'}`}>${o.previsto.tipo === 'entrada' ? '+' : '−'} ${o.previsto.natureza === 'variavel' ? '≈ ' : ''}${brl(o.valor)}</div>
      </button></li>`)}</ul>
    </section>`}

    ${dias.map((d) => html`<section>
      <div class="dia-cab"><span class="d">${fmtDay(d.data)} · ${diaSemana(d.data)}</span>
        <span class="t">${(() => { const v = d.itens.reduce((t, l) => t + (l.tipo === 'entrada' ? 1 : -1) * toCents(l.valor), 0); return `${v < 0 ? '−' : '+'} ${brl(Math.abs(v))}`; })()}</span></div>
      <ul class="lista painel">${d.itens.map(linha)}</ul>
    </section>`)}
    ${!dias.length && !pendentes.length && html`<p class="muted" style="text-align:center;margin-top:18px">Nada neste mês.</p>`}
  </main>`;
}
