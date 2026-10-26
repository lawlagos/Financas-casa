import { useState } from '../../vendor/hooks.module.js';
import { html } from '../html.js';
import { Icone } from '../icones.js';
import { Folha, Segmento, Chips, Campo } from '../componentes.js';
import { useStore, salvar, fecharFolha, toast } from '../../data/store.js';
import { parseBRL, brl } from '../../core/money.js';
import { ORIGENS } from '../../core/schema.js';
import { GRUPOS } from '../../core/balances.js';
import { CATEGORIA_DIZIMO } from '../../core/tithe.js';
import { contasAtivas, origemLabel } from '../derivados.js';
import { SelectConta } from './lancamento.js';

const CORES = ['#2b2b2b', '#ff7a00', '#009ee3', '#f04e23', '#ec7000', '#820ad1', '#cc092f', '#a35bd8', '#5d0a9c', '#1e7f55', '#b8741a', '#5b63b7'];

export function FolhaConta({ conta }) {
  const s = useStore();
  const editando = !!conta;
  const [f, setF] = useState(conta ? { ...conta, saldo_inicial: String(conta.saldo_inicial).replace('.', ',') } : {
    nome: '', dono: 'Marido', grupo: 'Pessoal', saldo_inicial: '', data_saldo_inicial: s.hoje, cor: CORES[0], ativa: true,
  });
  const [tentou, setTentou] = useState(false);
  const set = (p) => setF((x) => ({ ...x, ...p }));
  const guardar = async () => {
    setTentou(true);
    if (!f.nome.trim()) return;
    await salvar('contas', { ...f, nome: f.nome.trim(), saldo_inicial: parseBRL(f.saldo_inicial), ativa: f.ativa !== false });
    fecharFolha();
    toast(editando ? 'Conta atualizada' : 'Conta criada');
  };
  return html`<${Folha} titulo=${editando ? `Conta ${conta.nome}` : 'Nova conta'} rodape=${html`<button class="btn btn-pri" onClick=${guardar}>${editando ? 'Salvar conta' : 'Criar conta'}</button>`}>
    <${Campo} rotulo="Nome"><input value=${f.nome} onInput=${(e) => set({ nome: e.target.value })} aria-invalid=${tentou && !f.nome.trim()} /><//>
    <div class="campo"><span>De quem</span><${Segmento} rotulo="Dono" valor=${f.dono} onChange=${(v) => set({ dono: v })} opcoes=${[['Marido', 'Marido'], ['Esposa', 'Esposa']]} /></div>
    <div class="campo"><span>Grupo</span><${Segmento} rotulo="Grupo" valor=${f.grupo} onChange=${(v) => set({ grupo: v })} opcoes=${GRUPOS.map((g) => [g, g])} /></div>
    <div class="linha2">
      <${Campo} rotulo="Saldo em"><input type="date" value=${f.data_saldo_inicial} onInput=${(e) => set({ data_saldo_inicial: e.target.value })} /><//>
      <${Campo} rotulo="Saldo nesse dia"><input inputmode="decimal" placeholder="0,00" value=${f.saldo_inicial} onInput=${(e) => set({ saldo_inicial: e.target.value })} /><//>
    </div>
    <div class="ajuda muted" style="font-size:12.5px;margin-top:6px">O saldo de hoje é esse valor mais tudo que foi lançado a partir dessa data.</div>
    <div class="campo"><span>Cor</span>
      <div class="chips">${CORES.map((c) => html`<button type="button" class="chip" aria-label=${`Cor ${c}`} aria-pressed=${String(f.cor === c)} onClick=${() => set({ cor: c })} style=${`width:34px;height:34px;padding:0;background:${c};border-color:${f.cor === c ? 'var(--ink)' : c};outline:${f.cor === c ? '2px solid var(--ink)' : 'none'};outline-offset:2px`}></button>`)}</div>
    </div>
    ${editando && html`<label class="interruptor"><span>Conta em uso</span><input type="checkbox" checked=${f.ativa !== false} onChange=${(e) => set({ ativa: e.target.checked })} /></label>`}
  <//>`;
}

