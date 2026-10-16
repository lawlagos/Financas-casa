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
    L(d, 'transferencia', 1200, 'Saque Hotmart', 'hotmart', '', '', { conta_destino_id: 'c6' });
  }
  L(9, 'entrada', 4500, 'Salário', 'itau', 'cat-salario', 'Salario');
  L(6, 'entrada', 2000, 'Katsuhiro', 'inter', 'cat-consultoria', 'Consultoria', { previsto_id: 'demo-kat' });
  L(8, 'saida', 316, 'Internet + celular', 'itau', 'cat-internet', 'Casa');
  L(5, 'saida', 243.62, 'Mercado da semana', 'nubank', 'cat-mercado', 'Casa');
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
  return { contas, categorias: baseCategorias(), lancamentos: lancs, previstos, baixas, config: baseConfig() };
}
