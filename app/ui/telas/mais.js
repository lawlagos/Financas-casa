import { useState } from '../../vendor/hooks.module.js';
import { html } from '../html.js';
import { Icone } from '../icones.js';
import { Topo, Secao, Marca, Vazio, Campo, AbasSecao } from '../componentes.js';
import { useStore, abrirFolha, salvar, apagar, config, reiniciarDemo, sair, toast } from '../../data/store.js';
import { brl, parseBRL } from '../../core/money.js';
import { fmtDay, fmtMonthYear, monthName } from '../../core/dates.js';
import { GRUPOS } from '../../core/balances.js';
import { commitments, receivables } from '../../core/planning.js';
import { openOccurrences } from '../../core/recurrence.js';
import { addDays } from '../../core/dates.js';
import { saldosHoje, agendaTexto, valorPrevistoTexto, porId, origemLabel } from '../derivados.js';
import { projectedValue } from '../../core/recurrence.js';
import { prepararImportacao } from '../../core/importacao.js';
import { TAXA_IFOOD_PADRAO } from '../../core/pudim.js';

export function TelaMais() {
  const s = useStore();
  const it = (href, icone, tit, meta) => html`<li><a class="item" href=${href} style="text-decoration:none">
    <span class="marca suave"><${Icone} n=${icone} /></span><div class="corpo"><div class="tit">${tit}</div><div class="meta">${meta}</div></div>
    <span style="width:18px;color:var(--ink-3)"><${Icone} n="seta" /></span></a></li>`;
  return html`<main>
    <${Topo} titulo="Mais" />
    <ul class="lista painel">
      ${it('#/lista', 'lista', 'Lista de compras', `Casa: ${(s.tables.lista || []).filter((x) => x.origem !== 'Pudim').length} itens · Pudim: ${(s.tables.lista || []).filter((x) => x.origem === 'Pudim').length} itens`)}
      ${it('#/mais/mercado', 'carrinho', 'Mercado', 'O que mais compram, lista sugerida e previsão do mês')}
      ${it('#/mais/previstos', 'repetir', 'Previstos', 'Contas fixas, parcelas, variáveis e o que você tem a receber')}
      ${it('#/mais/compromissos', 'pilha', 'Compromissos', 'Quanto já está comprometido por mês e quando cada parcela acaba')}
      ${it('#/mais/contas', 'contas', 'Contas', `${s.tables.contas.length} contas, saldos iniciais`)}
      ${it('#/mais/categorias', 'etiqueta', 'Categorias', 'Nomes e origem sugerida')}
      ${it('#/mais/ajustes', 'ajustes', 'Ajustes', 'Gasto diário, reserva mínima, tema')}
    </ul>
    <p class="muted" style="font-size:12.5px;margin-top:18px">Próximas etapas: Hotmart e Meta automáticos, depois o radar de ofertas.</p>
  </main>`;
}

const SECOES_PREVISTOS = [
  ['A receber', (p) => p.tipo === 'entrada'],
  ['Fixos', (p) => p.tipo !== 'entrada' && p.natureza === 'fixo'],
  ['Parcelados', (p) => p.tipo !== 'entrada' && p.natureza === 'parcelado'],
  ['Variáveis', (p) => p.tipo !== 'entrada' && p.natureza === 'variavel'],
  ['Uma vez', (p) => p.tipo !== 'entrada' && p.natureza === 'unico'],
];

