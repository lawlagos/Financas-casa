// Dados iniciais: contas e categorias reais do casal, mais exemplos para o modo demonstração.
import { addDays, monthKey, addMonthsKey } from './dates.js';
import { CATEGORIA_DIZIMO, businessWeeks, refSemana, monthlyTithe, refMes } from './tithe.js';

export function baseContas(dataSaldo) {
  const c = (id, nome, dono, grupo, cor, saldo = 0) => ({ id, nome, dono, grupo, saldo_inicial: saldo, data_saldo_inicial: dataSaldo, cor, ativa: true });
  return [
    c('c6', 'C6', 'Marido', 'Empresa', '#2b2b2b'),
    c('inter', 'Inter', 'Marido', 'Empresa', '#ff7a00'),
    c('mp', 'Mercado Pago', 'Marido', 'Empresa', '#009ee3'),
    c('hotmart', 'Hotmart', 'Marido', 'Empresa', '#f04e23'),
    c('itau', 'Itaú', 'Marido', 'Pessoal', '#ec7000'),
    c('nubank', 'Nubank', 'Marido', 'Pessoal', '#820ad1'),
    c('bradesco', 'Bradesco', 'Marido', 'Pessoal', '#cc092f'),
    c('nubank-pf', 'Nubank PF', 'Esposa', 'Pessoal', '#a35bd8'),
    c('nubank-pj', 'Nubank PJ', 'Esposa', 'Pudim', '#5d0a9c'),
  ];
}

export function baseCategorias() {
  const c = (id, nome, tipo, origem_padrao = '') => ({ id, nome, tipo, origem_padrao, ativa: true });
  return [
    c('cat-salario', 'Salário', 'entrada', 'Salario'),
    c('cat-consultoria', 'Consultoria', 'entrada', 'Consultoria'),
    c('cat-youtube', 'YouTube (AdSense)', 'entrada', 'YouTube'),
    c('cat-venda-pudim', 'Venda de pudim', 'entrada', 'Pudim'),
    c('cat-venda-hotmart', 'Venda Hotmart', 'entrada', 'Hotmart'),
    c('cat-outras-entradas', 'Outras entradas', 'entrada', 'Casa'),
    c('cat-mercado', 'Mercado', 'saida', 'Casa'),
    c('cat-ingrediente', 'Ingrediente', 'saida', 'Pudim'),
    c('cat-embalagem', 'Embalagem', 'saida', 'Pudim'),
    c('cat-gas', 'Gás', 'saida', 'Casa'),
    c('cat-anuncio', 'Anúncio Meta', 'saida', 'Hotmart'),
    c('cat-taxa-hotmart', 'Taxa Hotmart', 'saida', 'Hotmart'),
    c('cat-aluguel', 'Aluguel', 'saida', 'Casa'),
    c('cat-luz', 'Luz', 'saida', 'Casa'),
    c('cat-agua', 'Água', 'saida', 'Casa'),
    c('cat-internet', 'Internet e celular', 'saida', 'Casa'),
    c('cat-emprestimo', 'Empréstimo e parcelas', 'saida', 'Casa'),
    c('cat-transporte', 'Transporte', 'saida', 'Casa'),
    c('cat-saude', 'Saúde', 'saida', 'Casa'),
    c('cat-lazer', 'Lazer', 'saida', 'Casa'),
    c('cat-mei', 'MEI e contador', 'saida', 'Pudim'),
    c(CATEGORIA_DIZIMO, 'Dízimo', 'saida', 'Casa'),
    c('cat-outros', 'Outros', 'saida', 'Casa'),
  ];
}

export function baseConfig() {
  return [
    { id: 'gasto_diario', valor: 75 },
    { id: 'reserva_minima', valor: 0 },
  ];
}

