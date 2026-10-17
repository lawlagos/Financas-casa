// Roda o código do Apps Script dentro de uma planilha falsa em memória.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ambiente } from './ambiente.js';
import { SCHEMA } from '../../app/core/schema.js';
import { conteudoInicial } from '../../scripts/gerar-inicial.mjs';

const DIR = new URL('../../apps-script/', import.meta.url);

const PROPS = { GOOGLE_CLIENT_ID: 'cliente-123', EMAILS_AUTORIZADOS: 'marido@gmail.com, Esposa@gmail.com' };
const tokenOk = (email) => () => ({ code: 200, body: JSON.stringify({ aud: 'cliente-123', email, email_verified: 'true' }) });

let env;
beforeEach(() => {
  env = ambiente({ props: PROPS, tokeninfo: tokenOk('esposa@gmail.com') });
  env.ctx.configurar();
});

test('esquema do Apps Script é o mesmo do app', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(env.ctx.ESQUEMA)), SCHEMA);
});

test('Inicial.gs está atualizado com seed.js', () => {
  assert.equal(readFileSync(new URL('Inicial.gs', DIR), 'utf8'), conteudoInicial(), 'rode: node scripts/gerar-inicial.mjs');
});

test('configurar cria abas, contas e categorias sem duplicar', () => {
  assert.ok(env.abas['Lançamentos'] && env.abas['Sessões']);
  assert.equal(env.abas['Contas'].linhas.length, 1 + 9);
  env.ctx.configurar();
  assert.equal(env.abas['Contas'].linhas.length, 1 + 9);
  // coluna de data como texto
  const iData = SCHEMA.lancamentos.indexOf('data') + 1;
  assert.equal(env.abas['Lançamentos'].formatos[iData], '@');
});

test('sem sessão não carrega', () => {
  const r = env.post({ acao: 'carregar' });
  assert.equal(r.ok, false);
  assert.equal(r.codigo, 'sessao-invalida');
});

test('login com e-mail autorizado cria sessão; carregar devolve tabelas tipadas', () => {
  const login = env.post({ acao: 'entrar', dados: { idToken: 'x', aparelho: 'Android' } });
  assert.equal(login.ok, true);
  assert.equal(login.dados.email, 'esposa@gmail.com');
  const r = env.post({ acao: 'carregar', sessao: login.dados.sessao });
  assert.equal(r.ok, true);
  assert.equal(r.dados.contas.length, 9);
  assert.equal(typeof r.dados.contas[0].saldo_inicial, 'number');
  assert.equal(r.dados.contas[0].ativa, true);
  assert.equal(r.dados._usuario.email, 'esposa@gmail.com');
  assert.deepEqual(Object.keys(r.dados).sort(), [...Object.keys(SCHEMA), '_usuario'].sort());
});

test('login recusado: e-mail de fora e token de outro app', () => {
  let e = ambiente({ props: PROPS, tokeninfo: tokenOk('intruso@gmail.com') });
  let r = e.post({ acao: 'entrar', dados: { idToken: 'x' } });
  assert.equal(r.codigo, 'nao-autorizado');
  e = ambiente({ props: PROPS, tokeninfo: () => ({ code: 200, body: JSON.stringify({ aud: 'outro', email: 'marido@gmail.com', email_verified: 'true' }) }) });
  r = e.post({ acao: 'entrar', dados: { idToken: 'x' } });
  assert.equal(r.codigo, 'login');
  e = ambiente({ props: {}, tokeninfo: tokenOk('marido@gmail.com') });
  r = e.post({ acao: 'entrar', dados: { idToken: 'x' } });
  assert.match(r.erro, /GOOGLE_CLIENT_ID/);
});

test('salvar insere e depois substitui pelo id; apagar remove', () => {
  const { sessao } = env.post({ acao: 'entrar', dados: { idToken: 'x' } }).dados;
  const lanc = { id: 'l1', data: '2026-10-16', tipo: 'saida', valor: 87.5, descricao: 'Assaí', conta_id: 'nubank-pj', origem: 'Pudim' };
  assert.equal(env.post({ acao: 'salvar', sessao, dados: { tabela: 'lancamentos', linha: lanc } }).ok, true);
  env.post({ acao: 'salvar', sessao, dados: { tabela: 'lancamentos', linha: { ...lanc, valor: 90 } } });
  let t = env.post({ acao: 'carregar', sessao }).dados.lancamentos;
  assert.equal(t.length, 1);
  assert.equal(t[0].valor, 90);
  assert.equal(t[0].data, '2026-10-16');
  assert.equal(t[0].previsto_id, '');
  assert.equal(env.post({ acao: 'apagar', sessao, dados: { tabela: 'lancamentos', id: 'l1' } }).dados, true);
  t = env.post({ acao: 'carregar', sessao }).dados.lancamentos;
  assert.equal(t.length, 0);
});

test('tabela desconhecida e linha sem id são recusadas', () => {
  const { sessao } = env.post({ acao: 'entrar', dados: { idToken: 'x' } }).dados;
  assert.equal(env.post({ acao: 'salvar', sessao, dados: { tabela: 'sessoes', linha: { id: 'x' } } }).codigo, 'tabela-invalida');
  assert.equal(env.post({ acao: 'salvar', sessao, dados: { tabela: 'lancamentos', linha: {} } }).codigo, 'linha-invalida');
  assert.equal(env.post({ acao: 'apagar', sessao, dados: { tabela: 'Contas', id: 'c6' } }).codigo, 'tabela-invalida');
});