export function TelaPrevistos() {
  const s = useStore();
  const contas = porId(s.tables.contas);
  const ativos = s.tables.previstos.filter((p) => p.ativo !== false);
  const inativos = s.tables.previstos.filter((p) => p.ativo === false);
  const occs = openOccurrences({ ...s.tables, lancs: s.tables.lancamentos, de: addDays(s.hoje, -60), ate: addDays(s.hoje, 400), hoje: s.hoje });
  const proxima = (p) => occs.find((o) => o.previsto.id === p.id);
  const Item = ({ p }) => {
    const o = proxima(p);
    const v = projectedValue(p, s.tables.lancamentos);
    return html`<li><button class="item item-btn" onClick=${() => abrirFolha('previsto', { previsto: p })}>
      <${Marca} conta=${contas[p.conta_id]} />
      <div class="corpo"><div class="tit">${p.descricao}${o?.parcela ? ` · ${o.parcela.k}/${o.parcela.n}` : ''}</div>
        <div class="meta">${agendaTexto(p)}${o ? `, próximo ${fmtDay(o.data)}` : p.ativo === false ? '' : ', sem próximas datas'}</div></div>
      <div class=${`valor ${p.tipo === 'entrada' ? (p.confianca === 'certo' && !p.renovacao ? 'pos' : 'prov') : ''}`}>${valorPrevistoTexto(p, v)}
        <small>${p.tipo === 'entrada' ? (p.renovacao ? 'renovação' : p.confianca === 'certo' ? 'certo' : 'provável') : contas[p.conta_id]?.nome || ''}</small></div>
    </button></li>`;
  };
  return html`<main>
    <${Topo} titulo="Previstos" voltar="#/mais" sub="Tudo que se repete ou já tem data"
      direita=${html`<button class="btn btn-pri btn-mini" onClick=${() => abrirFolha('previsto', {})}><${Icone} n="mais" />Novo</button>`} />
    ${!s.tables.previstos.length && html`<div class="painel"><${Vazio} titulo="Nenhum previsto ainda">Cadastre o aluguel, as parcelas e quem te paga todo mês para o Futuro funcionar.<//></div>`}
    ${SECOES_PREVISTOS.map(([titulo, f]) => {
      const lista = ativos.filter(f);
      if (!lista.length) return null;
      return html`<${Secao} titulo=${titulo}><ul class="lista painel">${lista.map((p) => html`<${Item} p=${p} />`)}</ul><//>`;
    })}
    ${inativos.length > 0 && html`<${Secao} titulo="Desativados"><ul class="lista painel" style="opacity:.7">${inativos.map((p) => html`<${Item} p=${p} />`)}</ul><//>`}
  </main>`;
}

export function TelaCompromissos() {
  const s = useStore();
  const base = { ...s.tables, lancs: s.tables.lancamentos, hoje: s.hoje };
  const c = commitments(base);
  const r = receivables({ ...base, dias: 60 });
  const linha = (rot, v, cor) => html`<div style="display:flex;justify-content:space-between;padding:6px 0"><span><span class="bolinha" style=${`display:inline-block;margin-right:8px;background:${cor}`}></span>${rot}</span><strong>${v}</strong></div>`;
  let acumulado = 0;
  return html`<main>
    <${Topo} titulo="Compromissos" voltar="#/mais" />
    <div class="painel painel-pad">
      <div class="muted" style="font-weight:650;font-size:13px">Comprometido por mês</div>
      <div style="font:700 34px/1.1 var(--display);letter-spacing:-.02em;margin:2px 0 10px">${brl(c.total)}</div>
      ${linha(`Fixos (${c.listas.fixo.length})`, brl(c.porNatureza.fixo), 'var(--ink)')}
      ${linha(`Parcelas (${c.parcelas.filter((x) => !x.quitado).length} ativas)`, brl(c.porNatureza.parcelado), 'var(--caramel)')}
      ${linha(`Variáveis (${c.listas.variavel.length})`, `≈ ${brl(c.porNatureza.variavel)}`, 'var(--prov)')}
    </div>

    <${Secao} titulo="Parcelas">
      ${c.parcelas.length ? html`<ul class="lista painel">
        ${c.parcelas.map((x) => html`<li><button class="item item-btn" onClick=${() => abrirFolha('previsto', { previsto: x.previsto })}>
          <div class="corpo"><div class="tit">${x.previsto.descricao}</div>
            <div class="meta">${x.quitado ? 'Quitado' : `Parcela ${x.parcelaAtual.k}/${x.parcelaAtual.n} de ${brl(x.previsto.valor * 100)}, termina em ${fmtMonthYear(x.termina)}`}</div></div>
          <div class="valor">${brl(x.faltaPagar)}<small>falta pagar</small></div>
        </button></li>`)}
      </ul>` : html`<div class="painel"><${Vazio} titulo="Sem parcelas">Empréstimos e parcelas cadastrados em Previstos aparecem aqui.<//></div>`}
    <//>

    ${c.alivio.length > 0 && html`<${Secao} titulo="Quando sobra mais">
      <ul class="lista painel">
        ${c.alivio.map((a) => {
          acumulado += a.valor;
          return html`<li class="item"><div class="corpo"><div class="tit" style="text-transform:capitalize">${monthName(a.mes)} ${a.mes.slice(0, 4)}</div>
            <div class="meta">Acaba ${a.descricao || 'uma parcela'}</div></div>
            <div class="valor pos">+${brl(a.valor)}/mês<small>${brl(acumulado)}/mês a mais no total</small></div></li>`;
        })}
      </ul>
    <//>`}

    <${Secao} titulo="A receber, próximos 60 dias">
      <div class="dupla" style="margin-bottom:10px">
        <div class="painel mini"><div class="rot">Certo</div><div class="num pos">${brl(r.totalCerto)}</div></div>
        <div class="painel mini"><div class="rot">Provável</div><div class="num prov">${brl(r.totalProvavel)}</div></div>
      </div>
      <ul class="lista painel">
        ${[...r.atrasados, ...r.proximos].map((o) => html`<li><button class="item item-btn" onClick=${() => abrirFolha('ocorrencia', { occ: o })}>
          <div class="corpo"><div class="tit">${o.previsto.descricao}</div>
            <div class="meta">${o.atrasado ? html`<span class="etiqueta atraso">Atrasado desde ${fmtDay(o.data)}</span>` : `${fmtDay(o.janelaInicio)}${o.janelaInicio !== o.data ? ` a ${fmtDay(o.data)}` : ''}`}</div></div>
          <div class=${`valor ${o.confianca === 'certo' ? 'pos' : 'prov'}`}>${o.previsto.natureza === 'variavel' ? '≈ ' : ''}${brl(o.valor)}<small>${o.confianca === 'certo' ? 'certo' : 'provável'}</small></div>
        </button></li>`)}
        ${!r.atrasados.length && !r.proximos.length && html`<li class="item muted">Nada previsto para entrar nos próximos 60 dias.</li>`}
      </ul>
    <//>

    ${r.renovacoes.length > 0 && html`<${Secao} titulo="Renovações do ano">
      <ul class="lista painel">
        ${r.renovacoes.map((o) => html`<li><button class="item item-btn" onClick=${() => abrirFolha('ocorrencia', { occ: o })}>
          <div class="corpo"><div class="tit">${o.previsto.descricao}</div>
            <div class="meta">${o.confirmada ? html`<span class="etiqueta pago">Renovou</span>` : o.lembrar ? html`<span class="etiqueta pendente">Renova em ${fmtDay(o.data)}. Confirmou?</span>` : `Renova em ${fmtMonthYear(o.data)}`}</div></div>
          <div class=${`valor ${o.confirmada ? 'pos' : 'prov'}`}>${brl(o.valor)}</div>
        </button></li>`)}
      </ul>
    <//>`}
  </main>`;
}

export function TelaContas() {
  const s = useStore();
  const { saldos } = saldosHoje(s);
  return html`<main>
    <${Topo} titulo="Contas" voltar=${location.hash.startsWith('#/mais') ? '#/mais' : null} direita=${html`<button class="btn btn-pri btn-mini" onClick=${() => abrirFolha('conta', {})}><${Icone} n="mais" />Nova</button>`} />
    ${!location.hash.startsWith('#/mais') && html`<${AbasSecao} secao="dinheiro" atual="/contas" />`}
    <ul class="lista painel">
      ${GRUPOS.map((g) => {
        const lista = s.tables.contas.filter((c) => c.grupo === g);
        if (!lista.length) return null;
        return html`<li class="grupo-cab"><span>${g}</span></li>
          ${lista.map((c) => html`<li><button class="item item-btn" style=${c.ativa === false ? 'opacity:.55' : ''} onClick=${() => abrirFolha('conta', { conta: c })}>
            <${Marca} conta=${c} />
            <div class="corpo"><div class="tit">${c.nome}${c.ativa === false ? ' (desativada)' : ''}</div>
              <div class="meta">${c.dono}, saldo de ${brl(Math.round(Number(c.saldo_inicial || 0) * 100))} em ${c.data_saldo_inicial ? fmtDay(c.data_saldo_inicial) : '?'}</div></div>
            <div class=${`valor ${saldos[c.id] < 0 ? 'neg' : ''}`}>${brl(saldos[c.id] || 0)}<small>hoje</small></div>
          </button></li>`)}`;
      })}
    </ul>
  </main>`;
}

export function TelaCategorias() {
  const s = useStore();
  const bloco = (tipo, titulo) => html`<${Secao} titulo=${titulo}><ul class="lista painel">
    ${s.tables.categorias.filter((c) => c.tipo === tipo).map((c) => html`<li><button class="item item-btn" style=${c.ativa === false ? 'opacity:.55' : ''} onClick=${() => abrirFolha('categoria', { categoria: c })}>
      <div class="corpo"><div class="tit">${c.nome}</div><div class="meta">Origem sugerida: ${origemLabel(c.origem_padrao) || 'nenhuma'}</div></div>
    </button></li>`)}
  </ul><//>`;
  return html`<main>
    <${Topo} titulo="Categorias" voltar="#/mais" direita=${html`<button class="btn btn-pri btn-mini" onClick=${() => abrirFolha('categoria', {})}><${Icone} n="mais" />Nova</button>`} />
    ${bloco('saida', 'Saídas')}${bloco('entrada', 'Entradas')}
  </main>`;
}

