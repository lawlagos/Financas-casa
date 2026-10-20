import { useState } from '../../vendor/hooks.module.js';
import { html } from '../html.js';
import { Icone } from '../icones.js';
import { Folha, Segmento, Chips, Campo } from '../componentes.js';
import { useStore, salvar, salvarVarias, fecharFolha, toast, config, abrirFolha } from '../../data/store.js';
import { brl, parseBRL, toCents } from '../../core/money.js';
import { addDays, fmtDay } from '../../core/dates.js';
import { custoReceita, custoInsumo, ingredientesDe, VALIDADE_PADRAO, precoNoCanal, totaisCarrinho, CANAIS, MARKUP_PADRAO, lerCustos, valorMinuto, ehSabor, ehPreparo, idPreparo, produtosDoSabor, TAMANHOS_PADRAO } from '../../core/pudim.js';
import { interpretarEstoque } from '../../core/vozestoque.js';
import { registrarFala, taxaIfood, registrarLote, registrarEnvio, editarMovimento, apagarMovimento, itensDaVenda, itensDoLote } from '../../data/pudim-acoes.js';
import { CampoFala } from '../voz.js';
import { chaveProduto, produtoDoItem, produtos } from '../../core/mercado.js';
import { contasAtivas } from '../derivados.js';
import { SelectConta } from './lancamento.js';
import { dadosPudim, porTamanho, fmtQtd } from '../telas/pudim.js';
import { embalagemBase, locaisDoProduto } from '../../core/estoqueinsumos.js';
import { cartoesEstoque } from '../../core/cardapio.js';

// "1,5" e "1.5" são um e meio; "1.500" (com vírgula ou três casas depois do ponto) é mil e quinhentos.
const numero = (t) => {
  const x = String(t ?? '').trim();
  const limpo = x.includes(',') ? x.replace(/\./g, '').replace(',', '.') : /^\d{1,3}(\.\d{3})+$/.test(x) ? x.replace(/\./g, '') : x;
  const n = Number(limpo);
  return Number.isFinite(n) ? n : 0;
};
const virgula = (n) => (n === '' || n === null || n === undefined ? '' : String(n).replace('.', ','));
const reais = (cents) => Math.round(cents) / 100;

const TITULO = { producao: 'Produzi', perda: 'Perdi' };

function LinhaCusto({ rot, valor, ajuda }) {
  return html`<div style="display:flex;justify-content:space-between;margin-top:4px;font-size:14px"><span>${rot}${ajuda ? html` <span class="muted">(${ajuda})</span>` : ''}</span><span>${brl(valor)}</span></div>`;
}
const MOTIVOS = [['vencido', 'Venceu'], ['quebrou', 'Quebrou ou estragou'], ['consumo', 'Consumo ou brinde']];
const UNIDADES = [['g', 'g'], ['kg', 'kg'], ['ml', 'ml'], ['l', 'litro'], ['un', 'unidade']];
const BASE_TXT = { g: 'g', kg: 'g', ml: 'ml', l: 'ml', un: 'un' };

// Escolha do local (São Roque, Ibiúna). Só aparece com mais de um local.
function EscolheLocal({ locais, valor, onChange, rotulo = 'Onde' }) {
  if (locais.length < 2) return null;
  return html`<div class="campo"><span>${rotulo}</span><${Segmento} rotulo=${rotulo} valor=${valor} onChange=${onChange} opcoes=${locais.map((l) => [l.id, l.nome])} /></div>`;
}
// Pudins de um local (Ibiúna não tem geladinho).
const produtosDoLocal = (d, local) => d.receitas.filter((r) => locaisDoProduto(r, d.locais).some((l) => l.id === local));

// Produzi ou Perdi: um movimento de estoque. Venda é pela tela Vender (PDV) ou pela voz.
export function FolhaMovimento({ tipo = 'producao', receita_id: receitaPedida, quantidade: qtdPedida, local: localPedido }) {
  const s = useStore();
  const d = dadosPudim(s);
  const [local, setLocal] = useState(d.locaisPorId[localPedido] ? localPedido : d.locais[0].id);
  const ultimoMov = [...d.movimentos].reverse().find((m) => m.tipo === tipo && d.receitasPorId[m.receita_id]);
  // Só receitas em uso: a última usada pode ter sido desativada.
  const inicial = (receitaPedida && d.receitas.find((r) => r.id === receitaPedida)?.id) || (ultimoMov && d.receitas.find((r) => r.id === ultimoMov.receita_id)?.id) || d.receitas[0]?.id || '';
  const qtdPadrao = (id) => (tipo === 'producao' ? String(d.receitasPorId[id]?.rendimento || 1) : '1');
  const [f, setF] = useState({
    receita_id: inicial,
    quantidade: qtdPedida ? String(qtdPedida) : qtdPadrao(inicial),
    data: s.hoje,
    validade: '',
    motivo: 'vencido',
  });
  const [tentou, setTentou] = useState(false);
  const set = (p) => setF((x) => ({ ...x, ...p }));
  const r = d.receitasPorId[f.receita_id];
  const c = d.custos[f.receita_id];
  const qtd = numero(f.quantidade);
  const validade = f.validade || addDays(f.data, Number(r?.validade_dias) || VALIDADE_PADRAO);
  const doLocal = produtosDoLocal(d, local);
  const tem = d.prontos[local]?.[f.receita_id] || 0;
  const trocaReceita = (id) => set({ receita_id: id, quantidade: qtdPadrao(id), validade: '' });
  const trocaLocal = (l) => {
    setLocal(l);
    // Geladinho não vai para Ibiúna: troca para o primeiro pudim que o local tem.
    if (!produtosDoLocal(d, l).some((x) => x.id === f.receita_id)) trocaReceita(produtosDoLocal(d, l)[0]?.id || '');
  };
  const ok = r && qtd > 0 && doLocal.some((x) => x.id === f.receita_id);

  const guardar = async () => {
    setTentou(true);
    if (!ok) return;
    // Mesmo caminho da fala: grava o movimento e, na produção, a saída dos ingredientes (tudo ou nada).
    try {
      await registrarFala({ movimentos: [{ tipo, receita: r, quantidade: qtd, custo: c.porUnidade, fixo: c.fixoUnidade, validade: tipo === 'producao' ? validade : '' }], venda: null, data: f.data, motivo: f.motivo, local });
    } catch {
      return;
    }
    fecharFolha();
    toast(tipo === 'producao' ? `${virgula(qtd)} ${r.nome} no estoque${d.locais.length > 1 ? ` de ${d.locaisPorId[local].nome}` : ''}` : 'Perda registrada');
  };

  if (!d.receitas.length) {
    return html`<${Folha} titulo=${TITULO[tipo]}><p class="muted">Cadastre ou importe as receitas primeiro, em Pudim > Receitas.</p><//>`;
  }
  return html`<${Folha} titulo=${TITULO[tipo]} rodape=${html`<button class=${`btn btn-pri ${!ok ? 'inativo' : ''}`} disabled=${tentou && !ok} onClick=${guardar}>${tipo === 'producao' ? 'Pôr no estoque' : 'Registrar perda'}</button>`}>
    <${EscolheLocal} locais=${d.locais} valor=${local} onChange=${trocaLocal} />
    <${Campo} rotulo="Qual pudim">
      <select aria-label="Qual pudim" value=${f.receita_id} onChange=${(e) => trocaReceita(e.target.value)}>
        ${doLocal.map((x) => html`<option value=${x.id}>${x.nome}</option>`)}
      </select>
    <//>
    <div class="linha2">
      <${Campo} rotulo=${tipo === 'producao' ? 'Quantas unidades' : 'Quantas'} ajuda=${tipo === 'producao' && r ? `A receita rende ${r.rendimento || 1}.` : tem ? `Na geladeira: ${tem}.` : tipo !== 'producao' ? 'Nenhum no estoque.' : ''}>
        <input id="mov-quantidade" inputmode="decimal" value=${f.quantidade} onInput=${(e) => set({ quantidade: e.target.value })} aria-invalid=${tentou && !(qtd > 0)} />
      <//>
      <${Campo} rotulo="Dia"><input type="date" value=${f.data} onInput=${(e) => set({ data: e.target.value })} /><//>
    </div>

    ${tipo === 'producao' && html`
      <${Campo} rotulo="Vence em" ajuda=${`Validade de ${r?.validade_dias || VALIDADE_PADRAO} dias, pela receita. Pode mudar aqui.`}>
        <input type="date" value=${validade} onInput=${(e) => set({ validade: e.target.value })} />
      <//>
      <div class="painel painel-pad" style="margin-top:14px">
        <div style="display:flex;justify-content:space-between"><span>Ingredientes e embalagem de cada</span><strong>${brl(c.porUnidade)}</strong></div>
        <div style="display:flex;justify-content:space-between;margin-top:6px"><span>Gasto em ingredientes e embalagens</span><strong>${brl(Math.round(c.porUnidade * qtd))}</strong></div>
        ${c.fixoUnidade > 0 && html`<div style="display:flex;justify-content:space-between;margin-top:6px"><span>Custo completo de cada (com mão de obra e despesas)</span><strong>${brl(c.completoUnidade)}</strong></div>`}
        ${c.faltando.length > 0 && html`<div class="duvida" style="margin-top:10px"><${Icone} n="alerta" /><span>Sem preço: ${c.faltando.join(', ')}. O custo está menor do que o real.</span></div>`}
      </div>`}

    ${tipo === 'perda' && html`
      <div class="campo"><span>O que houve</span><${Chips} rotulo="Motivo" valor=${f.motivo} onChange=${(v) => set({ motivo: v || 'vencido' })} opcoes=${MOTIVOS} /></div>
      <p class="muted" style="font-size:13px;margin:10px 0 0">Sai do estoque pelos mais antigos. Custo perdido: cerca de ${brl(Math.round(c.porUnidade * qtd))}.</p>`}
  <//>`;
}

