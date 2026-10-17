import { useState } from '../../vendor/hooks.module.js';
import { html } from '../html.js';
import { Icone } from '../icones.js';
import { Folha, Segmento, Chips, Campo } from '../componentes.js';
import { useStore, salvar, fecharFolha, toast } from '../../data/store.js';
import { brl, parseBRL, toCents } from '../../core/money.js';
import { addDays, fmtDay } from '../../core/dates.js';
import { custoReceita, custoInsumo, ingredientesDe, VALIDADE_PADRAO } from '../../core/pudim.js';
import { chaveProduto, produtoDoItem, produtos } from '../../core/mercado.js';
import { contasAtivas } from '../derivados.js';
import { SelectConta } from './lancamento.js';
import { dadosPudim } from '../telas/pudim.js';

const numero = (t) => {
  const n = Number(String(t ?? '').trim().replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};
const virgula = (n) => (n === '' || n === null || n === undefined ? '' : String(n).replace('.', ','));
const reais = (cents) => Math.round(cents) / 100;

const TITULO = { producao: 'Produzi', venda: 'Vendi', perda: 'Perdi' };
const MOTIVOS = [['vencido', 'Venceu'], ['quebrou', 'Quebrou ou estragou'], ['consumo', 'Consumo ou brinde']];
const UNIDADES = [['g', 'g'], ['kg', 'kg'], ['ml', 'ml'], ['l', 'litro'], ['un', 'unidade']];
const BASE_TXT = { g: 'g', kg: 'g', ml: 'ml', l: 'ml', un: 'un' };

// Produzi, Vendi ou Perdi: um movimento de estoque. A venda pode lançar a entrada no caixa junto.
export function FolhaMovimento({ tipo = 'producao' }) {
  const s = useStore();
  const d = dadosPudim(s);
  const ultimoMov = [...d.movimentos].reverse().find((m) => m.tipo === tipo && d.receitasPorId[m.receita_id]);
  const ultimaVenda = [...s.tables.lancamentos].reverse().find((l) => l.categoria_id === 'cat-venda-pudim');
  const contas = contasAtivas(s);
  const inicial = ultimoMov?.receita_id || d.receitas[0]?.id || '';
  const qtdPadrao = (id) => (tipo === 'producao' ? String(d.receitasPorId[id]?.rendimento || 1) : '1');
  const [f, setF] = useState({
    receita_id: inicial,
    quantidade: qtdPadrao(inicial),
    data: s.hoje,
    validade: '',
    preco: virgula(d.receitasPorId[inicial]?.preco_venda || ''),
    conta_id: ultimaVenda?.conta_id || (contas.find((c) => c.id === 'nubank-pj') ? 'nubank-pj' : ''),
    lancar: true,
    motivo: 'vencido',
  });
  const [tentou, setTentou] = useState(false);
  const set = (p) => setF((x) => ({ ...x, ...p }));
  const r = d.receitasPorId[f.receita_id];
  const c = d.custos[f.receita_id];
  const qtd = numero(f.quantidade);
  const preco = parseBRL(f.preco) || 0;
  const validade = f.validade || addDays(f.data, Number(r?.validade_dias) || VALIDADE_PADRAO);
  const naGeladeira = d.estoque.lista.find((x) => x.receita_id === f.receita_id);
  const trocaReceita = (id) => set({ receita_id: id, quantidade: qtdPadrao(id), preco: virgula(d.receitasPorId[id]?.preco_venda || ''), validade: '' });
  const ok = r && qtd > 0 && (tipo !== 'venda' || (preco > 0 && (!f.lancar || f.conta_id)));

  const guardar = async () => {
    setTentou(true);
    if (!ok) return;
    const agora = new Date().toISOString();
    let lancamento_id = '';
    if (tipo === 'venda' && f.lancar) {
      const l = await salvar('lancamentos', {
        tipo: 'entrada', valor: reais(Math.round(qtd * toCents(preco))), data: f.data, descricao: `Venda: ${virgula(qtd)} ${r.nome}`,
        conta_id: f.conta_id, conta_destino_id: '', categoria_id: 'cat-venda-pudim', origem: 'Pudim', canal: 'estoque', previsto_id: '',
      });
      lancamento_id = l.id;
    }
    await salvar('estoque', {
      data: f.data, receita_id: f.receita_id, tipo, quantidade: qtd,
      custo_unitario: tipo === 'producao' ? reais(c.porUnidade) : '',
      preco_unitario: tipo === 'venda' ? preco : '',
      validade: tipo === 'producao' ? validade : '',
      lancamento_id, obs: tipo === 'perda' ? f.motivo : '', criado_em: agora,
    });
    fecharFolha();
    toast(tipo === 'producao' ? `${virgula(qtd)} ${r.nome} no estoque` : tipo === 'venda' ? `Venda registrada${lancamento_id ? ' e lançada no caixa' : ''}` : 'Perda registrada');
  };

  if (!d.receitas.length) {
    return html`<${Folha} titulo=${TITULO[tipo]}><p class="muted">Cadastre ou importe as receitas primeiro, em Pudim > Receitas.</p><//>`;
  }
  return html`<${Folha} titulo=${TITULO[tipo]} rodape=${html`<button class="btn btn-pri" disabled=${tentou && !ok} onClick=${guardar}>${tipo === 'producao' ? 'Pôr no estoque' : tipo === 'venda' ? 'Registrar venda' : 'Registrar perda'}</button>`}>
    <${Campo} rotulo="Qual pudim">
      <select aria-label="Qual pudim" value=${f.receita_id} onChange=${(e) => trocaReceita(e.target.value)}>
        ${d.receitas.map((x) => html`<option value=${x.id}>${x.nome}</option>`)}
      </select>
    <//>
    <div class="linha2">
      <${Campo} rotulo=${tipo === 'producao' ? 'Quantas unidades' : 'Quantas'} ajuda=${tipo === 'producao' && r ? `A receita rende ${r.rendimento || 1}.` : naGeladeira ? `Na geladeira: ${naGeladeira.quantidade}.` : tipo !== 'producao' ? 'Nenhum no estoque.' : ''}>
        <input id="mov-quantidade" inputmode="decimal" value=${f.quantidade} onInput=${(e) => set({ quantidade: e.target.value })} aria-invalid=${tentou && !(qtd > 0)} />
      <//>
      <${Campo} rotulo="Dia"><input type="date" value=${f.data} onInput=${(e) => set({ data: e.target.value })} /><//>
    </div>

    ${tipo === 'producao' && html`
      <${Campo} rotulo="Vence em" ajuda=${`Validade de ${r?.validade_dias || VALIDADE_PADRAO} dias, pela receita. Pode mudar aqui.`}>
        <input type="date" value=${validade} onInput=${(e) => set({ validade: e.target.value })} />
      <//>
      <div class="painel painel-pad" style="margin-top:14px">
        <div style="display:flex;justify-content:space-between"><span>Custo de cada</span><strong>${brl(c.porUnidade)}</strong></div>
        <div style="display:flex;justify-content:space-between;margin-top:6px"><span>Gasto em ingredientes</span><strong>${brl(Math.round(c.porUnidade * qtd))}</strong></div>
        ${c.faltando.length > 0 && html`<div class="duvida" style="margin-top:10px"><${Icone} n="alerta" /><span>Sem preço: ${c.faltando.join(', ')}. O custo está menor do que o real.</span></div>`}
      </div>`}

    ${tipo === 'venda' && html`
      <${Campo} rotulo="Preço de cada"><input id="mov-preco" inputmode="decimal" placeholder="0,00" value=${f.preco} onInput=${(e) => set({ preco: e.target.value })} aria-invalid=${tentou && !(preco > 0)} /><//>
      <div class="painel painel-pad" style="margin-top:14px">
        <div style="display:flex;justify-content:space-between"><span>Total da venda</span><strong>${brl(Math.round(qtd * toCents(preco)))}</strong></div>
        <div style="display:flex;justify-content:space-between;margin-top:6px"><span>Lucro (preço menos custo)</span><strong>${brl(Math.round(qtd * (toCents(preco) - c.porUnidade)))}</strong></div>
      </div>
      <label class="interruptor"><span>Lançar a entrada no caixa</span><input type="checkbox" checked=${f.lancar} onChange=${(e) => set({ lancar: e.target.checked })} /></label>
      <div class="ajuda muted" style="font-size:12.5px;margin-top:4px">Desligue se já lançou esse dinheiro pelo print do Pix.</div>
      ${f.lancar && html`<${SelectConta} rotulo="Entrou em" valor=${f.conta_id} onChange=${(v) => set({ conta_id: v })} contas=${contas} />`}`}

    ${tipo === 'perda' && html`
      <div class="campo"><span>O que houve</span><${Chips} rotulo="Motivo" valor=${f.motivo} onChange=${(v) => set({ motivo: v || 'vencido' })} opcoes=${MOTIVOS} /></div>
      <p class="muted" style="font-size:13px;margin:10px 0 0">Sai do estoque pelos mais antigos. Custo perdido: cerca de ${brl(Math.round(c.porUnidade * qtd))}.</p>`}
  <//>`;
}

// Cadastro de receita: rendimento, validade, preço e ingredientes com o custo de cada um.
export function FolhaReceita({ receita }) {
  const s = useStore();
  const d = dadosPudim(s);
  const insumos = (s.tables.insumos || []).filter((x) => x.ativo !== false).sort((a, b) => a.nome.localeCompare(b.nome));
  const [f, setF] = useState(() => ({
    nome: receita?.nome || '',
    rendimento: virgula(receita?.rendimento || 1),
    validade_dias: virgula(receita?.validade_dias || VALIDADE_PADRAO),
    preco_venda: virgula(receita?.preco_venda || ''),
    ingredientes: ingredientesDe(receita).map((x) => ({ insumo_id: x.insumo_id, quantidade: virgula(x.quantidade) })),
    ativo: receita?.ativo !== false,
  }));
  const [tentou, setTentou] = useState(false);
  const set = (p) => setF((x) => ({ ...x, ...p }));
  const setIng = (i, p) => set({ ingredientes: f.ingredientes.map((x, j) => (j === i ? { ...x, ...p } : x)) });
  const montar = () => ({
    ...(receita || {}),
    nome: f.nome.trim(),
    rendimento: numero(f.rendimento) || 1,
    validade_dias: numero(f.validade_dias) || VALIDADE_PADRAO,
    preco_venda: parseBRL(f.preco_venda) || '',
    ingredientes: JSON.stringify(f.ingredientes.filter((x) => x.insumo_id && numero(x.quantidade) > 0).map((x) => ({ insumo_id: x.insumo_id, quantidade: numero(x.quantidade) }))),
    ativo: f.ativo,
  });
  const nova = montar();
  const c = custoReceita(nova, d.insumosPorId, d.itens);
  const guardar = async (zerarAlerta = false) => {
    setTentou(true);
    if (!nova.nome) return;
    // O custo de referência (para o alerta de alta) é o custo do momento em que o preço foi definido.
    const mudouPreco = toCents(nova.preco_venda || 0) !== toCents(receita?.preco_venda || 0);
    const custo_ref = mudouPreco || zerarAlerta || !receita?.custo_ref ? reais(c.porUnidade) : receita.custo_ref;
    await salvar('receitas', { ...nova, custo_ref });
    fecharFolha();
    toast(receita ? 'Receita salva' : 'Receita criada');
  };
  return html`<${Folha} titulo=${receita ? receita.nome : 'Nova receita'} rodape=${html`<button class="btn btn-pri" onClick=${() => guardar()}>Salvar receita</button>`}>
    <${Campo} rotulo="Nome"><input id="receita-nome" value=${f.nome} onInput=${(e) => set({ nome: e.target.value })} aria-invalid=${tentou && !nova.nome} /><//>
    <div class="linha2">
      <${Campo} rotulo="Rende (unidades)"><input id="receita-rendimento" inputmode="decimal" value=${f.rendimento} onInput=${(e) => set({ rendimento: e.target.value })} /><//>
      <${Campo} rotulo="Validade (dias)"><input inputmode="numeric" value=${f.validade_dias} onInput=${(e) => set({ validade_dias: e.target.value })} /><//>
    </div>
    <${Campo} rotulo="Preço de venda de cada" ajuda=${receita?.preco_sugerido ? `A planilha sugeria ${brl(toCents(receita.preco_sugerido))} (com salário e despesas fixas).` : ''}>
      <input id="receita-preco" inputmode="decimal" placeholder="0,00" value=${f.preco_venda} onInput=${(e) => set({ preco_venda: e.target.value })} />
    <//>

    <div class="painel painel-pad" style="margin-top:14px">
      <div style="display:flex;justify-content:space-between"><span>Custo da receita inteira</span><strong>${brl(c.total)}</strong></div>
      <div style="display:flex;justify-content:space-between;margin-top:6px"><span>Custo de cada</span><strong>${brl(c.porUnidade)}</strong></div>
      ${c.preco > 0 && html`<div style="display:flex;justify-content:space-between;margin-top:6px"><span>Lucro de cada</span><strong class=${c.lucroUnidade < 0 ? 'neg' : 'pos'}>${brl(c.lucroUnidade)} (${Math.round(c.margem * 100)}%)</strong></div>`}
      ${receita && c.subiu > 0 && html`<div class="duvida" style="margin-top:10px"><${Icone} n="alerta" /><span>O custo subiu ${Math.round(c.subiu * 100)}% desde que o preço foi definido (era ${brl(toCents(receita.custo_ref))}).
        <button class="link" style="display:block;margin-top:4px" onClick=${() => guardar(true)}>Manter o preço e tirar o aviso</button></span></div>`}
    </div>

    <div class="rot-mercado" style="margin:16px 0 6px">Ingredientes e embalagens da receita inteira</div>
    <ul class="lista painel">
      ${f.ingredientes.map((x, i) => {
        const ins = d.insumosPorId[x.insumo_id];
        const linha = c.linhas.find((l) => l.insumo?.id === x.insumo_id && l.quantidade === numero(x.quantidade));
        return html`<li class="item ing-linha">
          <select aria-label=${`Ingrediente ${i + 1}`} value=${x.insumo_id} onChange=${(e) => setIng(i, { insumo_id: e.target.value })}>
            <option value="">Escolha</option>
            ${insumos.map((o) => html`<option value=${o.id}>${o.nome}${o.tipo === 'embalagem' ? ' (embalagem)' : ''}</option>`)}
          </select>
          <input aria-label=${`Quantidade de ${ins?.nome || 'ingrediente'}`} inputmode="decimal" value=${x.quantidade} onInput=${(e) => setIng(i, { quantidade: e.target.value })} />
          <span class="muted ing-un">${BASE_TXT[ins?.unidade] || ''}</span>
          <span class="ing-custo">${linha?.custo != null ? brl(linha.custo) : '—'}</span>
          <button class="icone-btn" aria-label=${`Tirar ${ins?.nome || 'ingrediente'}`} onClick=${() => set({ ingredientes: f.ingredientes.filter((_, j) => j !== i) })}><${Icone} n="fechar" /></button>
        </li>`;
      })}
    </ul>
    <button class="btn btn-sec btn-larga" style="margin-top:10px" onClick=${() => set({ ingredientes: [...f.ingredientes, { insumo_id: '', quantidade: '' }] })}><${Icone} n="mais" />Ingrediente ou embalagem</button>
    ${receita && html`<label class="interruptor"><span>Receita em uso</span><input type="checkbox" checked=${f.ativo} onChange=${(e) => set({ ativo: e.target.checked })} /></label>`}
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
    preco_embalagem: virgula(insumo?.preco_embalagem || ''),
    produto: insumo?.produto || insumo?.nome || '',
    ativo: insumo?.ativo !== false,
  }));
  const [tentou, setTentou] = useState(false);
  const set = (p) => setF((x) => ({ ...x, ...p }));
  const preco = parseBRL(f.preco_embalagem) || '';
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
