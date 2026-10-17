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
let respostaGemini = null;

before(async () => {
  ({ server, base } = await servirApp({ 'config.js': `export const CONFIG = { apiUrl: '${API}', googleClientId: 'cliente-123' };` }));
  env = ambiente({
    props: { GOOGLE_CLIENT_ID: 'cliente-123', EMAILS_AUTORIZADOS: 'marido@gmail.com,esposa@gmail.com', GEMINI_API_KEY: 'k' },
    gemini: () => (typeof respostaGemini === 'number'
      ? { code: respostaGemini, body: '{}' }
      : { code: 200, body: JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(respostaGemini) }] } }] }) }),
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

const IMAGEM = new URL('../../app/icone-192.png', import.meta.url).pathname;

async function entrarELer(resposta) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const { page, erros } = await novaPagina(ctx);
  await page.goto(`${base}/#/inicio`);
  await page.getByRole('button', { name: 'Entrar com Google' }).click();
  await page.getByText('Saldo hoje, todas as contas').waitFor();
  respostaGemini = resposta;
  await page.getByRole('button', { name: 'Novo lançamento' }).click();
  await page.getByRole('button', { name: 'Foto ou print' }).click();
  await page.locator('#leitura-arquivo').setInputFiles(IMAGEM);
  return { ctx, page, erros };
}

test('print de comprovante: pergunta a conta, salva com canal foto', async () => {
  const antes = env.abas['Lançamentos'].linhas.length;
  const { ctx, page, erros } = await entrarELer({
    tipo_documento: 'comprovante', data: '2026-10-16',
    lancamentos: [{ tipo: 'saida', valor: 87.5, descricao: 'Pix Assaí', conta_id: null, categoria_id: 'cat-ingrediente', origem: null, confianca: 0.9, duvida: 'Não achei o banco no print.' }],
  });
  await page.getByText('Não achei o banco no print.').waitFor();
  await page.getByText('❓ Falta: conta.').waitFor();
  const botao = page.getByRole('button', { name: 'Salvar lançamento' });
  assert.equal(await botao.isDisabled(), true);
  await page.locator('.folha').getByLabel('Conta', { exact: true }).selectOption({ label: 'Nubank PJ (dela)' });
  assert.equal(await page.locator('.folha .chip[aria-pressed="true"]').innerText(), 'Pudim');
  await botao.click();
  await page.locator('.toast', { hasText: 'Lançamento salvo' }).waitFor();
  const linhas = env.abas['Lançamentos'].linhas;
  assert.equal(linhas.length, antes + 1);
  const l = linhas[linhas.length - 1];
  assert.deepEqual([l[1], l[3], l[5], l[8], l[9]], ['2026-10-16', 87.5, 'nubank-pj', 'Pudim', 'foto']);
  assert.deepEqual(erros, []);
  await ctx.close();
});

test('print de nota de mercado: categoria por item, categoria nova na hora, diferença do total, 1 lançamento por categoria', async () => {
  const antes = env.abas['Lançamentos'].linhas.length;
  const { ctx, page } = await entrarELer({
    tipo_documento: 'nota_mercado', estabelecimento: 'Assaí', data: '2026-10-16', total: 60,
    itens: [
      { descricao: 'Leite condensado Moça 395g', produto: 'Leite condensado', marca: 'Moça', tamanho: 395, tamanho_unidade: 'g', quantidade: 6, valor_total: 38.34, origem: 'Pudim', confianca: 0.95 },
      { descricao: 'Detergente', quantidade: 1, valor_total: 2.99, origem: 'Casa', confianca: 0.95 },
      { descricao: 'Leite integral', quantidade: 2, valor_total: 10.58, origem: null, duvida: 'Pudim ou casa?' },
    ],
  });
  await page.getByText('Itens (3)').waitFor();
  assert.equal(await page.getByRole('button', { name: /Salvar/ }).isDisabled(), true);
  await page.locator('.folha').getByLabel('Pago com').selectOption({ label: 'Nubank PJ (dela)' });
  await page.getByRole('group', { name: 'Categoria de Leite integral' }).getByRole('button', { name: 'Ingrediente' }).click();
  // categoria nova criada na hora para o detergente
  await page.getByLabel('Outra categoria para Detergente').selectOption({ label: '＋ Nova categoria…' });
  await page.locator('#nova-categoria-nome').fill('Limpeza');
  await page.getByRole('group', { name: 'Grupo da categoria' }).getByRole('button', { name: 'Casa' }).click();
  await page.getByRole('button', { name: 'Criar categoria' }).click();
  await page.getByRole('group', { name: 'Categoria de Detergente' }).getByRole('button', { name: 'Limpeza', pressed: true }).waitFor();
  await page.getByText(/A diferença de .* vai para/).waitFor();
  await page.getByLabel('Categoria da diferença').selectOption({ label: 'Mercado (Casa)' });
  await page.getByRole('button', { name: 'Salvar 3 lançamentos' }).click();
  await page.locator('.toast', { hasText: '3 lançamentos salvos' }).waitFor();
  const novas = env.abas['Lançamentos'].linhas.slice(antes);
  assert.equal(novas.length, 3);
  const porCat = Object.fromEntries(novas.map((l) => [l[4].split(':')[0], l]));
  assert.equal(porCat['Assaí — ingrediente'][3], 48.92);
  assert.equal(porCat['Assaí — ingrediente'][8], 'Pudim');
  assert.equal(porCat['Assaí — limpeza'][8], 'Casa');
  assert.equal(porCat['Assaí — mercado'][3], Math.round((60 - 48.92 - 2.99) * 100) / 100);
  assert.equal(Math.round(novas.reduce((t, l) => t + l[3], 0) * 100), 6000);
  assert.ok(novas.every((l) => l[12] && l[12] === novas[0][12]), 'mesmo grupo_id');
  const cats = env.abas['Categorias'].linhas;
  assert.ok(cats.some((c) => c[1] === 'Limpeza' && c[2] === 'saida' && c[3] === 'Casa'));
  const itens = env.abas['Itens'].linhas.slice(1);
  assert.equal(itens.length, 3);
  const moca = itens.find((i) => i[13] === 'Leite condensado');
  assert.deepEqual(moca.slice(13, 17), ['Leite condensado', 'Moça', 395, 'g']);
  assert.ok(itens.every((i) => i[9] && novas.some((l) => l[0] === i[9] && l[7] === i[12])), 'cada item ligado ao lançamento da sua categoria');
  await ctx.close();
});

test('limite do Gemini: mostra o motivo e oferece o formulário', async () => {
  const { ctx, page } = await entrarELer(429);
  await page.getByRole('alert').filter({ hasText: 'limite gratuito do Gemini' }).waitFor();
  await page.getByRole('button', { name: 'Lançar pelo formulário' }).click();
  await page.getByRole('dialog', { name: 'Novo lançamento' }).waitFor();
  await ctx.close();
});
