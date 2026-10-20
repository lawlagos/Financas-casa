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

const LISTA_MODELOS = { models: [
  { name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] },
  { name: 'models/gemini-3.6-flash', supportedGenerationMethods: ['generateContent', 'countTokens'] },
  { name: 'models/gemini-3.8-flash-lite', supportedGenerationMethods: ['generateContent'] },
  { name: 'models/gemini-3.9-flash-preview', supportedGenerationMethods: ['generateContent'] },
  { name: 'models/gemini-3.6-flash-image', supportedGenerationMethods: ['generateContent'] },
  { name: 'models/text-embedding-004', supportedGenerationMethods: ['embedContent'] },
] };

test('interpretar: descobre o Flash estável mais novo, manda a imagem com a chave no cabeçalho e devolve o JSON', () => {
  const resposta = { tipo_documento: 'comprovante', lancamentos: [{ tipo: 'saida', valor: 87.5, descricao: 'Pix Assaí' }], itens: [] };
  const props = { ...PROPS, GEMINI_API_KEY: 'chave-secreta' };
  const e = ambiente({
    props,
    tokeninfo: tokenOk('marido@gmail.com'),
    gemini: (url) => (url.includes('/models?')
      ? { code: 200, body: JSON.stringify(LISTA_MODELOS) }
      : { code: 200, body: JSON.stringify({ candidates: [{ content: { parts: [{ text: '```json\n' + JSON.stringify(resposta) + '\n```' }] } }] }) }),
  });
  e.ctx.configurar();
  const { sessao } = e.post({ acao: 'entrar', dados: { idToken: 'x' } }).dados;
  const r = e.post({ acao: 'interpretar', sessao, dados: { imagem: 'QUJD', mime: 'image/jpeg', contexto: { hoje: '2026-10-17', contas: [{ id: 'inter', nome: 'Inter' }] } } });
  assert.equal(r.ok, true, r.erro);
  assert.deepEqual(r.dados, resposta);
  const chamada = e.chamadasGemini.find((c) => c.url.includes(':generateContent'));
  assert.match(chamada.url, /models\/gemini-3\.6-flash:generateContent$/);
  assert.equal(props.GEMINI_MODELO_AUTO, 'gemini-3.6-flash');
  assert.equal(chamada.opcoes.headers['x-goog-api-key'], 'chave-secreta');
  const corpo = JSON.parse(chamada.opcoes.payload);
  assert.equal(corpo.contents[0].parts[1].inline_data.data, 'QUJD');
  assert.match(corpo.contents[0].parts[0].text, /"id":"inter"/);
  // segunda leitura não consulta a lista de novo
  e.post({ acao: 'interpretar', sessao, dados: { imagem: 'QUJD' } });
  assert.equal(e.chamadasGemini.filter((c) => c.url.includes('/models?')).length, 1);
});

test('interpretar: modelo aposentado (404) faz o servidor escolher outro e tentar de novo', () => {
  const props = { ...PROPS, GEMINI_API_KEY: 'k', GEMINI_MODELO_AUTO: 'gemini-2.0-flash' };
  const e = ambiente({
    props,
    tokeninfo: tokenOk('marido@gmail.com'),
    gemini: (url) => {
      if (url.includes('/models?')) return { code: 200, body: JSON.stringify(LISTA_MODELOS) };
      if (url.includes('gemini-2.0-flash')) return { code: 404, body: '{}' };
      return { code: 200, body: JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"lancamentos":[]}' }] } }] }) };
    },
  });
  e.ctx.configurar();
  const { sessao } = e.post({ acao: 'entrar', dados: { idToken: 'x' } }).dados;
  const r = e.post({ acao: 'interpretar', sessao, dados: { imagem: 'x' } });
  assert.equal(r.ok, true, r.erro);
  assert.equal(props.GEMINI_MODELO_AUTO, 'gemini-3.6-flash');
});

