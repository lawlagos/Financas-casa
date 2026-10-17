import { useState } from '../../vendor/hooks.module.js';
import { html } from '../html.js';
import { Icone } from '../icones.js';
import { Topo, Secao, Segmento, Vazio, Arrastavel } from '../componentes.js';
import { useStore, abrirFolha, salvarVarias, toast, config } from '../../data/store.js';
import { apagarMovimento, taxaIfood } from '../../data/pudim-acoes.js';
import { brl, brlSigned } from '../../core/money.js';
import { fmtDay, addDays, businessWeekStart } from '../../core/dates.js';
import { precoNoCanal, VALIDADE_PADRAO, custoReceita, processarEstoque, estoqueAtual, lotesNaGeladeira, lerLocais, localDe, semanaPudim, custoInsumo, lerCustos, valorMinuto, ehSabor, ehPreparo } from '../../core/pudim.js';
import { saldos, minimos, faltas, pudinsAbaixo, baseDe, embalagemBase } from '../../core/estoqueinsumos.js';
import { porId } from '../derivados.js';
import { cartoesEstoque } from '../../core/cardapio.js';
import { chaveProduto } from '../../core/mercado.js';
import { adicionarItens } from '../../data/lista-acoes.js';
import { FaixaDemo } from './inicio.js';

const ativo = (x) => x.ativo !== false && x.ativo !== 'FALSE';

// Tudo que as telas do pudim precisam, calculado de uma vez a partir das tabelas.
export function dadosPudim(s) {
  const insumosPorId = porId(s.tables.insumos || []);
  // "receitas" são os produtos que se vendem (tamanhos); os sabores só dão os ingredientes.
  const receitasPorId = porId(s.tables.receitas || []);
  // Tamanho de um sabor desligado também sai da venda (volta junto quando o sabor é religado).
  const saborDesligado = (r) => r.sabor_id && receitasPorId[r.sabor_id] && !ativo(receitasPorId[r.sabor_id]);
  const receitas = (s.tables.receitas || []).filter((r) => ativo(r) && !ehSabor(r) && !ehPreparo(r) && !saborDesligado(r)).sort((a, b) => a.nome.localeCompare(b.nome));
  const preparos = (s.tables.receitas || []).filter((r) => ativo(r) && ehPreparo(r)).sort((a, b) => a.nome.localeCompare(b.nome));
  const sabores = (s.tables.receitas || []).filter((r) => ativo(r) && ehSabor(r)).sort((a, b) => a.nome.localeCompare(b.nome));
  const itens = s.tables.itens || [];
  const custosFixos = lerCustos(config('custos_pudim', ''));
  const custos = {};
  for (const r of s.tables.receitas || []) custos[r.id] = custoReceita(r, insumosPorId, itens, custosFixos, receitasPorId);
  const movimentos = s.tables.estoque || [];
  // Locais do estoque (São Roque e Ibiúna, a não ser que a config diga outros).
  const locais = lerLocais(config('locais_estoque', ''));
  const locaisPorId = porId(locais);
  const { lotes, saidas } = processarEstoque(movimentos, (id) => ({ direto: custos[id]?.porUnidade || 0, fixo: custos[id]?.fixoUnidade || 0 }), locais);
  const estoque = estoqueAtual(lotes, receitasPorId, s.hoje);
  // Pronto (na validade) em cada local: { local: { receita_id: unidades } }.
  const prontos = Object.fromEntries(locais.map((l) => [l.id, {}]));
  for (const x of estoque.lista) for (const [loc, q] of Object.entries(x.porLocal)) if (q.quantidade) (prontos[loc] ||= {})[x.receita_id] = q.quantidade;
  // Estoque de ingredientes e mínimos (em fornadas, no produto).
  const { saldo, contadoEm } = saldos(s.tables.estoque_insumos || []);
  const minimo = minimos(receitas, receitasPorId, locais);
  return {
    insumosPorId, receitas, sabores, preparos, receitasPorId, custos, custosFixos, movimentos, saidas, estoque, itens, lotes, locais, locaisPorId, prontos,
    saldo, contadoEm, minimo, faltas: faltas({ saldo, minimo, insumosPorId }), abaixo: pudinsAbaixo(receitas, prontos, locais),
  };
}

// "1,2 kg", "800 g", "1,5 l", "12 un"
export function fmtQtd(q, insumo) {
  const b = baseDe(insumo);
  const n = (v, d = 1) => (Math.round(v * 10 ** d) / 10 ** d).toLocaleString('pt-BR');
  if (b === 'g') return Math.abs(q) >= 1000 ? `${n(q / 1000, 2)} kg` : `${n(q, 0)} g`;
  if (b === 'ml') return Math.abs(q) >= 1000 ? `${n(q / 1000, 2)} l` : `${n(q, 0)} ml`;
  return `${n(q, 1)} un`;
}
export const embalagensTxt = (q, insumo) => {
  const e = embalagemBase(insumo);
  return e > 1 ? `${(Math.round((q / e) * 10) / 10).toLocaleString('pt-BR')} emb. de ${fmtQtd(e, insumo)}` : '';
};

