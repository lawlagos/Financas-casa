// Mini PDV do pudim: toca no pudim para pôr no carrinho, escolhe venda direta ou iFood, e a venda
// tira do estoque. Só a venda direta entra no caixa (conta PJ); o iFood é lançado à mão quando paga, na quarta.
import { useState } from '../../vendor/hooks.module.js';
import { html } from '../html.js';
import { Icone } from '../icones.js';
import { Topo, Segmento, Campo } from '../componentes.js';
import { useStore, toast } from '../../data/store.js';
import { brl, parseBRL, toCents } from '../../core/money.js';
import { addDays } from '../../core/dates.js';
import { precoNoCanal, totaisCarrinho, CANAIS } from '../../core/pudim.js';
import { interpretarEstoque } from '../../core/vozestoque.js';
import { registrarVenda, taxaIfood, contasDaVenda, contaDoPudim } from '../../data/pudim-acoes.js';
import { contasAtivas } from '../derivados.js';
import { SelectConta } from '../folhas/lancamento.js';
import { CampoFala } from '../voz.js';
import { dadosPudim } from './pudim.js';
import { locaisDoProduto } from '../../core/estoqueinsumos.js';
import { FaixaDemo } from './inicio.js';

const qtdTxt = (n) => String(n).replace('.', ',');
const valorTxt = (cents) => (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function TelaPdv({ params = {} }) {
  const s = useStore();
  const d = dadosPudim(s);
  // De onde sai a venda (São Roque ou Ibiúna). Ibiúna não tem geladinho.
  const [local, setLocal] = useState(d.locaisPorId[params.local] ? params.local : d.locais[0].id);
  const contas = contasDaVenda(contasAtivas(s));
  const [canal, setCanal] = useState('direta');
  const [carrinho, setCarrinho] = useState({}); // receita_id → quantidade
  const [precos, setPrecos] = useState({}); // receita_id|canal → texto digitado
  const [qtdTexto, setQtdTexto] = useState({}); // receita_id → quantidade enquanto é digitada ("1," a caminho de "1,5")
  const [conta_id, setConta] = useState(() => contaDoPudim());
  const [data, setData] = useState(s.hoje);
  const [lancar, setLancar] = useState(true);
  const [busca, setBusca] = useState('');
  const [todos, setTodos] = useState(false);
  const [frase, setFrase] = useState('');
  const [falando, setFalando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [duvidas, setDuvidas] = useState([]); // trechos falados sem receita certa: [{ trecho, quantidade, candidatos }]
  const taxaPct = taxaIfood();

  const naGeladeira = d.prontos[local] || {};
  const doLocal = d.receitas.filter((r) => locaisDoProduto(r, d.locais).some((l) => l.id === local));
  const desde = addDays(s.hoje, -60);
  const vendas60 = {};
  for (const m of d.movimentos) if (m.tipo === 'venda' && m.data >= desde) vendas60[m.receita_id] = (vendas60[m.receita_id] || 0) + Number(m.quantidade || 0);
  const ordenadas = [...doLocal].sort((a, b) => (naGeladeira[b.id] || 0) - (naGeladeira[a.id] || 0) || (vendas60[b.id] || 0) - (vendas60[a.id] || 0) || a.nome.localeCompare(b.nome));
  const termo = busca.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const filtradas = termo ? ordenadas.filter((r) => r.nome.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(termo)) : ordenadas;
  const principais = filtradas.filter((r) => naGeladeira[r.id] || vendas60[r.id]);
  const duvida = duvidas[0];
  const visiveis = duvida ? duvida.candidatos.map((id) => d.receitasPorId[id]).filter(Boolean) : termo || todos || principais.length < 4 ? filtradas : principais;

  const chavePreco = (id) => `${id}|${canal}`;
  const precoDe = (r) => {
    const digitado = precos[chavePreco(r.id)];
    if (digitado !== undefined) return { preco: toCents(parseBRL(digitado) || 0), calculado: false, digitado: true };
    return precoNoCanal(r, canal, taxaPct);
  };
  const linhas = Object.entries(carrinho)
    .filter(([, q]) => q > 0)
    .map(([id, quantidade]) => {
      const receita = d.receitasPorId[id];
      const p = precoDe(receita);
      return { receita, quantidade, preco: p.preco, calculado: p.calculado, custo: d.custos[id]?.porUnidade || 0, fixo: d.custos[id]?.fixoUnidade || 0 };
    })
    .filter((l) => l.receita);
  const t = totaisCarrinho(linhas, canal, taxaPct);
  const semPreco = linhas.filter((l) => !l.preco);

  // Trocar de local tira do carrinho o que o novo local não tem (geladinho em Ibiúna).
  const trocarLocal = (l) => {
    setLocal(l);
    const pode = new Set(d.receitas.filter((r) => locaisDoProduto(r, d.locais).some((x) => x.id === l)).map((r) => r.id));
    setCarrinho((c) => Object.fromEntries(Object.entries(c).filter(([id]) => pode.has(id))));
  };
  const mudar = (id, delta) => {
    soltarQtd(id);
    setCarrinho((c) => ({ ...c, [id]: Math.max(0, Math.round(((c[id] || 0) + delta) * 100) / 100) }));
  };
  const tocar = (id) => {
    if (!duvida) return mudar(id, 1);
    mudar(id, duvida.quantidade || 1);
    setDuvidas((x) => x.slice(1));
  };
  // Digitar só muda a quantidade quando o número é válido; apagar o campo não tira o item (só o "−" tira).
  const digitarQtd = (id, texto) => {
    setQtdTexto((x) => ({ ...x, [id]: texto }));
    const q = Number(texto.replace(',', '.'));
    if (Number.isFinite(q) && q > 0) setCarrinho((c) => ({ ...c, [id]: q }));
  };
  const soltarQtd = (id) => setQtdTexto((x) => {
    const { [id]: _, ...resto } = x;
    return resto;
  });

  const ouvido = (texto) => {
    const r = interpretarEstoque(texto, { receitas: doLocal, hoje: s.hoje, estoque: naGeladeira, locais: d.locais });
    if (r.local && r.local !== local) trocarLocal(r.local);
    const vendas = r.itens.filter((i) => i.tipo !== 'producao' && i.tipo !== 'perda');
    const certos = vendas.filter((i) => i.receita_id);
    if (/\bi\s?food\b/i.test(texto)) setCanal('ifood');
    if (r.data !== s.hoje) setData(r.data);
    setCarrinho((c) => {
      const n = { ...c };
      for (const i of certos) n[i.receita_id] = (n[i.receita_id] || 0) + (i.quantidade || 1);
      return n;
    });
    const novas = vendas.filter((i) => !i.receita_id && i.candidatos.length);
    setDuvidas((x) => [...x, ...novas]);
    if (novas.length) toast(`Qual pudim é "${novas[0].trecho}"? Toque no certo.`);
    else if (certos.length) toast(`${certos.length === 1 ? 'Coloquei no carrinho' : `Coloquei ${certos.length} pudins no carrinho`}`);
    else toast('Não reconheci nenhum pudim na frase.', { tom: 'erro' });
    setFrase('');
    setFalando(false);
  };

  const finalizar = async () => {
    if (!linhas.length || semPreco.length || (lancar && canal === 'direta' && !conta_id)) return;
    setSalvando(true);
    try {
      const r = await registrarVenda({ linhas, canal, data, conta_id, lancar, local });
      setCarrinho({});
      setPrecos({});
      setQtdTexto({});
      toast(canal === 'ifood' ? `Venda do iFood de ${brl(r.bruto)} tirada do estoque` : `Venda de ${brl(r.bruto)} registrada${r.lancado ? ' e lançada no caixa' : ''}`);
    } catch {
      // o aviso de erro já apareceu; o carrinho continua para tentar de novo
    } finally {
      setSalvando(false);
    }
  };

  return html`<main class="pdv">
    <${Topo} titulo="Vender" sub="Toque no pudim para pôr no carrinho" voltar="#/pudim" direita=${html`<button class="btn btn-sec btn-mini" aria-pressed=${String(falando)} onClick=${() => setFalando(!falando)}><${Icone} n="mic" />Falar</button>`} />
    <${FaixaDemo} />
    ${d.locais.length > 1 && html`<${Segmento} rotulo="Local" classe="pdv-local" opcoes=${d.locais.map((l) => [l.id, l.nome])} valor=${local} onChange=${trocarLocal} />`}
    <${Segmento} rotulo="Canal" classe=${d.locais.length > 1 ? 'mt8' : ''} opcoes=${[['direta', CANAIS.direta], ['ifood', CANAIS.ifood]]} valor=${canal} onChange=${setCanal} />
    ${canal === 'ifood' && html`<p class="muted" style="font-size:12.5px;margin:6px 2px 0">Venda do iFood só tira do estoque, não mexe no saldo. O dinheiro entra quando o iFood pagar, na quarta: lance em <a href="#/inicio">Início › Pagamento do iFood</a>.</p>`}
    ${falando && html`<div style="margin-top:10px"><${CampoFala} id="pdv-frase" rotulo="O que vendeu" frase=${frase} setFrase=${setFrase} onPronto=${ouvido} placeholder="Ex.: 3 tradicionais no copo e 2 geladinhos de ninho com nutella" />
      <div class="acoes" style="margin-top:8px;justify-content:flex-end"><button class="btn btn-sec btn-mini" disabled=${!frase.trim()} onClick=${() => ouvido(frase)}>Pôr no carrinho</button></div></div>`}

    <div class="campo" style="margin-top:10px"><input class="pdv-busca" type="search" aria-label="Buscar pudim" placeholder="Buscar pudim" value=${busca} onInput=${(e) => setBusca(e.target.value)} /></div>
    ${duvida && html`<div class="duvida" style="margin-top:10px"><${Icone} n="info" /><span>Qual destes é "${duvida.trecho}"? Toque no certo para pôr ${qtdTxt(duvida.quantidade || 1)} no carrinho.
      <button class="link" style="display:block" onClick=${() => setDuvidas((x) => x.slice(1))}>Pular</button></span></div>`}
    <div class="pdv-grade">
      ${visiveis.map((r) => {
        const p = precoDe(r);
        const q = carrinho[r.id] || 0;
        return html`<button class=${`pdv-produto ${q ? 'no-carrinho' : ''}`} onClick=${() => tocar(r.id)} aria-label=${`Adicionar ${r.nome}`}>
          <span class="pdv-nome">${r.nome}</span>
          <span class="pdv-preco">${p.preco ? brl(p.preco) : 'sem preço'}${p.calculado ? '*' : ''}</span>
          <span class="pdv-estoque">${naGeladeira[r.id] ? `${naGeladeira[r.id]} pronto${naGeladeira[r.id] > 1 ? 's' : ''}` : 'sem estoque'}</span>
          ${q > 0 && html`<span class="pdv-qtd" aria-hidden="true">${qtdTxt(q)}</span>`}
        </button>`;
      })}
    </div>
    ${!duvida && !termo && !todos && visiveis.length < filtradas.length && html`<button class="btn btn-sec btn-larga" style="margin-top:10px" onClick=${() => setTodos(true)}>Mostrar todos os ${filtradas.length} pudins</button>`}
    ${canal === 'ifood' && linhas.some((l) => l.calculado) && html`<p class="muted" style="font-size:12.5px;margin:8px 2px 0">* Sem preço de iFood cadastrado: calculei o que deixa o mesmo líquido da venda direta. Cadastre na receita.</p>`}

    ${linhas.length > 0 && html`<button class="btn btn-pri pdv-barra" onClick=${() => document.getElementById('carrinho')?.scrollIntoView({ behavior: 'smooth' })}>
      <span>Carrinho: ${t.quantidade} ${t.quantidade === 1 ? 'pudim' : 'pudins'}</span><span>${brl(t.bruto)}</span></button>`}
    <section id="carrinho" class="painel painel-pad pdv-carrinho" aria-label="Carrinho">
      ${!linhas.length
        ? html`<p class="muted" style="margin:0">Carrinho vazio.</p>`
        : html`
        <ul class="pdv-linhas">
          ${linhas.map((l) => html`<li>
            <div class="pdv-linha-nome">${l.receita.nome}
              ${naGeladeira[l.receita.id] !== undefined && l.quantidade > (naGeladeira[l.receita.id] || 0) && html`<div class="neg" style="font-size:12px">Só ${naGeladeira[l.receita.id] || 0} no estoque</div>`}
              ${!(l.receita.id in naGeladeira) && html`<div class="muted" style="font-size:12px">Nenhum pronto${d.locais.length > 1 ? ` em ${d.locaisPorId[local].nome}` : ''}</div>`}</div>
            <div class="pdv-contador">
              <button class="icone-btn" aria-label=${`Menos ${l.receita.nome}`} onClick=${() => mudar(l.receita.id, -1)}>−</button>
              <input aria-label=${`Quantidade de ${l.receita.nome}`} inputmode="decimal" value=${qtdTexto[l.receita.id] ?? qtdTxt(l.quantidade)} onInput=${(e) => digitarQtd(l.receita.id, e.target.value)} onBlur=${() => soltarQtd(l.receita.id)} />
              <button class="icone-btn" aria-label=${`Mais ${l.receita.nome}`} onClick=${() => mudar(l.receita.id, 1)}>+</button>
            </div>
            <input class="pdv-preco-linha" aria-label=${`Preço de ${l.receita.nome}`} inputmode="decimal" placeholder="0,00"
              value=${precos[chavePreco(l.receita.id)] ?? (l.preco ? valorTxt(l.preco) : '')}
              onInput=${(e) => setPrecos((p) => ({ ...p, [chavePreco(l.receita.id)]: e.target.value }))} />
          </li>`)}
        </ul>
        <div class="pdv-totais">
          <div><span>${t.quantidade} ${t.quantidade === 1 ? 'pudim' : 'pudins'}</span><strong>${brl(t.bruto)}</strong></div>
          ${canal === 'ifood' && html`<div class="muted"><span>Taxa iFood ≈ ${qtdTxt(taxaPct)}%</span><span>− ${brl(t.taxa)}</span></div>
            <div class="muted"><span>Deve ficar com vocês</span><span>${brl(t.liquido)}</span></div>`}
          <div class="muted"><span>Lucro (tirando ingredientes e embalagens)</span><span>${brl(t.lucro)}</span></div>
          ${t.fixo > 0 && html`<div class="muted"><span>Lucro livre (tirando também mão de obra e despesas)</span><span>${brl(t.lucroLivre)}</span></div>`}
        </div>
        <div class="linha2">
          <${Campo} rotulo="Dia"><input type="date" value=${data} onInput=${(e) => setData(e.target.value)} /><//>
          ${canal === 'direta' && lancar ? html`<${SelectConta} rotulo="Entrou em" valor=${conta_id} onChange=${setConta} contas=${contas} />` : html`<div class="campo"><span>Saldo</span><div style="padding:12px 0">${canal === 'ifood' ? 'Não mexe (só estoque)' : '—'}</div></div>`}
        </div>
        ${canal === 'direta' && html`<label class="interruptor"><span>Lançar no caixa</span><input type="checkbox" checked=${lancar} onChange=${(e) => setLancar(e.target.checked)} /></label>`}
        ${semPreco.length > 0 && html`<div class="duvida" style="margin-top:10px"><${Icone} n="alerta" /><span>Digite o preço de ${semPreco.map((l) => l.receita.nome).join(', ')}.</span></div>`}
        <button class=${`btn btn-pri btn-larga ${salvando ? 'carregando' : ''}`} style="margin-top:14px" disabled=${salvando || semPreco.length > 0 || (lancar && canal === 'direta' && !conta_id)} onClick=${finalizar}>
          ${salvando ? 'Salvando…' : `Finalizar venda · ${brl(t.bruto)}`}</button>
        <button class="link" style="margin-top:8px" onClick=${() => { setCarrinho({}); setPrecos({}); setQtdTexto({}); }}>Esvaziar carrinho</button>`}
    </section>
  </main>`;
}