export function FolhaCategoria({ categoria }) {
  const editando = !!categoria;
  const [f, setF] = useState(categoria ? { ...categoria } : { nome: '', tipo: 'saida', origem_padrao: 'Casa', ativa: true });
  const set = (p) => setF((x) => ({ ...x, ...p }));
  const fixa = categoria?.id === CATEGORIA_DIZIMO;
  const guardar = async () => {
    if (!f.nome.trim()) return;
    await salvar('categorias', { ...f, nome: f.nome.trim() });
    fecharFolha();
    toast(editando ? 'Categoria atualizada' : 'Categoria criada');
  };
  return html`<${Folha} titulo=${editando ? 'Editar categoria' : 'Nova categoria'} rodape=${html`<button class="btn btn-pri" onClick=${guardar}>Salvar categoria</button>`}>
    <${Campo} rotulo="Nome"><input value=${f.nome} onInput=${(e) => set({ nome: e.target.value })} /><//>
    ${!fixa && html`<div class="campo"><span>Tipo</span><${Segmento} classe="tipo" rotulo="Tipo" valor=${f.tipo} onChange=${(v) => set({ tipo: v })} opcoes=${[['saida', 'Saída'], ['entrada', 'Entrada']]} /></div>`}
    <div class="campo"><span>Caixa sugerido</span><${Chips} rotulo="Caixa sugerido" valor=${f.origem_padrao} onChange=${(o) => set({ origem_padrao: o })} opcoes=${ORIGENS.map((o) => [o, origemLabel(o)])} />
      <div class="ajuda">Ao escolher esta categoria num lançamento, a origem já vem marcada.</div></div>
    ${editando && !fixa && html`<label class="interruptor"><span>Categoria em uso</span><input type="checkbox" checked=${f.ativa !== false} onChange=${(e) => set({ ativa: e.target.checked })} /></label>`}
  <//>`;
}

// Lança o pagamento do dízimo de uma semana ou de um mês.
export function FolhaDizimo({ referencia, valor, titulo }) {
  const s = useStore();
  const contas = contasAtivas(s);
  const ultimo = [...s.tables.lancamentos].reverse().find((l) => l.categoria_id === CATEGORIA_DIZIMO);
  const [f, setF] = useState({ valor: (valor / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 }), conta_id: ultimo?.conta_id || '', data: s.hoje });
  const set = (p) => setF((x) => ({ ...x, ...p }));
  const v = parseBRL(f.valor);
  const [salvando, setSalvando] = useState(false);
  const pagar = async () => {
    if (!(v > 0) || !f.conta_id) return;
    setSalvando(true);
    try {
      await salvar('lancamentos', {
      tipo: 'saida', valor: v, descricao: titulo, data: f.data, conta_id: f.conta_id, conta_destino_id: '', categoria_id: CATEGORIA_DIZIMO,
      origem: 'Casa', canal: 'manual', id_externo: referencia, previsto_id: '',
      });
    } catch {
      setSalvando(false);
      return;
    }
    fecharFolha();
    toast(`${titulo} pago: ${brl(Math.round(v * 100))}`);
  };
  return html`<${Folha} titulo="Pagar dízimo" rodape=${html`<button class=${`btn btn-pri ${salvando ? 'carregando' : ''}`} disabled=${!(v > 0) || !f.conta_id || salvando} onClick=${pagar}><${Icone} n="check" />Marcar como pago</button>`}>
    <p style="margin:0;color:var(--ink-2)">${titulo}</p>
    <div class="linha2">
      <${Campo} rotulo="Valor"><input inputmode="decimal" value=${f.valor} onInput=${(e) => set({ valor: e.target.value })} /><//>
      <${Campo} rotulo="Data"><input type="date" value=${f.data} onInput=${(e) => set({ data: e.target.value })} /><//>
    </div>
    <${SelectConta} rotulo="Saiu de" valor=${f.conta_id} contas=${contas} onChange=${(c) => set({ conta_id: c })} />
  <//>`;
}