const ROTULO_MOV = { producao: 'Produziu', venda: 'Vendeu', perda: 'Perdeu', transferencia: 'Enviou' };
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

function Linha({ rot, valor, classe = '', forte }) {
  return html`<div style="display:flex;justify-content:space-between;gap:12px;margin-top:7px"><span>${rot}</span>${forte ? html`<strong class=${classe} style="white-space:nowrap">${valor}</strong>` : html`<span class=${classe} style="white-space:nowrap">${valor}</span>`}</div>`;
}

// Estoque como o cardápio: um cartão por pudim, com o que tem em cada local. Toque abre o pudim.
// O que está zerado e não tem mínimo (feito por encomenda, como o de 1 kg) fica numa linha só, para não poluir.
function GradeEstoque({ d, s, local }) {
  const grupos = cartoesEstoque(d.receitas, d.lotes, s.hoje, { local: local || null, locais: d.locais });
  const amanha = addDays(s.hoje, 1);
  const quando = (v) => (v === s.hoje ? 'vence hoje' : v === amanha ? 'vence amanhã' : `vence ${fmtDay(v)}`);
  const abrir = (c) => abrirFolha('estoque-produto', { receita_id: c.receita.id, local });
  const info = (c) => {
    const falta = c.porLocal.reduce((t, x) => t + Math.max(0, x.minimo - x.quantidade), 0);
    return [
      c.status === 'zerado' ? 'acabou' : c.status === 'baixo' ? `faltam ${falta}` : '',
      c.total && c.proximaValidade ? quando(c.proximaValidade) : '',
      c.vencidos ? `${c.vencidos} vencido${c.vencidos > 1 ? 's' : ''}` : '',
    ].filter(Boolean).join(' · ');
  };
  if (!grupos.length) return null;
  return html`${grupos.map((g) => {
    const cheios = g.cartoes.filter((c) => c.status !== 'vazio' || c.vencidos);
    const vazios = g.cartoes.filter((c) => c.status === 'vazio' && !c.vencidos);
    return html`<section class="cardapio-cat" aria-label=${g.titulo}>
    <h3 class="cardapio-tit">${g.titulo}</h3>
    ${cheios.length > 0 && html`<div class="grade-estoque">
      ${cheios.map((c) => html`<button class=${`cartao-estoque st-${c.status}`} aria-label=${`${c.receita.nome}: ${c.total} pronto${c.total === 1 ? '' : 's'}`} onClick=${() => abrir(c)}>
        <span class="ce-nome">${c.nome}</span>
        <span class="ce-num">${c.total}</span>
        ${c.porLocal.length > 1 && html`<span class="ce-locais">${c.porLocal.map((x) => html`<span><span>${x.local.nome}</span><b class=${x.minimo > 0 && x.quantidade < x.minimo ? 'neg' : ''}>${x.quantidade}</b></span>`)}</span>`}
        <span class="ce-info">${info(c)}</span>
      </button>`)}
    </div>`}
    ${vazios.length > 0 && html`<div class="ce-vazios"><span class="muted">Sem estoque:</span>
      ${vazios.map((c) => html`<button class="chip" aria-label=${`${c.receita.nome}: 0 prontos`} onClick=${() => abrir(c)}>${c.nome}</button>`)}</div>`}
  </section>`;
  })}`;
}

