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
  await page.goto(`${base}/?demo#/inicio`);
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
  await page.goto(`${base}/?demo#/inicio`);
  const item = page.locator('a.item', { hasText: nome }).first();
  return (await item.locator('.valor').innerText()).trim();
};
const reais = (t) => Number(t.replace(/[^\d,-]/g, '').replace(',', '.'));

test('todas as telas abrem sem erro', async () => {
  for (const r of ['inicio', 'lancamentos', 'futuro', 'negocios', 'mais', 'mais/previstos', 'mais/compromissos', 'mais/contas', 'mais/categorias', 'mais/ajustes', 'mais/mercado', 'lista', 'pudim', 'pudim?aba=receitas', 'pudim?aba=ingredientes', 'pudim/vender', 'pudim/compras']) {
    await page.goto(`${base}/?demo#/${r}`);
    await page.locator('main h1').waitFor();
  }
  await page.getByRole('link', { name: 'Início' }).click();
  await page.getByText('Saldo hoje, todas as contas').waitFor();
  assert.deepEqual(erros, []);
});

test('lançar saída pelo formulário: origem vem da categoria e aparece no lucro do pudim', async () => {
  await page.goto(`${base}/?demo#/negocios`);
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
  await page.goto(`${base}/?demo#/mais/compromissos`);
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
  await page.goto(`${base}/?demo#/mais/previstos`);
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
  await page.goto(`${base}/?demo#/mais/compromissos`);
  const it = page.locator('.item', { hasText: 'Geladeira' }).first();
  assert.match(await it.innerText(), /R\$ 1\.200,00/);
});

test('editar, apagar e desfazer um lançamento', async () => {
  await page.goto(`${base}/?demo#/lancamentos`);
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
  await page.goto(`${base}/?demo#/lancamentos`);
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
  await page.goto(`${base}/?demo#/lancamentos`);
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
  await page.goto(`${base}/?demo#/mais/ajustes`);
  await page.getByLabel('Gasto diário estimado').fill('100');
  await page.getByRole('button', { name: 'Salvar ajustes' }).click();
  await toast().filter({ hasText: 'Ajustes salvos' }).waitFor();
  await page.goto(`${base}/?demo#/futuro`);
  await page.getByText('Diário de R$ 100,00 a partir de amanhã').waitFor();
  await page.reload();
  await page.getByText('Diário de R$ 100,00 a partir de amanhã').waitFor();
  await page.getByRole('button', { name: '3 meses' }).click();
  await page.getByRole('button', { name: 'Pessoal' }).click();
  await page.locator('.tabela-futuro tbody tr').first().waitFor();
  assert.deepEqual(erros, []);
});

test('importar arquivo: saldos e previstos entram e reimportar não duplica', async () => {
  const imp = {
    versao: 1, data_saldo: await hoje(), contas: { inter: 49, hotmart: 1462.55 },
    previstos: [{ id: 'imp-01', descricao: 'Saída dia 5 · 283,00', tipo: 'saida', natureza: 'parcelado', valor: 283, conta_id: 'inter', inicio: '2026-11-01', dia_inicio: 5, parcelas_total: 7, parcela_no_inicio: 1, recorrencia: 'meses', a_cada: 1, confianca: 'certo', ativo: true }],
  };
  await page.goto(`${base}/?demo#/mais/ajustes`);
  await page.locator('#importar-texto').fill('{ quebrado');
  await page.getByRole('button', { name: 'Importar', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'não é uma importação válida' }).waitFor();
  for (let i = 0; i < 2; i++) {
    await page.locator('#importar-texto').fill(JSON.stringify(imp));
    await page.getByRole('button', { name: 'Importar', exact: true }).click();
    await toast().filter({ hasText: 'Importado: 2 saldos e 1 previstos' }).waitFor();
  }
  await page.goto(`${base}/?demo#/mais/previstos`);
  assert.equal(await page.locator('.item', { hasText: '283,00' }).count(), 1);
  await page.goto(`${base}/?demo#/mais/contas`);
  assert.match(await page.locator('.item', { hasText: 'Hotmart' }).innerText(), /1\.462,55/);
});

test('saldo do termômetro é o real das contas; pendentes de hoje aparecem à parte', async () => {
  const soma = (await page.locator('.grupo-cab span:last-child').allInnerTexts()).reduce((t, x) => t + reais(x), 0);
  const saldo = reais(await page.locator('.termometro .saldo').innerText());
  assert.equal(Math.round(saldo * 100), Math.round(soma * 100));
});

