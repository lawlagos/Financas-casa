import { test } from 'node:test';
import assert from 'node:assert/strict';
import { catalogo, interpretarLista, estimar, historicoPrecos, comparar, resumoLista } from '../../app/core/listacompras.js';

const I = (data, produto, valor, extra = {}) => ({ data, produto, descricao: produto, valor, quantidade: 1, unidade: 'un', origem: 'Casa', mercado: 'Assaí', ...extra });
const itens = [
  I('2026-10-03', 'Leite condensado', 41.4, { quantidade: 6, origem: 'Pudim', tamanho: 395, tamanho_unidade: 'g' }),
  I('2026-10-10', 'Leite condensado', 39, { quantidade: 6, origem: 'Pudim', tamanho: 395, tamanho_unidade: 'g' }),
  I('2026-10-10', 'Detergente', 2.99),
  I('2026-10-11', 'Banana prata', 10.5, { quantidade: 1.5, unidade: 'kg' }),
  I('2026-10-11', 'Café', 18.9, { tamanho: 500, tamanho_unidade: 'g' }),
];
const insumos = [{ id: 'goi', nome: 'Goiabada', tipo: 'ingrediente', qtd_embalagem: 500, unidade: 'g', preco_embalagem: 5.5, ativo: true }];
const cat = catalogo({ itens, insumos });

test('frase falada vira itens com quantidade, unidade e o produto já conhecido', () => {
  const r = interpretarLista('preciso de 2 leites condensados, um quilo de banana, detergente e 3 goiabadas', cat);
  assert.deepEqual(r.map((x) => [x.nome, x.quantidade, x.unidade, x.origem, x.conhecido]), [
    ['Leite condensado', 2, 'un', 'Pudim', true],
    ['Banana prata', 1, 'kg', 'Casa', true],
    ['Detergente', 1, 'un', 'Casa', true],
    ['Goiabada', 3, 'un', 'Pudim', true],
  ]);
  const novo = interpretarLista('coloca papel toalha e meia dúzia de ovos', cat);
  assert.deepEqual(novo.map((x) => [x.nome, x.quantidade, x.conhecido]), [['Papel toalha', 1, false], ['Ovos', 6, false]]);
});

test('estimativa pela última compra: por unidade, por kg e por pacote; sem compra, pelo cadastro do pudim', () => {
  assert.equal(estimar({ nome: 'Leite condensado', quantidade: 2, unidade: 'un' }, { itens }).valor, 1300); // 39/6 = 6,50 cada
  assert.equal(estimar({ nome: 'Banana prata', quantidade: 2, unidade: 'kg' }, { itens }).valor, 1400); // 7,00/kg
  assert.equal(estimar({ nome: 'Café', quantidade: 250, unidade: 'g' }, { itens }).valor, 945); // 37,80/kg
  const g = estimar({ nome: 'Goiabada', quantidade: 3, unidade: 'un' }, { itens, insumos });
  assert.deepEqual([g.valor, g.fonte], [1650, 'cadastro']);
  assert.equal(estimar({ nome: 'Papel toalha', quantidade: 1, unidade: 'un' }, { itens }).valor, null);
  // pediu 2 kg de detergente (comprado por unidade): referência aproximada pelo último preço
  assert.deepEqual([estimar({ nome: 'Detergente', quantidade: 2, unidade: 'kg' }, { itens }).valor, estimar({ nome: 'Detergente', quantidade: 2, unidade: 'kg' }, { itens }).aproximado], [598, true]);
});

test('histórico mais novo primeiro e comparação com o que foi pago', () => {
  assert.deepEqual(historicoPrecos('leite condensado', itens).map((h) => [h.data, h.porUnidade]), [['2026-10-10', 650], ['2026-10-03', 690]]);
  assert.deepEqual(comparar(1400, 1300), { diferenca: 100, fracao: 100 / 1300 });
  assert.equal(comparar(0, 1300), null);
  const r = resumoLista([
    { estimado: 1300, comprado: true, pago: 1200 },
    { estimado: 1400, comprado: true, pago: 1500 },
    { estimado: 299, comprado: false },
    { estimado: null, comprado: true, pago: 500 },
  ]);
  assert.deepEqual([r.estimado, r.semPreco, r.pago, r.faltaEstimado], [2999, 1, 3200, 299]);
  assert.deepEqual(r.comparacao, { diferenca: 0, fracao: 0 });
});
