import { useState } from '../../vendor/hooks.module.js';
import { html } from '../html.js';
import { Icone } from '../icones.js';
import { Folha, Segmento, Chips, Campo } from '../componentes.js';
import { useStore, salvar, fecharFolha, toast } from '../../data/store.js';
import { brl, parseBRL, toCents } from '../../core/money.js';
import { addDays, fmtDay } from '../../core/dates.js';
import { custoReceita, custoInsumo, ingredientesDe, VALIDADE_PADRAO, precoNoCanal, totaisCarrinho, CANAIS } from '../../core/pudim.js';
import { interpretarEstoque } from '../../core/vozestoque.js';
import { registrarVenda, registrarMovimentos, taxaIfood } from '../../data/pudim-acoes.js';
import { CampoFala } from '../voz.js';
import { chaveProduto, produtoDoItem, produtos } from '../../core/mercado.js';
import { contasAtivas } from '../derivados.js';
import { SelectConta } from './lancamento.js';
import { dadosPudim } from '../telas/pudim.js';

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
const MOTIVOS = [['vencido', 'Venceu'], ['quebrou', 'Quebrou ou estragou'], ['consumo', 'Consumo ou brinde']];
const UNIDADES = [['g', 'g'], ['kg', 'kg'], ['ml', 'ml'], ['l', 'litro'], ['un', 'unidade']];
const BASE_TXT = { g: 'g', kg: 'g', ml: 'ml', l: 'ml', un: 'un' };

