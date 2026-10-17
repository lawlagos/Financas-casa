import { useState } from '../../vendor/hooks.module.js';
import { html } from '../html.js';
import { Icone } from '../icones.js';
import { Topo, Secao, Segmento, Vazio, Arrastavel } from '../componentes.js';
import { useStore, abrirFolha, salvarVarias, toast } from '../../data/store.js';
import { apagarMovimento } from '../../data/pudim-acoes.js';
import { brl, brlSigned } from '../../core/money.js';
import { fmtDay, addDays, businessWeekStart } from '../../core/dates.js';
import { custoReceita, processarEstoque, estoqueAtual, semanaPudim, custoInsumo } from '../../core/pudim.js';
import { porId } from '../derivados.js';
import { FaixaDemo } from './inicio.js';

const ativo = (x) => x.ativo !== false && x.ativo !== 'FALSE';

// Tudo que as telas do pudim precisam, calculado de uma vez a partir das tabelas.
export function dadosPudim(s) {
  const insumosPorId = porId(s.tables.insumos || []);
  const receitas = (s.tables.receitas || []).filter(ativo).sort((a, b) => a.nome.localeCompare(b.nome));
  const receitasPorId = porId(s.tables.receitas || []);
  const itens = s.tables.itens || [];
  const custos = {};
  for (const r of s.tables.receitas || []) custos[r.id] = custoReceita(r, insumosPorId, itens);
  const movimentos = s.tables.estoque || [];
  const { lotes, saidas } = processarEstoque(movimentos, (id) => custos[id]?.porUnidade || 0);
  const estoque = estoqueAtual(lotes, receitasPorId, s.hoje);
  return { insumosPorId, receitas, receitasPorId, custos, movimentos, saidas, estoque, itens };
}

const ROTULO_MOV = { producao: 'Produziu', venda: 'Vendeu', perda: 'Perdeu' };
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

function Linha({ rot, valor, classe = '', forte }) {
  return html`<div style="display:flex;justify-content:space-between;gap:12px;margin-top:7px"><span>${rot}</span>${forte ? html`<strong class=${classe} style="white-space:nowrap">${valor}</strong>` : html`<span class=${classe} style="white-space:nowrap">${valor}</span>`}</div>`;
}

