// Compra rápida de insumos do pudim, com pesquisa de preços no estilo Google Shopping.
// As ofertas são SIMULADAS (core/ofertas.js) a partir do que já pagaram; o que vale é o preço digitado ao registrar.
import { useState } from '../../vendor/hooks.module.js';
import { html } from '../html.js';
import { Icone } from '../icones.js';
import { Topo, Campo } from '../componentes.js';
import { useStore, toast } from '../../data/store.js';
import { brl, parseBRL, toCents } from '../../core/money.js';
import { fmtDay, addDays } from '../../core/dates.js';
import { pesquisar, linkGoogleShopping, textoCompra, cicloDe } from '../../core/ofertas.js';
import { registrarCompra } from '../../data/pudim-acoes.js';
import { contasAtivas } from '../derivados.js';
import { SelectConta } from '../folhas/lancamento.js';
import { FaixaDemo } from './inicio.js';

const FILTROS = [['', 'Todos'], ['ingrediente', 'Ingredientes'], ['embalagem', 'Embalagens']];
const valorTxt = (cents) => (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const notaTxt = (n) => String(n).replace('.', ',');
// Cor estável para a "foto" do produto, a partir do nome.
const corDe = (t) => `hsl(${[...t].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7)} 45% 88%)`;
const sigla = (t) => {
  const ps = t.split(/\s+/).filter((p) => p.length > 2);
  return (ps.length > 1 ? ps.slice(0, 2).map((p) => p[0]).join('') : t.slice(0, 2)).toUpperCase();
};

function Oferta({ o, nome, qtd, onMais, onMenos }) {
  const pct = Math.round(o.diferenca * 100);
  return html`<article class="oferta" aria-label=${`${o.titulo}, ${brl(o.preco)}, ${o.loja.nome}`}>
    <div class="oferta-foto" style=${`background:${corDe(nome)}`} aria-hidden="true">${sigla(nome)}</div>
    ${o.maisBarato && html`<span class="oferta-selo">Menor preço</span>`}
    <div class="oferta-titulo">${o.titulo}</div>
    <div class="oferta-preco">${brl(o.preco)}</div>
    <div class="oferta-medida">${brl(o.porMedida)}/${o.medida}${pct ? html` · <span class=${pct < 0 ? 'pos' : 'neg'}>${pct > 0 ? '+' : ''}${pct}%</span>` : ''}</div>
    <div class="oferta-loja">${o.loja.nome}</div>
    <div class="oferta-entrega">${o.loja.entrega}</div>
    <div class="oferta-nota">★ ${notaTxt(o.nota)} <span class="muted">(${o.avaliacoes.toLocaleString('pt-BR')})</span></div>
    ${qtd
      ? html`<div class="oferta-contador"><button class="icone-btn" aria-label=${`Menos ${o.titulo} no ${o.loja.nome}`} onClick=${onMenos}>−</button><strong>${qtd}</strong><button class="icone-btn" aria-label=${`Mais ${o.titulo} no ${o.loja.nome}`} onClick=${onMais}>+</button></div>`
      : html`<button class="btn btn-sec btn-mini oferta-add" aria-label=${`Adicionar ${o.titulo} do ${o.loja.nome}`} onClick=${onMais}>Adicionar</button>`}
  </article>`;
}

export function TelaCompras({ params = {} }) {
  const s = useStore();
  const contas = contasAtivas(s);
  const ultimaCompra = [...s.tables.lancamentos].reverse().find((l) => l.origem === 'Pudim' && (l.categoria_id === 'cat-ingrediente' || l.categoria_id === 'cat-embalagem'));
  const [texto, setTexto] = useState(params.q || '');
  const [tipo, setTipo] = useState('');
  const [todos, setTodos] = useState(false);
  const [carrinho, setCarrinho] = useState({}); // oferta.id → { oferta, insumo, quantidade }
  const [pagos, setPagos] = useState({}); // oferta.id → preço pago digitado
  const [conta_id, setConta] = useState(ultimaCompra?.conta_id || (contas.find((c) => c.id === 'nubank-pj') ? 'nubank-pj' : ''));
  const [data, setData] = useState(s.hoje);
  const [salvando, setSalvando] = useState(false);

  const resultados = pesquisar(texto, { insumos: s.tables.insumos || [], receitas: s.tables.receitas || [], itens: s.tables.itens || [], hoje: s.hoje, tipo });
  const visiveis = texto.trim() || todos ? resultados : resultados.slice(0, 8);
  const mudar = (oferta, insumo, delta) => setCarrinho((c) => {
    const q = Math.max(0, (c[oferta.id]?.quantidade || 0) + delta);
    const { [oferta.id]: _, ...resto } = c;
    return q ? { ...resto, [oferta.id]: { oferta, insumo, quantidade: q } } : resto;
  });
  const linhas = Object.values(carrinho).map((l) => {
    const digitado = pagos[l.oferta.id];
    return { ...l, preco: digitado !== undefined ? toCents(parseBRL(digitado) || 0) : l.oferta.preco };
  });
  const total = linhas.reduce((t, l) => t + l.preco * l.quantidade, 0);
  const qtdItens = linhas.reduce((t, l) => t + l.quantidade, 0);
  const proximaTroca = addDays(cicloDe(s.hoje), 3);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(textoCompra(linhas.map((l) => ({ ...l, oferta: { ...l.oferta, preco: l.preco } })), brl));
      toast('Lista copiada. É só colar no WhatsApp.');
    } catch {
      toast('Não consegui copiar neste aparelho.', { tom: 'erro' });
    }
  };
  const registrar = async () => {
    if (!linhas.length || !conta_id || linhas.some((l) => !l.preco)) return;
    setSalvando(true);
    try {
      const r = await registrarCompra({ linhas, data, conta_id });
      setCarrinho({});
      setPagos({});
      toast(`Compra de ${brl(r.total)} registrada. O custo das receitas já usa esses preços.`);
    } catch {
      // o aviso de erro já apareceu; o carrinho continua
    } finally {
      setSalvando(false);
    }
  };

  return html`<main class="compras">
    <${Topo} titulo="Comprar insumos" sub="Pesquisa de preços para a compra do pudim" voltar="#/pudim?aba=ingredientes" />
    <${FaixaDemo} />
    <div class="aviso-simulacao" role="note"><${Icone} n="info" /><span><strong>Preços simulados.</strong> Calculados a partir do que vocês já pagaram, variando por loja; mudam em ${fmtDay(proximaTroca)}. Para ofertas reais, toque em "Ver no Google". Ao registrar a compra, vale o preço que você digitar.</span></div>

    <label class="busca-shopping">
      <span style="width:20px;height:20px;display:inline-flex;color:var(--ink-3)"><${Icone} n="busca" /></span>
      <input type="search" aria-label="Pesquisar insumos" placeholder="Pesquisar insumos (ex.: leite condensado)" value=${texto} onInput=${(e) => setTexto(e.target.value)} />
    </label>
    <div class="chips" role="group" aria-label="Tipo de insumo" style="margin-top:10px">
      ${FILTROS.map(([v, t]) => html`<button type="button" class="chip" aria-pressed=${String(tipo === v)} onClick=${() => setTipo(v)}>${t}</button>`)}
    </div>

    ${!resultados.length && html`<p class="muted" style="margin-top:16px">Nada encontrado${texto ? ` para "${texto}"` : ''}. Os insumos vêm de Pudim > Ingredientes.</p>`}
    ${!texto.trim() && resultados.length > 0 && html`<p class="muted" style="font-size:13px;margin:14px 2px 0">Os mais usados nas receitas primeiro.</p>`}

    ${visiveis.map(({ insumo, usadoEm, ofertas }) => html`<section class="grupo-ofertas" aria-label=${insumo.nome}>
      <div class="grupo-ofertas-cab">
        <div><h2>${insumo.nome}</h2>
          <div class="muted" style="font-size:12.5px">${usadoEm ? `Usado em ${usadoEm} receita${usadoEm > 1 ? 's' : ''}` : 'Não usado nas receitas'}${ofertas[0] ? ` · vocês pagaram ${brl(ofertas[0].referencia.preco)}${ofertas[0].referencia.data ? ` em ${fmtDay(ofertas[0].referencia.data)}` : ''}` : ''}</div></div>
        <a class="link" href=${linkGoogleShopping(insumo)} target="_blank" rel="noopener">Ver no Google ↗</a>
      </div>
      ${ofertas.length
        ? html`<div class="ofertas-linha">${ofertas.map((o) => html`<${Oferta} o=${o} nome=${insumo.nome} qtd=${carrinho[o.id]?.quantidade || 0} onMais=${() => mudar(o, insumo, 1)} onMenos=${() => mudar(o, insumo, -1)} />`)}</div>`
        : html`<p class="muted" style="font-size:13px;margin:6px 0 0">Sem preço de referência para simular. Cadastre o preço em Pudim > Ingredientes ou use o "Ver no Google".</p>`}
    </section>`)}
    ${!texto.trim() && !todos && resultados.length > visiveis.length && html`<button class="btn btn-sec btn-larga" style="margin-top:14px" onClick=${() => setTodos(true)}>Ver todos os ${resultados.length} insumos</button>`}

    ${linhas.length > 0 && html`<button class="btn btn-pri pdv-barra" onClick=${() => document.getElementById('compra')?.scrollIntoView({ behavior: 'smooth' })}>
      <span>Compra: ${qtdItens} ${qtdItens === 1 ? 'item' : 'itens'}</span><span>${brl(total)}</span></button>`}
    <section id="compra" class="painel painel-pad pdv-carrinho" aria-label="Compra">
      ${!linhas.length
        ? html`<p class="muted" style="margin:0">Nada na compra ainda. Toque em "Adicionar" nas ofertas.</p>`
        : html`<ul class="pdv-linhas">
          ${linhas.map((l) => html`<li>
            <div class="pdv-linha-nome">${l.oferta.titulo}<div class="muted" style="font-size:12px">${l.oferta.loja.nome}</div></div>
            <div class="pdv-contador">
              <button class="icone-btn" aria-label=${`Menos ${l.oferta.titulo}`} onClick=${() => mudar(l.oferta, l.insumo, -1)}>−</button>
              <span style="min-width:22px;text-align:center;font-weight:700">${l.quantidade}</span>
              <button class="icone-btn" aria-label=${`Mais ${l.oferta.titulo}`} onClick=${() => mudar(l.oferta, l.insumo, 1)}>+</button>
            </div>
            <input class="pdv-preco-linha" aria-label=${`Preço pago em ${l.oferta.titulo}`} inputmode="decimal" placeholder="0,00"
              value=${pagos[l.oferta.id] ?? valorTxt(l.oferta.preco)} onInput=${(e) => setPagos((p) => ({ ...p, [l.oferta.id]: e.target.value }))} />
          </li>`)}
        </ul>
        <div class="pdv-totais"><div><span>Total</span><strong>${brl(total)}</strong></div></div>
        <div class="acoes" style="margin-top:12px"><button class="btn btn-sec" style="flex:1" onClick=${copiar}>Copiar lista</button></div>
        <div class="rot-mercado" style="margin:16px 0 0">Já comprou? Confira os preços pagos e registre</div>
        <div class="linha2">
          <${Campo} rotulo="Dia"><input type="date" value=${data} onInput=${(e) => setData(e.target.value)} /><//>
          <${SelectConta} rotulo="Pago com" valor=${conta_id} onChange=${setConta} contas=${contas} />
        </div>
        <button class=${`btn btn-pri btn-larga ${salvando ? 'carregando' : ''}`} style="margin-top:14px" disabled=${salvando || !conta_id || linhas.some((l) => !l.preco)} onClick=${registrar}>
          ${salvando ? 'Salvando…' : `Registrar compra · ${brl(total)}`}</button>
        <p class="muted" style="font-size:12.5px;margin:8px 0 0">Entra como gasto do Pudim (ingredientes e embalagens) e atualiza o custo das receitas.</p>`}
    </section>
  </main>`;
}
