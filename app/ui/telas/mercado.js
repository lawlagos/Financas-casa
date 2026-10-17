import { useState, useRef } from '../../vendor/hooks.module.js';
import { html } from '../html.js';
import { Icone } from '../icones.js';
import { Topo, Secao, Segmento, Vazio, Folha, Campo } from '../componentes.js';
import { useStore, abrirFolha, fecharFolha, salvar, toast } from '../../data/store.js';
import { brl } from '../../core/money.js';
import { fmtDay, monthName } from '../../core/dates.js';
import { produtos, listaSugerida, previsaoMes, textoLista, chaveProduto } from '../../core/mercado.js';
import { FaixaDemo } from './inicio.js';

const CHAVE_MARCADOS = 'fc-lista-marcados';
const GRUPO = 'fc-mercado-grupo';

// O que já foi pego na lista fica marcado só neste aparelho, por 10 dias.
function lerMarcados(hoje) {
  try {
    const m = JSON.parse(localStorage.getItem(CHAVE_MARCADOS) || '{}');
    return Object.fromEntries(Object.entries(m).filter(([, d]) => d >= hojeMenos(hoje, 10)));
  } catch {
    return {};
  }
}
const hojeMenos = (hoje, n) => new Date(Date.parse(hoje) - n * 86400000).toISOString().slice(0, 10);
function gravar(chave, valor) {
  try {
    localStorage.setItem(chave, typeof valor === 'string' ? valor : JSON.stringify(valor));
  } catch {
    /* sem armazenamento: vale só nesta visita */
  }
}
function lerGrupo() {
  try {
    return localStorage.getItem(GRUPO) === 'Pudim' ? 'Pudim' : 'Casa';
  } catch {
    return 'Casa';
  }
}

const unidadeTxt = (u) => ({ kg: 'kg', l: 'l', un: 'un', g: 'g', ml: 'ml' }[u] || u || 'un');
const qtdTxt = (q, u) => `${String(q).replace('.', ',')} ${unidadeTxt(u)}`;
const ritmoTxt = (p) => (p.intervalo ? `a cada ${p.intervalo} dia${p.intervalo > 1 ? 's' : ''}` : 'comprou uma vez');
const quandoTxt = (p) => {
  const d = p.diasParaProxima;
  if (d === null) return '';
  if (d < 0) return `devia ter acabado há ${-d} dia${d < -1 ? 's' : ''}`;
  if (d === 0) return 'deve acabar hoje';
  return `deve acabar em ${d} dia${d > 1 ? 's' : ''}`;
};

function Previsao({ p, grupo }) {
  if (p.valor === null) {
    return html`<div class="painel painel-pad">
      <div class="rot-mercado">Mercado ${grupo === 'Pudim' ? 'do pudim' : 'da casa'} em ${monthName(p.mes)}</div>
      <p class="muted" style="margin:6px 0 0">Ainda não dá para estimar. Com uma semana de notas lidas a previsão aparece aqui.</p>
    </div>`;
  }
  const base = p.como === 'media'
    ? p.meses.length === 1
      ? `Base: o que gastaram em ${monthName(p.meses[0])}`
      : `Média de ${p.meses.map((m) => monthName(m)).reverse().join(', ').replace(/, ([^,]+)$/, ' e $1')}`
    : `Pelo ritmo dos últimos ${p.diasDeDados} dias. Fica mais certeira depois do primeiro mês completo.`;
  return html`<div class="painel painel-pad">
    <div class="rot-mercado">Mercado ${grupo === 'Pudim' ? 'do pudim' : 'da casa'} em ${monthName(p.mes)}</div>
    <div class="num-mercado">≈ ${brl(p.valor)}</div>
    <div class="muted" style="font-size:13px">${base}</div>
    <div style="display:flex;justify-content:space-between;margin-top:10px;padding-top:10px;border-top:1px solid var(--line)">
      <span>Gasto neste mês até agora</span><strong>${brl(p.noMes)}</strong></div>
  </div>`;
}

