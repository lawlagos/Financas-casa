import { test } from 'node:test';
import assert from 'node:assert/strict';
import { custoInsumo, custoReceita, processarEstoque, estoqueAtual, semanaPudim, ingredientesDe, precoNoCanal, totaisCarrinho } from '../../app/core/pudim.js';

const hoje = '2026-10-17'; // sábado
const lc = { id: 'ins-lc', nome: 'Leite condensado', tipo: 'ingrediente', qtd_embalagem: 395, unidade: 'g', preco_embalagem: 6.39, data_preco: '2025-12-01', produto: 'Leite condensado' };
const ovos = { id: 'ins-ovos', nome: 'Ovos', tipo: 'ingrediente', qtd_embalagem: 20, unidade: 'un', preco_embalagem: 16.9, data_preco: '2025-10-18' };
const emb = { id: 'ins-emb', nome: 'Embalagem 150', tipo: 'embalagem', qtd_embalagem: 1, unidade: 'un', preco_embalagem: 2 };
const leite = { id: 'ins-leite', nome: 'Leite integral', qtd_embalagem: 1, unidade: 'l', preco_embalagem: 5.29 };

test('custo do insumo: cadastro, ou nota mais nova (com tamanho da nota ou da embalagem cadastrada)', () => {
  assert.equal(custoInsumo(lc).porBase, 639 / 395);
  assert.equal(custoInsumo(lc).fonte, 'cadastro');
  const itens = [
    { data: '2026-10-10', produto: 'Leite condensado', valor: 41.4, quantidade: 6, tamanho: 395, tamanho_unidade: 'g', mercado: 'Assaí' },
    { data: '2026-09-01', produto: 'leite condensado', valor: 99, quantidade: 1 },
  ];
  const c = custoInsumo(lc, itens);
  assert.equal(c.fonte, 'nota');
  assert.equal(c.mercado, 'Assaí');
  assert.equal(c.porBase, 690 / 395);
  // nota sem tamanho: usa a embalagem do cadastro
  assert.equal(custoInsumo(ovos, [{ data: '2026-10-01', descricao: 'Ovos 20 un', produto: 'Ovos', valor: 18, quantidade: 1 }]).porBase, 1800 / 20);
  // água: preço zero é preço; vazio é falta de preço
  assert.equal(custoInsumo({ nome: 'Água', qtd_embalagem: 1000, unidade: 'ml', preco_embalagem: 0 }).porBase, 0);
  assert.equal(custoInsumo({ nome: 'Sacola', qtd_embalagem: 1, unidade: 'un', preco_embalagem: '' }).porBase, null);
  // litro vira ml
  assert.equal(custoInsumo(leite).porBase, 529 / 1000);
  // nota mais velha que o preço digitado não vale
  assert.equal(custoInsumo({ ...lc, data_preco: '2026-10-15' }, itens).fonte, 'cadastro');
});

const receita = {
  id: 'rec-trad', nome: 'Pudim tradicional 150', rendimento: 8, preco_venda: 12, custo_ref: 1.5,
  ingredientes: JSON.stringify([{ insumo_id: 'ins-lc', quantidade: 395 }, { insumo_id: 'ins-ovos', quantidade: 8 }, { insumo_id: 'ins-emb', quantidade: 8 }, { insumo_id: 'ins-x', quantidade: 1 }]),
};
const insumos = { 'ins-lc': lc, 'ins-ovos': ovos, 'ins-emb': emb };

test('custo da receita: total, por unidade, margem, alerta de alta e o que ficou sem preço', () => {
  assert.equal(ingredientesDe(receita).length, 4);
  const c = custoReceita(receita, insumos);
  assert.equal(c.total, 639 + 676 + 1600);
  assert.equal(c.porUnidade, Math.round(2915 / 8));
  assert.equal(c.lucroUnidade, 1200 - 364);
  assert.deepEqual(c.faltando, ['ingrediente apagado']);
  assert.ok(c.subiu > 1); // custo de referência R$ 1,50 → hoje R$ 3,64
  assert.equal(custoReceita({ ...receita, custo_ref: 3.6 }, insumos).subiu, 0);
});

const M = (id, data, tipo, quantidade, extra = {}) => ({ id, data, tipo, receita_id: 'rec-trad', quantidade, criado_em: `${data}T10:00:${id}`, ...extra });

