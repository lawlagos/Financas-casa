import { useState, useRef, useEffect } from '../../vendor/hooks.module.js';
import { html } from '../html.js';
import { Icone } from '../icones.js';
import { Folha, Segmento, Chips, Campo } from '../componentes.js';
import { useStore, state, salvar, apagarLancamento, fecharFolha, abrirFolha, toast } from '../../data/store.js';
import { SeletorCategoria } from '../categorias.js';
import { parseQuick, parseVarios } from '../../core/quickparse.js';
import { parseBRL, brl, toCents } from '../../core/money.js';
import { ORIGENS } from '../../core/schema.js';
import { findMatch, matchCandidates } from '../../core/planning.js';
import { fmtDay } from '../../core/dates.js';
import { contasAtivas, origemLabel } from '../derivados.js';
import { GRUPOS } from '../../core/balances.js';
import { CATEGORIA_DIZIMO, dizimoEmAberto } from '../../core/tithe.js';

// Saída na categoria Dízimo sem referência conta como pagamento do dízimo mais antigo em aberto.
const comDizimo = (linha, hoje) => {
  if (linha.tipo !== 'saida' || linha.categoria_id !== CATEGORIA_DIZIMO || linha.id_externo) return linha;
  const aberto = dizimoEmAberto(state.tables.lancamentos, hoje);
  return aberto ? { ...linha, id_externo: aberto.referencia } : linha;
};

const vazio = (hoje) => ({ tipo: 'saida', valor: '', descricao: '', data: hoje, conta_id: '', conta_destino_id: '', categoria_id: '', origem: '' });

