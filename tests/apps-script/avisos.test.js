// Avisos no celular: assinatura VAPID (ES256) conferida pelo crypto do Node, inscrição, texto do aviso e o lembrete de 2 em 2 dias.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { ambiente } from './ambiente.js';

const PROPS = () => ({ GOOGLE_CLIENT_ID: 'cid', EMAILS_AUTORIZADOS: 'esposa@gmail.com' });
const tokenOk = (email) => () => ({ code: 200, body: JSON.stringify({ aud: 'cid', email, email_verified: 'true' }) });
const b64 = (s) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

function preparar(push) {
  const env = ambiente({ props: PROPS(), tokeninfo: tokenOk('esposa@gmail.com'), push });
  const { sessao } = env.post({ acao: 'entrar', dados: { idToken: 'x' } }).dados;
  return { env, sessao };
}

test('assinatura VAPID: JWT ES256 que o crypto do Node aceita, com a chave pública do servidor', () => {
  const { env, sessao } = preparar();
  const estado = env.post({ acao: 'avisos', sessao, dados: {} }).dados;
  const pub = b64(estado.chavePublica);
  assert.equal(pub.length, 65);
  assert.equal(pub[0], 4);
  const chave = crypto.createPublicKey({ format: 'jwk', key: { kty: 'EC', crv: 'P-256', x: pub.subarray(1, 33).toString('base64url'), y: pub.subarray(33).toString('base64url') } });
  // a mesma chave nas próximas vezes
  assert.equal(env.post({ acao: 'avisos', sessao, dados: {} }).dados.chavePublica, estado.chavePublica);
  for (const aud of ['https://web.push.apple.com', 'https://fcm.googleapis.com']) {
    const jwt = env.ctx.jwtVapid_(aud, env.ctx.chavesVapid_());
    const [cab, corpo, assinatura] = jwt.split('.');
    assert.deepEqual(JSON.parse(b64(cab)), { typ: 'JWT', alg: 'ES256' });
    const c = JSON.parse(b64(corpo));
    assert.equal(c.aud, aud);
    assert.ok(c.exp > Date.now() / 1000);
    assert.ok(crypto.verify('sha256', Buffer.from(`${cab}.${corpo}`), { key: chave, dsaEncoding: 'ieee-p1363' }, b64(assinatura)), `assinatura válida para ${aud}`);
  }
});

test('inscrever, testar (manda para o endpoint com VAPID), texto do aviso só para quem é inscrito, e celular que saiu é tirado', () => {
  let codigo = 201;
  const { env, sessao } = preparar(() => codigo);
  const endpoint = 'https://web.push.apple.com/QGuaR3Ht2Y-teste';
  let r = env.post({ acao: 'inscreverAviso', sessao, dados: { endpoint } }).dados;
  assert.equal(r.inscrito, true);
  assert.equal(r.aparelhos, 1);
  // reinscrever o mesmo celular não duplica
  assert.equal(env.post({ acao: 'inscreverAviso', sessao, dados: { endpoint } }).dados.aparelhos, 1);
  r = env.post({ acao: 'testarAviso', sessao, dados: {} }).dados;
  assert.deepEqual(r, { enviados: 1, aparelhos: 1 });
  const p = env.chamadasPush[0];
  assert.equal(p.url, endpoint);
  assert.match(p.opcoes.headers.Authorization, /^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=[\w-]{87}$/);
  assert.equal(p.opcoes.headers.TTL, '86400');
  // o celular busca o texto pelo id (hash do endpoint), como o service worker faz
  const id = crypto.createHash('sha256').update(endpoint).digest('hex').slice(0, 32);
  const texto = JSON.parse(env.ctx.doGet({ parameter: { aviso: id } }).texto);
  assert.equal(texto.texto, 'Os avisos estão funcionando neste celular.');
  assert.equal(JSON.parse(env.ctx.doGet({ parameter: { aviso: 'outro' } }).texto).texto, 'Abra o app para ver.');
  // celular que desinstalou (410) sai da lista
  codigo = 410;
  assert.deepEqual(env.post({ acao: 'testarAviso', sessao, dados: {} }).dados, { enviados: 0, aparelhos: 0 });
  // sem sessão não inscreve
  assert.equal(env.post({ acao: 'inscreverAviso', dados: { endpoint } }).ok, false);
});

test('avisosDaCasa: tarefas pendentes e dias sem lançar, no máximo de 2 em 2 dias', () => {
  const { env, sessao } = preparar();
  env.post({ acao: 'inscreverAviso', sessao, dados: { endpoint: 'https://web.push.apple.com/x' } });
  const dias = (n) => new Date(Date.now() - n * 86400000).toISOString();
  env.post({ acao: 'salvarVarias', sessao, dados: { tabela: 'tarefas', linhas: [
    { id: 't1', titulo: 'Instalar portão na escada', criado_em: dias(5), feita: false },
    { id: 't2', titulo: 'Trocar lâmpada', criado_em: dias(3), feita: true },
  ] } });
  env.post({ acao: 'salvar', sessao, dados: { tabela: 'lancamentos', linha: { id: 'l1', data: dias(4).slice(0, 10), tipo: 'saida', valor: 10, descricao: 'x', conta_id: 'c6', origem: 'Casa', criado_em: dias(4) } } });
  const r = env.ctx.avisosDaCasa();
  assert.match(r, /1 tarefa da casa pendente: Instalar portão na escada\. Faz 4 dias sem lançar entradas e saídas\./);
  assert.equal(env.chamadasPush.length, 1);
  // logo depois: nada (só daqui a 2 dias)
  assert.equal(env.ctx.avisosDaCasa(), 'Nada para lembrar agora.');
  assert.equal(env.chamadasPush.length, 1);
  // 2 dias depois, lembra de novo
  const ultimos = JSON.parse(env.props.AVISOS_ULTIMOS);
  env.props.AVISOS_ULTIMOS = JSON.stringify({ tarefas: dias(2), lancamentos: ultimos.lancamentos });
  assert.match(env.ctx.avisosDaCasa(), /tarefa da casa pendente/);
});