// Carrega saldos e previstos de um arquivo de importação (gerado pelo Claude a partir da planilha antiga).
function Importar() {
  const s = useStore();
  const [texto, setTexto] = useState('');
  const [erros, setErros] = useState([]);
  const [progresso, setProgresso] = useState(null);
  const lerArquivo = (e) => {
    const f = e.target.files?.[0];
    if (f) f.text().then(setTexto);
  };
  const importar = async () => {
    const r = prepararImportacao(texto, s.tables.contas, s.tables.previstos, s.tables.insumos, s.tables.receitas);
    setErros(r.erros);
    if (r.erros.length) return;
    const total = r.contas.length + r.previstos.length + r.remover.length + r.insumos.length + r.receitas.length + r.config.length;
    let feitos = 0;
    try {
      for (const [tabela, lista] of [['contas', r.contas], ['previstos', r.previstos], ['insumos', r.insumos], ['receitas', r.receitas], ['config', r.config]]) {
        for (const linha of lista) {
          setProgresso(`Importando ${++feitos} de ${total}…`);
          await salvar(tabela, linha);
        }
      }
      for (const id of r.remover) {
        setProgresso(`Importando ${++feitos} de ${total}…`);
        await apagar('previstos', id);
      }
    } catch {
      setProgresso(`Parou no item ${feitos} de ${total}. Toque em Importar de novo: o que já entrou não é duplicado.`);
      return;
    }
    setProgresso(null);
    setTexto('');
    const partes = [
      r.contas.length || r.previstos.length ? `${r.contas.length} saldos e ${r.previstos.length} previstos` : '',
      r.insumos.length ? `${r.insumos.length} ingredientes` : '',
      r.receitas.length ? `${r.receitas.length} receitas` : '',
      r.config.length ? 'custos do pudim' : '',
    ].filter(Boolean);
    toast(`Importado: ${partes.join(', ')}${r.remover.length ? `, ${r.remover.length} antigos removidos` : ''}`);
  };
  return html`<${Secao} titulo="Importar dados">
    <div class="painel painel-pad">
      <p style="margin:0 0 4px;color:var(--ink-2)">Escolha o arquivo de importação ou cole o texto dele. Importar de novo o mesmo arquivo atualiza, sem duplicar.</p>
      <${Campo} rotulo="Arquivo"><input id="importar-arquivo" type="file" accept=".json,application/json,text/plain" onChange=${lerArquivo} /><//>
      <${Campo} rotulo="Ou cole o texto">
        <textarea id="importar-texto" rows="4" style="width:100%;border:1px solid var(--line);border-radius:12px;padding:10px;background:var(--surface);font-size:13px" value=${texto} onInput=${(e) => setTexto(e.target.value)}></textarea>
      <//>
      ${erros.length > 0 && html`<div class="duvida" role="alert"><${Icone} n="alerta" /><span>${erros.slice(0, 5).join(' ')}${erros.length > 5 ? ` E mais ${erros.length - 5}.` : ''}</span></div>`}
      ${progresso && html`<p class="muted" role="status" style="margin:10px 0 0">${progresso}</p>`}
      <button class="btn btn-pri btn-larga" style="margin-top:14px" disabled=${!texto.trim() || (progresso && progresso.startsWith('Importando'))} onClick=${importar}>Importar</button>
    </div>
  <//>`;
}