test('estoque: produção vira lote, venda e perda saem do mais antigo, vencido fica separado', () => {
  const movs = [
    M('1', '2026-10-10', 'producao', 8, { custo_unitario: 3, validade: '2026-10-15' }),
    M('2', '2026-10-14', 'producao', 8, { custo_unitario: 4, validade: '2026-10-19' }),
    M('3', '2026-10-15', 'venda', 6, { preco_unitario: 12 }),
    M('4', '2026-10-17', 'venda', 3, { preco_unitario: 12 }),
  ];
  const { lotes, saidas } = processarEstoque(movs);
  assert.equal(saidas['3'].custo, 600 * 3);
  assert.equal(saidas['4'].custo, 3 * 400); // o lote velho venceu dia 15: a venda do dia 17 sai do novo
  const e = estoqueAtual(lotes, { 'rec-trad': receita }, hoje);
  assert.equal(e.quantidade, 5);
  assert.equal(e.potencial, 5 * 1200);
  assert.equal(e.lucroPotencial, 5 * 1200 - 5 * 400);
  assert.equal(e.vencidos, 2);
  // sem a segunda venda, sobram 2 do lote vencido em 15/10
  const sem = estoqueAtual(processarEstoque(movs.slice(0, 3)).lotes, { 'rec-trad': receita }, hoje);
  assert.equal(sem.vencidos, 2);
  assert.equal(sem.custoVencido, 600);
  assert.equal(sem.quantidade, 8);
  assert.equal(sem.lista[0].proximaValidade, '2026-10-19');
});

test('venda sem produção registrada usa o custo de hoje e avisa', () => {
  const { saidas } = processarEstoque([M('1', '2026-10-16', 'venda', 2, { preco_unitario: 12 })], () => 350);
  assert.deepEqual(saidas['1'], { custo: 700, semProducao: 2 });
});

test('semana do pudim (sáb a sex): produziu, vendeu, perdeu, ganho real e compras no caixa', () => {
  const movs = [
    M('0', '2026-10-09', 'producao', 4, { custo_unitario: 3, validade: '2026-10-13' }), // sexta da semana anterior
    M('1', '2026-10-10', 'producao', 8, { custo_unitario: 3.5, validade: '2026-10-15' }), // sábado: semana nova
    M('2', '2026-10-12', 'venda', 9, { preco_unitario: 12 }),
    M('3', '2026-10-16', 'perda', 2),
    M('4', '2026-10-17', 'venda', 1, { preco_unitario: 12 }), // sábado seguinte: fora
  ];
  const { saidas } = processarEstoque(movs);
  const lancs = [
    { tipo: 'saida', origem: 'Pudim', valor: 80, data: '2026-10-11' },
    { tipo: 'saida', origem: 'Casa', valor: 50, data: '2026-10-11' },
    { tipo: 'entrada', origem: 'Pudim', valor: 108, data: '2026-10-12' },
  ];
  const s = semanaPudim({ movimentos: movs, saidas, lancamentos: lancs, data: '2026-10-14' });
  assert.equal(s.inicio, '2026-10-10');
  assert.equal(s.fim, '2026-10-16');
  assert.equal(s.produzidos, 8);
  assert.equal(s.custoProduzido, 2800);
  assert.equal(s.vendidos, 9);
  assert.equal(s.vendas, 10800);
  assert.equal(s.custoVendido, 4 * 300 + 5 * 350);
  assert.equal(s.custoPerdido, 2 * 350);
  assert.equal(s.ganho, 10800 - 2950 - 700);
  assert.equal(s.comprasCaixa, 8000);
});

test('preço por canal: iFood cadastrado, ou calculado para manter o líquido da venda direta', () => {
  assert.deepEqual(precoNoCanal({ preco_venda: 12 }, 'direta'), { preco: 1200, calculado: false });
  assert.deepEqual(precoNoCanal({ preco_venda: 12, preco_ifood: 16.5 }, 'ifood'), { preco: 1650, calculado: false });
  // 12 / (1 - 0,262) = 16,26 → 16,30
  assert.deepEqual(precoNoCanal({ preco_venda: 12 }, 'ifood', 26.2), { preco: 1630, calculado: true });
  assert.deepEqual(precoNoCanal({}, 'ifood'), { preco: 0, calculado: false });
});

