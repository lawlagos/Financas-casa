// Peças só do app Pudins: menu de baixo e ajustes (taxa do iFood, importar receitas, tema e conta).
import { useState } from '../../vendor/hooks.module.js';
import { html } from '../html.js';
import { Icone } from '../icones.js';
import { Topo, Secao, Campo } from '../componentes.js';
import { useStore, salvar, config, reiniciarDemo, sair, toast } from '../../data/store.js';
import { parseBRL } from '../../core/money.js';
import { TAXA_IFOOD_PADRAO } from '../../core/pudim.js';
import { ifoodAntigoNoSaldo, tirarIfoodAntigoDoSaldo, paraJuntarNaPj, juntarNaPj } from '../../data/pudim-acoes.js';
import { Importar, lerTema, aplicarTema } from './mais.js';
import { urlDoApp } from '../apps.js';
import { FaixaDemo } from './inicio.js';

// Menu: Início, Estoque, Vender (no meio), Receitas e Compras do pudim.
export function NavPudins({ caminho }) {
  const aba = new URLSearchParams(location.hash.split('?')[1] || '').get('aba');
  const atual = (id) => {
    if (id === 'inicio') return (caminho === '/inicio' || (caminho === '/pudim' && !aba)) ? 'page' : null;
    if (id === 'estoque') return caminho === '/pudim' && (aba === 'estoque' || aba === 'ingredientes') ? 'page' : null;
    if (id === 'receitas') return caminho === '/pudim' && (aba === 'receitas' || aba === 'custos') ? 'page' : null;
    if (id === 'lista') return caminho === '/lista' || caminho === '/pudim/compras' ? 'page' : null;
    return null;
  };
  const link = (id, href, icone, rot) => html`<li><a href=${href} aria-current=${atual(id)}><${Icone} n=${icone} />${rot}</a></li>`;
  return html`<nav class="nav" aria-label="Navegação principal"><ul>
    ${link('inicio', '#/inicio', 'inicio', 'Início')}
    ${link('estoque', '#/pudim?aba=estoque', 'pilha', 'Estoque')}
    <li style="display:grid"><a class="fab" href="#/pudim/vender" aria-label="Vender" aria-current=${caminho === '/pudim/vender' ? 'page' : null}><${Icone} n="carrinho" /></a></li>
    ${link('receitas', '#/pudim?aba=receitas', 'etiqueta', 'Receitas')}
    ${link('lista', '#/lista', 'lista', 'Compras')}
  </ul></nav>`;
}

