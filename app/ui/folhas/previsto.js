import { useState } from '../../vendor/hooks.module.js';
import { html } from '../html.js';
import { Icone } from '../icones.js';
import { Folha, Segmento, Chips, Campo } from '../componentes.js';
import { useStore, salvar, apagar, fecharFolha, abrirFolha, toast } from '../../data/store.js';
import { parseBRL, brl } from '../../core/money.js';
import { ORIGENS } from '../../core/schema.js';
import { addDays, fmtDay, monthName } from '../../core/dates.js';
import { contasAtivas, origemLabel, FREQUENCIAS } from '../derivados.js';
import { SelectConta } from './lancamento.js';
import { SeletorCategoria } from '../categorias.js';

const NATUREZAS = {
  saida: [['fixo', 'Fixo'], ['parcelado', 'Parcelado'], ['variavel', 'Variável'], ['unico', 'Uma vez']],
  entrada: [['fixo', 'Fixo'], ['variavel', 'Variável'], ['unico', 'Uma vez']],
  transferencia: [['fixo', 'Fixo'], ['unico', 'Uma vez']],
};

const AJUDA_NATUREZA = {
  fixo: 'Mesmo valor sempre, sem data para acabar. Ex.: aluguel, internet, Katsuhiro.',
  parcelado: 'Valor fixo com número de parcelas. Para sozinho na última. Ex.: empréstimo.',
  variavel: 'Muda todo período. O Futuro usa a média dos 3 últimos valores reais. Ex.: luz, água, YouTube.',
  unico: 'Acontece uma vez numa data. Ex.: IPVA, matrícula.',
};

const MESES = Array.from({ length: 12 }, (_, i) => [String(i + 1), monthName(`2000-${String(i + 1).padStart(2, '0')}`)]);

