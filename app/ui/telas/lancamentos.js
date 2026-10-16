import { useState } from '../../vendor/hooks.module.js';
import { html } from '../html.js';
import { Icone } from '../icones.js';
import { Topo, Chips, Marca, Arrastavel, Vazio } from '../componentes.js';
import { useStore, abrirFolha, apagarLancamento } from '../../data/store.js';
import { brl, toCents, sum } from '../../core/money.js';
import { monthKey, addMonthsKey, monthName, fmtDayLong } from '../../core/dates.js';
import { ORIGENS } from '../../core/schema.js';
import { porId, origemLabel, contasAtivas } from '../derivados.js';
import { FaixaDemo } from './inicio.js';

const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const CANAL = { voz: 'por voz', foto: 'por foto', hotmart: 'automático', meta: 'automático' };

export function TelaLancamentos({ params }) {
  const s = useStore();
  const [mes, setMes] = useState(monthKey(s.hoje));
  const [origem, setOrigem] = useState('');
  const [conta, setConta] = useState(params.conta || '');
  const [busca, setBusca] = useState('');
  const contas = porId(s.tables.contas);
  const cats = porId(s.tables.categorias);

  const q = norm(busca);
  const lista = s.tables.lancamentos
    .filter((l) => monthKey(l.data) === mes)
    .filter((l) => !origem || (origem === 'transferencia' ? l.tipo === 'transferencia' : l.origem === origem && l.tipo !== 'transferencia'))
    .filter((l) => !conta || l.conta_id === conta || l.conta_destino_id === conta)
    .filter((l) => !q || norm(`${l.descricao} ${cats[l.categoria_id]?.nome || ''} ${contas[l.conta_id]?.nome || ''}`).includes(q))
    .sort((a, b) => (a.data === b.data ? (a.criado_em < b.criado_em ? 1 : -1) : a.data < b.data ? 1 : -1));

  const efeito = (l) => {
    const v = toCents(l.valor);
    if (l.tipo === 'entrada') return v;
    if (l.tipo === 'saida') return -v;
    if (conta) return l.conta_destino_id === conta ? v : -v;
    return 0;
  };
  const entradas = sum(lista.filter((l) => efeito(l) > 0), efeito);
  const saidas = -sum(lista.filter((l) => efeito(l) < 0), efeito);

  const dias = [];
  for (const l of lista) {
    const ult = dias[dias.length - 1];
    if (ult && ult.data === l.data) ult.itens.push(l);
    else dias.push({ data: l.data, itens: [l] });
  }

  const contaSel = contas[conta];
  return html`<main>
    <${Topo} titulo="Lançamentos" sub=${contaSel ? `Só ${contaSel.nome}` : 'Todas as contas'} />
    <${FaixaDemo} />
    <div style="display:flex;align-items:center;justify-content:space-between;margin:2px 0 12px">
      <button class="icone-btn" aria-label="Mês anterior" onClick=${() => setMes(addMonthsKey(mes, -1))}><${Icone} n="voltar" /></button>
      <strong style="font:700 18px var(--display);text-transform:capitalize">${monthName(mes)} ${mes.slice(0, 4)}</strong>
      <button class="icone-btn" aria-label="Próximo mês" onClick=${() => setMes(addMonthsKey(mes, 1))}><${Icone} n="seta" /></button>
    </div>
    <div class="busca"><${Icone} n="busca" /><input type="search" placeholder="Buscar descrição, categoria ou conta" value=${busca} onInput=${(e) => setBusca(e.target.value)} aria-label="Buscar" /></div>
    <div style="margin-top:10px">
      <${Chips} rotulo="Filtrar por origem" valor=${origem} onChange=${setOrigem}
        opcoes=${[['', 'Tudo'], ...ORIGENS.map((o) => [o, origemLabel(o)]), ['transferencia', 'Transferências']]} />
    </div>
    <div style="margin-top:6px">
      <${Chips} rotulo="Filtrar por conta" valor=${conta} onChange=${setConta}
        opcoes=${[['', 'Todas as contas'], ...contasAtivas(s).map((c) => [c.id, c.nome, c.cor])]} />
    </div>
    <div class="dupla" style="margin-top:12px">
      <div class="painel mini"><div class="rot">Entradas</div><div class="num pos">${brl(entradas)}</div></div>
      <div class="painel mini"><div class="rot">Saídas</div><div class="num neg">${brl(saidas)}</div></div>
    </div>
    ${!dias.length && html`<div class="painel" style="margin-top:14px"><${Vazio} titulo="Nada por aqui">
      ${busca || origem || conta ? 'Nenhum lançamento com esses filtros neste mês.' : 'Toque no + para lançar o primeiro do mês.'}<//></div>`}
    ${dias.map((d) => html`<section>
      <div class="dia-cab"><span class="d">${fmtDayLong(d.data)}</span><span class="t">${sum(d.itens, efeito) ? brl(sum(d.itens, efeito)) : ''}</span></div>
      <ul class="lista painel" style="overflow:hidden">
        ${d.itens.map((l) => {
          const c = contas[l.conta_id];
          const v = efeito(l);
          const meta = l.tipo === 'transferencia'
            ? `${c?.nome || '?'} → ${contas[l.conta_destino_id]?.nome || '?'}`
            : [cats[l.categoria_id]?.nome, c?.nome, origemLabel(l.origem)].filter(Boolean).join(', ');
          return html`<li key=${l.id}><${Arrastavel} onApagar=${() => apagarLancamento(l.id)}>
            <button class="item item-btn" onClick=${() => abrirFolha('lancamento', { lanc: l })}>
              ${l.tipo === 'transferencia' ? html`<span class="marca suave"><${Icone} n="transf" /></span>` : html`<${Marca} conta=${c} />`}
              <div class="corpo"><div class="tit">${l.descricao || '(sem descrição)'}</div>
                <div class="meta">${meta}${CANAL[l.canal] ? `, ${CANAL[l.canal]}` : ''}${l.previsto_id ? ', previsto' : ''}</div></div>
              <div class=${`valor ${v > 0 ? 'pos' : v < 0 ? 'neg' : 'muted'}`}>${v > 0 ? '+' : ''}${brl(l.tipo === 'transferencia' && !conta ? toCents(l.valor) : v)}</div>
            </button>
          <//></li>`;
        })}
      </ul>
    </section>`)}
    ${dias.length > 0 && html`<p class="muted" style="font-size:12.5px;text-align:center;margin-top:14px">Arraste um lançamento para a esquerda para apagar.</p>`}
  </main>`;
}