function AbaEstoque({ s, d }) {
  // Sem nada na semana que acabou de começar (sábado, dia de pagar o dízimo), abre na semana que fechou.
  const [data, setData] = useState(() => {
    const inicio = businessWeekStart(s.hoje);
    return d.movimentos.some((m) => m.data >= inicio) ? s.hoje : addDays(inicio, -1);
  });
  // Local escolhido ('' = todos). O de cima de tudo vale para os botões (Produzi, Vender, Perdi...).
  const [local, setLocal] = useState('');
  const nomeLocal = (id) => d.locaisPorId[id]?.nome || id || d.locais[0].nome;
  const e = local ? estoqueAtual(d.lotes, d.receitasPorId, s.hoje, local) : d.estoque;
  const lotes = lotesNaGeladeira(d.lotes, s.hoje, local || null);
  const abaixo = local ? d.abaixo.filter((x) => x.local.id === local) : d.abaixo;
  const sem = semanaPudim({ movimentos: d.movimentos, saidas: d.saidas, lancamentos: s.tables.lancamentos, data });
  const atual = sem.inicio === businessWeekStart(s.hoje);
  // Baixa dos vencidos sai de cada local onde eles estão.
  const darBaixa = async () => {
    const agora = new Date().toISOString();
    const linhas = e.lista.flatMap((x) => Object.entries(x.porLocal).filter(([loc, q]) => q.vencidos > 0 && (!local || loc === local)).map(([loc, q]) => ({
      data: s.hoje, local: loc, receita_id: x.receita_id, tipo: 'perda', quantidade: q.vencidos, custo_unitario: '', preco_unitario: '', validade: '', lancamento_id: '', obs: 'vencido', criado_em: agora,
    })));
    await salvarVarias('estoque', linhas);
    toast(`Baixa de ${plural(e.vencidos, 'pudim vencido', 'pudins vencidos')}`);
  };
  const doLocal = (m) => !local || localDe(m, d.locais) === local || (m.tipo === 'transferencia' && (m.local_destino || d.locais[0].id) === local);
  const recentes = d.movimentos.filter(doLocal).sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : String(b.criado_em) < String(a.criado_em) ? -1 : 1)).slice(0, 30);
  const apagarMov = async (m) => {
    const r = await apagarMovimento(m);
    toast(r.lancamentos ? `Venda apagada${r.itens > 1 ? ` (${r.itens} itens)` : ''}, e o lançamento no caixa também` : 'Movimento apagado');
  };
  const ondeMov = (m) => (m.tipo === 'transferencia' ? `${nomeLocal(m.local)} → ${nomeLocal(m.local_destino)}` : nomeLocal(m.local));
  // Lote na geladeira → abre a produção dele para corrigir validade ou local.
  const abrirLote = (g) => {
    const m = d.movimentos.find((x) => x.tipo === 'producao' && (x.lote_id || x.id) === g.lote);
    if (m) abrirFolha('editar-movimento', { id: m.id });
  };
  const resumoLote = (g) => Object.entries(g.itens).filter(([, q]) => q > 0).map(([id, q]) => `${q} ${d.receitasPorId[id]?.nome || '?'}`).sort((a, b) => a.replace(/^\d+ /, '').localeCompare(b.replace(/^\d+ /, ''))).join(', ');
  const opLocal = local || d.locais[0].id;

  return html`
    ${d.locais.length > 1 && html`<${Segmento} rotulo="Local" opcoes=${[['', 'Todos'], ...d.locais.map((l) => [l.id, l.nome])]} valor=${local} onChange=${setLocal} />`}
    <div class="painel painel-pad hero-pudim hero-compacto" style=${d.locais.length > 1 ? 'margin-top:10px' : ''}>
      <div><div class="rot-mercado">Pronto para vender${local ? ` em ${nomeLocal(local)}` : ''}</div>
        <div class="num-mercado">${plural(e.quantidade, 'pudim', 'pudins')}</div>
        <div class="muted" style="font-size:12.5px">custaram ${brl(e.custo)} em ingredientes</div></div>
      <div style="text-align:right"><div class="rot-mercado">Se vender tudo</div><strong style="font-size:17px">${brl(e.potencial)}</strong>
        <div class=${e.lucroPotencial < 0 ? 'neg' : 'pos'} style="font-size:13px;font-weight:700">lucro ${brlSigned(e.lucroPotencial)}</div></div>
    </div>
    ${e.semPreco.length > 0 && html`<div class="duvida" style="margin-top:8px"><${Icone} n="alerta" /><span>Sem preço de venda: ${e.semPreco.join(', ')}. Defina em Receitas.</span></div>`}

    ${e.vencidos > 0 && html`<div class="painel painel-pad aviso-vencido" role="alert">
      <div><strong>${plural(e.vencidos, 'pudim venceu', 'pudins venceram')}</strong>
        <div class="muted" style="font-size:13px">${brl(e.custoVencido)} em ingredientes. ${e.lista.flatMap((x) => Object.entries(x.porLocal).filter(([loc, q]) => q.vencidos && (!local || loc === local)).map(([loc, q]) => `${q.vencidos} ${x.receita?.nome || ''}${local ? '' : ` (${nomeLocal(loc)})`}`)).join(', ')}</div></div>
      <button class="btn btn-perigo btn-mini" style="white-space:nowrap" onClick=${darBaixa}>Dar baixa</button>
    </div>`}

    <div class="acoes acoes-pudim">
      <button class="btn btn-pri" onClick=${() => abrirFolha('movimento', { tipo: 'producao', local: opLocal })}>Produzi</button>
      <a class="btn btn-sec" href=${`#/pudim/vender${local ? `?local=${local}` : ''}`}>Vender</a>
      <button class="btn btn-sec" onClick=${() => abrirFolha('movimento', { tipo: 'perda', local: opLocal })}>Perdi</button>
    </div>
    <div class="acoes acoes-pudim" style="margin-top:8px">
      <button class="btn btn-sec" onClick=${() => abrirFolha('lote', { local: opLocal })}>Novo lote</button>
      ${d.locais.length > 1 && html`<button class="btn btn-sec" onClick=${() => abrirFolha('envio', { de: local && local !== d.locais[0].id ? local : d.locais[0].id })}>Enviar</button>`}
      <button class="btn btn-sec" onClick=${() => abrirFolha('voz-estoque', { local })}><${Icone} n="mic" />Falar</button>
    </div>


    <${GradeEstoque} d=${d} s=${s} local=${local} />

    ${(abaixo.length > 0 || d.faltas.length > 0) && html`<div class="painel painel-pad aviso-minimo" role="alert" aria-label="Estoque mínimo">
      ${abaixo.length > 0 && html`<div class="rot-mercado">Abaixo do mínimo</div>
        <ul class="lista-minimo">${abaixo.map((x) => html`<li>
          <div><strong>${x.receita.nome}</strong><div class="muted" style="font-size:12.5px">${d.locais.length > 1 ? `${x.local.nome}: ` : ''}tem ${x.tem}, mínimo ${x.minimo}</div></div>
          ${x.enviarDe
            ? html`<button class="btn btn-pri btn-mini" onClick=${() => abrirFolha('envio', { de: x.enviarDe.local.id, para: x.local.id, quantidades: { [x.receita.id]: x.enviarDe.quantidade } })}>Enviar ${x.enviarDe.quantidade} de ${x.enviarDe.local.nome}</button>`
            : html`<button class="btn btn-pri btn-mini" onClick=${() => abrirFolha('movimento', { tipo: 'producao', receita_id: x.receita.id, quantidade: x.fornadas * (Number(x.receita.rendimento) || 1), local: x.local.id })}>Fazer ${x.fornadas} fornada${x.fornadas > 1 ? 's' : ''}</button>`}
        </li>`)}</ul>`}
      ${d.faltas.length > 0 && html`<a class="link" href="#/pudim?aba=ingredientes" style="display:block;margin-top:${abaixo.length ? 10 : 0}px">Faltam ${d.faltas.length} ingrediente${d.faltas.length > 1 ? 's' : ''} para o estoque mínimo →</a>`}
    </div>`}

    <${Secao} titulo=${atual ? 'Esta semana' : `Semana de ${fmtDay(sem.inicio)}`}>
      <div class="painel painel-pad">
        <div class="navega-semana">
          <button class="icone-btn" aria-label="Semana anterior" onClick=${() => setData(addDays(sem.inicio, -7))}><${Icone} n="voltar" /></button>
          <span>${fmtDay(sem.inicio)} a ${fmtDay(sem.fim)}</span>
          <button class="icone-btn" aria-label="Próxima semana" disabled=${atual} onClick=${() => setData(addDays(sem.inicio, 7))}><${Icone} n="seta" /></button>
        </div>
        <${Linha} rot=${`Vendeu ${plural(sem.vendidos, 'pudim', 'pudins')}`} valor=${brl(sem.vendas)} forte />
        ${sem.porCanal.ifood && html`<div class="muted" style="font-size:13px;margin-top:2px">${sem.porCanal.direta ? `${plural(sem.porCanal.direta.quantidade, 'direto', 'diretos')} (${brl(sem.porCanal.direta.vendas)}), ` : ''}${sem.porCanal.ifood.quantidade} no iFood (${brl(sem.porCanal.ifood.vendas)})</div>
          <${Linha} rot="Taxa do iFood" valor=${`− ${brl(sem.taxas)}`} />`}
        <${Linha} rot="Custo do que vendeu" valor=${`− ${brl(sem.custoVendido)}`} />
        <${Linha} rot=${`Perdeu ${plural(sem.perdidos, 'pudim', 'pudins')}`} valor=${`− ${brl(sem.custoPerdido)}`} classe=${sem.custoPerdido ? 'neg' : ''} />
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-top:10px;padding-top:10px;border-top:1px solid var(--line)">
          <span style="font-weight:700">Ganho real</span><span class=${sem.ganho < 0 ? 'neg' : ''} style="font:700 24px var(--display)">${brlSigned(sem.ganho)}</span></div>
        ${sem.fixoSaidas > 0 && html`<${Linha} rot="Mão de obra e despesas fixas do que saiu" valor=${`− ${brl(sem.fixoSaidas)}`} />
          <${Linha} rot="Lucro livre (como na planilha)" valor=${brlSigned(sem.lucroLivre)} classe=${sem.lucroLivre < 0 ? 'neg' : ''} forte />`}
        <div style="margin-top:10px;padding-top:10px;border-top:1px dashed var(--line);font-size:14px">
          <${Linha} rot=${`Produziu ${plural(sem.produzidos, 'pudim', 'pudins')}, gastando em ingredientes`} valor=${brl(sem.custoProduzido)} />
          <${Linha} rot="Saiu do caixa em compras do pudim" valor=${brl(sem.comprasCaixa)} />
        </div>
        ${sem.semProducao > 0 && html`<p class="muted" style="font-size:12.5px;margin:8px 0 0">${plural(sem.semProducao, 'pudim saiu', 'pudins saíram')} sem produção registrada antes; usei o custo de hoje da receita.</p>`}
        <p class="muted" style="font-size:12.5px;margin:8px 0 0">O dízimo continua pelo caixa (entradas menos saídas do Pudim), como na tela Negócios.</p>
      </div>
    <//>

    ${lotes.length > 0 && html`<${Secao} titulo="Validade dos lotes">
      <ul class="lista painel" aria-label="Lotes">
        ${lotes.map((g) => html`<li><button class="item item-btn" onClick=${() => abrirLote(g)}><div class="corpo">
          <div class="tit">Lote de ${fmtDay(g.produzidoEm)}${d.locais.length > 1 ? ` · ${nomeLocal(g.local)}` : ''}</div>
          <div class="meta">${resumoLote(g)}</div></div>
          <div class=${`valor ${g.vencido ? 'neg' : g.validade <= addDays(s.hoje, 1) ? 'atencao' : ''}`}>${g.vencido ? 'venceu' : 'vence'}<small>${fmtDay(g.validade)}</small></div>
        </button></li>`)}
      </ul>
    <//>`}

    <${Secao} titulo="Movimentos">
      <ul class="lista painel">
        ${recentes.map((m) => html`<li><${Arrastavel} onApagar=${() => apagarMov(m)}><button class="item item-btn" onClick=${() => abrirFolha('editar-movimento', { id: m.id })}>
          <div class="corpo"><div class="tit">${ROTULO_MOV[m.tipo] || m.tipo} ${m.quantidade} ${d.receitasPorId[m.receita_id]?.nome || 'receita apagada'}</div>
            <div class="meta">${fmtDay(m.data)}${m.tipo === 'producao' && Number(m.quantidade) > 1 ? `, ${String(m.quantidade).replace('.', ',')} × ${brl(Math.round(Number(m.custo_unitario || 0) * 100))}` : ''}${d.locais.length > 1 ? `, ${ondeMov(m)}` : ''}${m.tipo === 'producao' && m.validade ? `, vence ${fmtDay(m.validade)}` : ''}${m.canal === 'ifood' ? ', iFood' : ''}${m.obs ? `, ${m.obs}` : ''}${m.lancamento_id ? ', lançado no caixa' : ''}</div></div>
          <div class=${`valor ${m.tipo === 'venda' ? 'pos' : m.tipo === 'perda' ? 'neg' : ''}`}>${m.tipo === 'venda' ? brl(Math.round(Number(m.quantidade) * Math.round(Number(m.preco_unitario || 0) * 100))) : m.tipo === 'producao' ? brl(Math.round(Number(m.quantidade) * Math.round(Number(m.custo_unitario || 0) * 100))) : m.tipo === 'transferencia' ? brl(d.saidas[m.id]?.transferido || 0) : brl(d.saidas[m.id]?.custo || 0)}
            <small>${m.tipo === 'venda' ? 'venda' : 'custo'}</small></div>
        </button><//></li>`)}
        ${!recentes.length && html`<li class="item muted">Registre o que produzir, vender ou perder pelos botões acima. Toque num movimento para corrigir; arraste para a esquerda para apagar.</li>`}
      </ul>
    <//>`;
}