test('mercado: previsão, lista sugerida marcável, juntar produtos e trocar para pudim', async () => {
  await page.goto(`${base}/?demo#/mais`);
  await page.getByRole('link', { name: /Mercado/ }).click();
  await page.getByText(/Mercado da casa em/).waitFor();
  assert.match(await page.locator('.num-mercado').innerText(), /R\$/);
  const marcador = page.getByRole('button', { name: /^Peguei/ }).first();
  await marcador.click();
  assert.equal(await marcador.getAttribute('aria-pressed'), 'true');
  // juntar Café com Banana prata (só para testar o mecanismo)
  const antes = await page.locator('.lista .item-btn').count();
  await page.locator('.item-btn', { hasText: 'Café' }).click();
  await page.locator('#produto-nome').fill('banana prata');
  await page.getByRole('button', { name: 'Juntar com Banana prata' }).click();
  await toast().filter({ hasText: 'Juntei com Banana prata' }).waitFor();
  assert.equal(await page.locator('.lista .item-btn').count(), antes - 1);
  await page.getByRole('group', { name: 'Compras de' }).getByRole('button', { name: 'Pudim' }).click();
  await page.locator('.item-btn', { hasText: 'Leite condensado' }).waitFor();
  assert.match(await page.locator('.item-btn', { hasText: 'Leite condensado' }).innerText(), /\/kg/);
  assert.deepEqual(erros, []);
});

test('pudim: produzir, vender lançando no caixa, dar baixa nos vencidos, apagar a venda e ajustar receita', async () => {
  await page.goto(`${base}/?demo#/negocios`);
  await page.locator('a.cartao-pudim').click();
  await page.getByText('Pronto para vender').waitFor();
  const pudins = async () => Number((await page.locator('.hero-pudim .num-mercado').innerText()).match(/\d+/)[0]);
  const antes = await pudins();

  await page.getByRole('button', { name: 'Produzi', exact: true }).click();
  await folha().getByLabel('Qual pudim').selectOption({ label: 'Pudim tradicional 150' });
  assert.equal(await page.locator('#mov-quantidade').inputValue(), '6');
  await page.getByRole('button', { name: 'Pôr no estoque' }).click();
  await toast().filter({ hasText: '6 Pudim tradicional 150 no estoque' }).waitFor();
  assert.equal(await pudins(), antes + 6);

  // venda direta pelo PDV: 3 toques no mini pudim
  const nubankPj = await saldoConta('Nubank PJ');
  await page.goto(`${base}/?demo#/pudim/vender`);
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Adicionar Pudim tradicional 150' }).click();
  await page.locator('#carrinho').getByText('R$ 36,00').first().waitFor();
  await page.getByRole('button', { name: 'Finalizar venda · R$ 36,00' }).click();
  await toast().filter({ hasText: 'Venda de R$ 36,00 registrada e lançada no caixa' }).waitFor();
  assert.equal(reais(await saldoConta('Nubank PJ')), Math.round((reais(nubankPj) + 36) * 100) / 100);
  await page.goto(`${base}/?demo#/pudim`);
  assert.equal(await pudins(), antes + 3);
  await page.goto(`${base}/?demo#/pudim`);
  await page.getByRole('alert').filter({ hasText: /venc/ }).getByRole('button', { name: 'Dar baixa' }).click();
  await toast().filter({ hasText: /Baixa de \d+ pudi(m|ns) vencidos?/ }).waitFor();
  assert.equal(await page.getByRole('alert').filter({ hasText: /venc/ }).count(), 0);

  // apagar a venda tira a entrada do caixa junto
  await page.goto(`${base}/?demo#/pudim`);
  const venda = page.locator('.arrastavel', { hasText: 'Vendeu 3 Pudim tradicional 150' }).first();
  await venda.scrollIntoViewIfNeeded();
  const caixa = await venda.boundingBox();
  await page.mouse.move(caixa.x + caixa.width - 20, caixa.y + caixa.height / 2);
  await page.mouse.down();
  await page.mouse.move(caixa.x + 40, caixa.y + caixa.height / 2, { steps: 8 });
  await page.mouse.up();
  await toast().filter({ hasText: 'Venda apagada, e o lançamento no caixa também' }).waitFor();
  assert.equal(reais(await saldoConta('Nubank PJ')), reais(nubankPj));

  await page.goto(`${base}/?demo#/pudim?aba=receitas`);
  await page.locator('.item-btn', { hasText: 'Pudim tradicional 150' }).click();
  await page.getByRole('button', { name: 'Manter o preço e tirar o aviso' }).click();
  await toast().filter({ hasText: 'Receita salva' }).waitFor();
  assert.equal(await page.locator('.item-btn', { hasText: 'Pudim tradicional 150' }).locator('.etiqueta').count(), 0);
  assert.deepEqual(erros, []);
});