test('interpretar: modelo sem cota (429) ou fora do ar tenta outros modelos; resposta com "pensamento" é ignorada', () => {
  const props = { ...PROPS, GEMINI_API_KEY: 'k', GEMINI_MODELO_AUTO: 'gemini-3.6-flash' };
  const e = ambiente({
    props,
    tokeninfo: tokenOk('marido@gmail.com'),
    gemini: (url) => {
      if (url.includes('/models?')) return { code: 200, body: JSON.stringify(LISTA_MODELOS) };
      if (url.includes('gemini-3.6-flash:')) return { code: 429, body: JSON.stringify({ error: { message: 'Quota exceeded' } }) };
      if (url.includes('gemini-flash-latest:')) return { code: 503, body: '{}' };
      return { code: 200, body: JSON.stringify({ candidates: [{ content: { parts: [{ text: 'pensando...', thought: true }, { text: 'Aqui está: {"lancamentos":[{"valor":10}]}' }] } }] }) };
    },
  });
  e.ctx.configurar();
  const { sessao } = e.post({ acao: 'entrar', dados: { idToken: 'x' } }).dados;
  const r = e.post({ acao: 'interpretar', sessao, dados: { imagem: 'x' } });
  assert.equal(r.ok, true, r.erro);
  assert.deepEqual(r.dados, { lancamentos: [{ valor: 10 }] });
  assert.equal(props.GEMINI_MODELO_AUTO, 'gemini-2.5-flash');
});

