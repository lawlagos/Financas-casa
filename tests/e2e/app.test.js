// Testes de ponta a ponta no modo demonstração. Rodar com: NODE_PATH=$(npm root -g) npm run test:e2e
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { servirApp, chromium } from './servidor.js';

let server;
let browser;
let page;
let base;
let erros;

before(async () => {
  ({ server, base } = await servirApp());
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  server?.close();
});

beforeEach(async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'pt-BR' });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  page = await ctx.newPage();
  erros = [];
  page.on('pageerror', (e) => erros.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !m.text().includes('net::ERR_FAILED') && erros.push(m.text()));
  await page.goto(`${base}/#/inicio`);
  await page.getByText('Saldo hoje, todas as contas').waitFor();
});

const hoje = () => page.evaluate(() => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date()));
const toast = () => page.locator('.toast span');
const folha = () => page.locator('.folha');
const novo = async () => {
  await page.getByRole('button', { name: 'Novo lançamento' }).click();
  await folha().waitFor();
};
const saldoConta = async (nome) => {
  await page.goto(`${base}/#/inicio`);
  const item = page.locator('a.item', { hasText: nome }).first();
  return (await item.locator('.valor').innerText()).trim();
};
const reais = (t) => Number(t.replace(/[^\d,-]/g, '').replace(',', '.'));

test('todas as telas abrem sem erro', async () => {
  for (const r of ['inicio', 'lancamentos', 'futuro', 'negocios', 'mais', 'mais/previstos', 'mais/compromissos', 'mais/contas', 'mais/categorias', 'mais/ajustes']) {
    await page.goto(`${base}/#/${r}`);
    await page.locator('main h1').waitFor();
  }
  await page.getByRole('link', { name: 'Início' }).click();
  await page.getByText('Saldo hoje, todas as contas').waitFor();
  assert.deepEqual(erros, []);
});

test('lançar saída pelo formulário: origem vem da categoria e aparece no lucro do pudim', async () => {
  await page.goto(`${base}/#/negocios`);
  const antes = reais(await page.locator('.mini', { hasText: 'Pudim' }).locator('.num').innerText());
  await novo();
  await page.getByRole('button', { name: 'Formulário' }).click();
  await page.getByPlaceholder('0,00').fill('87,50');
  await page.getByPlaceholder('Ex.: Assaí, pudins da semana').fill('Leite condensado');
  await folha().getByLabel('Conta', { exact: true }).selectOption({ label: 'Nubank PJ (dela)' });
  await folha().getByLabel('Categoria').selectOption({ label: 'Ingrediente' });
  assert.equal(await folha().getByRole('button', { name: 'Pudim', exact: true }).getAttribute('aria-pressed'), 'true');
  await folha().getByRole('button', { name: 'Salvar lançamento' }).click();
  await toast().filter({ hasText: 'Lançamento salvo' }).waitFor();
  await page.getByRole('link', { name: 'Negócios' }).click();
  const depois = reais(await page.locator('.mini', { hasText: 'Pudim' }).locator('.num').innerText());
  assert.equal(Math.round((antes - depois) * 100), 8750);
  await page.getByRole('link', { name: 'Lançamentos' }).click();
  await page.getByText('Leite condensado').waitFor();
  assert.deepEqual(erros, []);
});

test('falar/escrever: transferência entre contas muda os dois saldos e não mexe no mês', async () => {
  const c6 = reais(await saldoConta('C6'));
  const itau = reais(await saldoConta('Itaú'));
  const perf = await page.locator('.mini', { hasText: 'Performance do mês' }).locator('.num').innerText();
  await novo();
  await folha().getByPlaceholder(/gastei 87,50/).fill('passei 2 mil da C6 pro Itaú');
  await folha().getByRole('button', { name: 'Preencher' }).click();
  assert.equal(await folha().getByRole('button', { name: 'Transferência' }).getAttribute('aria-pressed'), 'true');
  assert.equal(await folha().getByPlaceholder('0,00').inputValue(), '2.000,00');
  await folha().getByRole('button', { name: 'Salvar lançamento' }).click();
  await toast().waitFor();
  assert.equal(Math.round((c6 - reais(await saldoConta('C6'))) * 100), 200000);
  assert.equal(Math.round((reais(await saldoConta('Itaú')) - itau) * 100), 200000);
  assert.equal(await page.locator('.mini', { hasText: 'Performance do mês' }).locator('.num').innerText(), perf);
});

