// Lista de compras por voz, com quanto deve sair (pelos preços da última compra) e, ao marcar o que pegou e
// digitar o preço, se ficou mais caro ou mais barato do que da outra vez.
import { useState, useEffect } from '../../vendor/hooks.module.js';
import { appAtual, urlDoApp } from '../apps.js';
import { html } from '../html.js';
import { Icone } from '../icones.js';
import { Topo, Secao, Campo, Chips, AbasSecao, Arrastavel } from '../componentes.js';
import { useStore, apagar, salvar, toast } from '../../data/store.js';
import { brl, parseBRL, toCents } from '../../core/money.js';
import { fmtDay } from '../../core/dates.js';
import { catalogo, interpretarLista, historicoPrecos, comparar, resumoLista } from '../../core/listacompras.js';
import { produtos, listaSugerida, chaveProduto } from '../../core/mercado.js';
import { adicionarItens, atualizarItem, finalizarCompra, adicionarTarefas, marcarTarefa } from '../../data/lista-acoes.js';
import { contasAtivas } from '../derivados.js';
import { SelectConta } from '../folhas/lancamento.js';
import { CampoFala } from '../voz.js';
import { FaixaDemo } from './inicio.js';

const qtdTxt = (q, u) => `${String(q).replace('.', ',')}${u && u !== 'un' ? ` ${u}` : ''}`;
const valorTxt = (cents) => (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// "R$ 0,40 mais caro (+6%)" / "R$ 0,40 mais barato (−6%)" / "mesmo preço"
export function Comparacao({ c, prefixo = '' }) {
  if (!c) return null;
  const pct = Math.round(c.fracao * 100);
  if (Math.abs(c.diferenca) < 5) return html`<span class="etiqueta">${prefixo}mesmo preço</span>`;
  return c.diferenca > 0
    ? html`<span class="etiqueta atraso">${prefixo}${brl(c.diferenca)} mais caro (+${pct}%)</span>`
    : html`<span class="etiqueta pago">${prefixo}${brl(-c.diferenca)} mais barato (${pct}%)</span>`;
}

function Item({ x, s, aberto, onAbrir }) {
  const estimado = x.preco_estimado ? toCents(x.preco_estimado) : null;
  const [pago, setPago] = useState(x.preco_pago ? valorTxt(toCents(x.preco_pago)) : '');
  const pagoCents = pago ? toCents(parseBRL(pago) || 0) : 0;
  const hist = historicoPrecos(x.nome, s.tables.itens || []);
  const ultimo = hist[0];
  const marcar = () => atualizarItem(x, { comprado: !x.comprado, comprado_em: x.comprado ? '' : new Date().toISOString() });
  // Passo do − e +: 1 unidade; meio quilo ou meio litro; 100 g ou 100 ml.
  const passo = { kg: 0.5, l: 0.5, g: 100, ml: 100 }[x.unidade] || 1;
  const tirar = async () => {
    await apagar('lista', x.id);
    toast(`${x.nome} saiu da lista`, { acao: 'Desfazer', onAcao: () => salvar('lista', x) });
  };
  const mudarQtd = (delta) => {
    const q = Math.round(((Number(x.quantidade) || 1) + delta) * 100) / 100;
    if (q <= 0) return tirar();
    return atualizarItem(x, { quantidade: q });
  };
  const guardarPago = () => {
    const v = parseBRL(pago) || '';
    if (String(v) !== String(x.preco_pago ?? '')) atualizarItem(x, { preco_pago: v, comprado: v ? true : x.comprado });
  };
  return html`<li class=${`item-lista ${x.comprado ? 'comprado' : ''}`}><${Arrastavel} onApagar=${tirar}>
    <div class="item-lista-linha">
      <button class="marcador" aria-pressed=${String(!!x.comprado)} aria-label=${`Peguei ${x.nome}`} onClick=${marcar}><${Icone} n="check" /></button>
      <button class="item-lista-corpo" onClick=${onAbrir} aria-expanded=${String(aberto)}>
        <div class="tit">${x.nome}</div>
        <div class="meta">${ultimo ? `última: ${brl(ultimo.porUnidade)}${x.unidade === 'kg' && ultimo.porKg ? ` (${brl(ultimo.porKg)}/kg)` : ''} em ${fmtDay(ultimo.data)}${ultimo.mercado ? `, ${ultimo.mercado}` : ''}` : estimado ? 'pelo preço do cadastro' : 'sem preço anterior'}</div>
      </button>
      <div class="valor">${estimado ? `≈ ${brl(estimado)}` : '—'}</div>
    </div>
    <div class="item-lista-qtd">
      <div class="pdv-contador">
        <button class="icone-btn" aria-label=${`Menos ${x.nome}`} onClick=${() => mudarQtd(-passo)}>−</button>
        <span class="qtd-lista" aria-label=${`Quantidade de ${x.nome}`}>${qtdTxt(x.quantidade, x.unidade)}</span>
        <button class="icone-btn" aria-label=${`Mais ${x.nome}`} onClick=${() => mudarQtd(passo)}>+</button>
      </div>
      <button class="icone-btn tirar-lista" aria-label=${`Tirar ${x.nome} da lista`} onClick=${tirar}><${Icone} n="lixo" /></button>
    </div><//>
    ${x.comprado && html`<div class="item-lista-pago">
      <label class="campo-pago"><span>Paguei</span><input aria-label=${`Quanto pagou em ${x.nome}`} inputmode="decimal" placeholder="0,00" value=${pago}
        onInput=${(e) => setPago(e.target.value)} onBlur=${guardarPago} onKeyDown=${(e) => e.key === 'Enter' && e.target.blur()} /></label>
      <${Comparacao} c=${comparar(pagoCents, estimado)} />
    </div>`}
    ${aberto && html`<div class="item-lista-detalhe">
      <div class="linha2">
        <${Campo} rotulo="Quantidade"><input aria-label="Quantidade" inputmode="decimal" value=${String(x.quantidade).replace('.', ',')} onChange=${(e) => {
          const q = Number(e.target.value.replace(',', '.'));
          if (q > 0) atualizarItem(x, { quantidade: q });
          else if (e.target.value.trim() === '0') tirar();
        }} /><//>
        <${Campo} rotulo="Medida"><select aria-label="Medida" value=${x.unidade || 'un'} onChange=${(e) => atualizarItem(x, { unidade: e.target.value })}>
          ${[['un', 'unidade'], ['kg', 'kg'], ['g', 'g'], ['l', 'litro'], ['ml', 'ml']].map(([v, t]) => html`<option value=${v}>${t}</option>`)}</select><//>
      </div>
      <div class="campo"><span>Mudar de lista</span><${Chips} rotulo="É para" valor=${x.origem} onChange=${(v) => atualizarItem(x, { origem: v || 'Casa' })} opcoes=${[['Casa', 'Casa'], ['Pudim', 'Pudim']]} /></div>
      ${hist.length > 0 && html`<div class="rot-mercado" style="margin:12px 0 4px">Preço nas últimas compras</div>
        <ul class="hist-precos">${hist.slice(0, 6).map((h, i) => {
          const antes = hist[i + 1];
          const c = antes ? comparar(h.porUnidade, antes.porUnidade) : null;
          return html`<li><span>${fmtDay(h.data)}${h.mercado ? ` · ${h.mercado}` : ''}</span><strong>${brl(h.porUnidade)}</strong>
            ${c && Math.abs(c.diferenca) >= 5 ? html`<span class=${c.diferenca > 0 ? 'neg' : 'pos'}>${c.diferenca > 0 ? '▲' : '▼'} ${Math.abs(Math.round(c.fracao * 100))}%</span>` : html`<span class="muted">—</span>`}</li>`;
        })}</ul>`}
      <button class="link" style="color:var(--neg);margin-top:10px" onClick=${tirar}>Tirar da lista</button>
    </div>`}
  </li>`;
}

// Duas listas: a da casa e a do pudim. O que se fala numa entra nela; cada uma tem a sua estimativa e o seu fechamento.
const daLista = (x) => (x.origem === 'Pudim' ? 'Pudim' : 'Casa');

export function TelaLista({ params = {} }) {
  const s = useStore();
  const contas = contasAtivas(s);
  // No Finanças a lista é a da casa; no Pudins, a do pudim.
  const qual = appAtual() === 'pudim' ? 'Pudim' : 'Casa';
  useEffect(() => {
    if (qual === 'Casa' && params.lista === 'pudim') location.replace(urlDoApp('pudim', '/lista'));
  }, []);
  const todas = [...(s.tables.lista || [])].sort((a, b) => (a.criado_em < b.criado_em ? -1 : 1));
  const lista = todas.filter((x) => daLista(x) === qual);
  const [frase, setFrase] = useState('');
  const [aberto, setAberto] = useState(null);
  const [mercado, setMercado] = useState('');
  const ultimaCompra = [...s.tables.lancamentos].reverse().find((l) => l.categoria_id === (qual === 'Pudim' ? 'cat-ingrediente' : 'cat-mercado'));
  const [conta_id, setConta] = useState(ultimaCompra?.conta_id || '');
  const [data, setData] = useState(s.hoje);
  const [salvando, setSalvando] = useState(false);

  const cat = catalogo({ itens: s.tables.itens || [], insumos: s.tables.insumos || [] });
  const linhas = lista.map((x) => ({ x, estimado: x.preco_estimado ? toCents(x.preco_estimado) : null, comprado: !!x.comprado, pago: x.preco_pago ? toCents(x.preco_pago) : 0 }));
  const r = resumoLista(linhas);
  const naLista = new Set(todas.map((x) => chaveProduto(x.nome)));
  const sugeridos = listaSugerida(produtos(s.tables.itens || [], { origem: qual, hoje: s.hoje })).itens.map((p) => ({ ...p, origem: qual }))
    .filter((p) => !naLista.has(p.chave));
  const comprados = lista.filter((x) => x.comprado);
  const prontos = comprados.filter((x) => Number(x.preco_pago) > 0);

  const ouvir = async (texto) => {
    // O que se fala na lista do pudim é do pudim; na da casa, da casa.
    const novos = interpretarLista(texto, cat).map((x) => ({ ...x, origem: qual }));
    if (!novos.length) return toast('Não entendi nenhum item. Ex.: "2 leites condensados e um quilo de banana".', { tom: 'erro' });
    try {
      await adicionarItens(novos);
      setFrase('');
      toast(novos.length === 1 ? `${novos[0].nome} na lista ${qual === 'Pudim' ? 'do pudim' : 'da casa'}` : `${novos.length} itens na lista ${qual === 'Pudim' ? 'do pudim' : 'da casa'}`);
    } catch {
      // o aviso de erro já apareceu
    }
  };
  const addSugeridos = async () => {
    await adicionarItens(sugeridos.map((p) => ({ nome: p.nome, quantidade: p.qtdPorCompra > 1 ? Math.round(p.qtdPorCompra) : 1, unidade: 'un', origem: p.origem })));
    toast(`${sugeridos.length} itens que estão acabando entraram na lista`);
  };
  const finalizar = async () => {
    if (!prontos.length || !conta_id) return;
    setSalvando(true);
    try {
      const f = await finalizarCompra({ itens: lista, mercado: mercado.trim(), data, conta_id });
      toast(`Compra de ${brl(f.total)} registrada. Os preços entram no histórico.`);
    } catch {
      // o aviso de erro já apareceu
    } finally {
      setSalvando(false);
    }
  };

  // Função, não componente: um componente criado aqui dentro seria recriado a cada tecla e perderia o que se digita.
  const bloco = (xs) => html`<ul class="lista painel lista-compras">${xs.map((x) => html`<${Item} key=${x.id} x=${x} s=${s} aberto=${aberto === x.id} onAbrir=${() => setAberto(aberto === x.id ? null : x.id)} />`)}</ul>`;

  return html`<main>
    <${Topo} titulo=${qual === 'Pudim' ? 'Compras do pudim' : 'Compras da casa'} sub="Fale o que precisa; o app estima quanto vai sair" />
    <${FaixaDemo} />
    ${qual === 'Casa' && html`<${AbasSecao} secao="casa" atual="/lista" />`}
    <${CampoFala} id="lista-frase" rotulo=${qual === 'Pudim' ? 'O que precisa comprar para o pudim' : 'O que precisa comprar para a casa'} frase=${frase} setFrase=${setFrase} onPronto=${ouvir}
      placeholder=${qual === 'Pudim' ? 'Ex.: 6 leites condensados, 4 creme de leite e 2 dúzias de ovos' : 'Ex.: um quilo de banana, arroz e detergente'} />
    <div class="acoes" style="margin-top:8px;justify-content:flex-end"><button class="btn btn-sec btn-mini" disabled=${!frase.trim()} onClick=${() => ouvir(frase)}>Pôr na lista</button></div>

    <div class="painel painel-pad" style="margin-top:12px">
      <div class="rot-mercado">${qual === 'Pudim' ? 'Compras do pudim' : 'Compras da casa'}: deve sair por</div>
      <div class="num-mercado">≈ ${brl(r.estimado)}</div>
      <div class="muted" style="font-size:13px">${lista.length} ${lista.length === 1 ? 'item' : 'itens'}, pelos preços da última compra${r.semPreco ? `; ${r.semPreco} sem preço anterior` : ''}</div>
      ${comprados.length > 0 && html`<div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--line)">
        <div style="display:flex;justify-content:space-between"><span>Já no carrinho</span><strong>${brl(r.pago)}</strong></div>
        <div style="display:flex;justify-content:space-between;margin-top:4px"><span>Falta pegar (estimado)</span><span>${brl(r.faltaEstimado)}</span></div>
        ${r.comparacao && html`<div style="margin-top:8px"><${Comparacao} c=${r.comparacao} prefixo="Até agora: " /></div>`}
      </div>`}
    </div>

    ${sugeridos.length > 0 && html`<button class="btn btn-sec btn-larga" style="margin-top:10px" onClick=${addSugeridos}><${Icone} n="carrinho" />Pôr o que está acabando (${sugeridos.length})</button>`}

    <${Secao} titulo="Para comprar">
      ${lista.some((x) => !x.comprado) ? bloco(lista.filter((x) => !x.comprado)) : html`<p class="muted" style="margin:0">${lista.length ? 'Tudo no carrinho.' : `A lista ${qual === 'Pudim' ? 'do pudim' : 'da casa'} está vazia. Fale ou digite o que precisa.`}</p>`}
    <//>
    ${comprados.length > 0 && html`<${Secao} titulo="No carrinho">
      ${bloco(comprados)}
      <div class="painel painel-pad" style="margin-top:12px">
        <div class="rot-mercado">Terminou a compra?</div>
        <${Campo} rotulo="Mercado"><input id="lista-mercado" placeholder="Ex.: Assaí" value=${mercado} onInput=${(e) => setMercado(e.target.value)} /><//>
        <div class="linha2">
          <${Campo} rotulo="Dia"><input type="date" value=${data} onInput=${(e) => setData(e.target.value)} /><//>
          <${SelectConta} rotulo="Pago com" valor=${conta_id} onChange=${setConta} contas=${contas} />
        </div>
        ${prontos.length < comprados.length && html`<p class="muted" style="font-size:12.5px;margin:8px 0 0">${comprados.length - prontos.length} ${comprados.length - prontos.length === 1 ? 'item está' : 'itens estão'} sem o preço pago e ${comprados.length - prontos.length === 1 ? 'fica' : 'ficam'} na lista.</p>`}
        <button class="btn btn-pri btn-larga" style="margin-top:12px" disabled=${salvando || !prontos.length || !conta_id} onClick=${finalizar}>
          ${salvando ? 'Salvando…' : `Registrar compra ${qual === 'Pudim' ? 'do pudim' : 'da casa'} · ${brl(prontos.reduce((t, x) => t + toCents(x.preco_pago), 0))}`}</button>
        <p class="muted" style="font-size:12.5px;margin:8px 0 0">${qual === 'Pudim' ? 'Vira gasto do Pudim (Ingrediente), soma no estoque de ingredientes' : 'Vira gasto da casa (Mercado)'} e os preços entram no histórico para a próxima lista.</p>
      </div>
    <//>`}
  </main>`;
}

// Tarefas da casa (instalar o portão da escada, trocar a lâmpada): o que entrou e quando, e marcar como feita.
export function TelaTarefas() {
  const s = useStore();
  const [texto, setTexto] = useState('');
  const [verFeitas, setVerFeitas] = useState(false);
  const todas = s.tables.tarefas || [];
  const pendentes = todas.filter((t) => !t.feita).sort((a, b) => (a.criado_em < b.criado_em ? -1 : 1));
  const feitas = todas.filter((t) => t.feita).sort((a, b) => (a.feita_em < b.feita_em ? 1 : -1));
  const dia = (iso) => (iso ? fmtDay(String(iso).slice(0, 10)) : '');
  const adicionar = async (t) => {
    // Várias de uma vez: uma por linha, ou separadas por vírgula ("trocar lâmpada, consertar torneira").
    const titulos = String(t).split(/\n|,|;/).map((x) => x.trim()).filter(Boolean).map((x) => x.charAt(0).toUpperCase() + x.slice(1));
    if (!titulos.length) return;
    try {
      await adicionarTarefas(titulos);
      setTexto('');
      toast(titulos.length === 1 ? 'Tarefa anotada' : `${titulos.length} tarefas anotadas`);
    } catch {
      // o aviso de erro já apareceu
    }
  };
  const concluir = async (t) => {
    await marcarTarefa(t, !t.feita);
    if (!t.feita) toast(`Feito: ${t.titulo}`, { acao: 'Desfazer', onAcao: () => marcarTarefa({ ...t, feita: true }, false) });
  };
  const apagarTarefa = async (t) => {
    await apagar('tarefas', t.id);
    toast('Tarefa apagada');
  };
  const item = (t) => html`<li key=${t.id}><${Arrastavel} onApagar=${() => apagarTarefa(t)}><div class=${`item item-tarefa ${t.feita ? 'feita' : ''}`}>
    <button class="marcador" aria-pressed=${String(!!t.feita)} aria-label=${`${t.feita ? 'Reabrir' : 'Concluir'} ${t.titulo}`} onClick=${() => concluir(t)}><${Icone} n="check" /></button>
    <div class="corpo"><div class="tit">${t.titulo}</div>
      <div class="meta">Anotada em ${dia(t.criado_em)}${t.feita ? ` · feita em ${dia(t.feita_em)}` : ''}</div></div>
  </div><//></li>`;
  return html`<main>
    <${Topo} titulo="Tarefas da casa" sub="O que precisa fazer em casa" />
    <${FaixaDemo} />
    <${AbasSecao} secao="casa" atual="/tarefas" />
    <${CampoFala} id="tarefa-texto" rotulo="Nova tarefa" frase=${texto} setFrase=${setTexto} onPronto=${adicionar}
      placeholder="Ex.: instalar portão na escada, trocar lâmpada da cozinha" />
    <div class="acoes" style="margin-top:8px;justify-content:flex-end"><button class="btn btn-pri btn-mini" disabled=${!texto.trim()} onClick=${() => adicionar(texto)}><${Icone} n="mais" />Anotar</button></div>
    <${Secao} titulo=${pendentes.length ? `Para fazer (${pendentes.length})` : 'Para fazer'}>
      ${pendentes.length ? html`<ul class="lista painel">${pendentes.map(item)}</ul>` : html`<p class="muted" style="margin:0">Nada pendente. Anote acima o que precisa fazer.</p>`}
    <//>
    ${feitas.length > 0 && html`<div style="margin-top:14px"><button class="link" onClick=${() => setVerFeitas(!verFeitas)}>${verFeitas ? 'Esconder' : 'Mostrar'} ${feitas.length} feita${feitas.length > 1 ? 's' : ''}</button>
      ${verFeitas && html`<ul class="lista painel" style="margin-top:8px">${feitas.map(item)}</ul>`}</div>`}
    <p class="muted" style="font-size:12.5px;margin-top:14px">Toque no círculo para marcar como feita. Arraste para a esquerda para apagar.</p>
  </main>`;
}
