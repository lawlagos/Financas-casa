import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepararImportacao } from '../../app/core/importacao.js';
import { baseContas } from '../../app/core/seed.js';

const contas = baseContas('2026-10-01');
const prev = (extra = {}) => ({ id: 'imp-1', descricao: 'Aluguel', tipo: 'saida', natureza: 'fixo', valor: 8470, conta_id: 'itau', inicio: '2026-11-01', dia_inicio: 30, ...extra });

test('importa saldos e previstos válidos, com todas as colunas do esquema', () => {
  const r = prepararImportacao(JSON.stringify({ versao: 1, data_saldo: '2026-10-17', contas: { inter: 49, hotmart: 1462.55 }, previstos: [prev()] }), contas);
  assert.deepEqual(r.erros, []);
  assert.equal(r.contas.length, 2);
  assert.equal(r.contas.find((c) => c.id === 'hotmart').saldo_inicial, 1462.55);
  assert.equal(r.contas[0].data_saldo_inicial, '2026-10-17');
  assert.equal(r.contas[0].nome, 'Inter');
  assert.equal(r.previstos[0].parcelas_total, '');
  assert.equal(r.previstos[0].dia_inicio, 30);
});

test('recusa texto quebrado, conta inexistente e previsto incompleto', () => {
  assert.match(prepararImportacao('{"versao":1,', contas).erros[0], /não é uma importação válida/);
  const r = prepararImportacao({ versao: 1, data_saldo: '2026-10-17', contas: { santander: 10 }, previstos: [prev({ conta_id: 'x' }), prev({ id: 'b', natureza: 'parcelado' }), prev({ id: 'c', natureza: 'unico' })] }, contas);
  assert.equal(r.erros.length, 4);
  assert.match(r.erros.join(' '), /santander/);
  assert.match(r.erros.join(' '), /conta desconhecida/);
  assert.match(r.erros.join(' '), /total de parcelas/);
  assert.match(r.erros.join(' '), /data inválida/);
});

test('substituir_prefixos remove previstos importados antes que não vieram de novo', () => {
  const existentes = [{ id: 'imp-01' }, { id: 'imp-02' }, { id: 'manual-1' }];
  const r = prepararImportacao({ versao: 1, substituir_prefixos: ['imp-'], previstos: [prev({ id: 'imp-02' })] }, contas, existentes);
  assert.deepEqual(r.erros, []);
  assert.deepEqual(r.remover, ['imp-01']);
});

test('importa ingredientes e receitas; receita com ingrediente desconhecido é recusada', () => {
  const imp = {
    versao: 1,
    insumos: [{ id: 'pp-lc', nome: 'Leite condensado', tipo: 'ingrediente', qtd_embalagem: 395, unidade: 'g', preco_embalagem: 6.39 }],
    receitas: [{ id: 'pp-trad', nome: 'Pudim tradicional', rendimento: 8, ingredientes: [{ insumo_id: 'pp-lc', quantidade: 395 }] }],
  };
  const r = prepararImportacao(JSON.stringify(imp), [], []);
  assert.deepEqual(r.erros, []);
  assert.equal(r.insumos[0].ativo, true);
  assert.equal(r.receitas[0].ingredientes, '[{"insumo_id":"pp-lc","quantidade":395}]');
  imp.receitas[0].ingredientes.push({ insumo_id: 'pp-nada', quantidade: 1 });
  assert.match(prepararImportacao(JSON.stringify(imp), [], []).erros[0], /pp-nada/);
});

test('reimportar receita mantém o preço digitado no app; custos do pudim viram Config', () => {
  const imp = {
    versao: 1,
    insumos: [{ id: 'pp-lc', nome: 'Leite condensado', qtd_embalagem: 395, unidade: 'g', preco_embalagem: 6.5 }],
    receitas: [{ id: 'pp-trad', nome: 'Pudim tradicional', rendimento: 8, tempo_preparo: 60, markup: 0.3, preco_venda: '', ingredientes: [{ insumo_id: 'pp-lc', quantidade: 395 }] }],
    custos_pudim: { salario: 200, decimo: 125, dias: 15, horas: 6, despesas: [{ nome: 'MEI', valor: 72, divisor: 1 }] },
  };
  const existente = { id: 'pp-trad', nome: 'Pudim tradicional', rendimento: 6, preco_venda: 12, preco_ifood: 16.5, tempo_preparo: '' };
  const r = prepararImportacao(JSON.stringify(imp), [], [], [{ id: 'pp-lc', preco_embalagem: 6.39, marca: 'Moça' }], [existente]);
  assert.deepEqual(r.erros, []);
  const [rec] = r.receitas;
  assert.deepEqual([rec.rendimento, rec.preco_venda, rec.preco_ifood, rec.tempo_preparo], [8, 12, 16.5, 60]);
  assert.deepEqual([r.insumos[0].preco_embalagem, r.insumos[0].marca], [6.5, 'Moça']);
  assert.equal(JSON.parse(r.config[0].valor).salario, 200);
});

test('revisão: reimportar não reativa receita desligada nem apaga a lista de ingredientes', () => {
  const imp = { versao: 1, insumos: [{ id: 'pp-lc', nome: 'Leite condensado', unidade: 'g' }], receitas: [{ id: 'pp-trad', nome: 'Pudim tradicional' }, { id: 'pp-nova', nome: 'Nova' }] };
  const existentes = [{ id: 'pp-trad', nome: 'Pudim tradicional', ativo: false, ingredientes: '[{"insumo_id":"pp-lc","quantidade":395}]' }];
  const r = prepararImportacao(JSON.stringify(imp), [], [], [{ id: 'pp-lc', ativo: false }], existentes);
  assert.deepEqual(r.erros, []);
  assert.equal(r.receitas[0].ativo, false);
  assert.equal(r.receitas[0].ingredientes, existentes[0].ingredientes);
  assert.deepEqual([r.receitas[1].ativo, r.receitas[1].ingredientes], [true, '[]']);
  assert.equal(r.insumos[0].ativo, false);
});