// Tabelas completas para o modo demonstração, com datas relativas a `hoje`.
export function demoTables(hoje) {
  const mesAnterior = addMonthsKey(monthKey(hoje), -1);
  const dataSaldo = `${mesAnterior}-01`;
  const contas = baseContas(dataSaldo);
  const saldos = { c6: 2240, inter: 1350.4, mp: 310, hotmart: 690, itau: 3120.55, nubank: 480, bradesco: 120, 'nubank-pf': 340, 'nubank-pj': 450 };
  for (const c of contas) c.saldo_inicial = saldos[c.id] || 0;

  let n = 0;
  const lancs = [];
  const L = (dias, tipo, valor, descricao, conta_id, categoria_id, origem, extra = {}) => {
    const data = addDays(hoje, -dias);
    if (data < dataSaldo) return;
    lancs.push({ id: `demo-l${++n}`, data, tipo, valor, descricao, conta_id, conta_destino_id: '', categoria_id, origem, canal: 'manual', criado_por: 'demo', criado_em: data, ...extra });
  };
  // Últimas semanas de pudim e Hotmart
  for (let w = 0; w < 6; w++) {
    const d = w * 7;
    L(d + 1, 'entrada', 420 + w * 35, 'Encomendas de pudim', 'nubank-pj', 'cat-venda-pudim', 'Pudim');
    L(d + 3, 'entrada', 260 + (w % 3) * 40, 'Pudins no Pix', 'nubank-pj', 'cat-venda-pudim', 'Pudim');
    L(d + 4, 'saida', 187.4 - w * 6, 'Assaí — ingredientes', 'nubank-pj', 'cat-ingrediente', 'Pudim');
    L(d + 5, 'saida', 64.9, 'Embalagens Plastilânia', 'nubank-pj', 'cat-embalagem', 'Pudim');
    L(d + 2, 'entrada', 1180 + (w % 2) * 640, 'Vendas Hotmart', 'hotmart', 'cat-venda-hotmart', 'Hotmart');
    L(d + 2, 'saida', 610 + w * 25, 'Anúncios Meta (semana)', 'c6', 'cat-anuncio', 'Hotmart');
    L(d + 5, 'saida', 243.62 - w * 11, 'Mercado da semana', 'nubank', 'cat-mercado', 'Casa');
    L(d, 'transferencia', 1200, 'Saque Hotmart', 'hotmart', '', '', { conta_destino_id: 'c6' });
  }
  L(9, 'entrada', 4500, 'Salário', 'itau', 'cat-salario', 'Salario');
  L(6, 'entrada', 2000, 'Katsuhiro', 'inter', 'cat-consultoria', 'Consultoria', { previsto_id: 'demo-kat' });
  L(8, 'saida', 316, 'Internet + celular', 'itau', 'cat-internet', 'Casa');
  L(3, 'saida', 46.9, 'Uber', 'nubank', 'cat-transporte', 'Casa');
  L(2, 'transferencia', 3000, 'C6 → Itaú', 'c6', '', 'Casa', { conta_destino_id: 'itau' });
  L(1, 'saida', 129.9, 'Farmácia', 'nubank-pf', 'cat-saude', 'Casa');

  const ini = dataSaldo;
  const P = (id, extra) => ({ id, natureza: 'fixo', tipo: 'saida', recorrencia: 'meses', a_cada: 1, mes_ancora: '', dia_inicio: 1, dia_fim: '', dia_semana: '', data_unica: '', inicio: ini, parcelas_total: '', parcela_no_inicio: '', confianca: 'certo', renovacao: false, pessoa: '', ativo: true, conta_destino_id: '', origem: 'Casa', ...extra });
  const mesAncora = (k) => Number(k.slice(5, 7));
  const previstos = [
    P('demo-aluguel', { descricao: 'Aluguel', valor: 8470, dia_inicio: 30, conta_id: 'itau', categoria_id: 'cat-aluguel' }),
    P('demo-condo', { descricao: 'Condomínio e IPTU', valor: 2391.4, dia_inicio: 23, conta_id: 'itau', categoria_id: 'cat-outros' }),
    P('demo-internet', { descricao: 'Internet + celular', valor: 316, dia_inicio: 8, conta_id: 'itau', categoria_id: 'cat-internet' }),
    P('demo-emprestimo', { natureza: 'parcelado', descricao: 'Empréstimo Itaú', valor: 850, dia_inicio: 5, conta_id: 'itau', categoria_id: 'cat-emprestimo', parcelas_total: 12, parcela_no_inicio: 6 }),
    P('demo-notebook', { natureza: 'parcelado', descricao: 'Notebook (cartão antigo)', valor: 316.2, dia_inicio: 12, conta_id: 'nubank', categoria_id: 'cat-emprestimo', parcelas_total: 10, parcela_no_inicio: 8 }),
    P('demo-luz', { natureza: 'variavel', descricao: 'Luz', valor: 260, dia_inicio: 10, conta_id: 'itau', categoria_id: 'cat-luz' }),
    P('demo-agua', { natureza: 'variavel', descricao: 'Água', valor: 120, dia_inicio: 15, conta_id: 'itau', categoria_id: 'cat-agua' }),
    P('demo-salario', { tipo: 'entrada', descricao: 'Salário', valor: 4500, dia_inicio: 6, conta_id: 'itau', categoria_id: 'cat-salario', origem: 'Salario' }),
    P('demo-kat', { tipo: 'entrada', descricao: 'Katsuhiro', pessoa: 'Katsuhiro', valor: 2000, dia_inicio: 8, dia_fim: 10, conta_id: 'inter', categoria_id: 'cat-consultoria', origem: 'Consultoria' }),
    P('demo-danilo', { tipo: 'entrada', descricao: 'Danilo', pessoa: 'Danilo', valor: 1500, dia_inicio: 13, dia_fim: 14, conta_id: 'inter', categoria_id: 'cat-consultoria', origem: 'Consultoria' }),
    P('demo-eduardo', { tipo: 'entrada', descricao: 'Eduardo (renovação anual)', pessoa: 'Eduardo', valor: 7200, a_cada: 12, mes_ancora: 4, dia_inicio: 10, conta_id: 'inter', categoria_id: 'cat-consultoria', origem: 'Consultoria', renovacao: true, confianca: 'provavel' }),
    P('demo-monique', { tipo: 'entrada', descricao: 'Monique (renovação anual)', pessoa: 'Monique', valor: 6000, a_cada: 12, mes_ancora: 6, dia_inicio: 15, conta_id: 'inter', categoria_id: 'cat-consultoria', origem: 'Consultoria', renovacao: true, confianca: 'provavel' }),
    P('demo-martin', { tipo: 'entrada', descricao: 'Martin (parte trimestral)', pessoa: 'Martin', valor: 2500, a_cada: 3, mes_ancora: mesAncora(addMonthsKey(monthKey(hoje), 1)), dia_inicio: 20, conta_id: 'c6', categoria_id: 'cat-consultoria', origem: 'Consultoria', confianca: 'provavel' }),
    P('demo-youtube', { natureza: 'variavel', tipo: 'entrada', descricao: 'YouTube (AdSense)', valor: 900, a_cada: 2, mes_ancora: mesAncora(monthKey(hoje)), dia_inicio: 21, conta_id: 'c6', categoria_id: 'cat-youtube', origem: 'YouTube', confianca: 'provavel' }),
  ];

  // Baixas do que já aconteceu no mês anterior e neste mês (demo), deixando o Danilo atrasado.
  const baixas = [];
  const B = (previsto_id, ref) => baixas.push({ id: `demo-b${baixas.length + 1}`, previsto_id, ref, status: 'baixado', lancamento_id: '', nova_data: '', criado_em: hoje });
  const mesAtual = monthKey(hoje);
  for (const k of [mesAnterior, mesAtual]) {
    for (const [id, dia] of [['demo-aluguel', 30], ['demo-condo', 23], ['demo-internet', 8], ['demo-emprestimo', 5], ['demo-notebook', 12], ['demo-luz', 10], ['demo-agua', 15], ['demo-salario', 6], ['demo-kat', 8], ['demo-danilo', 13]]) {
      const ref = `${k}-${String(dia).padStart(2, '0')}`;
      const passou = ref < hoje;
      if (k === mesAnterior || (passou && id !== 'demo-danilo')) B(id, ref);
    }
  }
  // Dízimos antigos já pagos; a semana fechada mais recente fica a pagar, para mostrar o fluxo.
  const fechadas = businessWeeks(lancs, hoje).filter((w) => w.fim < hoje && w.dizimo > 0);
  for (const w of fechadas.slice(0, -1)) {
    lancs.push({ id: `demo-l${++n}`, data: w.pagarEm, tipo: 'saida', valor: w.dizimo / 100, descricao: 'Dízimo dos negócios', conta_id: 'itau', conta_destino_id: '', categoria_id: CATEGORIA_DIZIMO, origem: 'Casa', canal: 'manual', id_externo: refSemana(w.inicio), criado_por: 'demo', criado_em: w.pagarEm });
  }
  const mt = monthlyTithe(lancs, mesAnterior);
  if (mt.dizimo > 0) lancs.push({ id: `demo-l${++n}`, data: `${monthKey(hoje)}-01`, tipo: 'saida', valor: mt.dizimo / 100, descricao: 'Dízimo do mês', conta_id: 'itau', conta_destino_id: '', categoria_id: CATEGORIA_DIZIMO, origem: 'Casa', canal: 'manual', id_externo: refMes(mesAnterior), criado_por: 'demo', criado_em: hoje });
  return { contas, categorias: baseCategorias(), lancamentos: lancs, previstos, baixas, config: [...baseConfig(), { id: 'custos_pudim', valor: JSON.stringify(demoCustosPudim()) }], itens: demoItens(hoje), ...demoPudim(hoje) };
}