// Lista de pudins com um campo de quantidade cada (lote e envio).
function Quantidades({ lista, qtds, setQtd, extra }) {
  return html`<ul class="lista painel" style="margin-top:12px">
    ${lista.map((r) => html`<li class="item"><div class="corpo"><div class="tit">${r.nome}</div>${extra && html`<div class="meta">${extra(r)}</div>`}</div>
      <input class="qtd-lote" aria-label=${`Quantos ${r.nome}`} inputmode="decimal" placeholder="0" value=${qtds[r.id] ?? ''} onInput=${(e) => setQtd(r.id, e.target.value)} style="width:72px;text-align:right" />
    </li>`)}
  </ul>`;
}

// Novo lote: vários sabores feitos juntos, no mesmo local e com a mesma validade.
export function FolhaLote({ local: localPedido }) {
  const s = useStore();
  const d = dadosPudim(s);
  const [local, setLocal] = useState(d.locaisPorId[localPedido] ? localPedido : d.locais[0].id);
  const [data, setData] = useState(s.hoje);
  const [validade, setValidade] = useState('');
  const [qtds, setQtds] = useState({});
  const [salvando, setSalvando] = useState(false);
  // Na ordem do cardápio (copo, 1 kg e 500 g, geladinhos).
  const grupos = cartoesEstoque(d.receitas, [], s.hoje, { local, locais: d.locais });
  const lista = grupos.flatMap((g) => g.cartoes.map((c) => c.receita));
  const itens = lista.map((r) => ({ receita: r, quantidade: numero(qtds[r.id]) })).filter((i) => i.quantidade > 0);
  // Validade sugerida: a menor entre os pudins do lote (copo 25 dias, 1 kg e 500 g 7 dias, geladinho 60).
  const diasMin = Math.min(...itens.map((i) => Number(i.receita.validade_dias) || VALIDADE_PADRAO));
  const vence = validade || addDays(data, Number.isFinite(diasMin) ? diasMin : VALIDADE_PADRAO);
  const total = itens.reduce((t, i) => t + i.quantidade, 0);
  const custo = itens.reduce((t, i) => t + i.quantidade * (d.custos[i.receita.id]?.porUnidade || 0), 0);
  const guardar = async () => {
    if (!itens.length) return;
    setSalvando(true);
    try {
      await registrarLote({ itens: itens.map((i) => ({ ...i, custo: d.custos[i.receita.id]?.porUnidade || 0, fixo: d.custos[i.receita.id]?.fixoUnidade || 0 })), data, validade: vence, local });
      fecharFolha();
      toast(`Lote com ${total} pudins no estoque${d.locais.length > 1 ? ` de ${d.locaisPorId[local].nome}` : ''}, vence ${fmtDay(vence)}`);
    } catch {
      setSalvando(false);
    }
  };
  return html`<${Folha} titulo="Novo lote" rodape=${html`<button class=${`btn btn-pri ${salvando ? 'carregando' : ''}`} disabled=${!itens.length || salvando} onClick=${guardar}>${salvando ? 'Salvando…' : total ? `Pôr ${virgula(total)} no estoque` : 'Pôr no estoque'}</button>`}>
    <p class="muted" style="font-size:13px;margin:0 0 6px">Vários sabores feitos juntos, com a mesma validade. Digite quantos de cada.</p>
    <${EscolheLocal} locais=${d.locais} valor=${local} onChange=${setLocal} />
    <div class="linha2">
      <${Campo} rotulo="Feito no dia"><input type="date" value=${data} onInput=${(e) => setData(e.target.value)} /><//>
      <${Campo} rotulo="Vence em"><input type="date" aria-label="Vence em" value=${vence} onInput=${(e) => setValidade(e.target.value)} /><//>
    </div>
    ${grupos.map((g) => html`<h3 class="cardapio-tit" style="margin-top:14px">${g.titulo}</h3>
      <${Quantidades} lista=${g.cartoes.map((c) => c.receita)} qtds=${qtds} setQtd=${(id, v) => setQtds((x) => ({ ...x, [id]: v }))} extra=${(r) => `rende ${r.rendimento || 1} por fornada · vale ${r.validade_dias || VALIDADE_PADRAO} dias`} />`)}
    ${itens.length > 0 && html`<p class="muted" style="font-size:13px;margin:10px 2px 0">${total} pudins, ${brl(Math.round(custo))} em ingredientes e embalagens (sai do estoque de ingredientes).</p>`}
  <//>`;
}

// Enviar pudins de um local para outro (ex.: de São Roque para Ibiúna). Vão com a validade de cada lote.
export function FolhaEnvio({ de: dePedido, para: paraPedido, quantidades = {} }) {
  const s = useStore();
  const d = dadosPudim(s);
  const ids = d.locais.map((l) => l.id);
  const [de, setDe] = useState(ids.includes(dePedido) ? dePedido : ids[0]);
  const [para, setPara] = useState(ids.includes(paraPedido) && paraPedido !== de ? paraPedido : ids.find((x) => x !== de) || '');
  const [data, setData] = useState(s.hoje);
  const [qtds, setQtds] = useState(() => Object.fromEntries(Object.entries(quantidades).map(([k, v]) => [k, virgula(v)])));
  const [salvando, setSalvando] = useState(false);
  const temEm = (loc, id) => d.prontos[loc]?.[id] || 0;
  const trocaDe = (v) => {
    setDe(v);
    if (para === v) setPara(ids.find((x) => x !== v) || '');
  };
  // O que pode ir: o que o destino trabalha (Ibiúna não tem geladinho), com o que tem na origem primeiro.
  const lista = produtosDoLocal(d, para).filter((r) => temEm(de, r.id) > 0 || qtds[r.id]).sort((a, b) => temEm(de, b.id) - temEm(de, a.id) || a.nome.localeCompare(b.nome));
  const itens = lista.map((r) => ({ receita: r, quantidade: numero(qtds[r.id]) })).filter((i) => i.quantidade > 0);
  const passa = itens.filter((i) => i.quantidade > temEm(de, i.receita.id));
  const total = itens.reduce((t, i) => t + i.quantidade, 0);
  const nome = (id) => d.locaisPorId[id]?.nome || id;
  const guardar = async () => {
    if (!itens.length || !para || para === de) return;
    setSalvando(true);
    try {
      await registrarEnvio({ itens, de, para, data });
      fecharFolha();
      toast(`${total} pudins enviados de ${nome(de)} para ${nome(para)}`);
    } catch {
      setSalvando(false);
    }
  };
  if (d.locais.length < 2) return html`<${Folha} titulo="Enviar"><p class="muted">Só há um local de estoque.</p><//>`;
  return html`<${Folha} titulo="Enviar pudins" rodape=${html`<button class=${`btn btn-pri ${salvando ? 'carregando' : ''}`} disabled=${!itens.length || salvando} onClick=${guardar}>${salvando ? 'Salvando…' : `Enviar ${total || ''} para ${nome(para)}`.replace('  ', ' ')}</button>`}>
    <${EscolheLocal} locais=${d.locais} valor=${de} onChange=${trocaDe} rotulo="Sai de" />
    <${EscolheLocal} locais=${d.locais.filter((l) => l.id !== de)} valor=${para} onChange=${setPara} rotulo="Vai para" />
    ${d.locais.length === 2 && html`<p class="muted" style="font-size:13px;margin:6px 2px 0">Vai para ${nome(para)}.</p>`}
    <${Campo} rotulo="Dia"><input type="date" value=${data} onInput=${(e) => setData(e.target.value)} /><//>
    ${lista.length
      ? html`<${Quantidades} lista=${lista} qtds=${qtds} setQtd=${(id, v) => setQtds((x) => ({ ...x, [id]: v }))} extra=${(r) => `tem ${temEm(de, r.id)} em ${nome(de)}, ${temEm(para, r.id)} em ${nome(para)}`} />`
      : html`<p class="muted" style="margin-top:12px">${nome(de)} não tem pudim pronto para enviar.</p>`}
    ${passa.length > 0 && html`<div class="duvida" style="margin-top:10px"><${Icone} n="alerta" /><span>${passa.map((i) => `${nome(de)} só tem ${temEm(de, i.receita.id)} ${i.receita.nome}`).join('; ')}. O que passar chega com a validade de hoje e fica devendo na origem até a próxima produção.</span></div>`}
  <//>`;
}