// Desativados ficam escondidos, mas dá para abrir e reativar.
function Desativados({ lista, tipo, folha, chave }) {
  const [aberto, setAberto] = useState(false);
  if (!lista.length) return null;
  return html`<div style="margin-top:12px">
    <button class="link" onClick=${() => setAberto(!aberto)}>${aberto ? 'Esconder' : 'Mostrar'} ${lista.length} ${tipo} desativad${tipo.endsWith('s') && tipo.startsWith('ingred') ? 'os' : 'as'}</button>
    ${aberto && html`<ul class="lista painel" style="margin-top:8px;opacity:.7">
      ${lista.map((x) => html`<li><button class="item item-btn" onClick=${() => abrirFolha(folha, { [chave]: x })}><div class="corpo"><div class="tit">${x.nome}</div><div class="meta">Desativad${chave === 'insumo' ? 'o' : 'a'}. Toque para reativar.</div></div></button></li>`)}
    </ul>`}
  </div>`;
}

// Do maior para o menor (1 kg, 500 g, copo); tamanho sem número por último.
export const porTamanho = (a, b) => (Number(b.porcao) || 0) - (Number(a.porcao) || 0) || a.nome.localeCompare(b.nome);

function ItemProduto({ r, c }) {
  const taxaPct = taxaIfood();
  const ifood = precoNoCanal(r, 'ifood', taxaPct);
  const liquidoIfood = ifood.preco - Math.round((ifood.preco * taxaPct) / 100);
  return html`<li><button class="item item-btn" onClick=${() => abrirFolha('receita', { receita: r })}>
    <div class="corpo"><div class="tit">${r.nome}</div>
      <div class="meta quebra">Custo ${brl(c.completoUnidade)} cada · rende ${r.rendimento || 1} · vale ${r.validade_dias || VALIDADE_PADRAO} dias${Number(r.estoque_minimo) > 0 ? ` · mínimo ${r.estoque_minimo} fornada${Number(r.estoque_minimo) > 1 ? 's' : ''}` : ''}${c.faltando.length ? ' · falta preço' : ''}</div>
      ${c.preco > 0 && ifood.preco > 0 && html`<div class="meta quebra">iFood ${brl(ifood.preco)}${ifood.calculado ? '*' : ''}: sobra ${brl(liquidoIfood)}, lucro <span class=${liquidoIfood - c.completoUnidade < 0 ? 'neg' : ''}>${brl(liquidoIfood - c.completoUnidade)}</span></div>`}
      ${!c.preco && html`<div class="muted" style="font-size:12.5px">Sugerido ${brl(c.sugerido)}</div>`}
      ${c.subiu > 0 && html`<div style="margin-top:4px"><span class="etiqueta atraso">Custo subiu ${Math.round(c.subiu * 100)}%</span></div>`}</div>
    <div class=${`valor ${c.margem !== null && c.margem < 0 ? 'neg' : ''}`}>${c.preco ? brl(c.preco) : '—'}<small>${c.margem !== null ? `lucro ${brl(c.preco - c.completoUnidade)}` : 'sem preço'}</small></div>
  </button></li>`;
}