test('validação: não salva sem valor e conta', async () => {
  await novo();
  await page.getByRole('button', { name: 'Formulário' }).click();
  await folha().getByRole('button', { name: 'Salvar lançamento' }).click();
  await folha().getByRole('alert').filter({ hasText: 'Para salvar, preencha: valor, conta' }).waitFor();
  await folha().getByRole('button', { name: 'Fechar' }).click();
  assert.equal(await folha().count(), 0);
});

test('baixa automática: lançar o aluguel pergunta se é o previsto e tira do Futuro', async () => {
  const h = await hoje();
  const dia30 = `${h.slice(0, 7)}-29`;
  await novo();
  await page.getByRole('button', { name: 'Formulário' }).click();
  await page.getByPlaceholder('0,00').fill('8470');
  await page.getByPlaceholder('Ex.: Assaí, pudins da semana').fill('Aluguel');
  await folha().getByLabel('Conta', { exact: true }).selectOption({ label: 'Itaú' });
  await folha().getByLabel('Data').fill(dia30);
  await folha().getByLabel('Categoria').selectOption({ label: 'Aluguel' });
  await folha().getByRole('button', { name: 'Salvar lançamento' }).click();
  await page.getByRole('dialog', { name: 'Esse lançamento já estava previsto?' }).waitFor();
  await page.getByRole('button', { name: 'Sim, é esse' }).click();
  await toast().filter({ hasText: 'Aluguel marcado como pago' }).waitFor();
  await page.getByRole('link', { name: 'Futuro' }).click();
  await page.locator('.tabela-futuro tbody tr').first().waitFor();
  const dia = `${dia30.slice(8, 10)}/${dia30.slice(5, 7)}`.replace('29/', '30/');
  assert.equal(await page.locator('.tabela-futuro tr', { hasText: dia }).filter({ hasText: '8.470,00' }).count(), 0, 'aluguel ainda aparece no Futuro');
});

test('recebimento atrasado: "Recebi" lança e some dos atrasados', async () => {
  await page.locator('.item', { hasText: 'Atrasado desde' }).first().click();
  await page.getByRole('button', { name: 'Recebi, lançar agora' }).click();
  assert.equal(await folha().getByPlaceholder('0,00').inputValue(), '1.500,00');
  await folha().getByRole('button', { name: 'Salvar lançamento' }).click();
  await toast().filter({ hasText: 'marcado como recebido' }).waitFor();
  assert.equal(await page.locator('.item', { hasText: 'Atrasado desde' }).count(), 0);
});

test('adiar e pular uma ocorrência', async () => {
  await page.locator('.item', { hasText: 'Atrasado desde' }).first().click();
  await page.getByRole('button', { name: 'Ainda vai pagar, mudar a data' }).click();
  await folha().getByLabel('Nova data').fill(`${(await hoje()).slice(0, 7)}-25`);
  await folha().getByRole('button', { name: 'Reagendar' }).click();
  await toast().filter({ hasText: 'reagendado para 25/' }).waitFor();
  assert.equal(await page.locator('.item', { hasText: 'Atrasado desde' }).count(), 0);
  await page.goto(`${base}/#/mais/compromissos`);
  await page.locator('.item', { hasText: 'YouTube' }).first().click();
  await page.getByRole('button', { name: 'Não vai pagar desta vez' }).click();
  await toast().filter({ hasText: 'saiu da previsão' }).waitFor();
  await page.getByRole('button', { name: 'Desfazer' }).click();
  await page.locator('.item', { hasText: 'YouTube' }).first().waitFor();
});

test('pagar dízimo pendente da semana fechada', async () => {
  const card = page.locator('.dizimo-card', { hasText: 'A pagar, semana' });
  await card.waitFor();
  await card.getByRole('button', { name: 'Pagar' }).click();
  await folha().getByLabel('Saiu de').selectOption({ label: 'Itaú' });
  await folha().getByRole('button', { name: 'Marcar como pago' }).click();
  await toast().filter({ hasText: 'pago' }).waitFor();
  assert.equal(await page.locator('.dizimo-card', { hasText: 'A pagar, semana' }).count(), 0);
  await page.getByRole('link', { name: 'Negócios' }).click();
  await page.locator('.etiqueta.pago').first().waitFor();
});