test('pdv no iFood: preço calculado, taxa de 26,2% como gasto, conta iFood criada; apagar tira os dois lançamentos', async () => {
  await page.goto(`${base}/?demo#/pudim/vender`);
  await page.getByRole('group', { name: 'Canal' }).getByRole('button', { name: 'iFood' }).click();
  await page.getByRole('button', { name: 'Adicionar Pudim tradicional 1100' }).click();
  await page.getByRole('button', { name: 'Mais Pudim tradicional 1100' }).click();
  // 65 / (1 - 0,262) = 88,08 → 88,10 cada; taxa 23,08 cada
  await page.locator('#carrinho').getByText('− R$ 46,16').waitFor();
  await page.locator('#carrinho').getByText('R$ 130,04').waitFor();
  await page.getByRole('button', { name: 'Finalizar venda · R$ 176,20' }).click();
  await toast().filter({ hasText: /líquido R\$ 130,04 na conta iFood, cai no banco na quarta \d\d\/\d\d/ }).waitFor();
  assert.match(await saldoConta('iFood'), /130,04/);
  // o líquido vira um repasse previsto para a quarta-feira, da conta iFood para o banco
  await page.goto(`${base}/?demo#/mais/previstos`);
  assert.match(await page.locator('.item', { hasText: 'Repasse iFood' }).first().innerText(), /130,04/);
  await page.goto(`${base}/?demo#/lancamentos`);
  await page.locator('.item', { hasText: 'Taxa iFood (26,2%)' }).first().waitFor();
  await page.goto(`${base}/?demo#/pudim`);
  await page.getByText('Taxa do iFood').waitFor();
  const venda = page.locator('.arrastavel', { hasText: 'Vendeu 2 Pudim tradicional 1100' }).first();
  await venda.scrollIntoViewIfNeeded();
  const caixa = await venda.boundingBox();
  await page.mouse.move(caixa.x + caixa.width - 20, caixa.y + caixa.height / 2);
  await page.mouse.down();
  await page.mouse.move(caixa.x + 40, caixa.y + caixa.height / 2, { steps: 8 });
  await page.mouse.up();
  await toast().filter({ hasText: 'Venda apagada' }).waitFor();
  assert.match(await saldoConta('iFood'), /0,00/);
  await page.goto(`${base}/?demo#/lancamentos`);
  assert.equal(await page.locator('.item', { hasText: 'Taxa iFood' }).count(), 0);
  await page.goto(`${base}/?demo#/mais/previstos`);
  await page.waitForTimeout(300);
  assert.equal(await page.locator('.item', { hasText: 'Repasse iFood' }).count(), 0, 'venda apagada sai do repasse');
  assert.deepEqual(erros, []);
});

test('estoque por voz: produz, vende e perde numa frase; o que faltou é respondido na lista', async () => {
  await page.goto(`${base}/?demo#/pudim`);
  const pudins = async () => Number((await page.locator('.hero-pudim .num-mercado').innerText()).match(/\d+/)[0]);
  const antes = await pudins();
  await page.getByRole('button', { name: 'Falar', exact: true }).click();
  await page.locator('#voz-estoque').fill('fiz uma fornada de mini pudim 150, vendi 1 pudim tradicional 1100 e perdi um ninho que caiu');
  await page.keyboard.press('Enter');
  await page.getByLabel('Pudim do item 1').waitFor();
  assert.equal(await page.getByLabel('Quantidade do item 1').inputValue(), '6');
  await folha().getByRole('group', { name: 'Motivo' }).getByRole('button', { name: 'Quebrou ou estragou', pressed: true }).waitFor();
  await page.getByRole('button', { name: 'Confirmar' }).click();
  await toast().filter({ hasText: /2 movimentos no estoque e venda de R\$ 65,00 lançada no caixa/ }).waitFor();
  assert.equal(await pudins(), antes + 6 - 1 - 1);

  // sem dizer o que houve: o app pergunta
  await page.getByRole('button', { name: 'Falar', exact: true }).click();
  await page.locator('#voz-estoque').fill('2 de ninho');
  await page.getByRole('button', { name: 'Entender' }).click();
  await page.getByText('Responda os ❓ para confirmar.').waitFor();
  assert.equal(await page.getByRole('button', { name: 'Confirmar' }).isDisabled(), true);
  await page.getByLabel('O que houve no item 1').selectOption({ label: 'Produziu' });
  await page.getByRole('button', { name: 'Confirmar' }).click();
  await toast().filter({ hasText: '1 movimento no estoque' }).waitFor();
  assert.deepEqual(erros, []);
});

