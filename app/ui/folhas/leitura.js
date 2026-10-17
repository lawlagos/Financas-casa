import { useEffect, useState } from '../../vendor/hooks.module.js';
import { html } from '../html.js';
import { Icone } from '../icones.js';
import { Folha, Segmento, Chips, Campo } from '../componentes.js';
import { useStore, salvar, fecharFolha, abrirFolha, toast, interpretarImagem } from '../../data/store.js';
import { ORIGENS, uid } from '../../core/schema.js';
import { brl, parseBRL } from '../../core/money.js';
import { montarContexto, conferirLeitura, pendenciasLancamento, resumoNota, lancamentosDaNota } from '../../core/leitura.js';
import { findMatch, matchCandidates } from '../../core/planning.js';
import { contasAtivas, origemLabel } from '../derivados.js';
import { prepararImagem } from '../imagem.js';
import { SelectConta } from './lancamento.js';

const valorTexto = (v) => (v ? Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '');

function EditorLancamento({ l, set, contas, categorias }) {
  const cats = categorias.filter((c) => c.tipo === l.tipo && c.ativa !== false);
  const pend = pendenciasLancamento(l);
  return html`<div class="painel painel-pad" style=${`margin-top:10px;${l.salvar ? '' : 'opacity:.55'}`}>
    <label class="interruptor" style="margin-top:0"><span>${l.descricao || 'Lançamento'}${l.valor ? ` · ${brl(Math.round(l.valor * 100))}` : ''}</span>
      <input type="checkbox" checked=${l.salvar} onChange=${(e) => set({ salvar: e.target.checked })} aria-label="Salvar este lançamento" /></label>
    ${l.salvar && html`<div>
      ${l.duvidaIa && html`<div class="duvida"><${Icone} n="info" /><span>${l.duvidaIa}</span></div>`}
      <div style="margin-top:10px"><${Segmento} classe="tipo" rotulo="Tipo" valor=${l.tipo} onChange=${(t) => set({ tipo: t, categoria_id: '', conta_destino_id: '' })}
        opcoes=${[['saida', 'Saída'], ['entrada', 'Entrada'], ['transferencia', 'Transferência']]} /></div>
      <div class="linha2">
        <${Campo} rotulo="Valor"><input inputmode="decimal" value=${valorTexto(l.valor)} onChange=${(e) => set({ valor: parseBRL(e.target.value) || null })} /><//>
        <${Campo} rotulo="Data"><input type="date" value=${l.data} onInput=${(e) => set({ data: e.target.value, dataLida: true })} /><//>
      </div>
      <${Campo} rotulo="Descrição"><input value=${l.descricao} onInput=${(e) => set({ descricao: e.target.value })} /><//>
      <div class="linha2">
        <${SelectConta} rotulo=${l.tipo === 'transferencia' ? 'Sai de' : 'Conta'} valor=${l.conta_id} contas=${contas} onChange=${(v) => set({ conta_id: v })} />
        ${l.tipo === 'transferencia'
          ? html`<${SelectConta} rotulo="Entra em" valor=${l.conta_destino_id} contas=${contas} excluir=${l.conta_id} onChange=${(v) => set({ conta_destino_id: v })} />`
          : html`<${Campo} rotulo="Categoria"><select aria-label="Categoria" value=${l.categoria_id} onChange=${(e) => {
              const c = cats.find((x) => x.id === e.target.value);
              set({ categoria_id: e.target.value, ...(c?.origem_padrao && !l.origem ? { origem: c.origem_padrao } : {}) });
            }}><option value="">Sem categoria</option>${cats.map((c) => html`<option value=${c.id}>${c.nome}</option>`)}</select><//>`}
      </div>
      ${l.tipo !== 'transferencia' && html`<div class="campo"><span>Origem</span><${Chips} rotulo="Origem" valor=${l.origem} onChange=${(o) => set({ origem: o })} opcoes=${ORIGENS.map((o) => [o, origemLabel(o)])} /></div>`}
      ${pend.length > 0 && html`<div class="duvida" role="alert"><${Icone} n="alerta" /><span>❓ Falta: ${pend.join(', ')}.</span></div>`}
    </div>`}
  </div>`;
}