export function TelaMercado() {
  const s = useStore();
  const [grupo, setGrupoEstado] = useState(lerGrupo);
  const [marcados, setMarcados] = useState(() => lerMarcados(s.hoje));
  const [todos, setTodos] = useState(false);
  const setGrupo = (g) => {
    setGrupoEstado(g);
    gravar(GRUPO, g);
  };
  const itens = s.tables.itens || [];
  const lista = produtos(itens, { origem: grupo, hoje: s.hoje });
  const sugerida = listaSugerida(lista);
  const prev = previsaoMes({ lancamentos: s.tables.lancamentos, itens, origem: grupo, hoje: s.hoje });
  const faltam = sugerida.itens.filter((p) => !marcados[p.chave]);

  const marcar = (p) => {
    const m = { ...marcados };
    if (m[p.chave]) delete m[p.chave];
    else m[p.chave] = s.hoje;
    setMarcados(m);
    gravar(CHAVE_MARCADOS, m);
  };
  const copiar = async () => {
    const texto = textoLista(faltam, brl);
    try {
      await navigator.clipboard.writeText(texto);
      toast('Lista copiada. É só colar no WhatsApp.');
    } catch {
      toast('Não consegui copiar neste aparelho.', { tom: 'erro' });
    }
  };
  const visiveis = todos ? lista : lista.slice(0, 15);

  return html`<main>
    <${Topo} titulo="Mercado" sub="O que vocês mais compram, o que está acabando e quanto vai custar" voltar="#/mais" />
    <${FaixaDemo} />
    <a class="btn btn-pri btn-larga" style="margin-bottom:12px" href="#/lista"><${Icone} n="lista" />Lista de compras</a>
    <${Segmento} rotulo="Compras de" opcoes=${[['Casa', 'Casa'], ['Pudim', 'Pudim']]} valor=${grupo} onChange=${setGrupo} />
    <div style="margin-top:12px"><${Previsao} p=${prev} grupo=${grupo} /></div>

    ${!lista.length
      ? html`<div class="painel" style="margin-top:14px"><${Vazio} titulo="Nenhum item ${grupo === 'Pudim' ? 'do pudim' : 'da casa'} ainda">
          <p style="margin:6px 0 12px">Leia uma nota de mercado pela foto e os itens começam a aparecer aqui.</p>
          <button class="btn btn-pri" onClick=${() => abrirFolha('leitura', {})}><${Icone} n="camera" />Ler nota de mercado</button>
        <//></div>`
      : html`
    <${Secao} titulo="Lista sugerida" acao=${faltam.length ? 'Copiar' : null} onAcao=${copiar}>
      <ul class="lista painel">
        ${sugerida.itens.map((p) => html`<li class="item">
          <button class="marcador" aria-pressed=${String(!!marcados[p.chave])} aria-label=${`Peguei ${p.nome}`} onClick=${() => marcar(p)}><${Icone} n="check" /></button>
          <div class="corpo" style=${marcados[p.chave] ? 'opacity:.5;text-decoration:line-through' : ''}>
            <div class="tit">${p.nome}${p.qtdPorCompra > 1 ? html` <span class="muted">${qtdTxt(p.qtdPorCompra, p.unidade)}</span>` : ''}</div>
            <div class="meta">${quandoTxt(p)}</div></div>
          <div class="valor">≈ ${brl(p.gastoPorCompra)}${p.maisBarato && html`<small>no ${p.maisBarato.mercado}</small>`}</div>
        </li>`)}
        ${!sugerida.itens.length && html`<li class="item muted">Nada acabando pelos próximos dias. A lista nasce do ritmo: precisa de pelo menos duas compras do mesmo produto.</li>`}
      </ul>
      ${sugerida.itens.length > 0 && html`<p class="muted" style="font-size:13px;margin:8px 2px 0">${faltam.length === 1 ? 'Falta 1' : `Faltam ${faltam.length}`} de ${sugerida.itens.length}, uns ${brl(faltam.reduce((t, p) => t + p.gastoPorCompra, 0))}.</p>`}
    <//>

    <${Secao} titulo="O que mais compram">
      <ul class="lista painel">
        ${visiveis.map((p) => html`<li><button class="item item-btn" onClick=${() => abrirFolha('produto', { chave: p.chave, grupo })}>
          <div class="corpo"><div class="tit">${p.nome}</div>
            <div class="meta">${p.compras} compra${p.compras > 1 ? `s, ${ritmoTxt(p)}` : ''}${p.marcas.length ? `, ${p.marcas.slice(0, 2).join(', ')}` : ''}</div></div>
          <div class="valor">${p.ultimoPreco !== null ? brl(p.ultimoPreco) : '—'}<small>${p.medida ? `${brl(p.medida.valor)}/${p.medida.unidade}` : `último, ${fmtDay(p.ultimaData)}`}</small></div>
        </button></li>`)}
      </ul>
      ${lista.length > 15 && !todos && html`<button class="btn" style="margin-top:10px;width:100%" onClick=${() => setTodos(true)}>Ver todos os ${lista.length} produtos</button>`}
    <//>`}
  </main>`;
}

// Histórico de um produto e troca do nome (juntar com outro é dar o mesmo nome).
export function FolhaProduto({ chave, grupo }) {
  const s = useStore();
  // Guarda o último encontrado: durante a troca de nome a chave muda e o produto "some" da lista.
  const ultimo = useRef(null);
  const p = produtos(s.tables.itens || [], { origem: grupo, hoje: s.hoje }).find((x) => x.chave === chave) || ultimo.current;
  ultimo.current = p;
  const [nome, setNome] = useState(p?.nome || '');
  const [salvando, setSalvando] = useState(false);
  if (!p) return html`<${Folha} titulo="Produto"><p class="muted">Produto não encontrado.</p><//>`;
  const outros = produtos(s.tables.itens || [], { origem: grupo, hoje: s.hoje }).filter((x) => x.chave !== chave).map((x) => x.nome);
  const juntaCom = outros.find((n) => chaveProduto(n) === chaveProduto(nome));
  const renomear = async () => {
    const novo = nome.trim();
    if (!novo || novo === p.nome) return fecharFolha();
    setSalvando(true);
    try {
      for (const it of p.historico) {
        const { _nome, ...linha } = it;
        await salvar('itens', { ...linha, produto: novo });
      }
      toast(juntaCom ? `Juntei com ${juntaCom}.` : 'Nome trocado.');
      fecharFolha();
    } catch {
      setSalvando(false);
    }
  };
  return html`<${Folha} titulo=${p.nome} rodape=${html`<button class="btn btn-pri" style="width:100%" disabled=${salvando || !nome.trim()} onClick=${renomear}>${salvando ? 'Salvando…' : juntaCom ? `Juntar com ${juntaCom}` : 'Salvar nome'}</button>`}>
    <div class="dupla" style="margin-bottom:12px">
      <div class="painel mini"><div class="rot">Compras</div><div class="num">${p.compras}</div><div class="rod">${ritmoTxt(p)}</div></div>
      <div class="painel mini"><div class="rot">Preço médio</div><div class="num">${p.precoMedio !== null ? brl(p.precoMedio) : '—'}</div><div class="rod">por ${unidadeTxt(p.unidade)}</div></div>
    </div>
    ${p.mercados.length > 1 && html`<div class="painel painel-pad" style="margin-bottom:12px">
      <div class="rot-mercado">Último preço em cada mercado</div>
      ${p.mercados.map((m, i) => html`<div style="display:flex;justify-content:space-between;margin-top:6px"><span>${i === 0 ? '✓ ' : ''}${m.mercado} <span class="muted">${fmtDay(m.data)}</span></span><strong>${brl(m.preco)}${m.medida ? html` <span class="muted" style="font-weight:500">(${brl(m.medida.valor)}/${m.medida.unidade})</span>` : ''}</strong></div>`)}
    </div>`}
    <${Campo} rotulo="Nome do produto" ajuda="Dê o mesmo nome de outro produto para juntar os dois.">
      <input id="produto-nome" value=${nome} list="produtos-existentes" onInput=${(e) => setNome(e.target.value)} />
      <datalist id="produtos-existentes">${outros.map((n) => html`<option value=${n} />`)}</datalist>
    <//>
    <div class="rot-mercado" style="margin:14px 0 6px">Histórico</div>
    <ul class="lista painel">
      ${p.historico.map((i) => html`<li class="item"><div class="corpo"><div class="tit">${i.descricao}</div>
        <div class="meta">${fmtDay(i.data)}${i.mercado ? `, ${i.mercado}` : ''}${i.marca ? `, ${i.marca}` : ''}${Number(i.quantidade) > 1 ? `, ${qtdTxt(i.quantidade, i.unidade)}` : ''}</div></div>
        <div class="valor">${i.valor ? brl(Math.round(Number(i.valor) * 100)) : '—'}</div></li>`)}
    </ul>
  <//>`;
}