function AbaReceitas({ s, d }) {
  const m = valorMinuto(d.custosFixos);
  const configurado = m.maoDeObra > 0 || m.despesas > 0;
  return html`
    <button class="painel painel-pad cartao-pudim cartao-custos" onClick=${() => abrirFolha('custos-pudim', {})}>
      <div class="corpo"><div class="rot-mercado">Mão de obra e despesas fixas</div>
        <div style="font-weight:700;margin-top:2px">${configurado
          ? `${brl(Math.round(m.maoDeObra * 60))} por hora de trabalho + ${brl(Math.round(m.despesas * 60))} de despesas`
          : 'Custo só com ingredientes e embalagens (sem mão de obra e energia)'}</div>
        ${configurado && html`<div class="muted" style="font-size:12.5px;margin-top:2px">Entram no custo de cada receita pelo tempo de preparo.</div>`}</div>
      <span style="width:18px;color:var(--ink-3)"><${Icone} n="seta" /></span>
    </button>
    <div class="acoes" style="justify-content:flex-end;margin-top:10px">
      <button class="btn btn-sec btn-mini" onClick=${() => abrirFolha('receita', { novoPreparo: true })}><${Icone} n="mais" />Novo preparo</button>
      <button class="btn btn-pri btn-mini" onClick=${() => abrirFolha('receita', { novoSabor: true })}><${Icone} n="mais" />Novo sabor</button></div>
    ${d.preparos.length > 0 && html`<section class="sabor" aria-label="Preparos"><div class="sabor-cab"><div class="corpo"><div class="tit">Preparos</div><div class="meta">Caldas e bases que entram em outras receitas</div></div></div>
      <ul class="lista painel">${d.preparos.map((p) => {
        const c = d.custos[p.id];
        return html`<li><button class="item item-btn" onClick=${() => abrirFolha('receita', { receita: p })}><div class="corpo"><div class="tit">${p.nome}</div>
          <div class="meta">Rende ${p.rendimento} g${c.faltando.length ? ', falta preço' : ''}</div></div>
          <div class="valor">${brl(Math.round((c.total / (Number(p.rendimento) || 1)) * 100))}<small>por 100 g</small></div></button></li>`;
      })}</ul></section>`}
    ${d.sabores.map((sabor) => {
      const c = d.custos[sabor.id];
      const tamanhos = d.receitas.filter((r) => r.sabor_id === sabor.id).sort(porTamanho);
      return html`<section class="sabor" aria-label=${sabor.nome}>
        <button class="sabor-cab" onClick=${() => abrirFolha('receita', { receita: sabor })}>
          <div class="corpo"><div class="tit">${sabor.nome}</div>
            <div class="meta">Receita: ${brl(c.ingredientes)} de ingredientes, ${sabor.tempo_preparo || '?'} min${c.faltando.length ? ', falta preço de algum ingrediente' : ''}</div></div>
          <span class="link" style="white-space:nowrap">Ingredientes</span>
        </button>
        <ul class="lista painel">
          ${tamanhos.map((r) => html`<${ItemProduto} r=${r} c=${d.custos[r.id]} />`)}
          ${!tamanhos.length && html`<li class="item muted">Sem tamanhos. Abra o sabor para criar 1 kg, 500 g e copo.</li>`}
        </ul>
      </section>`;
    })}
    ${d.receitas.some((r) => !r.sabor_id || !d.receitasPorId[r.sabor_id]) && html`<section class="sabor"><div class="sabor-cab"><div class="corpo"><div class="tit">Outros produtos</div><div class="meta">Com receita própria, sem sabor</div></div></div>
      <ul class="lista painel">${d.receitas.filter((r) => !r.sabor_id || !d.receitasPorId[r.sabor_id]).map((r) => html`<${ItemProduto} r=${r} c=${d.custos[r.id]} />`)}</ul></section>`}
    <${Desativados} lista=${(s.tables.receitas || []).filter((r) => !ativo(r))} tipo="receitas" folha="receita" chave="receita" />`;
}