function lerTema() {
  try {
    return localStorage.getItem('fc-tema') || 'auto';
  } catch {
    return 'auto';
  }
}

// "auto" só desfaz o que o próprio app marcou, sem apagar um tema definido por quem hospeda a página.
export function aplicarTema(t = lerTema()) {
  const raiz = document.documentElement;
  if (t === 'auto') {
    if (raiz.dataset.temaApp) {
      delete raiz.dataset.theme;
      delete raiz.dataset.temaApp;
    }
    return;
  }
  raiz.dataset.theme = t;
  raiz.dataset.temaApp = '1';
}

export function TelaAjustes() {
  const s = useStore();
  const [diario, setDiario] = useState(String(config('gasto_diario', 0)).replace('.', ','));
  const [reserva, setReserva] = useState(String(config('reserva_minima', 0)).replace('.', ','));
  const [taxa, setTaxa] = useState(String(config('taxa_ifood', TAXA_IFOOD_PADRAO)).replace('.', ','));
  const [tema, setTema] = useState(lerTema());
  const guardar = async () => {
    await salvar('config', { id: 'gasto_diario', valor: parseBRL(diario) });
    await salvar('config', { id: 'reserva_minima', valor: parseBRL(reserva) });
    const t = parseBRL(taxa);
    if (t >= 0 && t < 100) await salvar('config', { id: 'taxa_ifood', valor: t });
    toast('Ajustes salvos');
  };
  const trocarTema = (t) => {
    setTema(t);
    try {
      localStorage.setItem('fc-tema', t);
    } catch {
      /* tema vale só nesta sessão */
    }
    aplicarTema(t);
  };
  return html`<main>
    <${Topo} titulo="Ajustes" voltar="#/mais" />
    <div class="painel painel-pad">
      <${Campo} rotulo="Gasto diário estimado" ajuda="O seu “Diário” da planilha. O Futuro desconta esse valor por dia, a partir de amanhã.">
        <input inputmode="decimal" value=${diario} onInput=${(e) => setDiario(e.target.value)} />
      <//>
      <${Campo} rotulo="Reserva mínima" ajuda="Quanto você quer manter sempre na conta. O Futuro mostra quanto falta para não descer disso.">
        <input inputmode="decimal" value=${reserva} onInput=${(e) => setReserva(e.target.value)} />
      <//>
      <${Campo} rotulo="Taxa do iFood (%)" ajuda="Quanto o iFood tira de cada venda de pudim. Vale para as próximas vendas.">
        <input id="ajuste-taxa-ifood" inputmode="decimal" value=${taxa} onInput=${(e) => setTaxa(e.target.value)} />
      <//>
      <button class="btn btn-pri btn-larga" style="margin-top:16px" onClick=${guardar}>Salvar ajustes</button>
    </div>
    <${Importar} />
    <${Secao} titulo="Tema">
      <div class="segmento" role="group" aria-label="Tema">
        ${[['auto', 'Automático'], ['light', 'Claro'], ['dark', 'Escuro']].map(([v, t]) => html`<button aria-pressed=${String(tema === v)} onClick=${() => trocarTema(v)}>${t}</button>`)}
      </div>
    <//>
    <${Secao} titulo=${s.modo === 'demo' ? 'Modo demonstração' : 'Conta'}>
      <div class="painel painel-pad">
        ${s.modo === 'demo'
          ? html`<p style="margin:0 0 12px;color:var(--ink-2)">Os dados de exemplo ficam só neste aparelho. Quando a planilha estiver ligada, o app passa a usar os dados de vocês.</p>
            <button class="btn btn-sec btn-larga" onClick=${async () => { await reiniciarDemo(); toast('Exemplos restaurados'); }}>Restaurar dados de exemplo</button>`
          : html`<p style="margin:0 0 12px;color:var(--ink-2)">Conectado como ${s.usuario?.email || 'você'}.</p>
            <button class="btn btn-sec btn-larga" onClick=${sair}><${Icone} n="sair" />Sair deste aparelho</button>`}
      </div>
    <//>
  </main>`;
}
