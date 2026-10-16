// Gera apps-script/Inicial.gs a partir de app/core/seed.js, para as contas e categorias iniciais ficarem iguais.
import { writeFileSync } from 'node:fs';
import { baseContas, baseCategorias, baseConfig } from '../app/core/seed.js';

export function conteudoInicial() {
  const dados = { contas: baseContas(''), categorias: baseCategorias(), config: baseConfig() };
  return `// Gerado por scripts/gerar-inicial.mjs. Não edite à mão.
var DADOS_INICIAIS = ${JSON.stringify(dados, null, 2)};

// Rode esta função uma vez pelo editor do Apps Script (menu Executar) depois de colar o código.
// Cria as abas e cadastra contas, categorias e ajustes. Não apaga nada que já exista.
function configurar() {
  var hoje = Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'yyyy-MM-dd');
  Object.keys(ABAS).forEach(function (t) { aba_(t); });
  ['contas', 'categorias', 'config'].forEach(function (t) {
    if (lerTabela_(t).length) return;
    DADOS_INICIAIS[t].forEach(function (linha) {
      if (t === 'contas') linha.data_saldo_inicial = hoje;
      salvarLinha_(t, linha);
    });
  });
  var padrao = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Página1') || SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Sheet1');
  if (padrao && padrao.getLastRow() === 0) SpreadsheetApp.getActiveSpreadsheet().deleteSheet(padrao);
  return 'Pronto. Agora preencha o saldo de hoje de cada conta na aba Contas.';
}
`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  writeFileSync(new URL('../apps-script/Inicial.gs', import.meta.url), conteudoInicial());
  console.log('apps-script/Inicial.gs gerado');
}