// Estoque de ingredientes: o que falta para o mínimo, com um toque para pôr na lista de compras.
function PainelEstoqueInsumos({ s, d }) {
  const nuncaContou = !Object.keys(d.contadoEm).length && !(s.tables.estoque_insumos || []).length;
  const naLista = new Set((s.tables.lista || []).filter((x) => !x.comprado).map((x) => chaveProduto(x.nome)));
  const paraLista = d.faltas.filter((f) => !naLista.has(chaveProduto(f.insumo.produto || f.insumo.nome)));
  const porNaLista = async () => {
    await adicionarItens(paraLista.map((f) => ({ nome: f.insumo.produto || f.insumo.nome, quantidade: f.embalagens, unidade: 'un', origem: 'Pudim' })));
    toast(`${paraLista.length} ingrediente${paraLista.length > 1 ? 's' : ''} na lista de compras`);
  };
  return html`<div class="painel painel-pad" style="margin-top:10px">
    <div class="rot-mercado">Estoque de ingredientes</div>
    ${nuncaContou
      ? html`<p style="margin:6px 0 10px">Conte o que tem em casa uma vez. Depois a produção desconta sozinha e as compras somam.</p>`
      : d.faltas.length
        ? html`<ul class="lista-minimo">${d.faltas.map((f) => html`<li><div><strong>${f.insumo.nome}</strong>
            <div class="muted" style="font-size:12.5px">tem ${fmtQtd(f.tem, f.insumo)}, mínimo ${fmtQtd(f.minimo, f.insumo)}</div></div>
            <span class="neg" style="font-weight:700;white-space:nowrap">comprar ${f.embalagens}</span></li>`)}</ul>`
        : html`<p class="pos" style="margin:6px 0 10px;font-weight:700">Tudo acima do mínimo.</p>`}
    <div class="acoes" style="margin-top:8px">
      ${!nuncaContou && paraLista.length > 0 && html`<button class="btn btn-pri" style="flex:1" onClick=${porNaLista}><${Icone} n="lista" />Pôr na lista de compras</button>`}
      <button class="btn btn-sec" style="flex:1" onClick=${() => abrirFolha('contagem', {})}>Contar o que tem em casa</button>
    </div>
    ${!Object.keys(d.minimo).length && html`<p class="muted" style="font-size:12.5px;margin:8px 0 0">O mínimo vem do "estoque mínimo" de cada pudim (em fornadas), na aba Receitas.</p>`}
  </div>`;
}

