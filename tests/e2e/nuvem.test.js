// App em modo nuvem falando com o código real do Apps Script (planilha falsa) e login do Google simulado.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { servirApp, chromium } from './servidor.js';
import { ambiente } from '../apps-script/ambiente.js';

const API = 'https://script.google.com/macros/s/TESTE/exec';
const GSI_FALSO = `window.google = { accounts: { id: {
  initialize(o) { window.__cb = o.callback; },
  renderButton(el) { const b = document.createElement('button'); b.textContent = 'Entrar com Google'; b.onclick = () => window.__cb({ credential: 'token-falso' }); el.appendChild(b); }
} } };`;

let server;
let base;
let browser;
let env;
let falharSalvar = false;

before(async () => {
  ({ server, base } = await servirApp({ 'config.js': `export const CONFIG = { apiUrl: '${API}', googleClientId: 'cliente-123' };` }));
  env = ambiente({
    props: { GOOGLE_CLIENT_ID: 'cliente-123', EMAILS_AUTORIZADOS: 'marido@gmail.com,esposa@gmail.com' },
    tokeninfo: () => ({ code: 200, body: JSON.stringify({ aud: 'cliente-123', email: 'esposa@gmail.com', email_verified: 'true' }) }),
  });
  env.ctx.configurar();
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  server?.close();
});

async function novaPagina(ctx) {
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await ctx.route('https://accounts.google.com/gsi/client', (r) => r.fulfill({ contentType: 'text/javascript', body: GSI_FALSO }));
  await ctx.route(`${API}*`, async (r) => {
    const pedido = JSON.parse(r.request().postData() || '{}');
    const resp = falharSalvar && pedido.acao === 'salvar' ? { ok: false, codigo: 'erro', erro: 'Planilha ocupada' } : env.post(pedido);
    await r.fulfill({ contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(resp) });
  });
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', (e) => erros.push(e.message));
  return { page, erros };
}

test('login, lançar, recarregar sem pedir login de novo, sair', async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const { page, erros } = await novaPagina(ctx);
  await page.goto(`${base}/#/inicio`);
  await page.getByRole('button', { name: 'Entrar com Google' }).click();
  await page.getByText('Saldo hoje, todas as contas').waitFor();
  assert.equal(await page.locator('.faixa-demo').count(), 0, 'não deve mostrar faixa de demonstração');
  assert.equal(await page.locator('a.item').count(), 9);

  await page.getByRole('button', { name: 'Novo lançamento' }).click();
  await page.locator('.folha').getByPlaceholder(/gastei 87,50/).fill('recebi 4500 de salário no itaú');
  await page.getByRole('button', { name: 'Preencher' }).click();
  await page.getByRole('button', { name: 'Salvar lançamento' }).click();
  await page.locator('.toast', { hasText: 'Lançamento salvo' }).waitFor();
  const linhas = env.abas['Lançamentos'].linhas;
  assert.equal(linhas.length, 2);
  assert.equal(linhas[1][3], 4500);
  assert.equal(linhas[1][8], 'Salario');

  await page.reload();
  await page.getByText('Saldo hoje, todas as contas').waitFor();
  assert.match(await page.locator('a.item', { hasText: 'Itaú' }).innerText(), /4\.500,00/);
  await page.goto(`${base}/#/mais/ajustes`);
  await page.getByText('Conectado como esposa@gmail.com').waitFor();
  await page.getByRole('button', { name: 'Sair deste aparelho' }).click();
  await page.getByRole('button', { name: 'Entrar com Google' }).waitFor();
  assert.deepEqual(erros, []);
  await ctx.close();
});

test('erro da planilha ao salvar desfaz na tela e avisa', async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const { page } = await novaPagina(ctx);
  await page.goto(`${base}/#/inicio`);
  await page.getByRole('button', { name: 'Entrar com Google' }).click();
  await page.getByText('Saldo hoje, todas as contas').waitFor();
  falharSalvar = true;
  try {
    await page.goto(`${base}/#/mais/contas`);
    await page.locator('.item', { hasText: 'Bradesco' }).click();
    await page.locator('.folha').getByLabel('Nome').fill('Bradesco velho');
    await page.getByRole('button', { name: 'Salvar conta' }).click();
    await page.locator('.toast.erro', { hasText: 'Não salvou: Planilha ocupada' }).waitFor();
    assert.equal(await page.locator('.item', { hasText: 'Bradesco velho' }).count(), 0);
  } finally {
    falharSalvar = false;
  }
  await ctx.close();
});
