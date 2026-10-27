import { useEffect, useState } from '../../vendor/hooks.module.js';
import { html } from '../html.js';
import { Icone } from '../icones.js';
import { Folha, Segmento, Chips, Campo } from '../componentes.js';
import { useStore, salvar, salvarVarias, fecharFolha, abrirFolha, toast, interpretarImagem } from '../../data/store.js';
import { ORIGENS, uid } from '../../core/schema.js';
import { brl, parseBRL } from '../../core/money.js';
import { montarContexto, conferirLeitura, pendenciasLancamento, resumoNota, lancamentosDaNota, itensDaNota, categoriasMaisUsadas } from '../../core/leitura.js';
import { SeletorCategoria, NovaCategoria } from '../categorias.js';
import { findMatch, matchCandidates } from '../../core/planning.js';
import { contasAtivas, origemLabel } from '../derivados.js';
import { EscolheCaixa } from '../caixa.js';
import { prepararImagem } from '../imagem.js';
import { CONFIG } from '../../config.js';
import { SelectConta } from './lancamento.js';
import { entradasDaCompra } from '../../data/pudim-acoes.js';

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
          : html`<${SeletorCategoria} tipo=${l.tipo} valor=${l.categoria_id} onChange=${(id, c) => set({ categoria_id: id, ...(c?.origem_padrao ? { origem: c.origem_padrao } : {}) })} />`}
      </div>
      ${l.tipo !== 'transferencia' && html`<${EscolheCaixa} tipo=${l.tipo} valor=${l.origem} onChange=${(o) => set({ origem: o })} explicar=${false} />`}
      ${pend.length > 0 && html`<div class="duvida" role="alert"><${Icone} n="alerta" /><span>❓ Falta: ${pend.join(', ')}.</span></div>`}
    </div>`}
  </div>`;
}

// Categoria que recebe a diferença entre a soma dos itens e o total: a escolhida, ou a maior da nota.
function diferencaEfetiva(nota) {
  if (nota.diferencaEm !== null && nota.diferencaEm !== undefined) return nota.diferencaEm;
  const base = resumoNota(nota, { diferencaEm: '' });
  return Object.entries(base.soma).sort((a, b) => b[1] - a[1])[0]?.[0] || 'cat-mercado';
}

