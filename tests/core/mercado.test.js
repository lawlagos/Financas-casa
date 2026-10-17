import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nomeBase, chaveProduto, produtos, listaSugerida, previsaoMes, tamanhoBase, textoLista } from '../../app/core/mercado.js';

const hoje = '2026-10-17';
const I = (data, descricao, valor, extra = {}) => ({ data, descricao, valor, quantidade: 1, unidade: 'un', origem: 'Casa', categoria_id: 'cat-mercado', mercado: 'Assaí', ...extra });

test('nome base tira tamanho, números e embalagem', () => {
  assert.equal(nomeBase('Leite condensado Moça 395g'), 'Leite condensado Moça');
  assert.equal(nomeBase('PAPEL HIG. NEVE 12 UN'), 'PAPEL HIG NEVE');
  assert.equal(nomeBase('Detergente Ypê 500 ml'), 'Detergente Ypê');
  assert.equal(chaveProduto('Café  Pilão'), 'cafe pilao');
});

test('agrupa pelo produto da IA e, sem ele, pelo nome base; ignora outro grupo', () => {
  const lista = produtos([
    I('2026-09-01', 'Café Pilão 500g', 18.9, { produto: 'Café' }),
    I('2026-09-15', 'Café Melitta 500g', 17.5, { produto: 'café' }),
    I('2026-09-10', 'Detergente Ypê 500ml', 2.99),
    I('2026-09-24', 'DETERGENTE YPÊ 500 ML', 3.29),
    I('2026-09-12', 'Leite condensado', 6.39, { origem: 'Pudim' }),
  ], { hoje });
  assert.deepEqual(lista.map((p) => [p.chave, p.compras]), [['cafe', 2], ['detergente ype', 2]]);
});

test('ritmo, próxima compra, mercado mais barato e preço por kg', () => {
  const [cafe] = produtos([
    I('2026-09-01', 'Café', 18.9, { produto: 'Café', marca: 'Pilão', tamanho: 500, tamanho_unidade: 'g' }),
    I('2026-09-15', 'Café', 17.5, { produto: 'Café', marca: 'Melitta', mercado: 'Atacadão', tamanho: 500, tamanho_unidade: 'g' }),
    I('2026-09-29', 'Café', 38, { produto: 'Café', marca: 'Pilão', quantidade: 2, tamanho: 500, tamanho_unidade: 'g' }),
  ], { hoje });
  assert.equal(cafe.intervalo, 14);
  assert.equal(cafe.proxima, '2026-10-13');
  assert.equal(cafe.diasParaProxima, -4);
  assert.equal(cafe.ultimoPreco, 1900);
  assert.deepEqual(cafe.medida, { valor: 3800, unidade: 'kg' });
  assert.equal(cafe.maisBarato.mercado, 'Atacadão');
  assert.deepEqual(cafe.marcas, ['Pilão', 'Melitta']);
  assert.equal(cafe.qtdPorCompra, 1.33);
  assert.equal(cafe.historico[0].data, '2026-09-29');
});

test('tamanho base converte g e ml; un não tem medida', () => {
  assert.deepEqual(tamanhoBase({ tamanho: 395, tamanho_unidade: 'g' }), { qtd: 0.395, unidade: 'kg' });
  assert.deepEqual(tamanhoBase({ tamanho: 2, tamanho_unidade: 'l' }), { qtd: 2, unidade: 'l' });
  assert.equal(tamanhoBase({ tamanho: 12, tamanho_unidade: 'un' }), null);
});

test('lista sugerida: o que está acabando, atrasados primeiro, sem os abandonados', () => {
  const itens = [
    I('2026-09-01', 'Café', 18, { produto: 'Café' }), I('2026-09-15', 'Café', 18, { produto: 'Café' }), I('2026-09-29', 'Café', 18, { produto: 'Café' }),
    I('2026-10-01', 'Banana', 8, { produto: 'Banana' }), I('2026-10-11', 'Banana', 9, { produto: 'Banana' }),
    I('2026-10-10', 'Arroz', 30, { produto: 'Arroz' }), I('2026-10-14', 'Arroz', 30, { produto: 'Arroz' }),
    I('2026-04-01', 'Vela', 5, { produto: 'Vela' }), I('2026-04-05', 'Vela', 5, { produto: 'Vela' }),
    I('2026-08-01', 'Azeite', 40, { produto: 'Azeite' }), I('2026-09-30', 'Azeite', 40, { produto: 'Azeite' }),
    I('2026-10-16', 'Pão', 10, { produto: 'Pão' }),
  ];
  const l = listaSugerida(produtos(itens, { hoje }));
  // café venceu dia 13, arroz vence dia 18, banana dia 21 (fora), vela abandonada, azeite só em novembro, pão comprou uma vez
  assert.deepEqual(l.itens.map((p) => p.nome), ['Café', 'Arroz']);
  assert.equal(l.total, 1800 + 3000);
  assert.match(textoLista(l.itens, (c) => `R$ ${c / 100}`), /• Café\n• Arroz/);
});

const L = (data, valor, categoria_id = 'cat-mercado') => ({ data, valor, tipo: 'saida', categoria_id });

test('previsão: média dos meses fechados com gasto, contando categorias usadas nos itens', () => {
  const lancs = [L('2026-07-05', 900), L('2026-08-05', 1000), L('2026-09-05', 800), L('2026-09-20', 200, 'cat-limpeza'), L('2026-10-05', 300), L('2026-09-01', 999, 'cat-luz')];
  const p = previsaoMes({ lancamentos: lancs, itens: [I('2026-09-20', 'Detergente', 3, { categoria_id: 'cat-limpeza' })], hoje });
  assert.equal(p.como, 'media');
  assert.equal(p.mes, '2026-11');
  assert.deepEqual(p.meses, ['2026-09', '2026-08', '2026-07']);
  assert.equal(p.valor, Math.round((100000 + 100000 + 90000) / 3));
  assert.equal(p.noMes, 30000);
});

test('previsão: sem mês fechado, projeta pelo ritmo do mês; antes de 7 dias, não arrisca', () => {
  const p = previsaoMes({ lancamentos: [L('2026-10-04', 280), L('2026-10-12', 140)], itens: [], hoje });
  assert.equal(p.como, 'ritmo');
  assert.equal(p.diasDeDados, 14);
  assert.equal(p.valor, Math.round((42000 / 14) * 30));
  const q = previsaoMes({ lancamentos: [L('2026-10-14', 280)], itens: [], hoje });
  assert.equal(q.valor, null);
});