// Ingredientes, três receitas e duas semanas de produção, venda e perda.
function demoPudim(hoje) {
  const I = (id, nome, tipo, qtd_embalagem, unidade, preco_embalagem, produto = '') => ({ id, nome, tipo, marca: '', qtd_embalagem, unidade, preco_embalagem, data_preco: addDays(hoje, -60), produto: produto || nome, ativo: true });
  const insumos = [
    I('demo-ins-lc', 'Leite condensado', 'ingrediente', 395, 'g', 6.39),
    I('demo-ins-cl', 'Creme de leite', 'ingrediente', 200, 'g', 2.39),
    I('demo-ins-leite', 'Leite integral', 'ingrediente', 1, 'l', 5.29, 'Leite'),
    I('demo-ins-ovos', 'Ovos', 'ingrediente', 20, 'un', 16.9),
    I('demo-ins-acucar', 'Açúcar', 'ingrediente', 1, 'kg', 3.79),
    I('demo-ins-nutella', 'Nutella', 'ingrediente', 350, 'g', 31.99),
    I('demo-ins-emb150', 'Embalagem 150 ml', 'embalagem', 1, 'un', 2),
    I('demo-ins-emb1100', 'Embalagem 1100 ml', 'embalagem', 1, 'un', 5.71),
  ];
  const base = [['demo-ins-lc', 395], ['demo-ins-cl', 200], ['demo-ins-leite', 300], ['demo-ins-ovos', 4], ['demo-ins-acucar', 100]];
  const lista = (xs) => JSON.stringify(xs.map(([insumo_id, quantidade]) => ({ insumo_id, quantidade })));
  // Sabor = a receita de uma fornada; os tamanhos são o que se vende (rende 1 de 1100, 6 de 150).
  const S = (id, nome, extra) => ({ id, nome, tipo: 'sabor', sabor_id: '', porcao: '', rendimento: 1, validade_dias: 5, preco_venda: '', preco_sugerido: '', custo_ref: '', tempo_preparo: 60, markup: 0.3, preco_ifood: '', ingredientes: lista([...base, ...extra]), ativo: true });
  const T = (id, sabor_id, nome, porcao, rendimento, preco_venda, emb, custo_ref) => ({
    id, nome, tipo: 'produto', sabor_id, porcao, rendimento, validade_dias: 5, preco_venda, preco_sugerido: '', custo_ref, tempo_preparo: '', markup: '', preco_ifood: '', ingredientes: lista(emb), ativo: true,
  });
  const receitas = [
    S('demo-sab-trad', 'Pudim tradicional', []),
    S('demo-sab-ninho', 'Pudim ninho com Nutella', [['demo-ins-nutella', 140]]),
    T('demo-rec-mini', 'demo-sab-trad', 'Pudim tradicional 150', '150', 6, 12, [['demo-ins-emb150', 6]], 2.6),
    T('demo-rec-trad', 'demo-sab-trad', 'Pudim tradicional 1100', '1100', 1, 65, [['demo-ins-emb1100', 1]], 22),
    T('demo-rec-ninho', 'demo-sab-ninho', 'Pudim ninho com Nutella 1100', '1100', 1, 85, [['demo-ins-emb1100', 1]], 26),
  ];
  const estoque = [];
  const M = (dias, receita_id, tipo, quantidade, extra = {}) => {
    const data = addDays(hoje, -dias);
    estoque.push({ id: `demo-e${estoque.length + 1}`, data, receita_id, tipo, quantidade, custo_unitario: '', preco_unitario: '', validade: '', lancamento_id: '', obs: '', criado_em: `${data}T1${estoque.length % 10}:00:00Z`, ...extra });
  };
  const P = (dias, id, qtd, custo) => M(dias, id, 'producao', qtd, { custo_unitario: custo, validade: addDays(hoje, -dias + 5) });
  P(12, 'demo-rec-mini', 16, 2.75); P(12, 'demo-rec-trad', 3, 22.4); P(9, 'demo-rec-ninho', 1, 27.9);
  M(10, 'demo-rec-mini', 'venda', 10, { preco_unitario: 12 }); M(9, 'demo-rec-trad', 'venda', 2, { preco_unitario: 65 });
  M(6, 'demo-rec-mini', 'perda', 4, { obs: 'vencido' });
  P(5, 'demo-rec-mini', 16, 2.81); P(4, 'demo-rec-ninho', 2, 27.9); P(3, 'demo-rec-trad', 2, 22.4);
  M(3, 'demo-rec-mini', 'venda', 9, { preco_unitario: 12 }); M(2, 'demo-rec-ninho', 'venda', 1, { preco_unitario: 85 });
  M(1, 'demo-rec-mini', 'venda', 3, { preco_unitario: 12 });
  return { insumos, receitas, estoque };
}