function AbaEstoque({ s, d }) {
  // Sem nada na semana que acabou de começar (sábado, dia de pagar o dízimo), abre na semana que fechou.
  const [data, setData] = useState(() => {
    const inicio = businessWeekStart(s.hoje);
    return d.movimentos.some((m) => m.data >= inicio) ? s.hoje : addDays(inicio, -1);
  });
  const e = d.estoque;
  const sem = semanaPudim({ movimentos: d.movimentos, saidas: d.saidas, lancamentos: s.tables.lancamentos, data });
  const atual = sem.inicio === businessWeekStart(s.hoje);
  const darBaixa = async () => {
    const linhas = e.lista.filter((x) => x.vencidos > 0).map((x) => ({
      data: s.hoje, receita_id: x.receita_id, tipo: 'perda', quantidade: x.vencidos, custo_unitario: '', preco_unitario: '', validade: '', lancamento_id: '', obs: 'vencido', criado_em: new Date().toISOString(),
    }));
    await salvarVarias('estoque', linhas);
    toast(`Baixa de ${plural(e.vencidos, 'pudim vencido', 'pudins vencidos')}`);
  };
  const recentes = [...d.movimentos].sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : String(b.criado_em) < String(a.criado_em) ? -1 : 1)).slice(0, 30);
  const apagarMov = async (m) => {
    const r = await apagarMovimento(m);
    toast(r.lancamentos ? `Venda apagada${r.itens > 1 ? ` (${r.itens} itens)` : ''}, e o lançamento no caixa também` : 'Movimento apagado');
  };

  return html`
    <div class="painel painel-pad hero-pudim">
      <div class="rot-mercado">Pronto para vender</div>
      <div class="num-mercado">${plural(e.quantidade, 'pudim', 'pudins')}</div>
      <div class="dupla" style="margin-top:10px">
        <div><div class="rot-mercado">Se vender tudo</div><strong style="font-size:18px">${brl(e.potencial)}</strong></div>
        <div><div class="rot-mercado">Lucro potencial</div><strong style="font-size:18px" class=${e.lucroPotencial < 0 ? 'neg' : 'pos'}>${brlSigned(e.lucroPotencial)}</strong></div>
      </div>
      <div class="muted" style="font-size:12.5px;margin-top:6px">Custo dos ingredientes do que está pronto: ${brl(e.custo)}${e.venceLogo ? `. ${plural(e.venceLogo, 'vence', 'vencem')} até amanhã.` : ''}</div>
      ${e.semPreco.length > 0 && html`<div class="duvida" style="margin-top:10px"><${Icone} n="alerta" /><span>Sem preço de venda: ${e.semPreco.join(', ')}. Defina em Receitas para entrar no potencial.</span></div>`}
    </div>

    ${e.vencidos > 0 && html`<div class="painel painel-pad aviso-vencido" role="alert">
      <div><strong>${plural(e.vencidos, 'pudim venceu', 'pudins venceram')}</strong>
        <div class="muted" style="font-size:13px">${brl(e.custoVencido)} em ingredientes. ${e.lista.filter((x) => x.vencidos).map((x) => `${x.vencidos} ${x.receita?.nome || ''}`).join(', ')}</div></div>
      <button class="btn btn-perigo btn-mini" style="white-space:nowrap" onClick=${darBaixa}>Dar baixa</button>
    </div>`}

    <div class="acoes acoes-pudim">
      <button class="btn btn-pri" onClick=${() => abrirFolha('movimento', { tipo: 'producao' })}>Produzi</button>
      <a class="btn btn-sec" href="#/pudim/vender">Vender</a>
      <button class="btn btn-sec" onClick=${() => abrirFolha('movimento', { tipo: 'perda' })}>Perdi</button>
    </div>
    <button class="btn btn-sec btn-larga" style="margin-top:8px" onClick=${() => abrirFolha('voz-estoque', {})}><${Icone} n="mic" />Falar o que produziu, vendeu ou perdeu</button>

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
        <div style="margin-top:10px;padding-top:10px;border-top:1px dashed var(--line);font-size:14px">
          <${Linha} rot=${`Produziu ${plural(sem.produzidos, 'pudim', 'pudins')}, gastando em ingredientes`} valor=${brl(sem.custoProduzido)} />
          <${Linha} rot="Saiu do caixa em compras do pudim" valor=${brl(sem.comprasCaixa)} />
        </div>
        ${sem.semProducao > 0 && html`<p class="muted" style="font-size:12.5px;margin:8px 0 0">${plural(sem.semProducao, 'pudim saiu', 'pudins saíram')} sem produção registrada antes; usei o custo de hoje da receita.</p>`}
        <p class="muted" style="font-size:12.5px;margin:8px 0 0">O dízimo continua pelo caixa (entradas menos saídas do Pudim), como na tela Negócios.</p>
      </div>
    <//>

    ${e.lista.length > 0 && html`<${Secao} titulo="Na geladeira">
      <ul class="lista painel">
        ${e.lista.map((x) => html`<li class="item"><div class="corpo"><div class="tit">${x.receita?.nome || 'Receita apagada'}</div>
          <div class="meta">${x.quantidade ? `${plural(x.quantidade, 'unidade', 'unidades')}, vence ${fmtDay(x.proximaValidade)}` : ''}${x.vencidos ? html`${x.quantidade ? ', ' : ''}<span class="neg">${x.vencidos} vencido${x.vencidos > 1 ? 's' : ''}</span>` : ''}</div></div>
          <div class="valor">${brl(x.potencial)}<small>custo ${brl(x.custo)}</small></div></li>`)}
      </ul>
    <//>`}

    <${Secao} titulo="Movimentos">
      <ul class="lista painel">
        ${recentes.map((m) => html`<li><${Arrastavel} onApagar=${() => apagarMov(m)}><div class="item">
          <div class="corpo"><div class="tit">${ROTULO_MOV[m.tipo] || m.tipo} ${m.quantidade} ${d.receitasPorId[m.receita_id]?.nome || 'receita apagada'}</div>
            <div class="meta">${fmtDay(m.data)}${m.tipo === 'producao' && m.validade ? `, vence ${fmtDay(m.validade)}` : ''}${m.canal === 'ifood' ? ', iFood' : ''}${m.obs ? `, ${m.obs}` : ''}${m.lancamento_id ? ', lançado no caixa' : ''}</div></div>
          <div class=${`valor ${m.tipo === 'venda' ? 'pos' : m.tipo === 'perda' ? 'neg' : ''}`}>${m.tipo === 'venda' ? brl(Math.round(Number(m.quantidade) * Math.round(Number(m.preco_unitario || 0) * 100))) : m.tipo === 'producao' ? brl(Math.round(Number(m.quantidade) * Math.round(Number(m.custo_unitario || 0) * 100))) : brl(d.saidas[m.id]?.custo || 0)}
            <small>${m.tipo === 'venda' ? 'venda' : 'custo'}</small></div>
        </div><//></li>`)}
        ${!recentes.length && html`<li class="item muted">Registre o que produzir, vender ou perder pelos botões acima. Arraste um movimento para a esquerda para apagar.</li>`}
      </ul>
    <//>`;
}