test('sessão expira depois de 90 dias sem uso e pode ser revogada apagando a linha', () => {
  const { sessao } = env.post({ acao: 'entrar', dados: { idToken: 'x' } }).dados;
  const aba = env.abas['Sessões'];
  aba.linhas[1][4] = new Date(Date.now() - 91 * 86400000).toISOString();
  assert.equal(env.post({ acao: 'carregar', sessao }).codigo, 'sessao-invalida');
  assert.equal(aba.linhas.length, 1);
  const outra = env.post({ acao: 'entrar', dados: { idToken: 'x' } }).dados.sessao;
  aba.deleteRow(2);
  assert.equal(env.post({ acao: 'carregar', sessao: outra }).codigo, 'sessao-invalida');
});

test('e-mail removido da lista perde o acesso mesmo com sessão', () => {
  const { sessao } = env.post({ acao: 'entrar', dados: { idToken: 'x' } }).dados;
  PROPS.EMAILS_AUTORIZADOS = 'marido@gmail.com';
  try {
    assert.equal(env.post({ acao: 'carregar', sessao }).codigo, 'sessao-invalida');
  } finally {
    PROPS.EMAILS_AUTORIZADOS = 'marido@gmail.com, Esposa@gmail.com';
  }
});

test('dist/servidor.gs está atualizado e roda sozinho', async () => {
  const { conteudoServidor } = await import('../../scripts/gerar-servidor.mjs');
  const dist = readFileSync(new URL('../../dist/servidor.gs', import.meta.url), 'utf8');
  assert.equal(dist, conteudoServidor(), 'rode: node scripts/gerar-servidor.mjs');
  const vm = await import('node:vm');
  const ctx = { Utilities: { formatDate: () => '2026-10-17' } };
  vm.createContext(ctx);
  vm.runInContext(dist, ctx);
  assert.equal(typeof ctx.doPost, 'function');
  assert.equal(typeof ctx.configurar, 'function');
});

test('interpretar: manda a imagem ao Gemini com a chave no cabeçalho e devolve o JSON', () => {
  const resposta = { tipo_documento: 'comprovante', lancamentos: [{ tipo: 'saida', valor: 87.5, descricao: 'Pix Assaí' }], itens: [] };
  const e = ambiente({
    props: { ...PROPS, GEMINI_API_KEY: 'chave-secreta' },
    tokeninfo: tokenOk('marido@gmail.com'),
    gemini: () => ({ code: 200, body: JSON.stringify({ candidates: [{ content: { parts: [{ text: '```json\n' + JSON.stringify(resposta) + '\n```' }] } }] }) }),
  });
  e.ctx.configurar();
  const { sessao } = e.post({ acao: 'entrar', dados: { idToken: 'x' } }).dados;
  const r = e.post({ acao: 'interpretar', sessao, dados: { imagem: 'QUJD', mime: 'image/jpeg', contexto: { hoje: '2026-10-17', contas: [{ id: 'inter', nome: 'Inter' }] } } });
  assert.equal(r.ok, true, r.erro);
  assert.deepEqual(r.dados, resposta);
  const [chamada] = e.chamadasGemini;
  assert.match(chamada.url, /gemini-2\.5-flash:generateContent$/);
  assert.equal(chamada.opcoes.headers['x-goog-api-key'], 'chave-secreta');
  const corpo = JSON.parse(chamada.opcoes.payload);
  assert.equal(corpo.contents[0].parts[1].inline_data.data, 'QUJD');
  assert.match(corpo.contents[0].parts[0].text, /"id":"inter"/);
  assert.match(corpo.contents[0].parts[0].text, /Hoje é 2026-10-17/);
});

test('interpretar: sem sessão, sem chave, limite e modelo inexistente dão mensagens claras', () => {
  const base = { props: { ...PROPS }, tokeninfo: tokenOk('marido@gmail.com') };
  let e = ambiente(base);
  e.ctx.configurar();
  assert.equal(e.post({ acao: 'interpretar', dados: { imagem: 'x' } }).codigo, 'sessao-invalida');
  let { sessao } = e.post({ acao: 'entrar', dados: { idToken: 'x' } }).dados;
  assert.match(e.post({ acao: 'interpretar', sessao, dados: { imagem: 'x' } }).erro, /GEMINI_API_KEY/);
  for (const [code, codigo] of [[429, 'ia-limite'], [404, 'ia-modelo'], [400, 'ia-chave'], [500, 'ia']]) {
    e = ambiente({ ...base, props: { ...PROPS, GEMINI_API_KEY: 'k' }, gemini: () => ({ code, body: '{}' }) });
    e.ctx.configurar();
    ({ sessao } = e.post({ acao: 'entrar', dados: { idToken: 'x' } }).dados);
    assert.equal(e.post({ acao: 'interpretar', sessao, dados: { imagem: 'x' } }).codigo, codigo);
  }
});

test('salvarVarias grava várias linhas de uma vez na aba Itens, criada sozinha', () => {
  const { sessao } = env.post({ acao: 'entrar', dados: { idToken: 'x' } }).dados;
  const linhas = [{ id: 'i1', descricao: 'Leite condensado', quantidade: 6, valor: 38.34, origem: 'Pudim' }, { id: 'i2', descricao: 'Detergente', quantidade: 1, valor: 2.99, origem: 'Casa' }];
  assert.equal(env.post({ acao: 'salvarVarias', sessao, dados: { tabela: 'itens', linhas } }).ok, true);
  const t = env.post({ acao: 'carregar', sessao }).dados.itens;
  assert.equal(t.length, 2);
  assert.equal(t[0].quantidade, 6);
  assert.ok(env.abas['Itens']);
  assert.equal(env.post({ acao: 'salvarVarias', sessao, dados: { tabela: 'itens', linhas: [{ descricao: 'sem id' }] } }).codigo, 'linha-invalida');
});