// Mão de obra e despesas fixas de exemplo (a Base Cadastros da planilha).
export function demoCustosPudim() {
  return {
    salario: 1500, decimo: 125, dias: 20, horas: 6,
    despesas: [{ nome: 'Gás', valor: 120, divisor: 1 }, { nome: 'Energia', valor: 300, divisor: 3 }, { nome: 'MEI e contador', valor: 72, divisor: 1 }],
  };
}

// Itens de notas de mercado: produtos com ritmos diferentes, em dois mercados.
function demoItens(hoje) {
  const itens = [];
  const produtos = [
    // produto, descrição, marca, tamanho, unidade, a cada N dias, preço, origem, categoria
    ['Café', 'Café Pilão 500g', 'Pilão', 500, 'g', 12, 18.9, 'Casa', 'cat-mercado'],
    ['Arroz', 'Arroz Tio João 5kg', 'Tio João', 5, 'kg', 28, 31.9, 'Casa', 'cat-mercado'],
    ['Detergente', 'Detergente Ypê 500ml', 'Ypê', 500, 'ml', 9, 2.79, 'Casa', 'cat-mercado'],
    ['Papel higiênico', 'Papel higiênico Neve 12 rolos', 'Neve', '', '', 20, 22.9, 'Casa', 'cat-mercado'],
    ['Banana prata', 'Banana prata', '', '', '', 7, 7.5, 'Casa', 'cat-mercado'],
    ['Leite', 'Leite integral Italac 1l', 'Italac', 1, 'l', 6, 5.29, 'Casa', 'cat-mercado'],
    ['Leite condensado', 'Leite condensado Moça 395g', 'Moça', 395, 'g', 7, 6.89, 'Pudim', 'cat-ingrediente'],
    ['Creme de leite', 'Creme de leite Nestlé 200g', 'Nestlé', 200, 'g', 7, 3.49, 'Pudim', 'cat-ingrediente'],
  ];
  let n = 0;
  produtos.forEach(([produto, descricao, marca, tamanho, tamanho_unidade, passo, preco, origem, categoria_id], k) => {
    for (let d = 2 + (k % 4); d < 50; d += passo) {
      const mercado = (d + k) % 3 === 0 ? 'Atacadão' : 'Assaí';
      const quantidade = origem === 'Pudim' ? 6 : 1;
      const unit = Math.round(preco * (mercado === 'Atacadão' ? 0.94 : 1) * (1 - d * 0.001) * 100) / 100;
      itens.push({
        id: `demo-i${++n}`, data: addDays(hoje, -d), mercado, descricao, produto, marca, tamanho, tamanho_unidade,
        quantidade, unidade: 'un', valor: Math.round(unit * quantidade * 100) / 100, preco_unitario: unit,
        origem, categoria_id, lancamento_id: '', grupo_id: '', criado_em: hoje,
      });
    }
  });
  return itens;
}