export function FolhaPrevisto({ previsto, inicial }) {
  const s = useStore();
  const editando = !!previsto;
  const base = previsto || {
    tipo: 'saida', natureza: 'fixo', descricao: '', valor: '', conta_id: '', conta_destino_id: '', categoria_id: '', origem: 'Casa',
    recorrencia: 'meses', a_cada: 1, mes_ancora: String(Number(s.hoje.slice(5, 7))), dia_inicio: Number(s.hoje.slice(8, 10)), dia_fim: '',
    dia_semana: 1, data_unica: s.hoje, inicio: s.hoje, parcelas_total: '', parcela_no_inicio: 1, confianca: 'certo', renovacao: false, pessoa: '', ativo: true,
    ...(inicial || {}),
  };
  const [f, setF] = useState({ ...base, valor: base.valor === '' ? '' : String(base.valor).replace('.', ','), janela: !!base.dia_fim && Number(base.dia_fim) !== Number(base.dia_inicio) });
  const [tentou, setTentou] = useState(false);
  const set = (patch) => setF((x) => ({ ...x, ...patch }));
  const contas = contasAtivas(s);
  const cats = s.tables.categorias.filter((c) => c.tipo === f.tipo && c.ativa !== false);
  const freq = f.recorrencia === 'semanal' ? 'semanal' : String(f.a_cada || 1);
  const valor = parseBRL(f.valor);

  const faltando = [];
  if (!f.descricao.trim()) faltando.push('descrição');
  if (!(valor > 0)) faltando.push('valor');
  if (!f.conta_id) faltando.push('conta');
  if (f.tipo === 'transferencia' && !f.conta_destino_id) faltando.push('conta de destino');
  if (f.natureza === 'parcelado' && !(Number(f.parcelas_total) > 0)) faltando.push('total de parcelas');
  if (f.natureza === 'parcelado' && Number(f.parcela_no_inicio) > Number(f.parcelas_total)) faltando.push('parcela atual menor que o total');
  if (f.natureza === 'unico' && !f.data_unica) faltando.push('data');

  const guardar = async () => {
    setTentou(true);
    if (faltando.length) return;
    const ini = Number(f.dia_inicio || 1);
    const linha = {
      ...(previsto || {}),
      descricao: f.descricao.trim(),
      natureza: f.natureza,
      tipo: f.tipo,
      valor,
      conta_id: f.conta_id,
      conta_destino_id: f.tipo === 'transferencia' ? f.conta_destino_id : '',
      categoria_id: f.tipo === 'transferencia' ? '' : f.categoria_id,
      origem: f.tipo === 'transferencia' ? '' : f.origem,
      recorrencia: freq === 'semanal' ? 'semanal' : 'meses',
      a_cada: freq === 'semanal' ? 1 : Number(freq),
      mes_ancora: Number(freq) > 1 ? Number(f.mes_ancora) : '',
      dia_inicio: ini,
      dia_fim: f.janela ? Math.max(ini, Number(f.dia_fim || ini)) : '',
      dia_semana: freq === 'semanal' ? Number(f.dia_semana) : '',
      data_unica: f.natureza === 'unico' ? f.data_unica : '',
      inicio: f.inicio || s.hoje,
      parcelas_total: f.natureza === 'parcelado' ? Number(f.parcelas_total) : '',
      parcela_no_inicio: f.natureza === 'parcelado' ? Number(f.parcela_no_inicio || 1) : '',
      confianca: f.tipo === 'entrada' ? (f.renovacao ? 'provavel' : f.confianca) : 'certo',
      renovacao: f.tipo === 'entrada' && Number(freq) === 12 ? !!f.renovacao : false,
      pessoa: f.pessoa || '',
      ativo: f.ativo !== false,
    };
    try {
      await salvar('previstos', linha);
    } catch {
      return;
    }
    fecharFolha();
    toast(editando ? 'Previsto atualizado' : 'Previsto criado. Ele já aparece no Futuro.');
  };

  const remover = async () => {
    fecharFolha();
    const linha = await apagar('previstos', previsto.id);
    toast('Previsto apagado', { acao: 'Desfazer', onAcao: () => salvar('previstos', linha) });
  };

  const naturezas = NATUREZAS[f.tipo];
  const ehUnico = f.natureza === 'unico';

  return html`<${Folha} titulo=${editando ? 'Editar previsto' : 'Novo previsto'}
    rodape=${html`${editando && html`<button class="btn btn-perigo" style="flex:0 0 auto" onClick=${remover} aria-label="Apagar previsto"><${Icone} n="lixo" /></button>`}
      <button class="btn btn-pri" onClick=${guardar}>${editando ? 'Salvar alterações' : 'Criar previsto'}</button>`}>
    <${Segmento} classe="tipo" rotulo="Tipo" valor=${f.tipo}
      onChange=${(t) => set({ tipo: t, categoria_id: '', natureza: NATUREZAS[t].some(([v]) => v === f.natureza) ? f.natureza : 'fixo', origem: t === 'entrada' ? 'Consultoria' : 'Casa' })}
      opcoes=${[['saida', 'Gasto'], ['entrada', 'A receber'], ['transferencia', 'Transferência']]} />
    <div style="margin-top:10px">
      <${Segmento} rotulo="Natureza" valor=${f.natureza} onChange=${(n) => set({ natureza: n })} opcoes=${naturezas} />
      <div class="ajuda muted" style="font-size:12.5px;margin-top:6px">${AJUDA_NATUREZA[f.natureza]}</div>
    </div>

    <${Campo} rotulo=${f.tipo === 'entrada' ? 'Quem paga ou o que é' : 'Descrição'}>
      <input value=${f.descricao} placeholder=${f.tipo === 'entrada' ? 'Ex.: Katsuhiro, YouTube' : 'Ex.: Aluguel, Empréstimo Itaú'} onInput=${(e) => set({ descricao: e.target.value })} />
    <//>
    <div class="linha2">
      <${Campo} rotulo=${f.natureza === 'variavel' ? 'Valor estimado' : f.natureza === 'parcelado' ? 'Valor da parcela' : 'Valor'}>
        <input inputmode="decimal" placeholder="0,00" value=${f.valor} onInput=${(e) => set({ valor: e.target.value })} />
      <//>
      <${SelectConta} valor=${f.conta_id} contas=${contas} rotulo=${f.tipo === 'transferencia' ? 'Sai de' : 'Conta'} onChange=${(v) => set({ conta_id: v })} />
    </div>
    ${f.tipo === 'transferencia' && html`<${SelectConta} rotulo="Entra em" valor=${f.conta_destino_id} contas=${contas} excluir=${f.conta_id} onChange=${(v) => set({ conta_destino_id: v })} />`}

    ${ehUnico
      ? html`<${Campo} rotulo="Data"><input type="date" value=${f.data_unica} onInput=${(e) => set({ data_unica: e.target.value })} /><//>`
      : html`<div>
        <${Campo} rotulo="Frequência">
          <select aria-label="Frequência" value=${freq} onChange=${(e) => set(e.target.value === 'semanal' ? { recorrencia: 'semanal' } : { recorrencia: 'meses', a_cada: Number(e.target.value) })}>
            ${FREQUENCIAS.filter(([v]) => f.natureza !== 'parcelado' || v !== 'semanal').map(([v, t]) => html`<option value=${v}>${t}</option>`)}
          </select>
        <//>
        ${freq === 'semanal'
          ? html`<${Campo} rotulo="Dia da semana">
              <select aria-label="Dia da semana" value=${String(f.dia_semana)} onChange=${(e) => set({ dia_semana: e.target.value })}>
                ${['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'].map((d, i) => html`<option value=${String(i)}>${d}</option>`)}
              </select><//>`
          : html`<div>
            ${Number(freq) > 1 && html`<${Campo} rotulo=${Number(freq) === 12 ? 'Mês' : 'Um dos meses em que cai'}>
              <select aria-label="Mês" value=${String(f.mes_ancora)} onChange=${(e) => set({ mes_ancora: e.target.value })}>
                ${MESES.map(([v, t]) => html`<option value=${v}>${t}</option>`)}
              </select><//>`}
            <div class="linha2">
              <${Campo} rotulo=${f.janela ? 'Entre o dia' : 'Dia do mês'}><input type="number" min="1" max="31" inputmode="numeric" value=${f.dia_inicio} onInput=${(e) => set({ dia_inicio: e.target.value })} /><//>
              ${f.janela
                ? html`<${Campo} rotulo="E o dia"><input type="number" min="1" max="31" inputmode="numeric" value=${f.dia_fim} onInput=${(e) => set({ dia_fim: e.target.value })} /><//>`
                : html`<div class="campo"><span> </span><button type="button" class="btn btn-sec btn-larga" style="padding:12px" onClick=${() => set({ janela: true, dia_fim: Number(f.dia_inicio || 1) + 2 })}>Varia uns dias</button></div>`}
            </div>
            ${f.janela && html`<div class="ajuda muted" style="font-size:12.5px;margin-top:6px">O Futuro conta no último dia da janela. Se cair antes, melhor.
              <button class="btn btn-txt btn-mini" onClick=${() => set({ janela: false, dia_fim: '' })}>Usar dia fixo</button></div>`}
          </div>`}
        ${f.natureza === 'parcelado' && html`<div class="linha2">
          <${Campo} rotulo="Parcela atual"><input type="number" min="1" inputmode="numeric" value=${f.parcela_no_inicio} onInput=${(e) => set({ parcela_no_inicio: e.target.value })} /><//>
          <${Campo} rotulo="Total de parcelas"><input type="number" min="1" inputmode="numeric" value=${f.parcelas_total} onInput=${(e) => set({ parcelas_total: e.target.value })} /><//>
        </div>`}
        <${Campo} rotulo=${f.natureza === 'parcelado' ? 'A parcela atual vence a partir de' : 'Começa em'} ajuda="Ocorrências antes desta data são ignoradas.">
          <input type="date" value=${f.inicio} onInput=${(e) => set({ inicio: e.target.value })} />
        <//>
      </div>`}

    ${f.tipo !== 'transferencia' && html`<div>
      <${SeletorCategoria} tipo=${f.tipo} valor=${f.categoria_id} onChange=${(id, c) => set({ categoria_id: id, ...(c?.origem_padrao ? { origem: c.origem_padrao } : {}) })} />
      <div class="campo"><span>Origem</span><${Chips} rotulo="Origem" valor=${f.origem} onChange=${(o) => set({ origem: o })} opcoes=${ORIGENS.map((o) => [o, origemLabel(o)])} /></div>
    </div>`}

    ${f.tipo === 'entrada' && html`<div>
      ${Number(freq) === 12 && !ehUnico && html`<label class="interruptor"><span>É renovação de contrato<br /><small class="muted" style="font-weight:500">Avisa 30 dias antes e só conta como certo depois que você confirmar.</small></span>
        <input type="checkbox" checked=${!!f.renovacao} onChange=${(e) => set({ renovacao: e.target.checked })} /></label>`}
      ${!f.renovacao && html`<div class="campo"><span>Com que certeza entra?</span>
        <${Segmento} rotulo="Confiança" valor=${f.confianca} onChange=${(c) => set({ confianca: c })} opcoes=${[['certo', 'Certo'], ['provavel', 'Provável']]} />
        <div class="ajuda">Certo entra na conta de "quanto preciso fazer". Provável aparece à parte, na linha tracejada.</div></div>`}
    </div>`}

    ${editando && html`<label class="interruptor"><span>Ativo</span><input type="checkbox" checked=${f.ativo !== false} onChange=${(e) => set({ ativo: e.target.checked })} /></label>`}
    ${tentou && faltando.length > 0 && html`<div class="duvida" role="alert"><${Icone} n="alerta" /><span>Para salvar, preencha: ${faltando.join(', ')}.</span></div>`}
  <//>`;
}