function RevisarNota({ nota, setNota, contas }) {
  const r = resumoNota(nota, { diferencaEm: nota.diferencaEm });
  const setItem = (i, patch) => setNota({ ...nota, itens: nota.itens.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
  const todos = (origem) => setNota({ ...nota, itens: nota.itens.map((x) => ({ ...x, origem })) });
  return html`<div>
    <div class="linha2">
      <${Campo} rotulo="Mercado"><input value=${nota.estabelecimento} onInput=${(e) => setNota({ ...nota, estabelecimento: e.target.value })} /><//>
      <${Campo} rotulo="Data"><input type="date" value=${nota.data} onInput=${(e) => setNota({ ...nota, data: e.target.value, dataLida: true })} /><//>
    </div>
    <${SelectConta} rotulo="Pago com" valor=${nota.conta_id} contas=${contas} onChange=${(v) => setNota({ ...nota, conta_id: v })} />
    <div class="secao-cab" style="margin-top:16px"><h2 style="font-size:16px">Itens (${nota.itens.length})</h2>
      <span class="acoes"><button class="btn btn-sec btn-mini" onClick=${() => todos('Pudim')}>Tudo pudim</button><button class="btn btn-sec btn-mini" onClick=${() => todos('Casa')}>Tudo casa</button></span></div>
    <ul class="lista painel">
      ${nota.itens.map((it, i) => html`<li class="item" style="flex-wrap:wrap">
        <div class="corpo quebra"><div class="tit">${!it.origem || it.duvidaIa ? '❓ ' : '✅ '}${it.descricao || 'Item'}</div>
          <div class="meta">${it.quantidade > 1 ? `${it.quantidade} un · ` : ''}${it.valor ? brl(Math.round(it.valor * 100)) : 'valor ilegível'}${it.duvidaIa ? ` · ${it.duvidaIa}` : ''}</div></div>
        <div class="segmento" role="group" aria-label=${`Origem de ${it.descricao}`} style="flex:0 0 auto">
          ${['Pudim', 'Casa'].map((o) => html`<button type="button" aria-pressed=${String(it.origem === o)} onClick=${() => setItem(i, { origem: o, duvidaIa: '' })}>${o}</button>`)}
        </div>
      </li>`)}
    </ul>
    <div class="painel painel-pad" style="margin-top:10px">
      <div style="display:flex;justify-content:space-between"><span>Parte do pudim</span><strong>${brl(r.soma.Pudim)}</strong></div>
      <div style="display:flex;justify-content:space-between;margin-top:6px"><span>Parte da casa</span><strong>${brl(r.soma.Casa)}</strong></div>
      ${r.total !== null && html`<div class="muted" style="font-size:13px;margin-top:6px">Total da nota: ${brl(r.total)}</div>`}
    </div>
    ${r.diferenca !== 0 && html`<div class="duvida"><${Icone} n="alerta" /><span>A soma dos itens (${brl(r.somaItens)}) é diferente do total da nota (${brl(r.total)}). Onde lançar a diferença de ${brl(Math.abs(r.diferenca))}?
      <span class="acoes" style="margin-top:8px">${[['Casa', 'Na casa'], ['Pudim', 'No pudim'], ['', 'Ignorar']].map(([v, t]) => html`<button class="btn btn-mini ${nota.diferencaEm === v ? 'btn-pri' : 'btn-sec'}" onClick=${() => setNota({ ...nota, diferencaEm: v })}>${t}</button>`)}</span></span></div>`}
  </div>`;
}

export function FolhaLeitura() {
  const s = useStore();
  const contas = contasAtivas(s);
  const [etapa, setEtapa] = useState('escolher');
  const [previa, setPrevia] = useState(null);
  const [erro, setErro] = useState('');
  const [lancs, setLancs] = useState([]);
  const [nota, setNota] = useState(null);
  const [salvando, setSalvando] = useState(false);

  const ler = async (arquivo) => {
    if (!arquivo || !arquivo.type?.startsWith('image/')) return;
    setErro('');
    setEtapa('lendo');
    try {
      const img = await prepararImagem(arquivo);
      setPrevia(img.previa);
      const resp = await interpretarImagem({ imagem: img.imagem, mime: img.mime, contexto: montarContexto(s.tables, s.hoje) });
      const r = conferirLeitura(resp, s.tables, s.hoje);
      if (r.tipo === 'nota' && r.itens.length) {
        const ultimaNota = [...s.tables.lancamentos].reverse().find((l) => l.canal === 'foto' && l.grupo_id);
        setNota({ ...r, conta_id: ultimaNota?.conta_id || '', diferencaEm: 'Casa' });
        setLancs([]);
      } else if (r.lancamentos.length) {
        setLancs(r.lancamentos);
        setNota(null);
      } else {
        throw new Error('Não encontrei nenhum valor nesse print. Tente uma imagem mais nítida ou lance pelo formulário.');
      }
      setEtapa('revisar');
    } catch (e) {
      setErro(e.message || 'Não deu para ler o print.');
      setEtapa('erro');
    }
  };

  useEffect(() => {
    const colar = (e) => {
      const f = [...(e.clipboardData?.files || [])].find((x) => x.type.startsWith('image/'));
      if (f && etapa !== 'lendo') ler(f);
    };
    document.addEventListener('paste', colar);
    return () => document.removeEventListener('paste', colar);
  }, [etapa]);

  const aSalvar = nota
    ? (nota.conta_id ? lancamentosDaNota(nota, { conta_id: nota.conta_id, data: nota.data, diferencaEm: nota.diferencaEm }) : [])
    : lancs.filter((l) => l.salvar);
  const pendencias = nota
    ? [!nota.conta_id && 'a conta', resumoNota(nota).semOrigem && `${resumoNota(nota).semOrigem} ${resumoNota(nota).semOrigem === 1 ? 'item sem' : 'itens sem'} pudim/casa`, !nota.dataLida && 'confirmar a data'].filter(Boolean)
    : lancs.filter((l) => l.salvar).flatMap(pendenciasLancamento);

  const gravar = async () => {
    if (pendencias.length || !aSalvar.length) return;
    setSalvando(true);
    const grupo = nota ? uid('nota') : '';
    const salvos = [];
    try {
      for (const l of aSalvar) {
        salvos.push(await salvar('lancamentos', {
          tipo: l.tipo, valor: l.valor, data: l.data, conta_id: l.conta_id, conta_destino_id: l.conta_destino_id || '',
          categoria_id: l.tipo === 'transferencia' ? '' : l.categoria_id || '', origem: l.tipo === 'transferencia' ? '' : l.origem,
          descricao: (l.detalhe ? `${l.descricao}: ${l.detalhe}` : l.descricao).slice(0, 140) || 'Lançamento por print',
          canal: 'foto', grupo_id: grupo, id_externo: '', previsto_id: '',
        }));
      }
    } catch {
      setSalvando(false);
      return;
    }
    if (salvos.length === 1) {
      const m = findMatch(salvos[0], matchCandidates({ ...s.tables, hoje: s.hoje, lanc: salvos[0] }));
      if (m) return abrirFolha('baixa', { lanc: salvos[0], occ: m });
    }
    fecharFolha();
    toast(salvos.length === 1 ? 'Lançamento salvo' : `${salvos.length} lançamentos salvos`);
  };

  const resumo = nota ? resumoNota(nota, { diferencaEm: nota.diferencaEm }) : null;
  const qtd = nota ? (resumo.soma.Pudim > 0 ? 1 : 0) + (resumo.soma.Casa > 0 ? 1 : 0) : aSalvar.length;
  const rodape = etapa === 'revisar'
    ? html`<button class="btn btn-pri" disabled=${salvando || pendencias.length > 0 || !aSalvar.length} onClick=${gravar}>
        ${salvando ? 'Salvando…' : qtd > 1 ? `Salvar ${qtd} lançamentos` : 'Salvar lançamento'}</button>`
    : null;

  return html`<${Folha} titulo="Lançar por foto ou print" rodape=${rodape}>
    ${etapa === 'escolher' && html`<label class="painel" style="display:flex;flex-direction:column;align-items:center;gap:10px;padding:28px 16px;text-align:center;cursor:pointer;border-style:dashed">
      <span style="width:40px;height:40px;color:var(--caramel)"><${Icone} n="camera" /></span>
      <strong>Tirar foto ou escolher um print</strong>
      <span class="muted" style="font-size:13.5px">Comprovante de Pix, nota de mercado ou extrato. No computador, você também pode colar o print aqui (Ctrl+V).</span>
      <input id="leitura-arquivo" type="file" accept="image/*" class="sr" onChange=${(e) => ler(e.target.files?.[0])} />
    </label>`}
    ${etapa === 'lendo' && html`<div class="vazio">${previa && html`<img src=${previa} alt="Print enviado" style="max-height:180px;border-radius:12px;margin-bottom:12px" />`}<strong>Lendo o print…</strong>Isso leva uns segundos.</div>`}
    ${etapa === 'erro' && html`<div>
      <div class="duvida" role="alert"><${Icone} n="alerta" /><span>${erro}</span></div>
      <div class="acoes" style="margin-top:12px">
        <button class="btn btn-sec" onClick=${() => setEtapa('escolher')}>Tentar outra imagem</button>
        <button class="btn btn-sec" onClick=${() => abrirFolha('lancamento', {})}>Lançar pelo formulário</button>
      </div>
    </div>`}
    ${etapa === 'revisar' && html`<div>
      ${previa && html`<details><summary class="muted" style="font-size:13px;cursor:pointer">Ver o print</summary><img src=${previa} alt="Print lido" style="max-width:100%;border-radius:12px;margin-top:8px" /></details>`}
      ${nota
        ? html`<${RevisarNota} nota=${nota} setNota=${setNota} contas=${contas} />`
        : lancs.map((l, i) => html`<${EditorLancamento} key=${l.chave} l=${l} contas=${contas} categorias=${s.tables.categorias}
            set=${(patch) => setLancs((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)))} />`)}
      ${pendencias.length > 0 && html`<p class="muted" style="font-size:13px;margin:12px 2px 0">Para salvar, responda: ${[...new Set(pendencias)].join(', ')}.</p>`}
    </div>`}
  <//>`;
}