function valorTexto(v) {
  if (v === '' || v === null || v === undefined) return '';
  return Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function SelectConta({ valor, onChange, contas, rotulo = 'Conta', excluir }) {
  return html`<${Campo} rotulo=${rotulo}>
    <select aria-label=${rotulo} value=${valor || ''} onChange=${(e) => onChange(e.target.value)}>
      <option value="">Escolha a conta</option>
      ${GRUPOS.map((g) => html`<optgroup label=${g}>
        ${contas.filter((c) => c.grupo === g && c.id !== excluir).map((c) => html`<option value=${c.id}>${c.nome}${c.dono === 'Esposa' ? ' (dela)' : ''}</option>`)}
      </optgroup>`)}
    </select>
  <//>`;
}

export function FolhaLancamento({ lanc, inicial, ocorrencia }) {
  const s = useStore();
  const editando = !!lanc;
  const [f, setF] = useState(() => {
    const base = { ...vazio(s.hoje), ...(lanc || {}), ...(inicial || {}) };
    return { ...base, valor: valorTexto(base.valor) };
  });
  const [modo, setModo] = useState(editando || inicial ? 'digitar' : 'falar');
  const [frase, setFrase] = useState('');
  const [ouvindo, setOuvindo] = useState(false);
  const [interpretado, setInterpretado] = useState(false);
  const [origemManual, setOrigemManual] = useState(!!(lanc || inicial)?.origem);
  const [tentouSalvar, setTentouSalvar] = useState(false);
  const rec = useRef(null);
  const contas = contasAtivas(s);
  const cats = s.tables.categorias.filter((c) => c.tipo === f.tipo && c.ativa !== false);
  const set = (patch) => setF((x) => ({ ...x, ...patch }));

  useEffect(() => () => rec.current?.abort?.(), []);

  const temVoz = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);

  // Vários valores na frase ("248,55 dízimo - 51,45 oferta"): um rascunho para cada, salvos de uma vez.
  const [varios, setVarios] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const interpretar = (texto) => {
    const ctx = { contas, categorias: s.tables.categorias, hoje: s.hoje };
    const lista = parseVarios(texto, ctx);
    if (lista) {
      setVarios(lista.map((r) => ({ tipo: r.tipo || 'saida', valor: valorTexto(r.valor), descricao: r.descricao, categoria_id: r.categoria_id || '', origem: r.origem || (r.tipo === 'entrada' ? '' : 'Casa'), conta_id: r.conta_id || '', data: r.data })));
      setInterpretado(true);
      return;
    }
    setVarios(null);
    const r = parseQuick(texto, ctx);
    setF((x) => ({
      ...x,
      tipo: r.tipo || x.tipo,
      valor: r.valor !== null ? valorTexto(r.valor) : x.valor,
      descricao: r.descricao || x.descricao,
      data: r.data || x.data,
      conta_id: r.conta_id || x.conta_id,
      conta_destino_id: r.conta_destino_id || x.conta_destino_id,
      categoria_id: r.categoria_id || '',
      origem: r.origem || x.origem,
    }));
    setOrigemManual(!!r.origem);
    setInterpretado(true);
  };

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
      if (e.results[e.results.length - 1].isFinal) interpretar(t);
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

  const escolherCategoria = (id) => {
    const c = state.tables.categorias.find((x) => x.id === id);
    set({ categoria_id: id, ...(c && !origemManual && c.origem_padrao ? { origem: c.origem_padrao } : {}) });
  };

  const valor = parseBRL(f.valor);
  const faltando = [];
  if (!(valor > 0)) faltando.push('valor');
  if (!f.conta_id) faltando.push(f.tipo === 'transferencia' ? 'conta de origem' : 'conta');
  if (f.tipo === 'transferencia' && !f.conta_destino_id) faltando.push('conta de destino');
  if (f.tipo === 'transferencia' && f.conta_destino_id && f.conta_destino_id === f.conta_id) faltando.push('contas diferentes');
  if (f.tipo !== 'transferencia' && !f.origem) faltando.push('origem');
  if (!f.data) faltando.push('data');

  const salvarLanc = async () => {
    setTentouSalvar(true);
    if (faltando.length) return;
    const linha = {
      ...(lanc || {}),
      tipo: f.tipo,
      valor,
      descricao: f.descricao.trim() || (s.tables.categorias.find((c) => c.id === f.categoria_id)?.nome ?? (f.tipo === 'transferencia' ? 'Transferência' : '')),
      data: f.data,
      conta_id: f.conta_id,
      conta_destino_id: f.tipo === 'transferencia' ? f.conta_destino_id : '',
      categoria_id: f.tipo === 'transferencia' ? '' : f.categoria_id,
      origem: f.tipo === 'transferencia' ? '' : f.origem,
      canal: lanc?.canal || (interpretado ? 'voz' : 'manual'),
      id_externo: lanc?.id_externo || inicial?.id_externo || '',
      previsto_id: lanc?.previsto_id || (ocorrencia ? ocorrencia.previsto_id : ''),
    };
    let salvo;
    try {
      salvo = await salvar('lancamentos', editando ? linha : comDizimo(linha, s.hoje));
    } catch {
      return;
    }
    if (ocorrencia) {
      await salvar('baixas', { previsto_id: ocorrencia.previsto_id, ref: ocorrencia.ref, status: 'baixado', lancamento_id: salvo.id, nova_data: '', criado_em: new Date().toISOString() });
      fecharFolha();
      toast(`${salvo.descricao} lançado e marcado como ${salvo.tipo === 'entrada' ? 'recebido' : 'pago'}`);
      return;
    }
    if (!editando && !salvo.previsto_id && !salvo.id_externo) {
      const occs = matchCandidates({ ...s.tables, hoje: s.hoje, lanc: salvo });
      const m = findMatch(salvo, occs);
      if (m) {
        abrirFolha('baixa', { lanc: salvo, occ: m });
        return;
      }
    }
    fecharFolha();
    toast(editando ? 'Lançamento atualizado' : salvo.id_externo?.startsWith('dizimo:') ? 'Lançamento salvo e contado como dízimo pago' : 'Lançamento salvo');
  };

  const apagar = async () => {
    fecharFolha();
    await apagarLancamento(lanc.id);
  };

  // Vários de uma vez: conta e dia em comum (cada um pode ter os seus, vindos da frase).
  const setItem = (i, p) => setVarios((xs) => xs.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const faltaVarios = varios ? varios.filter((x) => !(parseBRL(x.valor) > 0) || !x.conta_id || (x.tipo !== 'transferencia' && !x.origem)).length : 0;
  const salvarVarios = async () => {
    setTentouSalvar(true);
    if (faltaVarios) return;
    setSalvando(true);
    try {
      for (const x of varios) {
        await salvar('lancamentos', comDizimo({
          tipo: x.tipo, valor: parseBRL(x.valor), descricao: x.descricao.trim() || (s.tables.categorias.find((c) => c.id === x.categoria_id)?.nome ?? ''),
          data: x.data, conta_id: x.conta_id, conta_destino_id: '', categoria_id: x.categoria_id, origem: x.origem, canal: 'voz', id_externo: '', previsto_id: '',
        }, s.hoje));
      }
      fecharFolha();
      toast(`${varios.length} lançamentos salvos`);
    } catch {
      setSalvando(false);
    }
  };
  const salvarUm = async () => {
    setSalvando(true);
    try {
      await salvarLanc();
    } finally {
      setSalvando(false);
    }
  };
  const rodape = varios
    ? html`<button class=${`btn btn-pri ${salvando ? 'carregando' : ''}`} disabled=${salvando} onClick=${salvarVarios}>${salvando ? 'Salvando…' : `Salvar ${varios.length} lançamentos`}</button>`
    : html`
    ${editando && html`<button class="btn btn-perigo" style="flex:0 0 auto" onClick=${apagar} aria-label="Apagar lançamento"><${Icone} n="lixo" /></button>`}
    <button class=${`btn btn-pri ${salvando ? 'carregando' : ''}`} disabled=${salvando} onClick=${salvarUm}>${salvando ? 'Salvando…' : editando ? 'Salvar alterações' : 'Salvar lançamento'}</button>`;

  return html`<${Folha} titulo=${editando ? 'Editar lançamento' : 'Novo lançamento'} rodape=${rodape}>
    ${!editando && !inicial && html`<div class="modos" role="group" aria-label="Como lançar">
      <button class="modo" aria-pressed=${String(modo === 'falar')} onClick=${() => setModo('falar')}><${Icone} n="mic" />Falar ou escrever</button>
      <button class="modo" onClick=${() => abrirFolha('leitura')}><${Icone} n="camera" />Foto ou print</button>
      <button class="modo" aria-pressed=${String(modo === 'digitar')} onClick=${() => setModo('digitar')}><${Icone} n="teclado" />Formulário</button>
    </div>`}

    ${modo === 'falar' && !editando && html`<div>
      <div class="fala">
        <textarea rows="2" placeholder="Ex.: gastei 87,50 no mercado pro pudim no nubank pj" value=${frase}
          onInput=${(e) => setFrase(e.target.value)}
          onKeyDown=${(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); interpretar(frase); } }}></textarea>
        ${temVoz
          ? html`<button class=${`mic ${ouvindo ? 'ouvindo' : ''}`} onClick=${ouvir} aria-label=${ouvindo ? 'Parar de ouvir' : 'Falar'}><${Icone} n="mic" /></button>`
          : null}
      </div>
      <div class="acoes" style="margin-top:8px;justify-content:flex-end">
        <button class="btn btn-sec btn-mini" disabled=${!frase.trim()} onClick=${() => interpretar(frase)}>Preencher</button>
      </div>
    </div>`}

    ${varios && html`<div aria-label="Vários lançamentos">
      <div class="duvida"><${Icone} n="info" /><span>Entendi ${varios.length} lançamentos. Confira e salve todos de uma vez.</span></div>
      <ul class="lista painel varios-lanc" style="margin-top:10px">
        ${varios.map((x, i) => {
          const cats = s.tables.categorias.filter((c) => c.tipo === x.tipo && c.ativa !== false);
          return html`<li class="item varios-item">
            <div class="varios-linha">
              <select aria-label=${`Tipo do lançamento ${i + 1}`} value=${x.tipo} onChange=${(e) => setItem(i, { tipo: e.target.value, categoria_id: '' })}>
                <option value="saida">Saída</option><option value="entrada">Entrada</option></select>
              <input aria-label=${`Valor do lançamento ${i + 1}`} inputmode="decimal" value=${x.valor} onInput=${(e) => setItem(i, { valor: e.target.value })} aria-invalid=${tentouSalvar && !(parseBRL(x.valor) > 0)} />
              <button class="icone-btn" aria-label=${`Tirar lançamento ${i + 1}`} onClick=${() => setVarios((xs) => (xs.length > 2 ? xs.filter((_, j) => j !== i) : null))}><${Icone} n="fechar" /></button>
            </div>
            <input aria-label=${`Descrição do lançamento ${i + 1}`} value=${x.descricao} placeholder="Descrição" onInput=${(e) => setItem(i, { descricao: e.target.value })} />
            <div class="varios-linha">
              <select aria-label=${`Categoria do lançamento ${i + 1}`} value=${x.categoria_id} onChange=${(e) => {
                const c = s.tables.categorias.find((k) => k.id === e.target.value);
                setItem(i, { categoria_id: e.target.value, ...(c?.origem_padrao ? { origem: c.origem_padrao } : {}) });
              }}><option value="">Categoria</option>${cats.map((c) => html`<option value=${c.id}>${c.nome}</option>`)}</select>
              <select aria-label=${`Origem do lançamento ${i + 1}`} value=${x.origem} onChange=${(e) => setItem(i, { origem: e.target.value })} aria-invalid=${tentouSalvar && !x.origem}>
                <option value="">Origem</option>${ORIGENS.map((o) => html`<option value=${o}>${origemLabel(o)}</option>`)}</select>
            </div>
          </li>`;
        })}
      </ul>
      <div class="linha2">
        <${SelectConta} rotulo="Conta (de todos)" valor=${varios.every((x) => x.conta_id === varios[0].conta_id) ? varios[0].conta_id : ''} contas=${contas} onChange=${(c) => setVarios((xs) => xs.map((x) => ({ ...x, conta_id: c })))} />
        <${Campo} rotulo="Dia (de todos)"><input type="date" value=${varios[0].data} onInput=${(e) => setVarios((xs) => xs.map((x) => ({ ...x, data: e.target.value })))} /><//>
      </div>
      ${tentouSalvar && faltaVarios > 0 && html`<div class="duvida" role="alert"><${Icone} n="alerta" /><span>Falta valor, conta ou origem em ${faltaVarios} ${faltaVarios === 1 ? 'lançamento' : 'lançamentos'}.</span></div>`}
    </div>`}

    ${!varios && (modo === 'digitar' || interpretado || editando) && html`<div>
      ${interpretado && faltando.length > 0 && html`<div class="duvida"><${Icone} n="info" /><span>Confira antes de salvar: falta ${faltando.join(', ')}.</span></div>`}
      <div style="margin-top:12px">
        <${Segmento} classe="tipo" rotulo="Tipo" valor=${f.tipo} onChange=${(t) => set({ tipo: t, categoria_id: '' })}
          opcoes=${[['saida', 'Saída'], ['entrada', 'Entrada'], ['transferencia', 'Transferência']]} />
      </div>
      <label class="valor-grande">
        <span class="sr">Valor</span><span aria-hidden="true">R$</span>
        <input inputmode="decimal" placeholder="0,00" value=${f.valor} onInput=${(e) => set({ valor: e.target.value })}
          onBlur=${(e) => { const v = parseBRL(e.target.value); if (v > 0) set({ valor: valorTexto(v) }); }} aria-invalid=${tentouSalvar && !(valor > 0)} />
      </label>
      <${Campo} rotulo="Descrição">
        <input value=${f.descricao} placeholder=${f.tipo === 'transferencia' ? 'Ex.: Saque para o Itaú' : 'Ex.: Assaí, pudins da semana'} onInput=${(e) => set({ descricao: e.target.value })} />
      <//>
      <div class="linha2">
        <${SelectConta} rotulo=${f.tipo === 'transferencia' ? 'Sai de' : 'Conta'} valor=${f.conta_id} contas=${contas} onChange=${(v) => set({ conta_id: v })} />
        ${f.tipo === 'transferencia'
          ? html`<${SelectConta} rotulo="Entra em" valor=${f.conta_destino_id} contas=${contas} excluir=${f.conta_id} onChange=${(v) => set({ conta_destino_id: v })} />`
          : html`<${Campo} rotulo="Data"><input type="date" value=${f.data} onInput=${(e) => set({ data: e.target.value })} /><//>`}
      </div>
      ${f.tipo === 'transferencia' && html`<${Campo} rotulo="Data"><input type="date" value=${f.data} onInput=${(e) => set({ data: e.target.value })} /><//>`}
      ${f.tipo !== 'transferencia' && html`<div>
        <${SeletorCategoria} tipo=${f.tipo} valor=${f.categoria_id} onChange=${(id) => escolherCategoria(id)} />
        <div class="campo"><span>Origem</span>
          <${Chips} rotulo="Origem" valor=${f.origem} onChange=${(o) => { set({ origem: o }); setOrigemManual(true); }}
            opcoes=${ORIGENS.map((o) => [o, origemLabel(o)])} />
          <div class="ajuda">A origem decide o dízimo: Pudim e Hotmart entram no lucro da semana; Salário, Consultoria e YouTube, nos 10% do mês.</div>
        </div>
      </div>`}
      ${tentouSalvar && faltando.length > 0 && html`<div class="duvida" role="alert"><${Icone} n="alerta" /><span>Para salvar, preencha: ${faltando.join(', ')}.</span></div>`}
    </div>`}
  <//>`;
}