test('custos do pudim: mão de obra e despesas fixas entram na receita pelo tempo de preparo, com preço sugerido', async () => {
  await page.goto(`${base}/?demo#/pudim?aba=receitas`);
  await page.getByRole('button', { name: /Mão de obra e despesas fixas/ }).click();
  await page.locator('#custos-salario').fill('200');
  await page.getByLabel('13º por mês').fill('125');
  await page.getByLabel('Dias de trabalho no mês').fill('15');
  await page.getByLabel('Horas por dia').fill('6');
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: /Tirar / }).first().click();
  await page.getByRole('button', { name: 'Despesa', exact: true }).click();
  await page.getByLabel('Despesa 1').fill('Fixas');
  await page.getByLabel('Valor de Fixas').fill('2192');
  await folha().getByText('R$ 2.192,00/mês').waitFor();
  await folha().getByText('R$ 0,0602').waitFor();
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await toast().filter({ hasText: 'Custos do pudim salvos' }).waitFor();

  // o tempo de preparo e o markup ficam no sabor; os tamanhos herdam
  await page.locator('.sabor-cab', { hasText: 'Pudim tradicional' }).click();
  await page.locator('#receita-tempo').fill('60');
  // 60 min: mão de obra 3,61 e despesas 24,36 numa receita
  await folha().getByText('R$ 3,61').waitFor();
  await folha().getByText('R$ 24,36').waitFor();
  await page.locator('#receita-markup').fill('50');
  await page.getByRole('button', { name: 'Salvar sabor' }).click();
  await toast().filter({ hasText: 'Sabor salvo' }).waitFor();
  await page.locator('.item-btn', { hasText: 'Pudim tradicional 150' }).click();
  await folha().getByText(/Preço sugerido \(markup 50%\)/).waitFor();
  await folha().getByText('Os ingredientes e o tempo de preparo vêm do sabor').waitFor();
  await page.keyboard.press('Escape');
  assert.match(await page.locator('.item-btn', { hasText: 'Pudim tradicional 150' }).innerText(), /Custo R\$ [\d,]+ cada/);
  assert.deepEqual(erros, []);
});

test('revisão: quantidade do PDV aceita apagar e digitar 1,5 sem sumir; receita desativada pode ser reativada', async () => {
  await page.goto(`${base}/?demo#/pudim/vender`);
  await page.getByRole('button', { name: 'Adicionar Pudim tradicional 1100' }).click();
  const qtd = page.getByLabel('Quantidade de Pudim tradicional 1100');
  await qtd.fill('');
  assert.equal(await qtd.count(), 1, 'apagar o número não tira o item do carrinho');
  await qtd.pressSequentially('1,5');
  await page.locator('#carrinho').getByText('R$ 97,50').first().waitFor();
  await page.getByRole('button', { name: 'Menos Pudim tradicional 1100' }).click();
  await page.getByRole('button', { name: 'Menos Pudim tradicional 1100' }).click();
  assert.equal(await page.getByLabel('Quantidade de Pudim tradicional 1100').count(), 0);

  await page.goto(`${base}/?demo#/pudim?aba=receitas`);
  await page.locator('.item-btn', { hasText: 'Pudim ninho com Nutella 1100' }).click();
  await folha().getByLabel('Receita em uso').uncheck();
  await page.getByRole('button', { name: 'Salvar receita' }).click();
  await page.getByRole('button', { name: 'Mostrar 1 receitas desativadas' }).click();
  await page.getByRole('button', { name: /Pudim ninho com Nutella 1100.*reativar/ }).click();
  await folha().getByLabel('Receita em uso').check();
  await page.getByRole('button', { name: 'Salvar receita' }).click();
  await page.locator('.lista .item-btn', { hasText: 'Pudim ninho com Nutella 1100' }).first().waitFor();
  assert.deepEqual(erros, []);
});

test('comprar insumos: pesquisa simulada, carrinho, preço pago e registro que atualiza o custo das receitas', async () => {
  await page.goto(`${base}/?demo#/pudim?aba=ingredientes`);
  await page.getByRole('link', { name: /Pesquisar preços/ }).click();
  await page.getByRole('note').filter({ hasText: 'Preços simulados' }).waitFor();
  await page.getByLabel('Pesquisar insumos').fill('creme');
  assert.equal(await page.locator('.grupo-ofertas').count(), 1);
  assert.equal(await page.locator('.grupo-ofertas').getByText('Menor preço').count(), 1);
  assert.match(await page.locator('.grupo-ofertas a.link').getAttribute('href'), /google\.com\/search\?tbm=shop&q=Creme%20de%20leite/);
  await page.locator('.grupo-ofertas .oferta-add').first().click();
  await page.getByRole('button', { name: /^Mais Creme de leite/ }).first().click();
  const preco = page.getByLabel(/^Preço pago em Creme de leite/);
  await preco.fill('3,10');
  await page.locator('#compra').getByText('R$ 6,20').first().waitFor();
  await page.getByRole('button', { name: 'Registrar compra · R$ 6,20' }).click();
  await toast().filter({ hasText: 'Compra de R$ 6,20 registrada' }).waitFor();
  await page.goto(`${base}/?demo#/lancamentos`);
  await page.locator('.item', { hasText: '— ingredientes' }).first().waitFor();
  await page.goto(`${base}/?demo#/pudim?aba=ingredientes`);
  const hojeTxt = (await hoje()).split('-').reverse().slice(0, 2).join('/');
  assert.match(await page.locator('.item-btn', { hasText: 'Creme de leite' }).innerText(), new RegExp(`nota de ${hojeTxt}`));
  assert.deepEqual(erros, []);
});