// Ações sobre uma ocorrência prevista: lançar, adiar, pular, confirmar renovação.
export function FolhaOcorrencia({ occ }) {
  const s = useStore();
  const p = occ.previsto;
  const recebe = p.tipo === 'entrada';
  const [adiando, setAdiando] = useState(false);
  const [novaData, setNovaData] = useState(addDays(s.hoje, 3));
  const baixa = (status, extra = {}) =>
    salvar('baixas', { id: occ.baixa?.id, previsto_id: p.id, ref: occ.ref, status, lancamento_id: '', nova_data: '', criado_em: new Date().toISOString(), ...extra });

  const lancar = () => {
    abrirFolha('lancamento', {
      inicial: { tipo: p.tipo, valor: occ.valor / 100, descricao: p.descricao, data: s.hoje, conta_id: p.conta_id, conta_destino_id: p.conta_destino_id, categoria_id: p.categoria_id, origem: p.origem },
      ocorrencia: { previsto_id: p.id, ref: occ.ref },
    });
  };
  const adiar = async () => {
    await baixa('adiado', { nova_data: novaData });
    fecharFolha();
    toast(`${p.descricao} reagendado para ${fmtDay(novaData)}`);
  };
  const pular = async () => {
    await baixa('pulado');
    fecharFolha();
    toast(`${p.descricao} de ${fmtDay(occ.data)} saiu da previsão`, { acao: 'Desfazer', onAcao: () => apagarBaixa(p.id, occ.ref) });
  };
  const renovou = async () => {
    await baixa('renovou');
    fecharFolha();
    toast(`${p.descricao} confirmado. Agora conta como certo.`);
  };
  const naoRenovou = async () => {
    await baixa('pulado');
    await salvar('previstos', { ...p, ativo: false });
    fecharFolha();
    toast(`${p.descricao} não renovou e saiu da previsão`);
  };
  const apagarBaixa = async (pid, ref) => {
    const b = s.tables.baixas.find((x) => x.previsto_id === pid && x.ref === ref);
    if (b) await apagar('baixas', b.id);
  };

  const parcela = occ.parcela ? ` · parcela ${occ.parcela.k}/${occ.parcela.n}` : '';
  return html`<${Folha} titulo=${p.descricao}>
    <p style="margin:0 0 6px;color:var(--ink-2)">${recebe ? 'A receber' : 'A pagar'} ${p.natureza === 'variavel' ? '≈ ' : ''}<strong>${brl(occ.valor)}</strong> em ${fmtDay(occ.data)}${parcela}.
      ${occ.atrasado && html` <span class="etiqueta atraso">Atrasado</span>`}
      ${occ.confianca !== 'certo' && html` <span class="etiqueta prov">Provável</span>`}</p>
    <div style="display:grid;gap:8px;margin-top:14px">
      ${p.renovacao && !occ.baixa
        ? html`<button class="btn btn-pri" onClick=${renovou}>Renovou, contar como certo</button>
          <button class="btn btn-sec" onClick=${naoRenovou}>Não renovou</button>`
        : null}
      <button class=${`btn ${p.renovacao && !occ.baixa ? 'btn-sec' : 'btn-pri'}`} onClick=${lancar}>${recebe ? 'Recebi, lançar agora' : 'Paguei, lançar agora'}</button>
      ${!adiando
        ? html`<button class="btn btn-sec" onClick=${() => setAdiando(true)}>${recebe ? 'Ainda vai pagar, mudar a data' : 'Mudar a data'}</button>`
        : html`<div class="painel painel-pad"><${Campo} rotulo="Nova data"><input type="date" value=${novaData} onInput=${(e) => setNovaData(e.target.value)} /><//>
            <button class="btn btn-pri btn-larga" style="margin-top:10px" onClick=${adiar}>Reagendar</button></div>`}
      <button class="btn btn-sec" onClick=${pular}>${recebe ? 'Não vai pagar desta vez' : 'Pular esta vez'}</button>
      <button class="btn btn-txt" onClick=${() => abrirFolha('previsto', { previsto: p })}>Editar o previsto</button>
    </div>
  <//>`;
}
