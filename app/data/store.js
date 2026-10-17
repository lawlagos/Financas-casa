// Estado do app: tabelas carregadas uma vez, alterações otimistas e avisos (toasts).
import { useEffect, useState } from '../vendor/hooks.module.js';
import { todayIso } from '../core/dates.js';
import { TABELAS, uid } from '../core/schema.js';
import { LocalApi } from './local-api.js';
import { RemoteApi } from './remote-api.js';
import { CONFIG } from '../config.js';

export const state = {
  fase: 'carregando', // carregando | login | pronto | erro
  modo: 'demo',
  hoje: todayIso(),
  tables: Object.fromEntries(TABELAS.map((t) => [t, []])),
  erro: null,
  toast: null,
  usuario: null,
};

let api;
const listeners = new Set();

// O app pode ficar aberto de um dia para o outro: ao voltar para ele, confere a data de hoje.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    const hoje = todayIso();
    if (hoje !== state.hoje) {
      state.hoje = hoje;
      emit();
    }
  });
}

let versao = 0;

export function emit() {
  versao += 1;
  for (const fn of listeners) fn();
}

// Re-renderiza quando o estado muda. Se algo mudou entre a renderização e a inscrição, atualiza logo.
export function useStore() {
  const [, force] = useState(0);
  const vista = versao;
  useEffect(() => {
    const fn = () => force((x) => x + 1);
    listeners.add(fn);
    if (versao !== vista) fn();
    return () => listeners.delete(fn);
  }, []);
  return state;
}

function usarDemo() {
  const params = new URLSearchParams(location.search);
  return !CONFIG.apiUrl || params.has('demo');
}

export async function init() {
  api = usarDemo() ? new LocalApi(state.hoje) : new RemoteApi(CONFIG.apiUrl);
  state.modo = api.modo;
  if (api.modo === 'nuvem' && !api.sessao) {
    state.fase = 'login';
    emit();
    return;
  }
  await recarregar();
}

export async function recarregar() {
  try {
    const t = await api.carregar();
    for (const nome of TABELAS) state.tables[nome] = t[nome] || [];
    state.usuario = t._usuario || null;
    state.fase = 'pronto';
    state.erro = null;
  } catch (e) {
    if (e.codigo === 'sessao-invalida') {
      api.sair();
      state.fase = 'login';
    } else {
      state.fase = 'erro';
      state.erro = e.message;
    }
  }
  emit();
}

export async function entrar(idToken) {
  const aparelho = navigator.userAgent.match(/\(([^)]+)\)/)?.[1]?.slice(0, 60) || 'aparelho';
  await api.entrar(idToken, aparelho);
  state.fase = 'carregando';
  emit();
  await recarregar();
}

export function sair() {
  if (api.sair) api.sair();
  state.fase = 'login';
  emit();
}

export async function reiniciarDemo() {
  await api.reiniciar();
  await recarregar();
}

// Manda a imagem para a IA (via servidor) e devolve a leitura bruta.
export function interpretarImagem(dados) {
  return api.interpretar(dados);
}

export function config(chave, padrao = '') {
  const c = state.tables.config.find((x) => x.id === chave);
  return c ? c.valor : padrao;
}

function quem() {
  return state.usuario?.email || (state.modo === 'demo' ? 'demo' : '');
}

// Salva uma linha (insere ou substitui pelo id), com atualização imediata na tela.
export async function salvar(tabela, linha) {
  const agora = new Date().toISOString();
  const nova = { ...linha };
  if (!nova.id) nova.id = uid(tabela.slice(0, 3));
  if (tabela === 'lancamentos') {
    if (!nova.criado_em) {
      nova.criado_em = agora;
      nova.criado_por = quem();
    } else nova.editado_em = agora;
  }
  const anterior = state.tables[tabela].find((x) => x.id === nova.id) || null;
  state.tables[tabela] = anterior ? state.tables[tabela].map((x) => (x.id === nova.id ? nova : x)) : [...state.tables[tabela], nova];
  emit();
  try {
    await api.salvar(tabela, nova);
  } catch (e) {
    // Desfaz pelo id na lista de agora: outras gravações podem ter mudado a lista enquanto esta ia.
    state.tables[tabela] = anterior
      ? state.tables[tabela].map((x) => (x.id === nova.id ? anterior : x))
      : state.tables[tabela].filter((x) => x.id !== nova.id);
    toast(`Não salvou: ${e.message}`, { tom: 'erro' });
    emit();
    throw e;
  }
  return nova;
}

// Grava várias linhas de uma vez; id que já existe é substituído (o servidor faz o mesmo).
export async function salvarVarias(tabela, linhas) {
  const novas = linhas.map((l) => ({ ...l, id: l.id || uid(tabela.slice(0, 3)) }));
  const ids = new Set(novas.map((l) => l.id));
  const anteriores = (state.tables[tabela] || []).filter((l) => ids.has(l.id));
  state.tables[tabela] = (state.tables[tabela] || []).filter((l) => !ids.has(l.id)).concat(novas);
  emit();
  try {
    await api.salvarVarias(tabela, novas);
  } catch (e) {
    state.tables[tabela] = state.tables[tabela].filter((l) => !ids.has(l.id)).concat(anteriores);
    toast(`Não salvou: ${e.message}`, { tom: 'erro' });
    emit();
    throw e;
  }
  return novas;
}

export async function apagar(tabela, id) {
  const lista = state.tables[tabela];
  const linha = lista.find((x) => x.id === id);
  state.tables[tabela] = lista.filter((x) => x.id !== id);
  emit();
  try {
    await api.apagar(tabela, id);
  } catch (e) {
    if (linha && !state.tables[tabela].some((x) => x.id === id)) state.tables[tabela] = [...state.tables[tabela], linha];
    toast(`Não apagou: ${e.message}`, { tom: 'erro' });
    emit();
    throw e;
  }
  return linha;
}

// Apaga um lançamento e as baixas ligadas a ele, com opção de desfazer.
export async function apagarLancamento(id) {
  const baixas = state.tables.baixas.filter((b) => b.lancamento_id === id);
  const linha = await apagar('lancamentos', id);
  for (const b of baixas) await apagar('baixas', b.id);
  toast('Lançamento apagado', {
    acao: 'Desfazer',
    onAcao: async () => {
      await salvar('lancamentos', linha);
      for (const b of baixas) await salvar('baixas', b);
    },
  });
}

let toastTimer;
export function toast(texto, { acao, onAcao, tom = 'normal', ms = 5000 } = {}) {
  clearTimeout(toastTimer);
  state.toast = { id: Date.now(), texto, acao, onAcao, tom };
  emit();
  toastTimer = setTimeout(() => {
    state.toast = null;
    emit();
  }, ms);
}

export function fecharToast() {
  clearTimeout(toastTimer);
  state.toast = null;
  emit();
}

// Folha (modal de baixo) aberta: { tipo, props }. Uma por vez.
export function abrirFolha(tipo, props = {}) {
  state.folha = { tipo, props, id: Date.now() };
  emit();
}

export function fecharFolha() {
  state.folha = null;
  emit();
}