test('sabor novo nasce com 1 kg, 500 g e copo (rende 1, 2 e 6); sabor não aparece para vender', async () => {
  await page.goto(`${base}/?demo#/pudim?aba=receitas`);
  await page.getByRole('button', { name: 'Novo sabor' }).click();
  await page.locator('#receita-nome').fill('Pudim de coco');
  await page.locator('#receita-tempo').fill('50');
  await page.getByRole('button', { name: 'Ingrediente ou embalagem' }).click();
  await page.getByLabel('Ingrediente 1').selectOption({ label: 'Leite condensado' });
  await page.getByLabel('Quantidade de Leite condensado').fill('395');
  await page.getByRole('button', { name: 'Salvar sabor' }).click();
  await toast().filter({ hasText: 'Sabor criado com 1 kg, 500 g e copo' }).waitFor();
  const sabor = page.getByRole('region', { name: 'Pudim de coco' });
  assert.deepEqual(await sabor.locator('.item-btn .tit').allInnerTexts(), ['Pudim de coco 1 kg', 'Pudim de coco 500 g', 'Pudim de coco no copo']);
  assert.match(await sabor.locator('.item-btn', { hasText: 'Pudim de coco no copo' }).innerText(), /rende 6 · vale 25 dias/);
  await page.goto(`${base}/?demo#/pudim/vender`);
  await page.getByLabel('Buscar pudim').fill('coco');
  assert.deepEqual(await page.locator('.pdv-nome').allInnerTexts(), ['Pudim de coco 1 kg', 'Pudim de coco 500 g', 'Pudim de coco no copo']);
  assert.deepEqual(erros, []);
});

test('lista de compras: falar os itens, estimativa pela última compra, pago mais caro/barato e registrar a compra', async () => {
  await page.goto(`${base}/?demo#/mais`);
  await page.getByRole('link', { name: /Lista de compras/ }).click();
  await page.locator('#lista-frase').fill('2 leites condensados, detergente e papel toalha');
  await page.getByRole('button', { name: 'Pôr na lista' }).click();
  await toast().filter({ hasText: '3 itens na lista da casa' }).waitFor();
  assert.deepEqual(await page.locator('.item-lista .tit').evaluateAll((els) => els.map((e) => e.firstChild.textContent.trim())), ['Leite condensado', 'Detergente', 'Papel toalha']);
  const estimadoLeite = reais(await page.locator('.item-lista', { hasText: 'Leite condensado' }).locator('.valor').innerText());
  assert.ok(estimadoLeite > 0);
  assert.match(await page.locator('.item-lista', { hasText: 'Papel toalha' }).innerText(), /sem preço anterior/);

  await page.getByRole('button', { name: 'Peguei Leite condensado' }).click();
  const pago = page.getByLabel('Quanto pagou em Leite condensado');
  await pago.fill(String(estimadoLeite + 1).replace('.', ','));
  await pago.press('Enter');
  await page.locator('.item-lista', { hasText: 'Leite condensado' }).getByText(/R\$ 1,00 mais caro/).waitFor();
  await page.getByText(/Até agora: R\$ 1,00 mais caro/).waitFor();
  await page.getByRole('button', { name: 'Peguei Detergente' }).click();
  await page.getByLabel('Quanto pagou em Detergente').fill('1,50');
  await page.getByLabel('Quanto pagou em Detergente').press('Enter');
  await page.locator('.item-lista', { hasText: 'Detergente' }).getByText(/mais barato/).waitFor();

  await page.locator('#lista-mercado').fill('Assaí');
  await page.getByLabel('Pago com').selectOption({ label: 'Nubank' });
  const total = Math.round((estimadoLeite + 1 + 1.5) * 100) / 100;
  await page.getByRole('button', { name: /^Registrar compra/ }).click();
  await toast().filter({ hasText: /Compra de R\$ .* registrada/ }).waitFor();
  assert.equal(await page.locator('.item-lista').count(), 1, 'só o papel toalha fica na lista');
  await page.goto(`${base}/?demo#/lancamentos`);
  await page.locator('.item', { hasText: 'Assaí — casa' }).first().waitFor();
  // lista do pudim é separada: o que se fala nela fica nela, e não aparece na da casa
  await page.goto(`${base}/?demo#/lista?lista=pudim`);
  await page.getByRole('group', { name: 'Lista' }).getByRole('button', { name: 'Pudim', pressed: true }).waitFor();
  await page.locator('#lista-frase').fill('6 leites condensados');
  await page.getByRole('button', { name: 'Pôr na lista' }).click();
  await toast().filter({ hasText: 'Leite condensado na lista do pudim' }).waitFor();
  assert.equal(await page.locator('.item-lista').count(), 1);
  await page.getByRole('group', { name: 'Lista' }).getByRole('button', { name: /^Casa/ }).click();
  await page.locator('.item-lista', { hasText: 'Papel toalha' }).waitFor();
  assert.equal(await page.locator('.item-lista', { hasText: 'Leite condensado' }).count(), 0);
  // a próxima lista já usa o preço desta compra
  await page.goto(`${base}/?demo#/lista`);
  await page.locator('#lista-frase').fill('detergente');
  await page.getByRole('button', { name: 'Pôr na lista' }).click();
  await page.locator('.item-lista', { hasText: 'Detergente' }).getByText('≈ R$ 1,50').waitFor();
  assert.ok(total > 0);
  assert.deepEqual(erros, []);
});