function RevisarNota({ nota, setNota, contas, tables }) {
  const [novaPara, setNovaPara] = useState(null);
  const difEm = diferencaEfetiva(nota);
  const r = resumoNota(nota, { diferencaEm: difEm });
  const cats = Object.fromEntries(tables.categorias.map((c) => [c.id, c]));
  const rapidas = categoriasMaisUsadas(tables, 3);
  const setItem = (i, patch) => setNota({ ...nota, itens: nota.itens.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
  const semCategoria = (id) => setNota({ ...nota, itens: nota.itens.map((x) => (x.categoria_id ? x : { ...x, categoria_id: id, duvidaIa: '' })) });
  const nomeCat = (id) => (id ? `${cats[id]?.nome || '?'} (${origemLabel(cats[id]?.origem_padrao || 'Casa')})` : '');
  return html`<div>
    <div class="linha2">
      <${Campo} rotulo="Mercado"><input value=${nota.estabelecimento} onInput=${(e) => setNota({ ...nota, estabelecimento: e.target.value })} /><//>
      <${Campo} rotulo="Data"><input type="date" value=${nota.data} onInput=${(e) => setNota({ ...nota, data: e.target.value, dataLida: true })} /><//>
    </div>
    <${SelectConta} rotulo="Pago com" valor=${nota.conta_id} contas=${contas} onChange=${(v) => setNota({ ...nota, conta_id: v })} />
    <div class="secao-cab" style="margin-top:16px"><h2 style="font-size:16px">Itens (${nota.itens.length})</h2></div>
    ${r.semCategoria > 0 && html`<label class="campo" style="margin-top:0"><span>Colocar todos os itens sem categoria em</span>
      <select aria-label="Categoria dos itens sem categoria" value="" onChange=${(e) => e.target.value && semCategoria(e.target.value)}>
        <option value="">Escolha…</option>
        ${tables.categorias.filter((c) => c.tipo === 'saida' && c.ativa !== false && c.id !== 'cat-dizimo').map((c) => html`<option value=${c.id}>${nomeCat(c.id)}</option>`)}
      </select></label>`}
    <ul class="lista painel">
      ${nota.itens.map((it, i) => {
        const opcoes = rapidas.some((c) => c.id === it.categoria_id) || !it.categoria_id ? rapidas : [cats[it.categoria_id], ...rapidas.slice(0, 2)];
        return html`<li class="item" style="flex-direction:column;align-items:stretch;gap:8px">
          <div class="corpo quebra"><div class="tit">${!it.categoria_id || it.duvidaIa ? '❓ ' : '✅ '}${it.descricao || 'Item'}</div>
            <div class="meta">${it.quantidade !== 1 ? `${it.quantidade} ${it.unidade || 'un'} · ` : ''}${it.valor ? brl(Math.round(it.valor * 100)) : 'valor ilegível'}${it.duvidaIa ? ` · ${it.duvidaIa}` : ''}</div></div>
          <div class="chips compactos" role="group" aria-label=${`Categoria de ${it.descricao}`}>
            ${opcoes.filter(Boolean).map((c) => html`<button type="button" class="chip" aria-pressed=${String(it.categoria_id === c.id)} onClick=${() => setItem(i, { categoria_id: c.id, duvidaIa: '' })}>${c.nome}</button>`)}
            <select class="chip" aria-label=${`Outra categoria para ${it.descricao}`} value="" onChange=${(e) => { if (e.target.value === '__nova') setNovaPara(i); else if (e.target.value) setItem(i, { categoria_id: e.target.value, duvidaIa: '' }); }}>
              <option value="">Outra…</option>
              ${tables.categorias.filter((c) => c.tipo === 'saida' && c.ativa !== false && c.id !== 'cat-dizimo').map((c) => html`<option value=${c.id}>${c.nome}</option>`)}
              <option value="__nova">＋ Nova categoria…</option>
            </select>
          </div>
          ${novaPara === i && html`<${NovaCategoria} tipo="saida" onCancelar=${() => setNovaPara(null)} onCriada=${(c) => { setNovaPara(null); setItem(i, { categoria_id: c.id, duvidaIa: '' }); }} />`}
        </li>`;
      })}
    </ul>
    <div class="painel painel-pad" style="margin-top:10px">
      ${Object.entries(r.soma).filter(([, v]) => v).sort((a, b) => b[1] - a[1]).map(([id, v], k) => html`<div style=${`display:flex;justify-content:space-between;${k ? 'margin-top:6px' : ''}`}><span>${nomeCat(id)}</span><strong>${brl(v)}</strong></div>`)}
      ${r.total !== null && html`<div class="muted" style="font-size:13px;margin-top:6px">Total da nota: ${brl(r.total)}</div>`}
    </div>
    ${r.diferenca !== 0 && html`<div class="duvida"><${Icone} n="alerta" /><span>A soma dos itens (${brl(r.somaItens)}) é diferente do total da nota (${brl(r.total)}). A diferença de ${brl(Math.abs(r.diferenca))} vai para:
      <select aria-label="Categoria da diferença" style="margin-top:8px;width:100%" value=${difEm} onChange=${(e) => setNota({ ...nota, diferencaEm: e.target.value })}>
        ${tables.categorias.filter((c) => c.tipo === 'saida' && c.ativa !== false && c.id !== 'cat-dizimo').map((c) => html`<option value=${c.id}>${nomeCat(c.id)}</option>`)}
        <option value="">Ignorar a diferença</option>
      </select></span></div>`}
  </div>`;
}

const MAX_PRINTS = 5;

export function FolhaLeitura() {
  const s = useStore();
  const contas = contasAtivas(s);
  const [etapa, setEtapa] = useState('escolher');
  // Prints sendo lidos: [{ previa, estado: 'espera' | 'lendo' | 'ok' | 'erro', erro }]
  const [fila, setFila] = useState([]);
  const [erro, setErro] = useState('');
  const [avisos, setAvisos] = useState([]);
  const [lancs, setLancs] = useState([]);
  const [nota, setNota] = useState(null);
  // Notas de mercado que ainda vão ser revisadas (cada nota é revisada sozinha, depois dos outros prints).
  const [notasDepois, setNotasDepois] = useState([]);
  const [salvosAntes, setSalvosAntes] = useState(0);
  const [salvando, setSalvando] = useState(false);
  const previas = fila.filter((x) => x.previa);

  const ultimaNota = [...s.tables.lancamentos].reverse().find((l) => l.canal === 'foto' && l.grupo_id);
  const comoNota = (r) => ({ ...r, conta_id: ultimaNota?.conta_id || '', diferencaEm: null });

  // Lê até MAX_PRINTS de uma vez, dois por vez, mostrando o andamento de cada um.
  const ler = async (lista) => {
    const imagens = [...(lista || [])].filter((f) => f?.type?.startsWith('image/'));
    if (!imagens.length) return;
    const arquivos = imagens.slice(0, MAX_PRINTS);
    const extras = imagens.length - arquivos.length;
    setErro('');
    setEtapa('lendo');
    const estado = arquivos.map(() => ({ previa: '', estado: 'espera', erro: '' }));
    const mudar = (k, p) => {
      estado[k] = { ...estado[k], ...p };
      setFila([...estado]);
    };
    setFila([...estado]);
    const contexto = montarContexto(s.tables, s.hoje);
    const resultados = new Array(arquivos.length).fill(null);
    let proximo = 0;
    const trabalhar = async () => {
      while (proximo < arquivos.length) {
        const k = proximo++;
        try {
          mudar(k, { estado: 'lendo' });
          const img = await prepararImagem(arquivos[k]);
          mudar(k, { previa: img.previa });
          const resp = await interpretarImagem({ imagem: img.imagem, mime: img.mime, contexto });
          const r = conferirLeitura(resp, s.tables, s.hoje);
          if (!(r.tipo === 'nota' && r.itens.length) && !r.lancamentos.length) throw new Error('Não encontrei nenhum valor nesse print.');
          resultados[k] = r;
          mudar(k, { estado: 'ok' });
        } catch (e) {
          const msg = e.codigo === 'acao-invalida'
            ? `O servidor da planilha ainda está na versão antiga. Abra ${CONFIG.apiUrl} no navegador: se não aparecer "versao", a implantação que o app usa não foi atualizada (veja o passo a passo no chat).`
            : e.message || 'Não deu para ler o print.';
          mudar(k, { estado: 'erro', erro: msg });
        }
      }
    };
    await Promise.all([trabalhar(), trabalhar()]);

    const notas = [];
    const juntos = [];
    resultados.forEach((r, k) => {
      if (!r) return;
      if (r.tipo === 'nota' && r.itens.length) notas.push(comoNota(r));
      else for (const l of r.lancamentos) juntos.push({ ...l, chave: `p${k}-${l.chave}`, print: arquivos.length > 1 ? k + 1 : 0 });
    });
    const falhas = estado.map((x, k) => (x.estado === 'erro' ? { k, erro: x.erro } : null)).filter(Boolean);
    if (!juntos.length && !notas.length) {
      setErro(falhas.length === 1 ? falhas[0].erro : `Não deu para ler ${falhas.length === arquivos.length && arquivos.length > 1 ? 'nenhum dos prints' : 'o print'}. ${falhas[0]?.erro || ''} Tente uma imagem mais nítida ou lance pelo formulário.`);
      setEtapa('erro');
      return;
    }
    setAvisos([
      ...falhas.map((f) => `Print ${f.k + 1}: ${f.erro}`),
      ...(extras > 0 ? [`Mandei só os ${MAX_PRINTS} primeiros prints (de ${imagens.length}). Mande o resto depois.`] : []),
    ]);
    if (juntos.length) {
      setLancs(juntos);
      setNota(null);
      setNotasDepois(notas);
    } else {
      setNota(notas[0]);
      setLancs([]);
      setNotasDepois(notas.slice(1));
    }
    setEtapa('revisar');
  };

  useEffect(() => {
    const colar = (e) => {
      const fs = [...(e.clipboardData?.files || [])].filter((x) => x.type.startsWith('image/'));
      if (fs.length && etapa !== 'lendo') ler(fs);
    };
    document.addEventListener('paste', colar);
    return () => document.removeEventListener('paste', colar);
  }, [etapa]);

  const aSalvar = nota
    ? (nota.conta_id ? lancamentosDaNota(nota, { conta_id: nota.conta_id, data: nota.data, diferencaEm: diferencaEfetiva(nota), categorias: s.tables.categorias }) : [])
    : lancs.filter((l) => l.salvar);
  const pendencias = nota
    ? [!nota.conta_id && 'a conta', resumoNota(nota).semCategoria && `${resumoNota(nota).semCategoria} ${resumoNota(nota).semCategoria === 1 ? 'item sem' : 'itens sem'} categoria`, !nota.dataLida && 'confirmar a data'].filter(Boolean)
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
    let avisoItens = '';
    if (nota) {
      try {
        const itensSalvos = await salvarVarias('itens', itensDaNota(nota, salvos, { data: nota.data, grupo_id: grupo, criado_em: new Date().toISOString() }));
        // Ingredientes do pudim comprados na nota entram no estoque de ingredientes.
        await entradasDaCompra(itensSalvos.filter((x) => x.origem === 'Pudim'), { data: nota.data }).catch(() => {});
      } catch {
        avisoItens = ' Os itens da nota não foram guardados: atualize o servidor no Apps Script.';
      }
    }
    // Ainda há nota de mercado de outro print: segue para ela.
    if (notasDepois.length) {
      setSalvosAntes((n) => n + salvos.length);
      setNota(notasDepois[0]);
      setLancs([]);
      setNotasDepois(notasDepois.slice(1));
      setAvisos([]);
      setSalvando(false);
      toast(`${salvos.length === 1 ? 'Lançamento salvo' : `${salvos.length} lançamentos salvos`}. Agora a nota de mercado.${avisoItens}`, avisoItens ? { tom: 'erro', ms: 9000 } : {});
      return;
    }
    const total = salvosAntes + salvos.length;
    if (total === 1 && !nota) {
      const m = findMatch(salvos[0], matchCandidates({ ...s.tables, hoje: s.hoje, lanc: salvos[0] }));
      if (m) return abrirFolha('baixa', { lanc: salvos[0], occ: m });
    }
    fecharFolha();
    toast((total === 1 ? 'Lançamento salvo.' : `${total} lançamentos salvos.`) + avisoItens, avisoItens ? { tom: 'erro', ms: 9000 } : {});
  };

  const resumo = nota ? resumoNota(nota, { diferencaEm: diferencaEfetiva(nota) }) : null;
  const qtd = nota ? Object.values(resumo.soma).filter((v) => v > 0).length : aSalvar.length;
  const rodape = etapa === 'revisar'
    ? html`<button class=${`btn btn-pri ${salvando ? 'carregando' : ''}`} disabled=${salvando || pendencias.length > 0 || !aSalvar.length} onClick=${gravar}>
        ${salvando ? 'Salvando…' : qtd > 1 ? `Salvar ${qtd} lançamentos` : 'Salvar lançamento'}</button>`
    : null;

  return html`<${Folha} titulo="Lançar por foto ou print" rodape=${rodape}>
    ${etapa === 'escolher' && html`<label class="painel" style="display:flex;flex-direction:column;align-items:center;gap:10px;padding:28px 16px;text-align:center;cursor:pointer;border-style:dashed">
      <span style="width:40px;height:40px;color:var(--caramel)"><${Icone} n="camera" /></span>
      <strong>Tirar foto ou escolher prints</strong>
      <span class="muted" style="font-size:13.5px">Até ${MAX_PRINTS} de uma vez: comprovante de Pix, nota de mercado, extrato ou print das notificações do banco. No computador, você também pode colar o print aqui (Ctrl+V).</span>
      <input id="leitura-arquivo" type="file" accept="image/*" multiple class="sr" onChange=${(e) => ler(e.target.files)} />
    </label>`}
    ${etapa === 'lendo' && (() => {
      const feitos = fila.filter((x) => x.estado === 'ok' || x.estado === 'erro').length;
      return html`<div class="leitura-andamento" role="status" aria-live="polite">
        <div class="leitura-cab"><span class="girando" aria-hidden="true"></span>
          <strong>${fila.length > 1 ? `Lendo os prints… ${feitos} de ${fila.length}` : 'Lendo o print…'}</strong></div>
        <div class="muted" style="font-size:13px">Cada print leva uns segundos.</div>
        <ul class="leitura-prints">${fila.map((x, k) => html`<li class=${`lp-${x.estado}`}>
          ${x.previa ? html`<img src=${x.previa} alt=${`Print ${k + 1}`} />` : html`<span class="lp-vazio"></span>`}
          <span class="lp-selo" aria-label=${`Print ${k + 1}: ${x.estado === 'ok' ? 'lido' : x.estado === 'erro' ? 'não deu' : 'lendo'}`}>
            ${x.estado === 'ok' ? html`<${Icone} n="check" />` : x.estado === 'erro' ? html`<${Icone} n="fechar" />` : html`<span class="girando"></span>`}</span>
        </li>`)}</ul>
      </div>`;
    })()}
    ${etapa === 'erro' && html`<div>
      <div class="duvida" role="alert"><${Icone} n="alerta" /><span>${erro}</span></div>
      <div class="acoes" style="margin-top:12px">
        <button class="btn btn-sec" onClick=${() => setEtapa('escolher')}>Tentar outra imagem</button>
        <button class="btn btn-sec" onClick=${() => abrirFolha('lancamento', {})}>Lançar pelo formulário</button>
      </div>
    </div>`}
    ${etapa === 'revisar' && html`<div>
      ${avisos.map((a) => html`<div class="duvida" style="margin-bottom:8px"><${Icone} n="alerta" /><span>${a}</span></div>`)}
      ${notasDepois.length > 0 && html`<p class="muted" style="font-size:13px;margin:0 0 8px">Depois destes, ${notasDepois.length === 1 ? 'vem 1 nota de mercado' : `vêm ${notasDepois.length} notas de mercado`} para conferir.</p>`}
      ${previas.length > 0 && html`<details><summary class="muted" style="font-size:13px;cursor:pointer">${previas.length > 1 ? `Ver os ${previas.length} prints` : 'Ver o print'}</summary>
        ${previas.map((x) => html`<img src=${x.previa} alt="Print lido" style="max-width:100%;border-radius:12px;margin-top:8px" />`)}</details>`}
      ${nota
        ? html`<${RevisarNota} nota=${nota} setNota=${setNota} contas=${contas} tables=${s.tables} />`
        : html`${lancs.length > 1 && html`<section class="painel painel-pad" style="margin-bottom:10px" aria-label="Para todos">
            <strong>Para todos os ${lancs.length}</strong>
            <${SelectConta} rotulo="Conta de todos" valor=${lancs.every((x) => x.conta_id === lancs[0].conta_id) ? lancs[0].conta_id : ''} contas=${contas} onChange=${(c) => setLancs((xs) => xs.map((x) => ({ ...x, conta_id: c })))} />
            <${EscolheCaixa} rotulo="Caixa de todos" tipo=${lancs.find((x) => x.tipo !== 'transferencia')?.tipo || 'saida'} valor=${lancs.every((x) => x.origem === lancs[0].origem) ? lancs[0].origem : ''} onChange=${(o) => setLancs((xs) => xs.map((x) => (x.tipo === 'transferencia' ? x : { ...x, origem: o })))} />
            <${Campo} rotulo="Data de todos"><input type="date" aria-label="Data de todos" value=${lancs.every((x) => x.data === lancs[0].data) ? lancs[0].data : ''} onInput=${(e) => e.target.value && setLancs((xs) => xs.map((x) => ({ ...x, data: e.target.value, dataLida: true })))} /><//>
          </section>`}
        ${lancs.map((l, i) => html`<${EditorLancamento} key=${l.chave} l=${l} contas=${contas} categorias=${s.tables.categorias}
            set=${(patch) => setLancs((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)))} />`)}`}
      ${pendencias.length > 0 && html`<p class="muted" style="font-size:13px;margin:12px 2px 0">Para salvar, responda: ${[...new Set(pendencias)].join(', ')}.</p>`}
    </div>`}
  <//>`;
}