function AbaIngredientes({ s, d }) {
  const insumos = (s.tables.insumos || []).filter(ativo).sort((a, b) => a.nome.localeCompare(b.nome));
  const bloco = (tipo, titulo) => {
    const lista = insumos.filter((x) => (x.tipo || 'ingrediente') === tipo);
    if (!lista.length) return null;
    return html`<li class="grupo-cab"><span>${titulo}</span></li>
      ${lista.map((x) => {
        const c = custoInsumo(x, d.itens);
        const base = c.base === 'un' ? 'un' : c.base === 'g' ? 'kg' : 'l';
        const porBase = c.porBase === null ? null : Math.round(c.porBase * (c.base === 'un' ? 1 : 1000));
        const tem = d.saldo[x.id];
        const min = d.minimo[x.id] || 0;
        return html`<li><button class="item item-btn" onClick=${() => abrirFolha('insumo', { insumo: x })}>
          <div class="corpo"><div class="tit">${x.nome}${x.marca && x.marca !== '-' ? html` <span class="muted">${x.marca}</span>` : ''}</div>
            ${(tem !== undefined || min > 0) && html`<div class=${`meta ${min > 0 && (tem || 0) < min ? 'neg' : ''}`}>Em casa: ${tem !== undefined ? fmtQtd(tem, x) : '?'}${min > 0 ? ` · mínimo ${fmtQtd(min, x)}` : ''}</div>`}
            <div class="meta">${c.fonte === 'nota' ? `nota de ${fmtDay(c.data)}${c.mercado ? `, ${c.mercado}` : ''}` : c.fonte === 'cadastro' ? `preço digitado${c.data ? ` em ${fmtDay(c.data)}` : ''}` : 'sem preço'}</div></div>
          <div class="valor">${porBase === null ? '—' : brl(porBase)}<small>por ${base}</small></div>
        </button></li>`;
      })}`;
  };
  return html`
    <div class="acoes" style="justify-content:flex-end"><button class="btn btn-pri btn-mini" onClick=${() => abrirFolha('insumo', {})}><${Icone} n="mais" />Novo</button></div>
    <${PainelEstoqueInsumos} s=${s} d=${d} />
    <a class="btn btn-pri btn-larga" style="margin-top:10px" href="#/pudim/compras"><${Icone} n="busca" />Pesquisar preços e comprar</a>
    <p class="muted" style="font-size:13px;margin:8px 2px">O preço vem da nota de mercado mais recente do produto. Sem nota, vale o preço digitado aqui.</p>
    <ul class="lista painel">${bloco('ingrediente', 'Ingredientes')}${bloco('embalagem', 'Embalagens')}</ul>
    <${Desativados} lista=${(s.tables.insumos || []).filter((x) => !ativo(x))} tipo="ingredientes" folha="insumo" chave="insumo" />`;
}