test('revisão: sabor desligado tira os tamanhos dele da venda; religar devolve', async () => {
  await page.goto(`${base}/?demo#/pudim?aba=receitas`);
  await page.locator('.sabor-cab', { hasText: 'Pudim ninho com Nutella' }).click();
  await folha().getByLabel('Sabor em uso').uncheck();
  await page.getByRole('button', { name: 'Salvar sabor' }).click();
  await page.goto(`${base}/?demo#/pudim/vender`);
  await page.getByLabel('Buscar pudim').fill('ninho');
  assert.equal(await page.locator('.pdv-produto').count(), 0);
  await page.goto(`${base}/?demo#/pudim?aba=receitas`);
  await page.getByRole('button', { name: /Mostrar 1 receitas desativadas/ }).click();
  await page.getByRole('button', { name: /Pudim ninho com Nutella.*reativar/ }).click();
  await folha().getByLabel('Sabor em uso').check();
  await page.getByRole('button', { name: 'Salvar sabor' }).click();
  await page.goto(`${base}/?demo#/pudim/vender`);
  await page.getByLabel('Buscar pudim').fill('ninho');
  assert.equal(await page.locator('.pdv-produto').count(), 1);
  assert.deepEqual(erros, []);
});

test('estoque de ingredientes: produção desconta pela receita, apagar devolve, contagem, falta vai para a lista', async () => {
  const emCasa = async (nome) => (await page.locator('.item-btn', { hasText: nome }).locator('.meta').first().innerText()).match(/Em casa: ([^·]+)/)[1].trim();
  await page.goto(`${base}/?demo#/pudim`);
  // abaixo do mínimo: 2 fornadas de 6 do tradicional 150
  const aviso = page.getByRole('alert', { name: 'Estoque mínimo' });
  // falta em número, e o custo estimado para repor
  const linha = aviso.locator('li', { hasText: 'Pudim tradicional 150' }).filter({ hasText: 'São Roque' });
  await linha.getByText('faltam 8').waitFor();
  await linha.getByText(/1 fornada rende 6 e custa ≈ R\$ [\d,]+/).waitFor();
  await aviso.getByText(/Para repor o mínimo: faltam \d+ pudins/).waitFor();
  await linha.getByRole('button', { name: 'Produzir' }).click();
  assert.equal(await page.locator('#mov-quantidade').inputValue(), '12');
  await page.getByRole('button', { name: 'Pôr no estoque' }).click();
  await toast().filter({ hasText: '12 Pudim tradicional 150 no estoque' }).waitFor();
  await page.goto(`${base}/?demo#/pudim?aba=ingredientes`);
  assert.equal(await emCasa('Leite condensado'), '1,58 kg'); // 6 latas − 2 fornadas × 395 g

  // apagar a produção devolve os ingredientes
  await page.goto(`${base}/?demo#/pudim`);
  const mov = page.locator('.arrastavel', { hasText: 'Produziu 12 Pudim tradicional 150' }).first();
  await mov.scrollIntoViewIfNeeded();
  const caixa = await mov.boundingBox();
  await page.mouse.move(caixa.x + caixa.width - 20, caixa.y + caixa.height / 2);
  await page.mouse.down();
  await page.mouse.move(caixa.x + 40, caixa.y + caixa.height / 2, { steps: 8 });
  await page.mouse.up();
  await toast().filter({ hasText: 'Movimento apagado' }).waitFor();
  await page.goto(`${base}/?demo#/pudim?aba=ingredientes`);
  assert.equal(await emCasa('Leite condensado'), '2,37 kg');

  // contagem: só 1 lata em casa → falta para o mínimo e vai para a lista. Mínimo: (2 fornadas do 150 + 1 do 1100)
  // em São Roque e metade disso em Ibiúna = 4,5 fornadas × 395 g = 4,5 latas → comprar 4
  await page.getByRole('button', { name: 'Contar o que tem em casa' }).click();
  await page.getByLabel('Quantas embalagens de Leite condensado').fill('1');
  await page.getByRole('button', { name: 'Salvar 1 contagem' }).click();
  await toast().filter({ hasText: 'Contagem de 1 ingrediente salva' }).waitFor();
  assert.equal(await emCasa('Leite condensado'), '395 g');
  const painel = page.locator('.painel', { hasText: 'Estoque de ingredientes' });
  await painel.getByText('comprar 4').waitFor();
  await painel.getByRole('button', { name: 'Pôr na lista de compras' }).click();
  await toast().filter({ hasText: '1 ingrediente na lista de compras' }).waitFor();
  await page.goto(`${base}/?demo#/lista?lista=pudim`);
  assert.match(await page.locator('.item-lista', { hasText: 'Leite condensado' }).innerText(), /Leite condensado\s*4/);
  // aviso na tela inicial
  await page.goto(`${base}/?demo#/inicio`);
  await page.locator('a.aviso-minimo', { hasText: 'ingrediente faltando' }).waitFor();
  assert.deepEqual(erros, []);
});