test('interpretar: sem sessão, sem chave, limite e modelo inexistente dão mensagens claras', () => {
  const base = { props: { ...PROPS }, tokeninfo: tokenOk('marido@gmail.com') };
  let e = ambiente(base);
  e.ctx.configurar();
  assert.equal(e.post({ acao: 'interpretar', dados: { imagem: 'x' } }).codigo, 'sessao-invalida');
  let { sessao } = e.post({ acao: 'entrar', dados: { idToken: 'x' } }).dados;
  assert.match(e.post({ acao: 'interpretar', sessao, dados: { imagem: 'x' } }).erro, /GEMINI_API_KEY/);
  const CHAVE_RUIM = JSON.stringify({ error: { code: 400, status: 'INVALID_ARGUMENT', message: 'API key not valid. Please pass a valid API key.' } });
  const IMAGEM_RUIM = JSON.stringify({ error: { code: 400, status: 'INVALID_ARGUMENT', message: 'Unable to process input image.' } });
  for (const [code, codigo, body] of [[429, 'ia-limite'], [404, 'ia-modelo'], [400, 'ia-chave', CHAVE_RUIM], [403, 'ia-chave'], [400, 'ia', IMAGEM_RUIM], [500, 'ia']]) {
    e = ambiente({ ...base, props: { ...PROPS, GEMINI_API_KEY: 'k', GEMINI_MODELO: 'gemini-x' }, gemini: (url) => (url.includes('/models?') ? { code: 200, body: '{"models":[]}' } : { code, body: body || '{}' }) });
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

test('aba de versão anterior ganha as colunas novas no fim do cabeçalho', () => {
  const aba = env.abas['Contas'];
  // simula aba antiga sem a última coluna
  for (const l of aba.linhas) l.length = SCHEMA.contas.length - 1;
  const { sessao } = env.post({ acao: 'entrar', dados: { idToken: 'x' } }).dados;
  const r = env.post({ acao: 'carregar', sessao });
  assert.equal(r.ok, true);
  assert.deepEqual(aba.linhas[0], SCHEMA.contas);
  assert.equal(r.dados.contas.length, 9);
});

test('aba Itens antiga ganha produto, marca e tamanho: texto puro, menos o tamanho', () => {
  const aba = env.abas['Itens'];
  for (const l of aba.linhas) l.length = 13;
  aba.formatos = {};
  const { sessao } = env.post({ acao: 'entrar', dados: { idToken: 'x' } }).dados;
  assert.equal(env.post({ acao: 'carregar', sessao }).ok, true);
  assert.deepEqual(aba.linhas[0], SCHEMA.itens);
  assert.deepEqual(aba.formatos, { 14: '@', 15: '@', 17: '@' });
});

test('doGet mostra a versão do servidor e se a chave do Gemini está configurada', () => {
  const info = JSON.parse(env.ctx.doGet().texto);
  assert.match(info.versao, /^\d{4}-\d{2}-\d{2}/);
  assert.match(info.leitura_de_prints, /FALTA/);
});

test('config guarda o JSON dos custos do pudim como texto e números como número', () => {
  const { sessao } = env.post({ acao: 'entrar', dados: { idToken: 'x' } }).dados;
  const custos = JSON.stringify({ salario: 200, despesas: [{ nome: 'MEI', valor: 72, divisor: 1 }] });
  env.post({ acao: 'salvar', sessao, dados: { tabela: 'config', linha: { id: 'custos_pudim', valor: custos } } });
  env.post({ acao: 'salvar', sessao, dados: { tabela: 'config', linha: { id: 'taxa_ifood', valor: 26.2 } } });
  const cfg = Object.fromEntries(env.post({ acao: 'carregar', sessao }).dados.config.map((c) => [c.id, c.valor]));
  assert.equal(cfg.custos_pudim, custos);
  assert.equal(cfg.taxa_ifood, 26.2);
});

test('aba cheia (mais de 1000 linhas) ganha linhas novas em texto puro, em vez de dar erro', () => {
  const { sessao } = env.post({ acao: 'entrar', dados: { idToken: 'x' } }).dados;
  const linhas = Array.from({ length: 1100 }, (_, i) => ({ id: `i${i}`, data: '2026-10-17', descricao: 'Item', quantidade: 1, valor: 1 }));
  assert.equal(env.post({ acao: 'salvarVarias', sessao, dados: { tabela: 'itens', linhas } }).ok, true);
  assert.equal(env.post({ acao: 'salvar', sessao, dados: { tabela: 'itens', linha: { id: 'mais-um', descricao: 'x' } } }).ok, true);
  const aba = env.abas['Itens'];
  assert.equal(aba.linhas.length, 1102);
  assert.ok(aba.maxRows >= 1102);
  const dataCol = SCHEMA.itens.indexOf('data') + 1;
  assert.ok(aba.formatosNovos.some(([linha, col, n, f]) => linha === 1001 && col === dataCol && n >= 500 && f === '@'));
  assert.ok(!aba.formatosNovos.some(([, col]) => col === SCHEMA.itens.indexOf('valor') + 1), 'coluna numérica não vira texto');
});

test('salvarVarias repetido (resposta perdida) atualiza em vez de duplicar; apagar tira todas as cópias', () => {
  const { sessao } = env.post({ acao: 'entrar', dados: { idToken: 'x' } }).dados;
  const linhas = [{ id: 'e1', data: '2026-10-17', tipo: 'venda', quantidade: 2 }, { id: 'e2', data: '2026-10-17', tipo: 'venda', quantidade: 1 }];
  env.post({ acao: 'salvarVarias', sessao, dados: { tabela: 'estoque', linhas } });
  env.post({ acao: 'salvarVarias', sessao, dados: { tabela: 'estoque', linhas: [{ ...linhas[0], quantidade: 3 }, linhas[1]] } });
  let est = env.post({ acao: 'carregar', sessao }).dados.estoque;
  assert.deepEqual(est.map((x) => [x.id, x.quantidade]), [['e1', 3], ['e2', 1]]);
  // cópia antiga duplicada à mão na planilha: apagar remove as duas
  env.abas['Estoque'].linhas.push([...env.abas['Estoque'].linhas[1]]);
  env.post({ acao: 'apagar', sessao, dados: { tabela: 'estoque', id: 'e1' } });
  est = env.post({ acao: 'carregar', sessao }).dados.estoque;
  assert.deepEqual(est.map((x) => x.id), ['e2']);
});

test('sair encerra a sessão no servidor; outra sessão continua valendo', () => {
  const a = env.post({ acao: 'entrar', dados: { idToken: 'x' } }).dados.sessao;
  const b = env.post({ acao: 'entrar', dados: { idToken: 'x' } }).dados.sessao;
  assert.equal(env.post({ acao: 'sair', sessao: a }).ok, true);
  assert.equal(env.post({ acao: 'carregar', sessao: a }).codigo, 'sessao-invalida');
  assert.equal(env.post({ acao: 'carregar', sessao: b }).ok, true);
});