function AbaReceitas({ d }) {
  return html`
    <div class="acoes" style="justify-content:flex-end"><button class="btn btn-pri btn-mini" onClick=${() => abrirFolha('receita', {})}><${Icone} n="mais" />Nova receita</button></div>
    <ul class="lista painel" style="margin-top:10px">
      ${d.receitas.map((r) => {
        const c = d.custos[r.id];
        return html`<li><button class="item item-btn" onClick=${() => abrirFolha('receita', { receita: r })}>
          <div class="corpo"><div class="tit">${r.nome}</div>
            <div class="meta">Rende ${r.rendimento || 1}, custo ${brl(c.porUnidade)} cada${c.faltando.length ? ', falta preço de algum ingrediente' : ''}</div>
            ${c.subiu > 0 && html`<div style="margin-top:4px"><span class="etiqueta atraso">Custo subiu ${Math.round(c.subiu * 100)}%</span></div>`}</div>
          <div class=${`valor ${c.margem !== null && c.margem < 0.3 ? 'neg' : ''}`}>${c.preco ? brl(c.preco) : '—'}<small>${c.margem !== null ? `margem ${Math.round(c.margem * 100)}%` : 'sem preço'}</small></div>
        </button></li>`;
      })}
    </ul>`;
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
        return html`<li><button class="item item-btn" onClick=${() => abrirFolha('insumo', { insumo: x })}>
          <div class="corpo"><div class="tit">${x.nome}${x.marca && x.marca !== '-' ? html` <span class="muted">${x.marca}</span>` : ''}</div>
            <div class="meta">${c.fonte === 'nota' ? `nota de ${fmtDay(c.data)}${c.mercado ? `, ${c.mercado}` : ''}` : c.fonte === 'cadastro' ? `preço digitado${c.data ? ` em ${fmtDay(c.data)}` : ''}` : 'sem preço'}</div></div>
          <div class="valor">${porBase === null ? '—' : brl(porBase)}<small>por ${base}</small></div>
        </button></li>`;
      })}`;
  };
  return html`
    <div class="acoes" style="justify-content:flex-end"><button class="btn btn-pri btn-mini" onClick=${() => abrirFolha('insumo', {})}><${Icone} n="mais" />Novo</button></div>
    <p class="muted" style="font-size:13px;margin:8px 2px">O preço vem da nota de mercado mais recente do produto. Sem nota, vale o preço digitado aqui.</p>
    <ul class="lista painel">${bloco('ingrediente', 'Ingredientes')}${bloco('embalagem', 'Embalagens')}</ul>`;
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
        : aba === 'estoque' ? html`<${AbaEstoque} s=${s} d=${d} />` : aba === 'receitas' ? html`<${AbaReceitas} d=${d} />` : html`<${AbaIngredientes} s=${s} d=${d} />`}
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