export function TelaPudim({ params = {} }) {
  const s = useStore();
  const aba = ['estoque', 'receitas', 'ingredientes'].includes(params.aba) ? params.aba : 'estoque';
  const d = dadosPudim(s);
  const vazio = !d.receitas.length;
  return html`<main>
    <${Topo} titulo="Pudim" sub="Estoque, receitas e custo dos ingredientes" voltar="#/negocios" />
    <${FaixaDemo} />
    <${Segmento} rotulo="Parte" opcoes=${[['estoque', 'Estoque'], ['receitas', 'Receitas'], ['ingredientes', 'Ingredientes']]} valor=${aba}
      onChange=${(v) => (location.hash = `#/pudim?aba=${v}`)} />
    <div style="margin-top:12px">
      ${vazio && aba !== 'ingredientes'
        ? html`<div class="painel"><${Vazio} titulo="Nenhuma receita ainda">
            <p style="margin:6px 0 12px">Importe as receitas da planilha do Pudim Perfeito em Mais > Ajustes > Importar, ou crie a primeira.</p>
            <button class="btn btn-pri" onClick=${() => abrirFolha('receita', {})}>Criar receita</button><//></div>`
        : aba === 'estoque' ? html`<${AbaEstoque} s=${s} d=${d} />` : aba === 'receitas' ? html`<${AbaReceitas} s=${s} d=${d} />` : html`<${AbaIngredientes} s=${s} d=${d} />`}
    </div>
  </main>`;
}

// Cartão da tela Negócios.
export function CartaoPudim() {
  const s = useStore();
  const d = dadosPudim(s);
  const e = d.estoque;
  return html`<a class="painel painel-pad cartao-pudim" href="#/pudim">
    <div class="corpo"><div class="rot-mercado">Estoque do pudim</div>
      <div style="font-weight:700;margin-top:2px">${d.receitas.length ? `${plural(e.quantidade, 'pudim pronto', 'pudins prontos')}, ${brl(e.potencial)} se vender tudo` : 'Receitas, custos e estoque'}</div>
      ${e.vencidos > 0 && html`<div class="neg" style="font-size:13px;margin-top:2px">${plural(e.vencidos, 'vencido', 'vencidos')} para dar baixa</div>`}</div>
    <span style="width:18px;color:var(--ink-3)"><${Icone} n="seta" /></span>
  </a>`;
}