test('novo previsto parcelado aparece em Compromissos e no Futuro', async () => {
  await page.goto(`${base}/#/mais/previstos`);
  await page.getByRole('button', { name: 'Novo', exact: true }).click();
  await folha().getByRole('button', { name: 'Parcelado' }).click();
  await folha().getByLabel('Descrição').fill('Geladeira');
  await folha().getByLabel('Valor da parcela').fill('400');
  await folha().getByLabel('Conta', { exact: true }).selectOption({ label: 'Nubank' });
  await folha().getByLabel('Dia do mês').fill('20');
  await folha().getByLabel('Parcela atual', { exact: true }).fill('3');
  await folha().getByLabel('Total de parcelas').fill('5');
  await folha().getByRole('button', { name: 'Criar previsto' }).click();
  await toast().filter({ hasText: 'Previsto criado' }).waitFor();
  await page.getByText('Geladeira · 3/5').waitFor();
  await page.goto(`${base}/#/mais/compromissos`);
  const it = page.locator('.item', { hasText: 'Geladeira' }).first();
  assert.match(await it.innerText(), /R\$ 1\.200,00/);
});

test('editar, apagar e desfazer um lançamento', async () => {
  await page.goto(`${base}/#/lancamentos`);
  await page.locator('.item', { hasText: 'Farmácia' }).click();
  await folha().getByLabel('Descrição').fill('Farmácia da esquina');
  await folha().getByRole('button', { name: 'Salvar alterações' }).click();
  await toast().filter({ hasText: 'Lançamento atualizado' }).waitFor();
  await page.locator('.item', { hasText: 'Farmácia da esquina' }).click();
  await folha().getByRole('button', { name: 'Apagar lançamento' }).click();
  await toast().filter({ hasText: 'Lançamento apagado' }).waitFor();
  assert.equal(await page.locator('.item', { hasText: 'Farmácia da esquina' }).count(), 0);
  await page.getByRole('button', { name: 'Desfazer' }).click();
  await page.locator('.item', { hasText: 'Farmácia da esquina' }).waitFor();
});

test('arrastar para a esquerda apaga', async () => {
  await page.goto(`${base}/#/lancamentos`);
  const item = page.locator('.arrastavel', { hasText: 'Uber' });
  await item.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  const box = await item.boundingBox();
  await page.mouse.move(box.x + box.width - 30, box.y + box.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(box.x + box.width - 30 - i * 20, box.y + box.height / 2);
  await page.mouse.up();
  await toast().filter({ hasText: 'Lançamento apagado' }).waitFor();
  assert.equal(await page.locator('.arrastavel', { hasText: 'Uber' }).count(), 0);
  assert.equal(await folha().count(), 0, 'arrastar não deve abrir a edição');
});

test('filtros e busca de lançamentos', async () => {
  await page.goto(`${base}/#/lancamentos`);
  await page.locator('.chips').first().getByRole('button', { name: 'Pudim' }).click();
  const metas = await page.locator('.item .meta').allInnerTexts();
  assert.ok(metas.length > 0 && metas.every((m) => m.includes('Pudim')));
  await page.locator('.chips').first().getByRole('button', { name: 'Tudo' }).click();
  await page.getByLabel('Buscar').fill('uber');
  assert.equal(await page.locator('.item .tit').count(), 1);
  await page.getByRole('button', { name: 'Mês anterior' }).click();
  await page.getByText('Nada por aqui').waitFor();
});

test('ajustes mudam o Futuro e os dados ficam salvos depois de recarregar', async () => {
  await page.goto(`${base}/#/mais/ajustes`);
  await page.getByLabel('Gasto diário estimado').fill('100');
  await page.getByRole('button', { name: 'Salvar ajustes' }).click();
  await toast().filter({ hasText: 'Ajustes salvos' }).waitFor();
  await page.goto(`${base}/#/futuro`);
  await page.getByText('Diário de R$ 100,00 a partir de amanhã').waitFor();
  await page.reload();
  await page.getByText('Diário de R$ 100,00 a partir de amanhã').waitFor();
  await page.getByRole('button', { name: '3 meses' }).click();
  await page.getByRole('button', { name: 'Pessoal' }).click();
  await page.locator('.tabela-futuro tbody tr').first().waitFor();
  assert.deepEqual(erros, []);
});