test('carrinho: bruto, taxa de 26,2% no iFood, líquido e lucro', () => {
  const linhas = [{ quantidade: 3, preco: 1650, custo: 400 }, { quantidade: 1, preco: 9000, custo: 3000 }];
  const t = totaisCarrinho(linhas, 'ifood', 26.2);
  assert.equal(t.bruto, 4950 + 9000);
  assert.equal(t.taxa, 3 * 432 + 2358);
  assert.equal(t.liquido, t.bruto - t.taxa);
  assert.equal(t.lucro, t.liquido - 4200);
  assert.equal(t.quantidade, 4);
  assert.equal(totaisCarrinho(linhas, 'direta').taxa, 0);
});

test('semana separa venda direta e iFood e desconta a taxa do ganho', () => {
  const movs = [
    M('1', '2026-10-10', 'producao', 4, { custo_unitario: 3, validade: '2026-10-15' }),
    M('2', '2026-10-11', 'venda', 1, { preco_unitario: 12, canal: 'direta' }),
    M('3', '2026-10-11', 'venda', 2, { preco_unitario: 16.5, taxa_unitaria: 4.32, canal: 'ifood' }),
  ];
  const { saidas } = processarEstoque(movs);
  const lancs = [{ tipo: 'saida', origem: 'Pudim', categoria_id: 'cat-taxa-ifood', valor: 8.64, data: '2026-10-11' }];
  const s = semanaPudim({ movimentos: movs, saidas, lancamentos: lancs, data: '2026-10-12' });
  assert.equal(s.vendas, 1200 + 3300);
  assert.equal(s.taxas, 864);
  assert.deepEqual(s.porCanal.ifood, { quantidade: 2, vendas: 3300, taxas: 864 });
  assert.equal(s.ganho, 4500 - 864 - 900);
  assert.equal(s.comprasCaixa, 0);
});

test('revisão: venda pula o lote vencido, baixa de vencido tira o vencido e produção do dia conta antes da venda', () => {
  // lote velho venceu em 06/10; venda em 10/10 sai do lote bom e o vencido continua aparecendo
  const a = processarEstoque([
    M('1', '2026-10-01', 'producao', 4, { custo_unitario: 3, validade: '2026-10-06' }),
    M('2', '2026-10-09', 'producao', 6, { custo_unitario: 4, validade: '2026-10-14' }),
    M('3', '2026-10-10', 'venda', 4, { preco_unitario: 12 }),
  ]);
  assert.equal(a.saidas['3'].custo, 4 * 400);
  const ea = estoqueAtual(a.lotes, { 'rec-trad': receita }, '2026-10-11');
  assert.deepEqual([ea.quantidade, ea.vencidos], [2, 4]);
  // lote mais novo vence antes: a baixa de vencido tira dele, não do bom
  const b = processarEstoque([
    M('1', '2026-10-01', 'producao', 5, { custo_unitario: 3, validade: '2026-10-20' }),
    M('2', '2026-10-02', 'producao', 3, { custo_unitario: 3, validade: '2026-10-05' }),
    M('3', '2026-10-10', 'perda', 3, { obs: 'vencido' }),
  ]);
  const eb = estoqueAtual(b.lotes, { 'rec-trad': receita }, '2026-10-10');
  assert.deepEqual([eb.quantidade, eb.vencidos], [5, 0]);
  // venda lançada antes da produção do mesmo dia
  const c = processarEstoque([
    { ...M('1', '2026-10-10', 'venda', 4, { preco_unitario: 12 }), criado_em: '2026-10-10T09:00' },
    { ...M('2', '2026-10-10', 'producao', 8, { custo_unitario: 3, validade: '2026-10-15' }), criado_em: '2026-10-10T18:00' },
  ]);
  assert.deepEqual(c.saidas['1'], { custo: 1200, semProducao: 0 });
  assert.equal(c.lotes[0].restante, 4);
});

test('revisão: nota de item vendido por peso e embalagem por unidade sem conteúdo', () => {
  const acucar = { nome: 'Açúcar', qtd_embalagem: 5, unidade: 'kg', preco_embalagem: 20, data_preco: '2026-01-01' };
  const nota = [{ data: '2026-10-01', produto: 'Açúcar', valor: 10, quantidade: 2, unidade: 'kg' }];
  assert.equal(custoInsumo(acucar, nota).porBase, 1000 / 2 / 1000);
  assert.equal(custoInsumo({ nome: 'Tampa', unidade: 'un', qtd_embalagem: '', preco_embalagem: 1.26 }).porBase, 126);
});