// Um pudim do estoque: quanto tem em cada local, por validade, quanto custa e quanto sobra em cada canal.
export function FolhaEstoqueProduto({ receita_id, local: localTela = '' }) {
  const s = useStore();
  const d = dadosPudim(s);
  const r = d.receitasPorId[receita_id];
  if (!r) return html`<${Folha} titulo="Pudim"><p class="muted">Esse pudim não existe mais.</p><//>`;
  const c = d.custos[r.id];
  const taxaPct = taxaIfood();
  const direta = toCents(r.preco_venda || 0);
  const ifood = precoNoCanal(r, 'ifood', taxaPct);
  const liquidoIfood = ifood.preco - Math.round((ifood.preco * taxaPct) / 100);
  const amanha = addDays(s.hoje, 1);
  const locais = locaisDoProduto(r, d.locais);
  const porLocal = locais.map((l) => {
    const porValidade = {};
    let investido = 0;
    for (const lt of d.lotes) {
      if (lt.receita_id !== r.id || lt.local !== l.id) continue;
      porValidade[lt.validade] = (porValidade[lt.validade] || 0) + lt.restante;
      if (lt.validade >= s.hoje) investido += lt.restante * lt.custo;
    }
    const linhas = Object.entries(porValidade).sort(([a], [b]) => (a < b ? -1 : 1)).map(([validade, quantidade]) => ({ validade, quantidade, vencido: validade < s.hoje }));
    const minimo = Math.ceil((Number(r.estoque_minimo) || 0) * (Number(r.rendimento) || 1) * (Number(l.fator) || 0));
    return { local: l, linhas, prontos: linhas.filter((x) => !x.vencido).reduce((t, x) => t + x.quantidade, 0), minimo, investido };
  });
  const opLocal = d.locaisPorId[localTela] && locais.some((l) => l.id === localTela) ? localTela : locais[0]?.id || d.locais[0].id;
  const quando = (v) => (v < s.hoje ? `venceu ${fmtDay(v)}` : v === s.hoje ? 'vence hoje' : v === amanha ? 'vence amanhã' : `vence ${fmtDay(v)}`);
  const ir = (tipo, props) => abrirFolha(tipo, props);
  return html`<${Folha} titulo=${r.nome}>
    <div class="painel painel-pad">
      <div style="display:flex;justify-content:space-between;gap:10px"><span>Custo de cada (ingredientes e embalagem)</span><strong style="white-space:nowrap">${brl(c.completoUnidade)}</strong></div>
      <div style="display:flex;justify-content:space-between;gap:10px;margin-top:6px"><span>Venda direta ${direta ? brl(direta) : '—'}</span><strong class=${direta - c.completoUnidade < 0 ? 'neg' : 'pos'}>${direta ? `lucro ${brl(direta - c.completoUnidade)}` : 'sem preço'}</strong></div>
      <div style="display:flex;justify-content:space-between;gap:10px;margin-top:6px"><span>iFood ${ifood.preco ? brl(ifood.preco) : '—'}${ifood.calculado ? '*' : ''}</span><strong class=${liquidoIfood - c.completoUnidade < 0 ? 'neg' : 'pos'}>${ifood.preco ? `lucro ${brl(liquidoIfood - c.completoUnidade)}` : 'sem preço'}</strong></div>
      <div class="muted" style="font-size:12.5px;margin-top:6px">Validade de ${r.validade_dias || VALIDADE_PADRAO} dias. Uma fornada rende ${r.rendimento || 1}.${ifood.calculado ? ' * Sem preço de iFood cadastrado: calculado para sobrar o mesmo da venda direta.' : ''}</div>
    </div>
    ${porLocal.map((x) => html`<div class="estoque-local">
      <h4><span>${x.local.nome}</span><span class=${x.minimo > 0 && x.prontos < x.minimo ? 'neg' : ''}>${x.prontos} pronto${x.prontos === 1 ? '' : 's'}${x.minimo ? ` · mín. ${x.minimo}` : ''}</span></h4>
      ${x.linhas.length
        ? html`<ul class="lista painel">${x.linhas.map((l) => html`<li class="item"><div class="corpo"><div class="tit">${l.quantidade} ${l.quantidade === 1 ? 'unidade' : 'unidades'}</div></div>
            <div class=${`valor ${l.vencido ? 'neg' : l.validade <= amanha ? 'atencao' : ''}`} style="font-size:14px">${quando(l.validade)}</div></li>`)}</ul>`
        : html`<p class="muted" style="margin:2px 0 0;font-size:13.5px">Nenhum.</p>`}
      ${x.prontos > 0 && html`<p class="muted" style="margin:6px 2px 0;font-size:13px">Custaram ${brl(x.investido)} em ingredientes e embalagem (${brl(Math.round(x.investido / x.prontos))} cada). Se perder um, perde isso.</p>`}
    </div>`)}
    <div class="acoes acoes-pudim" style="margin-top:16px">
      <button class="btn btn-pri" onClick=${() => ir('movimento', { tipo: 'producao', receita_id: r.id, quantidade: Number(r.rendimento) || 1, local: opLocal })}>Produzi</button>
      <a class="btn btn-sec" href=${`#/pudim/vender?local=${opLocal}`} onClick=${() => fecharFolha()}>Vender</a>
      <button class="btn btn-sec" onClick=${() => ir('movimento', { tipo: 'perda', receita_id: r.id, local: opLocal })}>Perdi</button>
    </div>
    ${locais.length > 1 && html`<button class="btn btn-sec btn-larga" style="margin-top:8px" onClick=${() => {
      const de = porLocal.slice().sort((a, b) => b.prontos - a.prontos)[0].local.id;
      ir('envio', { de, quantidades: {} });
    }}>Enviar para outro local</button>`}
    <button class="link" style="margin-top:12px" onClick=${() => ir('receita', { receita: r })}>Preço, receita e validade</button>
  <//>`;
}

const TIPO_TXT = { producao: 'Produção', venda: 'Venda', perda: 'Perda', transferencia: 'Envio' };

// Corrigir um movimento: local, dia, quantidade, validade. Os saldos se refazem sozinhos:
// "tirei 3 de Ibiúna mas era de São Roque" → muda para São Roque, volta 3 para Ibiúna e sai 3 de São Roque.
export function FolhaEditarMovimento({ id }) {
  const s = useStore();
  const d = dadosPudim(s);
  const m = (s.tables.estoque || []).find((x) => x.id === id);
  const r = m && d.receitasPorId[m.receita_id];
  const localInicial = m ? m.local || d.locais[0].id : '';
  const [f, setF] = useState(() => ({
    local: localInicial, local_destino: m?.local_destino || d.locais.find((l) => l.id !== localInicial)?.id || '',
    data: m?.data || s.hoje, quantidade: virgula(m?.quantidade ?? ''), validade: m?.validade || '', obs: m?.obs || 'vencido', loteTodo: true,
    receita_id: m?.receita_id || '',
  }));
  const [salvando, setSalvando] = useState(false);
  if (!m) return html`<${Folha} titulo="Movimento"><p class="muted">Esse movimento não existe mais.</p><//>`;
  const set = (p) => setF((x) => ({ ...x, ...p }));
  const nome = (lid) => d.locaisPorId[lid]?.nome || lid;
  const venda = m.tipo === 'venda';
  const carrinho = venda ? itensDaVenda(m) : [];
  const lote = m.tipo === 'producao' ? itensDoLote(m) : [m];
  const qtd = numero(f.quantidade);
  const locaisOk = r ? locaisDoProduto(r, d.locais) : d.locais;
  const mudouLocal = f.local !== localInicial;
  const sai = m.tipo !== 'producao';
  // Prévia do que acontece com os saldos ao trocar o local.
  const qAntes = Number(m.quantidade) || 0;
  const qNovo = venda ? qAntes : qtd;
  const pudinsDoLocal = d.receitas.filter((x) => locaisDoProduto(x, d.locais).some((l) => l.id === f.local));
  const prevLocal = !mudouLocal || m.tipo === 'transferencia'
    ? ''
    : venda && carrinho.length > 1
      ? `Os ${carrinho.length} itens da venda voltam para ${nome(localInicial)} e saem de ${nome(f.local)}.`
      : sai
        ? `Volta${qAntes > 1 ? 'm' : ''} ${virgula(qAntes)} para ${nome(localInicial)} e sa${qNovo > 1 ? 'em' : 'i'} ${virgula(qNovo)} de ${nome(f.local)}.`
        : `Os ${virgula(qAntes)} saem de ${nome(localInicial)} e ficam em ${nome(f.local)}.`;
  const temNovo = d.prontos[f.local]?.[m.receita_id] || 0;
  const faltaNovo = sai && mudouLocal && !venda ? qtd > temNovo : venda && mudouLocal && carrinho.some((x) => Number(x.quantidade) > (d.prontos[f.local]?.[x.receita_id] || 0));
  const ok = venda ? true : qtd > 0 && f.data && (m.tipo !== 'transferencia' || (f.local_destino && f.local_destino !== f.local));

  const guardar = async () => {
    if (!ok) return;
    const mud = venda ? { local: f.local } : { local: f.local, data: f.data, quantidade: qtd };
    // Pudim trocado ("era copo, não 500 g"): a produção passa a custar o de cada do pudim certo.
    if (!venda && f.receita_id && f.receita_id !== m.receita_id) {
      mud.receita_id = f.receita_id;
      if (m.tipo === 'producao') {
        mud.custo_unitario = reais(d.custos[f.receita_id]?.porUnidade || 0);
        mud.custo_fixo_unitario = reais(d.custos[f.receita_id]?.fixoUnidade || 0);
        if (!f.validade || f.validade === m.validade) mud.validade = addDays(f.data, Number(d.receitasPorId[f.receita_id]?.validade_dias) || VALIDADE_PADRAO);
      }
    }
    if (m.tipo === 'producao' && !mud.validade) mud.validade = f.validade || m.validade;
    if (m.tipo === 'perda') mud.obs = f.obs;
    if (m.tipo === 'transferencia') mud.local_destino = f.local_destino;
    setSalvando(true);
    try {
      await editarMovimento(m, { ...mud, loteTodo: lote.length > 1 && f.loteTodo });
      fecharFolha();
      toast(prevLocal ? `Corrigido. ${prevLocal}` : 'Movimento corrigido');
    } catch {
      setSalvando(false);
    }
  };
  const apagarEste = async () => {
    await apagarMovimento(m);
    fecharFolha();
    toast(venda && m.lancamento_id ? 'Venda apagada, e o lançamento no caixa também' : 'Movimento apagado');
  };

  return html`<${Folha} titulo=${`Corrigir ${(TIPO_TXT[m.tipo] || 'movimento').toLowerCase()}`} rodape=${html`<button class="btn btn-sec" onClick=${apagarEste}>Apagar</button><button class=${`btn btn-pri ${salvando ? 'carregando' : ''}`} disabled=${!ok || salvando} onClick=${guardar}>${salvando ? 'Salvando…' : 'Salvar'}</button>`}>
    <div class="painel painel-pad"><strong>${TIPO_TXT[m.tipo] || m.tipo}: ${virgula(m.quantidade)} ${r?.nome || 'receita apagada'}</strong>
      <div class="muted" style="font-size:13px">${fmtDay(m.data)}${m.tipo === 'transferencia' ? `, de ${nome(localInicial)} para ${nome(m.local_destino)}` : d.locais.length > 1 ? `, ${nome(localInicial)}` : ''}${m.lancamento_id ? ', lançada no caixa' : ''}</div></div>
    <${EscolheLocal} locais=${m.tipo === 'transferencia' ? d.locais : locaisOk} valor=${f.local} onChange=${(v) => set({ local: v, ...(v === f.local_destino ? { local_destino: d.locais.find((l) => l.id !== v)?.id || '' } : {}) })}
      rotulo=${m.tipo === 'transferencia' ? 'Saiu de' : m.tipo === 'producao' ? 'Está em' : 'Saiu de'} />
    ${m.tipo === 'transferencia' && html`<${EscolheLocal} locais=${d.locais.filter((l) => l.id !== f.local)} valor=${f.local_destino} onChange=${(v) => set({ local_destino: v })} rotulo="Foi para" />`}
    ${prevLocal && html`<div class="duvida" style="margin-top:10px"><${Icone} n="info" /><span>${prevLocal}${faltaNovo ? ` ${nome(f.local)} ${venda ? 'não tem tudo isso' : `só tem ${temNovo}`} pronto; o resto fica devendo até a próxima produção ou envio.` : ''}</span></div>`}
    ${venda
      ? html`<p class="muted" style="font-size:13px;margin:10px 2px 0">${carrinho.length > 1 ? `A troca de local vale para a venda inteira (${carrinho.length} itens). ` : ''}Quantidade e dia estão ligados ao valor${m.lancamento_id ? ' lançado no caixa' : ' da venda'}: para mudar, apague a venda e lance de novo.</p>`
      : html`<${Campo} rotulo="Qual pudim">
        <select aria-label="Qual pudim" value=${f.receita_id} onChange=${(e) => set({ receita_id: e.target.value })}>
          ${!pudinsDoLocal.some((x) => x.id === f.receita_id) && html`<option value=${f.receita_id}>${d.receitasPorId[f.receita_id]?.nome || 'receita apagada'}</option>`}
          ${pudinsDoLocal.map((x) => html`<option value=${x.id}>${x.nome}</option>`)}
        </select>
      <//>
      ${m.tipo === 'producao' && f.receita_id !== m.receita_id && d.custos[f.receita_id] && html`<div class="duvida" style="margin-top:8px"><${Icone} n="info" /><span>Passa a custar ${brl(d.custos[f.receita_id].porUnidade)} cada (era ${brl(toCents(m.custo_unitario || 0))}).</span></div>`}
      <div class="linha2">
        <${Campo} rotulo="Quantos"><input aria-label="Quantos" inputmode="decimal" value=${f.quantidade} onInput=${(e) => set({ quantidade: e.target.value })} aria-invalid=${!(qtd > 0)} /><//>
        <${Campo} rotulo="Dia"><input type="date" value=${f.data} onInput=${(e) => set({ data: e.target.value })} /><//>
      </div>`}
    ${m.tipo === 'producao' && html`<${Campo} rotulo="Vence em"><input type="date" aria-label="Vence em" value=${f.validade} onInput=${(e) => set({ validade: e.target.value })} /><//>`}
    ${m.tipo === 'producao' && lote.length > 1 && html`<label class="interruptor"><span>Local, dia e validade valem para o lote inteiro (${lote.length} sabores)</span><input type="checkbox" checked=${f.loteTodo} onChange=${(e) => set({ loteTodo: e.target.checked })} /></label>`}
    ${m.tipo === 'perda' && html`<div class="campo"><span>O que houve</span><${Chips} rotulo="Motivo" valor=${f.obs} onChange=${(v) => set({ obs: v || 'vencido' })} opcoes=${MOTIVOS} /></div>`}
  <//>`;
}