// Produzi ou Perdi: um movimento de estoque. Venda é pela tela Vender (PDV) ou pela voz.
export function FolhaMovimento({ tipo = 'producao' }) {
  const s = useStore();
  const d = dadosPudim(s);
  const ultimoMov = [...d.movimentos].reverse().find((m) => m.tipo === tipo && d.receitasPorId[m.receita_id]);
  // Só receitas em uso: a última usada pode ter sido desativada.
  const inicial = (ultimoMov && d.receitas.find((r) => r.id === ultimoMov.receita_id)?.id) || d.receitas[0]?.id || '';
  const qtdPadrao = (id) => (tipo === 'producao' ? String(d.receitasPorId[id]?.rendimento || 1) : '1');
  const [f, setF] = useState({
    receita_id: inicial,
    quantidade: qtdPadrao(inicial),
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
  const naGeladeira = d.estoque.lista.find((x) => x.receita_id === f.receita_id);
  const trocaReceita = (id) => set({ receita_id: id, quantidade: qtdPadrao(id), validade: '' });
  const ok = r && qtd > 0;

  const guardar = async () => {
    setTentou(true);
    if (!ok) return;
    await salvar('estoque', {
      data: f.data, receita_id: f.receita_id, tipo, quantidade: qtd,
      custo_unitario: tipo === 'producao' ? reais(c.porUnidade) : '',
      preco_unitario: '',
      validade: tipo === 'producao' ? validade : '',
      lancamento_id: '', obs: tipo === 'perda' ? f.motivo : '', criado_em: new Date().toISOString(), canal: '', taxa_unitaria: '',
    });
    fecharFolha();
    toast(tipo === 'producao' ? `${virgula(qtd)} ${r.nome} no estoque` : 'Perda registrada');
  };

  if (!d.receitas.length) {
    return html`<${Folha} titulo=${TITULO[tipo]}><p class="muted">Cadastre ou importe as receitas primeiro, em Pudim > Receitas.</p><//>`;
  }
  return html`<${Folha} titulo=${TITULO[tipo]} rodape=${html`<button class="btn btn-pri" disabled=${tentou && !ok} onClick=${guardar}>${tipo === 'producao' ? 'Pôr no estoque' : 'Registrar perda'}</button>`}>
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
    preco_ifood: virgula(receita?.preco_ifood || ''),
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
    preco_ifood: parseBRL(f.preco_ifood) || '',
    ingredientes: JSON.stringify(f.ingredientes.filter((x) => x.insumo_id && numero(x.quantidade) > 0).map((x) => ({ insumo_id: x.insumo_id, quantidade: numero(x.quantidade) }))),
    ativo: f.ativo,
  });
  const nova = montar();
  const c = custoReceita(nova, d.insumosPorId, d.itens);
  const taxaPct = taxaIfood();
  const ifood = precoNoCanal(nova, 'ifood', taxaPct);
  const liquidoIfood = ifood.preco - Math.round((ifood.preco * taxaPct) / 100);
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
    <${Campo} rotulo="Preço no iFood" ajuda=${ifood.preco ? (ifood.calculado
      ? `Vazio: o app usa ${brl(ifood.preco)}, que depois da taxa de ${String(taxaPct).replace('.', ',')}% deixa o mesmo da venda direta.`
      : `Depois da taxa de ${String(taxaPct).replace('.', ',')}%, ficam ${brl(liquidoIfood)} (lucro ${brl(liquidoIfood - c.porUnidade)}).`) : ''}>
      <input id="receita-preco-ifood" inputmode="decimal" placeholder=${ifood.calculado ? (ifood.preco / 100).toFixed(2).replace('.', ',') : '0,00'} value=${f.preco_ifood} onInput=${(e) => set({ preco_ifood: e.target.value })} />
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

const TIPOS_FALA = [['producao', 'Produziu'], ['venda', 'Vendeu'], ['perda', 'Perdeu']];

// Estoque por voz: fala (ou digita) a frase, confere o rascunho e grava produção, venda e perda de uma vez.
export function FolhaVozEstoque() {
  const s = useStore();
  const d = dadosPudim(s);
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
    const x = interpretarEstoque(texto, { receitas: d.receitas, hoje: s.hoje, estoque: naGeladeira });
    setR({ ...x, itens: x.itens.map((i) => ({ ...i, tipo: i.tipo || '', quantidade: i.quantidade ? virgula(i.quantidade) : '' })) });
  };
  const setItem = (k, p) => setR((x) => ({ ...x, itens: x.itens.map((i, j) => (j === k ? { ...i, ...p } : i)) }));
  const itens = (r?.itens || []).map((i) => ({ ...i, receita: d.receitasPorId[i.receita_id], qtd: numero(i.quantidade) }));
  const vendas = itens.filter((i) => i.tipo === 'venda');
  const linhasVenda = vendas.filter((i) => i.receita).map((i) => ({ receita: i.receita, quantidade: i.qtd, preco: precoNoCanal(i.receita, r.canal, taxaPct).preco, custo: d.custos[i.receita.id]?.porUnidade || 0 }));
  const t = totaisCarrinho(linhasVenda, r?.canal, taxaPct);
  const pendente = itens.filter((i) => !i.receita || !(i.qtd > 0) || !i.tipo).length + linhasVenda.filter((l) => !l.preco).length;
  const ok = r && itens.length && !pendente && (!vendas.length || !lancar || r.canal === 'ifood' || conta_id);

  const guardar = async () => {
    if (!ok) return;
    setSalvando(true);
    try {
      const outros = itens.filter((i) => i.tipo !== 'venda').map((i) => ({ tipo: i.tipo, receita: i.receita, quantidade: i.qtd, custo: d.custos[i.receita.id]?.porUnidade || 0 }));
      const n = await registrarMovimentos(outros, { data: r.data, motivo: r.motivo });
      const v = linhasVenda.length ? await registrarVenda({ linhas: linhasVenda, canal: r.canal, data: r.data, conta_id, lancar }) : null;
      fecharFolha();
      toast([n ? `${n} movimento${n > 1 ? 's' : ''} no estoque` : '', v ? `venda de ${brl(v.bruto)}${v.lancado ? ' lançada no caixa' : ''}` : ''].filter(Boolean).join(' e ').replace(/^./, (c) => c.toUpperCase()));
    } catch {
      setSalvando(false);
    }
  };

  return html`<${Folha} titulo="Estoque por voz" rodape=${r && html`<button class="btn btn-pri" disabled=${!ok || salvando} onClick=${guardar}>${salvando ? 'Salvando…' : 'Confirmar'}</button>`}>
    <${CampoFala} id="voz-estoque" rotulo="O que aconteceu" frase=${frase} setFrase=${setFrase} onPronto=${entender}
      placeholder="Ex.: fiz uma fornada de mini 150 e vendi 3 tradicionais 1100 no iFood" />
    <div class="acoes" style="margin-top:8px;justify-content:flex-end"><button class="btn btn-sec btn-mini" disabled=${!frase.trim()} onClick=${() => entender(frase)}>Entender</button></div>
    ${r && !itens.length && html`<div class="duvida" style="margin-top:10px"><${Icone} n="alerta" /><span>Não reconheci nenhum pudim. Fale o nome como está nas receitas, com o tamanho (ex.: "tradicional 1100").</span></div>`}
    ${r && itens.length > 0 && html`
      <${Campo} rotulo="Dia"><input type="date" value=${r.data} onInput=${(e) => setR({ ...r, data: e.target.value })} /><//>
      <ul class="lista painel" style="margin-top:12px">
        ${itens.map((i, k) => html`<li class="item voz-item">
          <select aria-label=${`O que houve no item ${k + 1}`} value=${i.tipo} onChange=${(e) => setItem(k, { tipo: e.target.value })}>
            ${!i.tipo && html`<option value="">❓</option>`}${TIPOS_FALA.map(([v, t2]) => html`<option value=${v}>${t2}</option>`)}
          </select>
          <input aria-label=${`Quantidade do item ${k + 1}`} inputmode="decimal" value=${i.quantidade} onInput=${(e) => setItem(k, { quantidade: e.target.value })} aria-invalid=${!(i.qtd > 0)} />
          <select class="voz-receita" aria-label=${`Pudim do item ${k + 1}`} value=${i.receita_id} onChange=${(e) => setItem(k, { receita_id: e.target.value })} aria-invalid=${!i.receita}>
            ${!i.receita_id && html`<option value="">❓ Qual pudim? (${i.trecho})</option>`}
            ${i.candidatos.length > 0 && html`<optgroup label="Mais prováveis">${i.candidatos.map((id) => html`<option value=${id}>${d.receitasPorId[id]?.nome}</option>`)}</optgroup>`}
            <optgroup label="Todos">${d.receitas.map((x) => html`<option value=${x.id}>${x.nome}</option>`)}</optgroup>
          </select>
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