export function TelaAjustesPudim() {
  const s = useStore();
  const [taxa, setTaxa] = useState(String(config('taxa_ifood', TAXA_IFOOD_PADRAO)).replace('.', ','));
  const [tema, setTema] = useState(lerTema());
  const [limpando, setLimpando] = useState(false);
  const antigo = ifoodAntigoNoSaldo(s.tables);
  const juntar = paraJuntarNaPj(s.tables);
  const nomePj = s.tables.contas.find((c) => c.id === juntar.pj)?.nome || 'conta PJ';
  const [juntando, setJuntando] = useState(false);
  const fazerJuntar = async () => {
    if (!confirm(`Passar ${juntar.mover.length} lançamentos de ${juntar.contas.map((c) => c.nome).join(' e ')} para a ${nomePj}, apagar ${juntar.apagar.length} transferências entre elas e desativar essas contas?`)) return;
    setJuntando(true);
    try {
      const r = await juntarNaPj();
      toast(`${r.movidos} lançamentos passados para a ${nomePj}, ${r.apagados} transferências apagadas`);
    } finally {
      setJuntando(false);
    }
  };
  const limpar = async () => {
    if (!confirm(`Tirar do saldo ${antigo.lancs.length} lançamentos de vendas do iFood (e ${antigo.repasses.length} repasses previstos)? As vendas continuam no estoque.`)) return;
    setLimpando(true);
    try {
      const r = await tirarIfoodAntigoDoSaldo();
      toast(`${r.lancamentos} lançamentos e ${r.repasses} repasses tirados do saldo`);
    } finally {
      setLimpando(false);
    }
  };
  const guardar = async () => {
    const t = parseBRL(taxa);
    if (!(t >= 0 && t < 100)) return toast('Taxa inválida', { tom: 'erro' });
    await salvar('config', { id: 'taxa_ifood', valor: t });
    toast('Ajustes salvos');
  };
  const trocarTema = (t) => {
    setTema(t);
    try {
      localStorage.setItem('fc-tema', t);
    } catch {
      /* tema vale só nesta sessão */
    }
    aplicarTema(t);
  };
  return html`<main>
    <${Topo} titulo="Ajustes" voltar="#/inicio" />
    <${FaixaDemo} />
    <div class="painel painel-pad">
      <${Campo} rotulo="Taxa do iFood (%)" ajuda="Quanto o iFood tira de cada venda. Vale para as próximas vendas.">
        <input id="ajuste-taxa-ifood" inputmode="decimal" value=${taxa} onInput=${(e) => setTaxa(e.target.value)} />
      <//>
      <button class="btn btn-pri btn-larga" style="margin-top:16px" onClick=${guardar}>Salvar</button>
      <button class="btn btn-sec btn-larga" style="margin-top:8px" onClick=${() => (location.hash = '#/pudim?aba=receitas')}>Mão de obra e despesas fixas: em Receitas</button>
    </div>
    ${(antigo.lancs.length > 0 || antigo.repasses.length > 0) && html`<div class="painel painel-pad aviso-minimo" style="margin-top:12px" aria-label="iFood antigo no saldo">
      <strong>Vendas do iFood ainda no saldo</strong>
      <p class="muted" style="font-size:13px;margin:4px 0 10px">Antes, cada venda do iFood entrava na conta iFood (com a taxa) e virava um repasse previsto. Agora o iFood só mexe no estoque e o dinheiro entra quando você lança o pagamento de quarta. Há ${antigo.lancs.length} lançamentos e ${antigo.repasses.length} repasses do jeito antigo.</p>
      <button class=${`btn btn-sec btn-larga ${limpando ? 'carregando' : ''}`} disabled=${limpando} onClick=${limpar}>Tirar do saldo (o estoque fica igual)</button>
    </div>`}
    ${juntar.contas.length > 0 && juntar.pj && html`<section class="painel painel-pad aviso-minimo" style="margin-top:12px" aria-label="Juntar na PJ">
      <strong>Juntar tudo na ${nomePj}</strong>
      <p class="muted" style="font-size:13px;margin:4px 0 10px">Agora venda direta e pagamento do iFood entram direto na ${nomePj}, separados pela categoria (Venda de pudim e Pagamento iFood). As contas ${juntar.contas.map((c) => c.nome).join(' e ')} têm ${juntar.mover.length} lançamentos para passar para a ${nomePj}${juntar.apagar.length ? ` e ${juntar.apagar.length} transferências entre elas (que deixam de ser necessárias)` : ''}.</p>
      <button class=${`btn btn-sec btn-larga ${juntando ? 'carregando' : ''}`} disabled=${juntando} onClick=${fazerJuntar}>Juntar na ${nomePj}</button>
    </section>`}
    <${Importar} />
    <${Secao} titulo="Tema">
      <div class="segmento" role="group" aria-label="Tema">
        ${[['auto', 'Automático'], ['light', 'Claro'], ['dark', 'Escuro']].map(([v, t]) => html`<button aria-pressed=${String(tema === v)} onClick=${() => trocarTema(v)}>${t}</button>`)}
      </div>
    <//>
    <${Secao} titulo="Outros apps">
      <a class="btn btn-sec btn-larga" href=${urlDoApp('financas', '/inicio')}><${Icone} n="dinheiro" />Abrir o Finanças da Casa</a>
      <p class="muted" style="font-size:12.5px;margin:8px 2px 0">A mesma planilha: as vendas e compras do pudim aparecem lá nos lançamentos e no resumo de Negócios.</p>
    <//>
    <${Secao} titulo=${s.modo === 'demo' ? 'Modo demonstração' : 'Conta'}>
      <div class="painel painel-pad">
        ${s.modo === 'demo'
          ? html`<button class="btn btn-sec btn-larga" onClick=${async () => { await reiniciarDemo(); toast('Exemplos restaurados'); }}>Restaurar dados de exemplo</button>`
          : html`<p style="margin:0 0 12px;color:var(--ink-2)">Conectado como ${s.usuario?.email || 'você'}.</p>
            <button class="btn btn-sec btn-larga" onClick=${sair}><${Icone} n="sair" />Sair deste aparelho</button>`}
      </div>
    <//>
  </main>`;
}