export function FolhaBaixa({ lanc, occ }) {
  const p = occ.previsto;
  const recebe = p.tipo === 'entrada';
  const parcela = occ.parcela ? ` (parcela ${occ.parcela.k}/${occ.parcela.n})` : '';
  const sim = async () => {
    await salvar('baixas', { previsto_id: p.id, ref: occ.ref, status: 'baixado', lancamento_id: lanc.id, nova_data: '', criado_em: new Date().toISOString() });
    await salvar('lancamentos', { ...lanc, previsto_id: p.id });
    fecharFolha();
    toast(`${p.descricao} marcado como ${recebe ? 'recebido' : 'pago'}`);
  };
  const nao = () => {
    fecharFolha();
    toast('Lançamento salvo');
  };
  return html`<${Folha} titulo="Esse lançamento já estava previsto?" onFechar=${nao}
    rodape=${html`<button class="btn btn-sec" onClick=${nao}>Não, é outro</button><button class="btn btn-pri" onClick=${sim}>Sim, é esse</button>`}>
    <p style="margin:4px 0 0;color:var(--ink-2)">
      É <strong>${p.descricao}${parcela}</strong>, previsto para ${fmtDay(occ.data)} com ${p.natureza === 'variavel' ? 'cerca de ' : ''}${brl(occ.valor)}?
    </p>
    <p class="muted" style="font-size:13.5px">Você lançou ${brl(toCents(lanc.valor))} em ${fmtDay(lanc.data)}. Se for esse, ele sai da lista de previstos e não conta duas vezes no Futuro.</p>
  <//>`;
}