test('preparo (calda) entra no custo e no gasto de ingredientes de outra receita', async () => {
  await page.goto(`${base}/?demo#/pudim?aba=receitas`);
  await page.getByRole('region', { name: 'Preparos' }).getByText('Calda de morango').waitFor();
  await page.locator('.sabor-cab', { hasText: 'Pudim ninho com Nutella' }).click();
  await page.getByRole('button', { name: 'Ingrediente ou embalagem' }).click();
  const n = await page.locator('.ing-linha select').count();
  await page.getByLabel(`Ingrediente ${n}`).selectOption({ label: 'Calda de morango' });
  await page.getByLabel('Quantidade de Calda de morango').fill('200');
  // calda: 200 g de açúcar (R$ 0,76) rende 400 g → 200 g custam R$ 0,38
  await page.locator('.ing-linha', { hasText: 'g' }).last().getByText('R$ 0,38').waitFor();
  await page.getByRole('button', { name: 'Salvar sabor' }).click();
  await toast().filter({ hasText: 'Sabor salvo' }).waitFor();
  assert.deepEqual(erros, []);
});

test('dois locais: lote com vários sabores, envio para Ibiúna, perda lançada em Ibiúna corrigida para São Roque', async () => {
  await page.goto(`${base}/?demo#/pudim`);
  await page.getByText('Pronto para vender').waitFor();
  const local = async (nome) => {
    await page.getByRole('group', { name: 'Local' }).getByRole('button', { name: nome, exact: true }).click();
    await page.locator('.hero-pudim .rot-mercado').first().filter({ hasText: nome === 'Todos' ? /^Pronto para vender$/ : `em ${nome}` }).waitFor();
  };
  const pudins = async () => Number((await page.locator('.hero-pudim .num-mercado').innerText()).match(/\d+/)[0]);
  // Espera a tela mostrar o número (ela redesenha logo depois do clique).
  const temPudins = (n) => page.locator('.hero-pudim .num-mercado', { hasText: new RegExp(`^${n} pudi`) }).waitFor();
  await local('São Roque');
  const sr0 = await pudins();
  await local('Ibiúna');
  await temPudins(0);
  await local('Todos');

  // lote: 12 tradicionais 150 e 2 ninho 1100, mesma validade
  await page.getByRole('button', { name: 'Novo lote' }).click();
  await folha().getByLabel('Quantos Pudim tradicional 150').fill('12');
  await folha().getByLabel('Quantos Pudim ninho com Nutella 1100').fill('2');
  await folha().getByLabel('Vence em').fill('2099-01-05');
  await page.getByRole('button', { name: 'Pôr 14 no estoque' }).click();
  await toast().filter({ hasText: 'Lote com 14 pudins no estoque de São Roque, vence 05/01' }).waitFor();
  await page.getByRole('list', { name: 'Lotes' }).locator('.item', { hasText: '2 Pudim ninho com Nutella 1100, 12 Pudim tradicional 150' }).waitFor();

  // envio de 6 para Ibiúna
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();
  await folha().getByLabel('Quantos Pudim tradicional 150').fill('6');
  await page.getByRole('button', { name: 'Enviar 6 para Ibiúna' }).click();
  await toast().filter({ hasText: '6 pudins enviados de São Roque para Ibiúna' }).waitFor();
  await local('Ibiúna');
  await temPudins(6);
  await local('São Roque');
  await temPudins(sr0 + 14 - 6);

  // perdeu 3 em Ibiúna... mas era de São Roque
  await local('Ibiúna');
  await page.getByRole('button', { name: 'Perdi' }).click();
  await folha().getByLabel('Qual pudim').selectOption({ label: 'Pudim tradicional 150' });
  await page.locator('#mov-quantidade').fill('3');
  // "quebrou" sai dos que estão na validade (perda por vencimento sairia primeiro dos vencidos)
  await folha().getByRole('group', { name: 'Motivo' }).getByRole('button', { name: 'Quebrou ou estragou' }).click();
  await page.getByRole('button', { name: 'Registrar perda' }).click();
  await toast().filter({ hasText: 'Perda registrada' }).waitFor();
  await temPudins(3);
  await page.locator('.item-btn', { hasText: 'Perdeu 3 Pudim tradicional 150' }).click();
  await folha().getByRole('group', { name: 'Saiu de' }).getByRole('button', { name: 'São Roque' }).click();
  await folha().getByText('Voltam 3 para Ibiúna e saem 3 de São Roque.').waitFor();
  await page.getByRole('button', { name: 'Salvar' }).click();
  await toast().filter({ hasText: 'Corrigido' }).waitFor();
  await temPudins(6);
  await local('São Roque');
  await temPudins(sr0 + 14 - 6 - 3);

  // validade corrigida no lote inteiro (os dois sabores, e o que foi para Ibiúna vai junto)
  await local('Todos');
  await page.getByRole('list', { name: 'Lotes' }).locator('.item', { hasText: '2 Pudim ninho com Nutella 1100' }).filter({ hasText: '05/01' }).click();
  await folha().getByText('Local, dia e validade valem para o lote inteiro (2 sabores)').waitFor();
  await folha().getByLabel('Vence em').fill('2099-01-03');
  await page.getByRole('button', { name: 'Salvar' }).click();
  await toast().filter({ hasText: 'Movimento corrigido' }).waitFor();
  const lotes = page.getByRole('list', { name: 'Lotes' });
  await lotes.locator('.item', { hasText: '2 Pudim ninho com Nutella 1100' }).filter({ hasText: '03/01' }).waitFor();
  await lotes.locator('.item', { hasText: 'Ibiúna' }).filter({ hasText: '03/01' }).waitFor();
  assert.equal(await lotes.locator('.item', { hasText: '05/01' }).count(), 0);

  // cartões do estoque como o cardápio: tocar abre o pudim com o que tem em cada local
  await local('Todos');
  await page.getByRole('region', { name: 'Pudim no copo' }).getByRole('button', { name: /^Pudim tradicional 150: \d+ prontos$/ }).click();
  await folha().locator('.estoque-local', { hasText: 'Ibiúna' }).getByText('6 prontos · mín. 6').waitFor();
  await page.keyboard.press('Escape');

  // Ibiúna não vende geladinho e o PDV abre no local escolhido
  await page.goto(`${base}/?demo#/pudim/vender?local=ibiuna`);
  await page.getByRole('group', { name: 'Local' }).getByRole('button', { name: 'Ibiúna', pressed: true }).waitFor();
  await page.getByRole('button', { name: 'Adicionar Pudim tradicional 150' }).locator('.pdv-estoque', { hasText: '6 prontos' }).waitFor();
  assert.deepEqual(erros, []);
});