// Cadastro de receita: rendimento, validade, preço e ingredientes com o custo de cada um.
// Três jeitos de receita: sabor (ingredientes de uma fornada, não se vende), tamanho de um sabor (rendimento,
// embalagens e preço; os ingredientes vêm do sabor) e receita avulsa (tudo nela mesma, como antes).
export function FolhaReceita({ receita, novoSabor, novoPreparo, sabor_id: novoTamanhoDe }) {
  const s = useStore();
  const d = dadosPudim(s);
  const saborDoTamanho = d.receitasPorId[receita?.sabor_id || novoTamanhoDe] || null;
  // Sabor apagado na planilha: o tamanho vira receita avulsa para dar para corrigir ou desligar.
  const modo = ehPreparo(receita) || novoPreparo ? 'preparo' : ehSabor(receita) || novoSabor ? 'sabor' : saborDoTamanho ? 'tamanho' : 'avulsa';
  const sabor = modo === 'tamanho' ? saborDoTamanho : null;
  const insumos = (s.tables.insumos || []).filter((x) => x.ativo !== false).sort((a, b) => a.nome.localeCompare(b.nome));
  const [f, setF] = useState(() => ({
    nome: receita?.nome || (sabor ? `${sabor.nome} ` : ''),
    porcao: receita?.porcao || '',
    rendimento: virgula(receita?.rendimento || 1),
    validade_dias: virgula(receita?.validade_dias || sabor?.validade_dias || VALIDADE_PADRAO),
    tempo_preparo: virgula(receita?.tempo_preparo ?? ''),
    markup: receita?.markup === '' || receita?.markup == null
      ? (modo === 'tamanho' ? '' : virgula(MARKUP_PADRAO * 100))
      : virgula(Math.round(Number(receita.markup) * 1000) / 10),
    preco_venda: virgula(receita?.preco_venda || ''),
    preco_ifood: virgula(receita?.preco_ifood || ''),
    ingredientes: ingredientesDe(receita).map((x) => ({ insumo_id: x.insumo_id, quantidade: virgula(x.quantidade) })),
    ativo: receita?.ativo !== false,
    criarTamanhos: true,
    // Mínimo digitado em unidades (12 copos); guardado em fornadas, que é o que o estoque de ingredientes usa.
    estoque_minimo: receita?.estoque_minimo ? virgula(Math.round(Number(receita.estoque_minimo) * (Number(receita.rendimento) || 1) * 100) / 100) : '',
  }));
  const [tentou, setTentou] = useState(false);
  const set = (p) => setF((x) => ({ ...x, ...p }));
  const setIng = (i, p) => set({ ingredientes: f.ingredientes.map((x, j) => (j === i ? { ...x, ...p } : x)) });
  const montar = () => ({
    ...(receita || {}),
    nome: f.nome.trim(),
    tipo: modo === 'sabor' ? 'sabor' : modo === 'preparo' ? 'preparo' : modo === 'tamanho' ? 'produto' : receita?.tipo || '',
    sabor_id: modo === 'tamanho' ? sabor?.id || '' : '',
    porcao: modo === 'tamanho' ? f.porcao.trim() : '',
    rendimento: modo === 'sabor' ? 1 : numero(f.rendimento) || 1,
    estoque_minimo: modo === 'sabor' || modo === 'preparo' || !numero(f.estoque_minimo) ? '' : Math.round((numero(f.estoque_minimo) / (numero(f.rendimento) || 1)) * 10000) / 10000,
    validade_dias: numero(f.validade_dias) || VALIDADE_PADRAO,
    tempo_preparo: modo === 'tamanho' ? '' : numero(f.tempo_preparo) || '',
    markup: String(f.markup).trim() === '' ? '' : numero(f.markup) / 100,
    preco_venda: modo === 'sabor' || modo === 'preparo' ? '' : parseBRL(f.preco_venda) || '',
    preco_ifood: modo === 'sabor' || modo === 'preparo' ? '' : parseBRL(f.preco_ifood) || '',
    ingredientes: JSON.stringify(f.ingredientes.filter((x) => x.insumo_id && numero(x.quantidade) > 0).map((x) => ({ insumo_id: x.insumo_id, quantidade: numero(x.quantidade) }))),
    ativo: f.ativo,
  });
  const nova = montar();
  const c = custoReceita(nova, d.insumosPorId, d.itens, d.custosFixos, d.receitasPorId);
  const taxaPct = taxaIfood();
  const ifood = precoNoCanal(nova, 'ifood', taxaPct);
  const liquidoIfood = ifood.preco - Math.round((ifood.preco * taxaPct) / 100);
  const tamanhos = modo === 'sabor' && receita ? (s.tables.receitas || []).filter((r) => r.sabor_id === receita.id && r.ativo !== false).sort(porTamanho) : [];
  const faltamPadrao = TAMANHOS_PADRAO.filter((t) => !tamanhos.some((r) => String(r.porcao) === t.porcao));

  const guardar = async (zerarAlerta = false) => {
    setTentou(true);
    if (!nova.nome || (modo === 'tamanho' && !sabor)) return;
    // O custo de referência (para o alerta de alta) é o custo do momento em que o preço foi definido.
    const mudouPreco = toCents(nova.preco_venda || 0) !== toCents(receita?.preco_venda || 0);
    const custo_ref = modo === 'sabor' || modo === 'preparo' ? '' : mudouPreco || zerarAlerta || !receita?.custo_ref ? reais(c.porUnidade) : receita.custo_ref;
    const salvo = await salvar('receitas', { ...nova, custo_ref });
    if (modo === 'sabor') {
      // Sabor renomeado: os tamanhos que tinham o nome antigo acompanham.
      if (receita && receita.nome !== salvo.nome) {
        for (const t of tamanhos) if (t.nome.startsWith(receita.nome)) await salvar('receitas', { ...t, nome: salvo.nome + t.nome.slice(receita.nome.length) });
      }
      if (!receita && f.criarTamanhos) await salvarVarias('receitas', produtosDoSabor(salvo, s.tables.insumos));
    }
    fecharFolha();
    toast(modo === 'sabor' ? (receita ? 'Receita salva' : `Sabor criado${f.criarTamanhos ? ' com 1 kg, 500 g e copo' : ''}`) : modo === 'preparo' ? 'Preparo salvo' : modo === 'tamanho' ? (receita ? 'Tamanho salvo' : 'Tamanho criado') : 'Receita salva');
  };
  const criarPadrao = async () => {
    // Tamanho que já existiu (desligado) volta como estava, com preço e nome; só os novos nascem do padrão.
    const porId = d.receitasPorId;
    await salvarVarias('receitas', produtosDoSabor(receita, s.tables.insumos, faltamPadrao).map((novo) => (porId[novo.id] ? { ...porId[novo.id], ativo: true } : novo)));
    toast(`Tamanhos criados: ${faltamPadrao.map((t) => t.nome).join(', ')}`);
  };
  const titulo = receita
    ? modo === 'sabor' ? `Receita: ${receita.nome}` : receita.nome
    : modo === 'preparo' ? 'Novo preparo' : modo === 'sabor' ? 'Novo sabor' : modo === 'tamanho' ? `Novo tamanho de ${sabor?.nome || ''}` : 'Nova receita';
  const rotuloLista = modo === 'preparo' ? 'Ingredientes de um preparo' : modo === 'sabor' ? 'Ingredientes de uma receita (uma fornada)' : modo === 'tamanho' ? 'Embalagens e extras (por receita do sabor)' : 'Ingredientes e embalagens da receita inteira';

  return html`<${Folha} titulo=${titulo} rodape=${html`<button class="btn btn-pri" onClick=${() => guardar()}>${modo === 'sabor' ? 'Salvar receita' : modo === 'preparo' ? 'Salvar preparo' : modo === 'tamanho' ? 'Salvar tamanho' : 'Salvar receita'}</button>`}>
    ${modo === 'tamanho' && sabor && html`<div class="painel painel-pad" style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:6px">
      <span class="muted" style="font-size:13px">Tamanho do sabor <b>${sabor.nome}</b>: aqui ficam embalagem, rendimento, validade e preço.</span>
      <button class="btn btn-sec btn-mini" style="white-space:nowrap" onClick=${() => abrirFolha('receita', { receita: sabor })}>Ver receita</button></div>`}
    ${receita?.sabor_id && !saborDoTamanho && html`<div class="duvida" style="margin-top:0"><${Icone} n="alerta" /><span>O sabor deste tamanho foi apagado da planilha. Ele passa a ser uma receita avulsa: confira os ingredientes ou desligue.</span></div>`}
    ${modo === 'tamanho' && sabor && html`<div class="duvida" style="margin-top:0"><${Icone} n="info" /><span>Os ingredientes e o tempo de preparo vêm do sabor <strong>${sabor.nome}</strong>. Aqui ficam o rendimento, as embalagens e o preço.
      <button class="link" style="display:block;margin-top:4px" onClick=${() => abrirFolha('receita', { receita: sabor })}>Abrir o sabor</button></span></div>`}
    <${Campo} rotulo="Nome"><input id="receita-nome" value=${f.nome} onInput=${(e) => set({ nome: e.target.value })} aria-invalid=${tentou && !nova.nome} /><//>
    ${modo === 'tamanho' && html`<div class="linha2">
      <${Campo} rotulo="Tamanho (ml)"><input id="receita-porcao" value=${f.porcao} onInput=${(e) => set({ porcao: e.target.value })} /><//>
      <${Campo} rotulo="Rende (por receita)" ajuda="Quantas unidades uma receita do sabor dá."><input id="receita-rendimento" inputmode="decimal" value=${f.rendimento} onInput=${(e) => set({ rendimento: e.target.value })} /><//>
    </div>`}
    ${modo === 'preparo' && html`<div class="duvida" style="margin-top:0"><${Icone} n="info" /><span>Preparo é uma receita que entra em outras (calda, base). Diga quanto ela rende em gramas; nas receitas ele aparece em "Preparos" para escolher.</span></div>
      <${Campo} rotulo="Rende (gramas)"><input id="receita-rendimento" inputmode="decimal" value=${f.rendimento} onInput=${(e) => set({ rendimento: e.target.value })} /><//>`}
    ${modo === 'avulsa' && html`<${Campo} rotulo="Rende (unidades)"><input id="receita-rendimento" inputmode="decimal" value=${f.rendimento} onInput=${(e) => set({ rendimento: e.target.value })} /><//>`}
    ${modo !== 'preparo' && html`<div class="linha2">
      ${modo !== 'tamanho' && html`<${Campo} rotulo="Tempo de preparo (min)"><input id="receita-tempo" inputmode="numeric" value=${f.tempo_preparo} onInput=${(e) => set({ tempo_preparo: e.target.value })} /><//>`}
      <${Campo} rotulo="Validade (dias)"><input inputmode="numeric" value=${f.validade_dias} onInput=${(e) => set({ validade_dias: e.target.value })} /><//>
      <${Campo} rotulo="Markup (%)"><input id="receita-markup" inputmode="decimal" placeholder=${modo === 'tamanho' ? `do sabor: ${Math.round(c.markup * 1000) / 10}` : ''} value=${f.markup} onInput=${(e) => set({ markup: e.target.value })} /><//>
    </div>`}
    ${(modo === 'tamanho' || modo === 'avulsa') && html`<${Campo} rotulo="Estoque mínimo (unidades)" ajuda=${`Avisa quando houver menos de ${numero(f.estoque_minimo) || 0} prontos em São Roque (Ibiúna: metade) e calcula os ingredientes para manter em casa.`}>
      <input id="receita-minimo" inputmode="decimal" placeholder="0" value=${f.estoque_minimo} onInput=${(e) => set({ estoque_minimo: e.target.value })} /><//>`}
    ${modo !== 'sabor' && modo !== 'preparo' && html`
    <${Campo} rotulo="Preço de venda de cada" ajuda=${receita?.preco_sugerido ? `A planilha sugeria ${brl(toCents(receita.preco_sugerido))} (com salário e despesas fixas).` : ''}>
      <input id="receita-preco" inputmode="decimal" placeholder="0,00" value=${f.preco_venda} onInput=${(e) => set({ preco_venda: e.target.value })} />
    <//>
    <${Campo} rotulo="Preço no iFood" ajuda=${ifood.preco ? (ifood.calculado
      ? `Vazio: o app usa ${brl(ifood.preco)}, que depois da taxa de ${String(taxaPct).replace('.', ',')}% deixa o mesmo da venda direta.`
      : `Depois da taxa de ${String(taxaPct).replace('.', ',')}%, ficam ${brl(liquidoIfood)} (lucro ${brl(liquidoIfood - c.completoUnidade)}).`) : ''}>
      <input id="receita-preco-ifood" inputmode="decimal" placeholder=${ifood.calculado ? (ifood.preco / 100).toFixed(2).replace('.', ',') : '0,00'} value=${f.preco_ifood} onInput=${(e) => set({ preco_ifood: e.target.value })} />
    <//>`}

    ${modo === 'preparo' && html`<div class="painel painel-pad" style="margin-top:14px">
      <div style="display:flex;justify-content:space-between"><span>Custo do preparo inteiro</span><strong>${brl(c.total)}</strong></div>
      <div style="display:flex;justify-content:space-between;margin-top:6px"><span>Custo de 100 g</span><strong>${brl(Math.round((c.total / (numero(f.rendimento) || 1)) * 100))}</strong></div>
      ${c.faltando.length > 0 && html`<p class="muted" style="font-size:12.5px;margin:8px 0 0">Sem preço: ${c.faltando.join(', ')}.</p>`}
    </div>`}
    ${modo !== 'preparo' && html`<div class="painel painel-pad" style="margin-top:14px">
      <div class="rot-mercado" style="margin-bottom:4px">${modo === 'sabor' ? 'Custo de uma receita do sabor' : 'Custo da receita inteira'}</div>
      <${LinhaCusto} rot="(A) Mão de obra" valor=${c.maoDeObra} ajuda=${c.maoDeObra || !d.custosFixos.salario ? '' : 'informe o tempo de preparo'} />
      <${LinhaCusto} rot="(B) Ingredientes" valor=${c.ingredientes} />
      ${modo !== 'sabor' && html`<${LinhaCusto} rot="(C) Embalagens" valor=${c.embalagens} />`}
      <${LinhaCusto} rot="(D) Despesas fixas" valor=${c.despesas} />
      <div style="display:flex;justify-content:space-between;margin-top:8px;padding-top:8px;border-top:1px solid var(--line)"><span>Custo de produção</span><strong>${brl(c.completo)}</strong></div>
      ${modo !== 'sabor' && html`
      <div style="display:flex;justify-content:space-between;margin-top:6px"><span>Custo de cada (÷ ${nova.rendimento})</span><strong>${brl(c.completoUnidade)}</strong></div>
      <div style="display:flex;justify-content:space-between;margin-top:6px"><span>Preço sugerido (markup ${String(Math.round(c.markup * 1000) / 10).replace('.', ',')}%)</span><strong>${brl(c.sugerido)}</strong></div>
      ${c.preco > 0 && html`<div style="display:flex;justify-content:space-between;margin-top:6px"><span>Lucro livre de cada, com o seu preço</span><strong style="white-space:nowrap" class=${c.lucroUnidade < 0 ? 'neg' : 'pos'}>${brl(c.lucroUnidade)} (${Math.round(c.margem * 100)}%)</strong></div>`}`}
      ${!d.custosFixos.salario && !d.custosFixos.despesas.length && html`<p class="muted" style="font-size:12.5px;margin:8px 0 0">Mão de obra e despesas fixas estão zeradas. Configure em Receitas > Mão de obra e despesas fixas.</p>`}
      ${receita && modo !== 'sabor' && c.subiu > 0 && html`<div class="duvida" style="margin-top:10px"><${Icone} n="alerta" /><span>O custo subiu ${Math.round(c.subiu * 100)}% desde que o preço foi definido (era ${brl(toCents(receita.custo_ref))}).
        <button class="link" style="display:block;margin-top:4px" onClick=${() => guardar(true)}>Manter o preço e tirar o aviso</button></span></div>`}
    </div>`}

    ${modo === 'sabor' && receita && html`<div class="rot-mercado" style="margin:16px 0 6px">Tamanhos (o que vocês vendem)</div>
      <ul class="lista painel">
        ${tamanhos.map((t) => {
          const ct = d.custos[t.id];
          return html`<li><button class="item item-btn" onClick=${() => abrirFolha('receita', { receita: t })}>
            <div class="corpo"><div class="tit">${t.nome}</div><div class="meta">Rende ${t.rendimento}, custo ${brl(ct?.completoUnidade || 0)}</div></div>
            <div class="valor">${t.preco_venda ? brl(toCents(t.preco_venda)) : '—'}<small>sugerido ${brl(ct?.sugerido || 0)}</small></div></button></li>`;
        })}
        ${!tamanhos.length && html`<li class="item muted">Nenhum tamanho ainda.</li>`}
      </ul>
      <div class="acoes" style="margin-top:10px">
        ${faltamPadrao.length > 0 && html`<button class="btn btn-sec" style="flex:1" onClick=${criarPadrao}>Criar ${faltamPadrao.map((t) => t.porcao).join(', ')}</button>`}
        <button class="btn btn-sec" style="flex:1" onClick=${() => abrirFolha('receita', { sabor_id: receita.id })}><${Icone} n="mais" />Outro tamanho</button>
      </div>`}
    ${modo === 'sabor' && !receita && html`<label class="interruptor"><span>Criar 1 kg (rende 1), 500 g (rende 2) e copo de 150 (rende 6)</span><input type="checkbox" checked=${f.criarTamanhos} onChange=${(e) => set({ criarTamanhos: e.target.checked })} /></label>`}

    <div class="rot-mercado" style="margin:16px 0 6px">${rotuloLista}</div>
    <ul class="lista painel">
      ${f.ingredientes.map((x, i) => {
        const prep = idPreparo(x.insumo_id) ? d.receitasPorId[idPreparo(x.insumo_id)] : null;
        const ins = prep ? { nome: prep.nome, unidade: 'g' } : d.insumosPorId[x.insumo_id];
        const linha = c.linhas.find((l) => !l.doSabor && l.insumo?.id === x.insumo_id && l.quantidade === numero(x.quantidade));
        return html`<li class="item ing-linha">
          <select aria-label=${`Ingrediente ${i + 1}`} value=${x.insumo_id} onChange=${(e) => setIng(i, { insumo_id: e.target.value })}>
            <option value="">Escolha</option>
            ${insumos.map((o) => html`<option value=${o.id}>${o.nome}${o.tipo === 'embalagem' ? ' (embalagem)' : ''}</option>`)}
            ${d.preparos.filter((p) => p.id !== receita?.id).length > 0 && html`<optgroup label="Preparos (caldas, bases)">${d.preparos.filter((p) => p.id !== receita?.id).map((p) => html`<option value=${`preparo:${p.id}`}>${p.nome}</option>`)}</optgroup>`}
          </select>
          <input aria-label=${`Quantidade de ${ins?.nome || 'ingrediente'}`} inputmode="decimal" value=${x.quantidade} onInput=${(e) => setIng(i, { quantidade: e.target.value })} />
          <span class="muted ing-un">${BASE_TXT[ins?.unidade] || ''}</span>
          <span class="ing-custo">${linha?.custo != null ? brl(linha.custo) : '—'}</span>
          <button class="icone-btn" aria-label=${`Tirar ${ins?.nome || 'ingrediente'}`} onClick=${() => set({ ingredientes: f.ingredientes.filter((_, j) => j !== i) })}><${Icone} n="fechar" /></button>
        </li>`;
      })}
      ${!f.ingredientes.length && html`<li class="item muted">${modo === 'tamanho' ? 'Sem embalagem.' : 'Sem ingredientes.'}</li>`}
    </ul>
    <button class="btn btn-sec btn-larga" style="margin-top:10px" onClick=${() => set({ ingredientes: [...f.ingredientes, { insumo_id: '', quantidade: '' }] })}><${Icone} n="mais" />${modo === 'tamanho' ? 'Embalagem ou extra' : 'Ingrediente ou embalagem'}</button>
    ${receita && html`<label class="interruptor"><span>${modo === 'sabor' ? 'Sabor em uso' : modo === 'preparo' ? 'Preparo em uso' : 'Receita em uso'}</span><input type="checkbox" checked=${f.ativo} onChange=${(e) => set({ ativo: e.target.checked })} /></label>`}
  <//>`;
}

// Cadastro de ingrediente ou embalagem, com o histórico de preços das notas.
export function FolhaInsumo({ insumo }) {
  const s = useStore();
  const itens = s.tables.itens || [];
  const [f, setF] = useState(() => ({
    nome: insumo?.nome || '',
    tipo: insumo?.tipo || 'ingrediente',
    marca: insumo?.marca && insumo.marca !== '-' ? insumo.marca : '',
    qtd_embalagem: virgula(insumo?.qtd_embalagem || ''),
    unidade: insumo?.unidade || 'g',
    preco_embalagem: virgula(insumo?.preco_embalagem ?? ''),
    produto: insumo?.produto || insumo?.nome || '',
    ativo: insumo?.ativo !== false,
  }));
  const [tentou, setTentou] = useState(false);
  const set = (p) => setF((x) => ({ ...x, ...p }));
  const preco = String(f.preco_embalagem).trim() === '' ? '' : parseBRL(f.preco_embalagem) || 0;
  const montado = { ...(insumo || {}), ...f, nome: f.nome.trim(), produto: f.produto.trim(), qtd_embalagem: numero(f.qtd_embalagem) || '', preco_embalagem: preco };
  const c = custoInsumo(montado, itens);
  const chave = chaveProduto(montado.produto || montado.nome);
  const historico = itens.filter((it) => it.valor && chaveProduto(produtoDoItem(it)) === chave).sort((a, b) => (a.data < b.data ? 1 : -1)).slice(0, 12);
  const sugestoes = [...produtos(itens, { origem: 'Pudim', hoje: s.hoje }), ...produtos(itens, { origem: 'Casa', hoje: s.hoje })].map((p) => p.nome);
  const guardar = async () => {
    setTentou(true);
    if (!montado.nome) return;
    const mudouPreco = toCents(preco || 0) !== toCents(insumo?.preco_embalagem || 0);
    await salvar('insumos', { ...montado, data_preco: mudouPreco ? s.hoje : insumo?.data_preco || (preco ? s.hoje : '') });
    fecharFolha();
    toast(insumo ? 'Ingrediente salvo' : 'Ingrediente criado');
  };
  const porBase = c.porBase === null ? null : Math.round(c.porBase * (c.base === 'un' ? 1 : 1000));
  return html`<${Folha} titulo=${insumo ? insumo.nome : 'Novo ingrediente'} rodape=${html`<button class="btn btn-pri" onClick=${guardar}>Salvar</button>`}>
    <${Campo} rotulo="Nome"><input id="insumo-nome" value=${f.nome} onInput=${(e) => set({ nome: e.target.value })} aria-invalid=${tentou && !montado.nome} /><//>
    <div class="campo"><span>É</span><${Segmento} rotulo="Tipo" valor=${f.tipo} onChange=${(v) => set({ tipo: v })} opcoes=${[['ingrediente', 'Ingrediente'], ['embalagem', 'Embalagem']]} /></div>
    <${Campo} rotulo="Marca (opcional)"><input value=${f.marca} onInput=${(e) => set({ marca: e.target.value })} /><//>
    <div class="linha2">
      <${Campo} rotulo="Conteúdo da embalagem"><input id="insumo-qtd" inputmode="decimal" value=${f.qtd_embalagem} onInput=${(e) => set({ qtd_embalagem: e.target.value })} /><//>
      <${Campo} rotulo="Medida"><select aria-label="Medida" value=${f.unidade} onChange=${(e) => set({ unidade: e.target.value })}>${UNIDADES.map(([v, t]) => html`<option value=${v}>${t}</option>`)}</select><//>
    </div>
    <${Campo} rotulo="Preço da embalagem" ajuda="Use quando não tiver nota de mercado. Uma nota mais nova passa na frente.">
      <input id="insumo-preco" inputmode="decimal" placeholder="0,00" value=${f.preco_embalagem} onInput=${(e) => set({ preco_embalagem: e.target.value })} />
    <//>
    <${Campo} rotulo="Nome nas notas de mercado" ajuda="O mesmo nome de produto que aparece na tela Mercado; é assim que o preço das notas chega aqui.">
      <input value=${f.produto} list="insumo-produtos" onInput=${(e) => set({ produto: e.target.value })} />
      <datalist id="insumo-produtos">${sugestoes.map((n) => html`<option value=${n} />`)}</datalist>
    <//>
    <div class="painel painel-pad" style="margin-top:14px">
      <div style="display:flex;justify-content:space-between"><span>Custo usado nas receitas</span><strong>${porBase === null ? 'sem preço' : `${brl(porBase)} por ${c.base === 'un' ? 'unidade' : c.base === 'g' ? 'kg' : 'litro'}`}</strong></div>
      <div class="muted" style="font-size:13px;margin-top:4px">${c.fonte === 'nota' ? `Da nota de ${fmtDay(c.data)}${c.mercado ? ` no ${c.mercado}` : ''}${c.marca ? `, ${c.marca}` : ''}.` : c.fonte === 'cadastro' ? 'Do preço digitado acima.' : 'Digite o preço ou leia uma nota com este produto.'}</div>
    </div>
    ${historico.length > 0 && html`<div class="rot-mercado" style="margin:16px 0 6px">Compras nas notas</div>
      <ul class="lista painel">${historico.map((it) => html`<li class="item"><div class="corpo"><div class="tit">${it.descricao}</div>
        <div class="meta">${fmtDay(it.data)}${it.mercado ? `, ${it.mercado}` : ''}${it.marca ? `, ${it.marca}` : ''}${Number(it.quantidade) > 1 ? `, ${virgula(it.quantidade)} un` : ''}</div></div>
        <div class="valor">${brl(toCents(it.valor))}</div></li>`)}</ul>`}
    ${insumo && html`<label class="interruptor"><span>Em uso</span><input type="checkbox" checked=${f.ativo} onChange=${(e) => set({ ativo: e.target.checked })} /></label>`}
  <//>`;
}

const TIPOS_FALA = [['producao', 'Produziu'], ['venda', 'Vendeu'], ['perda', 'Perdeu'], ['transferencia', 'Enviou']];

// Estoque por voz: fala (ou digita) a frase, confere o rascunho e grava produção, venda e perda de uma vez.
export function FolhaVozEstoque({ local: localPedido = '' }) {
  const s = useStore();
  const d = dadosPudim(s);
  // Onde aconteceu (e de onde saem os envios). A frase pode dizer ("em Ibiúna"); senão, o local escolhido na tela.
  const [onde, setOnde] = useState(d.locaisPorId[localPedido] ? localPedido : d.locais[0].id);
  const contas = contasAtivas(s);
  const ultimaDireta = [...s.tables.lancamentos].reverse().find((l) => l.categoria_id === 'cat-venda-pudim' && l.conta_id !== 'ifood');
  const naGeladeira = Object.fromEntries(d.estoque.lista.map((x) => [x.receita_id, x.quantidade]));
  const [frase, setFrase] = useState('');
  const [r, setR] = useState(null);
  const [conta_id, setConta] = useState(ultimaDireta?.conta_id || (contas.find((c) => c.id === 'nubank-pj') ? 'nubank-pj' : ''));
  const [lancar, setLancar] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const taxaPct = taxaIfood();

  const entender = (texto) => {
    const x = interpretarEstoque(texto, { receitas: d.receitas, hoje: s.hoje, estoque: naGeladeira, locais: d.locais });
    const envio = x.itens.find((i) => i.tipo === 'transferencia');
    const novoOnde = x.local || envio?.local || '';
    if (novoOnde) setOnde(novoOnde);
    const base = novoOnde || onde;
    setR({ ...x, itens: x.itens.map((i) => ({ ...i, tipo: i.tipo || '', quantidade: i.quantidade ? virgula(i.quantidade) : '', local: i.local && i.local !== base ? i.local : '', para: i.para || (i.tipo === 'transferencia' ? d.locais.find((l) => l.id !== base)?.id || '' : '') })) });
  };
  const setItem = (k, p) => setR((x) => ({ ...x, itens: x.itens.map((i, j) => (j === k ? { ...i, ...p } : i)) }));
  const itens = (r?.itens || []).map((i) => ({ ...i, receita: d.receitasPorId[i.receita_id], qtd: numero(i.quantidade) }));
  const vendas = itens.filter((i) => i.tipo === 'venda');
  const linhasVenda = vendas.filter((i) => i.receita).map((i) => ({ receita: i.receita, quantidade: i.qtd, local: i.local || '', preco: precoNoCanal(i.receita, r.canal, taxaPct).preco, custo: d.custos[i.receita.id]?.porUnidade || 0, fixo: d.custos[i.receita.id]?.fixoUnidade || 0 }));
  const t = totaisCarrinho(linhasVenda, r?.canal, taxaPct);
  // Item com local próprio na frase ("perdi 2 em Ibiúna") ou o local de cima.
  const localDoItem = (i) => i.local || onde;
  const envioRuim = (i) => i.tipo === 'transferencia' && (!i.para || i.para === localDoItem(i));
  const pendente = itens.filter((i) => !i.receita || !(i.qtd > 0) || !i.tipo || envioRuim(i)).length + linhasVenda.filter((l) => !l.preco).length;
  const ok = r && itens.length && !pendente && (!vendas.length || !lancar || r.canal === 'ifood' || conta_id);

  const guardar = async () => {
    if (!ok) return;
    setSalvando(true);
    try {
      const outros = itens.filter((i) => i.tipo !== 'venda').map((i) => ({ tipo: i.tipo, receita: i.receita, quantidade: i.qtd, custo: d.custos[i.receita.id]?.porUnidade || 0, fixo: d.custos[i.receita.id]?.fixoUnidade || 0, local: localDoItem(i), para: i.para }));
      const res = await registrarFala({ movimentos: outros, venda: linhasVenda.length ? { linhas: linhasVenda, canal: r.canal, conta_id, lancar } : null, data: r.data, motivo: r.motivo, local: onde });
      const n = res.movimentos;
      const v = res.venda;
      fecharFolha();
      toast([n ? `${n} movimento${n > 1 ? 's' : ''} no estoque` : '', v ? `venda de ${brl(v.bruto)}${v.lancado ? ' lançada no caixa' : ''}${v.repasse ? ` (o iFood paga na quarta ${fmtDay(v.repasse)})` : ''}` : ''].filter(Boolean).join(' e ').replace(/^./, (c) => c.toUpperCase()));
    } catch {
      setSalvando(false);
    }
  };

  return html`<${Folha} titulo="Estoque por voz" rodape=${r && html`<button class=${`btn btn-pri ${salvando ? 'carregando' : ''}`} disabled=${!ok || salvando} onClick=${guardar}>${salvando ? 'Salvando…' : 'Confirmar'}</button>`}>
    <${CampoFala} id="voz-estoque" rotulo="O que aconteceu" frase=${frase} setFrase=${setFrase} onPronto=${entender}
      placeholder="Ex.: fiz uma fornada de tradicional no copo e vendi 2 brigadeirão de 1 kg no iFood" />
    <div class="acoes" style="margin-top:8px;justify-content:flex-end"><button class="btn btn-sec btn-mini" disabled=${!frase.trim()} onClick=${() => entender(frase)}>Entender</button></div>
    ${r && !itens.length && html`<div class="duvida" style="margin-top:10px"><${Icone} n="alerta" /><span>Não reconheci nenhum pudim. Fale o nome como está nas receitas, com o tamanho (ex.: "tradicional no copo", "brigadeirão 1 kg").</span></div>`}
    ${r && itens.length > 0 && html`
      <${Campo} rotulo="Dia"><input type="date" value=${r.data} onInput=${(e) => setR({ ...r, data: e.target.value })} /><//>
      <${EscolheLocal} locais=${d.locais} valor=${onde} onChange=${setOnde} />
      <ul class="lista painel" style="margin-top:12px">
        ${itens.map((i, k) => html`<li class="item voz-item">
          <select aria-label=${`O que houve no item ${k + 1}`} value=${i.tipo} onChange=${(e) => setItem(k, { tipo: e.target.value })}>
            ${!i.tipo && html`<option value="">❓</option>`}${TIPOS_FALA.map(([v, t2]) => html`<option value=${v}>${t2}</option>`)}
          </select>
          <input aria-label=${`Quantidade do item ${k + 1}`} inputmode="decimal" value=${i.quantidade} onInput=${(e) => setItem(k, { quantidade: e.target.value })} aria-invalid=${!(i.qtd > 0)} />
          <select class="voz-receita" aria-label=${`Pudim do item ${k + 1}`} value=${i.receita_id} onChange=${(e) => {
            const escolhida = d.receitasPorId[e.target.value];
            // "uma fornada de 150": ao escolher o pudim, as fornadas viram unidades pelo rendimento dele.
            setItem(k, { receita_id: e.target.value, ...(i.numFornadas && escolhida ? { quantidade: virgula(i.numFornadas * (Number(escolhida.rendimento) || 1)) } : {}) });
          }} aria-invalid=${!i.receita}>
            ${!i.receita_id && html`<option value="">❓ Qual pudim? (${i.trecho})</option>`}
            ${i.candidatos.length > 0 && html`<optgroup label="Mais prováveis">${i.candidatos.map((id) => html`<option value=${id}>${d.receitasPorId[id]?.nome}</option>`)}</optgroup>`}
            <optgroup label="Todos">${d.receitas.map((x) => html`<option value=${x.id}>${x.nome}</option>`)}</optgroup>
          </select>
          ${i.tipo === 'transferencia' && html`<select aria-label=${`Para onde foi o item ${k + 1}`} value=${i.para} onChange=${(e) => setItem(k, { para: e.target.value })} aria-invalid=${envioRuim(i)}>
            ${!i.para && html`<option value="">Para onde?</option>`}${d.locais.filter((l) => l.id !== localDoItem(i)).map((l) => html`<option value=${l.id}>para ${l.nome}</option>`)}
          </select>`}
          ${i.local && i.local !== onde && html`<span class="muted" style="font-size:12.5px;align-self:center">${i.tipo === 'transferencia' ? 'de' : 'em'} ${d.locaisPorId[i.local]?.nome || i.local}</span>`}
          <button class="icone-btn" aria-label=${`Tirar item ${k + 1}`} onClick=${() => setR({ ...r, itens: r.itens.filter((_, j) => j !== k) })}><${Icone} n="fechar" /></button>
        </li>`)}
      </ul>
      ${itens.some((i) => i.tipo === 'perda') && html`<div class="campo"><span>Por que perdeu</span><${Chips} rotulo="Motivo" valor=${r.motivo} onChange=${(v) => setR({ ...r, motivo: v || 'vencido' })} opcoes=${MOTIVOS} /></div>`}
      ${vendas.length > 0 && html`
        <div class="campo"><span>Venda</span><${Segmento} rotulo="Canal" valor=${r.canal} onChange=${(v) => setR({ ...r, canal: v })} opcoes=${[['direta', CANAIS.direta], ['ifood', CANAIS.ifood]]} /></div>
        <div class="painel painel-pad" style="margin-top:10px">
          <div style="display:flex;justify-content:space-between"><span>Total da venda</span><strong>${brl(t.bruto)}</strong></div>
          ${r.canal === 'ifood' && html`<div style="display:flex;justify-content:space-between;margin-top:6px"><span>Taxa iFood</span><span class="neg">− ${brl(t.taxa)}</span></div>`}
          ${linhasVenda.some((l) => !l.preco) && html`<div class="duvida" style="margin-top:8px"><${Icone} n="alerta" /><span>Pudim sem preço de venda: cadastre na receita ou use a tela Vender.</span></div>`}
        </div>
        <label class="interruptor"><span>Lançar a venda no caixa</span><input type="checkbox" checked=${lancar} onChange=${(e) => setLancar(e.target.checked)} /></label>
        ${lancar && r.canal === 'direta' && html`<${SelectConta} rotulo="Entrou em" valor=${conta_id} onChange=${setConta} contas=${contas} />`}`}
      ${pendente > 0 && html`<p class="muted" style="font-size:13px;margin:10px 0 0">Responda os ❓ para confirmar.</p>`}`}
  <//>`;
}

// Mão de obra e despesas fixas do pudim (a Base Cadastros da planilha): entram em cada receita pelo tempo de preparo.
export function FolhaCustosPudim() {
  const [f, setF] = useState(() => {
    const c = lerCustos(config('custos_pudim', ''));
    return {
      salario: virgula(c.salario), decimo: virgula(c.decimo), dias: virgula(c.dias), horas: virgula(c.horas),
      despesas: c.despesas.map((x) => ({ nome: x.nome || '', valor: virgula(x.valor), divisor: virgula(x.divisor || 1) })),
    };
  });
  const set = (p) => setF((x) => ({ ...x, ...p }));
  const setDesp = (i, p) => set({ despesas: f.despesas.map((x, j) => (j === i ? { ...x, ...p } : x)) });
  const montado = {
    salario: parseBRL(f.salario) || 0, decimo: parseBRL(f.decimo) || 0, dias: numero(f.dias) || 0, horas: numero(f.horas) || 0,
    despesas: f.despesas.filter((x) => x.nome.trim() || parseBRL(x.valor)).map((x) => ({ nome: x.nome.trim(), valor: parseBRL(x.valor) || 0, divisor: numero(x.divisor) || 1 })),
  };
  const m = valorMinuto(montado);
  const guardar = async () => {
    await salvar('config', { id: 'custos_pudim', valor: JSON.stringify(montado) });
    fecharFolha();
    toast('Custos do pudim salvos');
  };
  const minuto = (v) => (v / 100).toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  return html`<${Folha} titulo="Mão de obra e despesas fixas" rodape=${html`<button class="btn btn-pri" onClick=${guardar}>Salvar</button>`}>
    <p class="muted" style="font-size:13px;margin:0">Como na Base Cadastros da planilha. Cada receita soma o tempo de preparo vezes o valor do minuto.</p>
    <div class="linha2">
      <${Campo} rotulo="Salário da produtora (mês)"><input id="custos-salario" inputmode="decimal" value=${f.salario} onInput=${(e) => set({ salario: e.target.value })} /><//>
      <${Campo} rotulo="13º por mês"><input inputmode="decimal" value=${f.decimo} onInput=${(e) => set({ decimo: e.target.value })} /><//>
    </div>
    <div class="linha2">
      <${Campo} rotulo="Dias de trabalho no mês"><input inputmode="numeric" value=${f.dias} onInput=${(e) => set({ dias: e.target.value })} /><//>
      <${Campo} rotulo="Horas por dia"><input inputmode="decimal" value=${f.horas} onInput=${(e) => set({ horas: e.target.value })} /><//>
    </div>
    <div class="rot-mercado" style="margin:16px 0 6px">Despesas fixas do mês</div>
    <ul class="lista painel">
      ${f.despesas.map((x, i) => html`<li class="item ing-linha desp-linha">
        <input class="desp-nome" aria-label=${`Despesa ${i + 1}`} placeholder="Nome" value=${x.nome} onInput=${(e) => setDesp(i, { nome: e.target.value })} />
        <input aria-label=${`Valor de ${x.nome || 'despesa'}`} inputmode="decimal" placeholder="0,00" value=${x.valor} onInput=${(e) => setDesp(i, { valor: e.target.value })} />
        <span class="muted ing-un">÷</span>
        <input style="width:40px" aria-label=${`Dividir ${x.nome || 'despesa'} por`} inputmode="numeric" value=${x.divisor} onInput=${(e) => setDesp(i, { divisor: e.target.value })} />
        <button class="icone-btn" aria-label=${`Tirar ${x.nome || 'despesa'}`} onClick=${() => set({ despesas: f.despesas.filter((_, j) => j !== i) })}><${Icone} n="fechar" /></button>
      </li>`)}
    </ul>
    <div class="ajuda muted" style="font-size:12.5px;margin-top:6px">"÷" é a parte que cabe ao pudim: água 120 ÷ 6 conta 20 por mês. Use 1 para despesa só do pudim.</div>
    <button class="btn btn-sec btn-larga" style="margin-top:10px" onClick=${() => set({ despesas: [...f.despesas, { nome: '', valor: '', divisor: '1' }] })}><${Icone} n="mais" />Despesa</button>
    <div class="painel painel-pad" style="margin-top:14px">
      <div style="display:flex;justify-content:space-between"><span>Despesas que entram no pudim</span><strong style="white-space:nowrap">${brl(m.despesasMes)}/mês</strong></div>
      <div style="display:flex;justify-content:space-between;margin-top:6px"><span>Minuto de trabalho</span><strong>R$ ${minuto(m.maoDeObra)}</strong></div>
      <div style="display:flex;justify-content:space-between;margin-top:6px"><span>Minuto de despesas</span><strong>R$ ${minuto(m.despesas)}</strong></div>
    </div>
  <//>`;
}

// Contagem do que tem em casa (em embalagens: latas, caixinhas, pacotes; aceita meio, 0,5). Vira o ponto de partida
// do estoque de cada ingrediente; depois disso a produção desconta e as compras somam sozinhas.
export function FolhaContagem() {
  const s = useStore();
  const d = dadosPudim(s);
  const insumos = (s.tables.insumos || []).filter((x) => x.ativo !== false)
    .sort((a, b) => (d.minimo[b.id] ? 1 : 0) - (d.minimo[a.id] ? 1 : 0) || a.nome.localeCompare(b.nome));
  const [valores, setValores] = useState(() => Object.fromEntries(insumos.map((x) => [x.id, d.saldo[x.id] === undefined ? '' : virgula(Math.round((Math.max(0, d.saldo[x.id]) / embalagemBase(x)) * 10) / 10)])));
  const [salvando, setSalvando] = useState(false);
  const mudados = insumos.filter((x) => {
    const v = valores[x.id];
    if (String(v).trim() === '') return false;
    const antes = d.saldo[x.id] === undefined ? null : Math.round((Math.max(0, d.saldo[x.id]) / embalagemBase(x)) * 10) / 10;
    return numero(v) !== antes;
  });
  const guardar = async () => {
    setSalvando(true);
    try {
      const agora = new Date().toISOString();
      await salvarVarias('estoque_insumos', mudados.map((x) => ({
        data: s.hoje, insumo_id: x.id, tipo: 'contagem', quantidade: Math.round(numero(valores[x.id]) * embalagemBase(x) * 1000) / 1000, origem: 'contagem', ref: '', obs: '', criado_em: agora,
      })));
      fecharFolha();
      toast(`Contagem de ${mudados.length} ingrediente${mudados.length > 1 ? 's' : ''} salva`);
    } catch {
      setSalvando(false);
    }
  };
  return html`<${Folha} titulo="O que tem em casa" rodape=${html`<button class=${`btn btn-pri ${salvando ? 'carregando' : ''}`} disabled=${salvando || !mudados.length} onClick=${guardar}>${salvando ? 'Salvando…' : mudados.length ? `Salvar ${mudados.length} contage${mudados.length > 1 ? 'ns' : 'm'}` : 'Nada mudou'}</button>`}>
    <p class="muted" style="font-size:13px;margin:0 0 8px">Quantas embalagens tem de cada um (aceita 0,5 para meio pacote). Deixe em branco o que não quer contar agora.</p>
    <ul class="lista painel">
      ${insumos.map((x) => html`<li class="item contagem-linha">
        <div class="corpo"><div class="tit">${x.nome}</div>
          <div class="meta">1 emb. = ${fmtQtd(embalagemBase(x), x)}${d.minimo[x.id] ? ` · mínimo ${virgula(Math.ceil((d.minimo[x.id] / embalagemBase(x)) * 10) / 10)} emb.` : ''}</div></div>
        <input aria-label=${`Quantas embalagens de ${x.nome}`} inputmode="decimal" placeholder="—" value=${valores[x.id]} onInput=${(e) => setValores((v) => ({ ...v, [x.id]: e.target.value }))} />
      </li>`)}
    </ul>
  <//>`;
}