test('produção lançada no pudim errado: trocar o pudim refaz o custo de cada e o gasto de ingredientes', async () => {
  await page.goto(`${base}/?demo#/pudim`);
  await page.getByRole('button', { name: 'Produzi', exact: true }).click();
  await folha().getByLabel('Qual pudim').selectOption({ label: 'Pudim tradicional 1100' });
  await page.locator('#mov-quantidade').fill('4');
  await page.getByRole('button', { name: 'Pôr no estoque' }).click();
  await toast().filter({ hasText: '4 Pudim tradicional 1100 no estoque' }).waitFor();
  const mov = page.locator('.item-btn', { hasText: 'Produziu 4 Pudim tradicional 1100' }).first();
  const antes = await mov.locator('.valor').innerText();
  await mov.click();
  await folha().getByLabel('Qual pudim').selectOption({ label: 'Pudim tradicional 150' });
  await folha().getByText(/Passa a custar R\$ [\d,]+ cada/).waitFor();
  await page.getByRole('button', { name: 'Salvar' }).click();
  await toast().filter({ hasText: 'Movimento corrigido' }).waitFor();
  const depois = page.locator('.item-btn', { hasText: 'Produziu 4 Pudim tradicional 150' }).first();
  await depois.waitFor();
  assert.match(await depois.innerText(), /4 × R\$ [\d,]+/);
  assert.ok(reais(await depois.locator('.valor').innerText()) < reais(antes));
  assert.equal(await page.locator('.item-btn', { hasText: 'Produziu 4 Pudim tradicional 1100' }).count(), 0);
  assert.deepEqual(erros, []);
});
