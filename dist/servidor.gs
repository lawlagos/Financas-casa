// Finanças da Casa: servidor completo. Gerado por scripts/gerar-servidor.mjs a partir de apps-script/.
// Cole tudo no arquivo Código.gs do Apps Script (apagando o que estiver lá).

// ===== Esquema.gs =====
// Mesmo esquema de app/core/schema.js (um teste garante que os dois batem).
var ESQUEMA = {
  contas: ['id', 'nome', 'dono', 'grupo', 'saldo_inicial', 'data_saldo_inicial', 'cor', 'ativa'],
  categorias: ['id', 'nome', 'tipo', 'origem_padrao', 'ativa'],
  lancamentos: [
    'id', 'data', 'tipo', 'valor', 'descricao', 'conta_id', 'conta_destino_id', 'categoria_id', 'origem', 'canal',
    'id_externo', 'foto_id', 'grupo_id', 'previsto_id', 'criado_por', 'criado_em', 'editado_em'
  ],
  previstos: [
    'id', 'descricao', 'natureza', 'tipo', 'valor', 'conta_id', 'conta_destino_id', 'categoria_id', 'origem', 'recorrencia',
    'a_cada', 'mes_ancora', 'dia_inicio', 'dia_fim', 'dia_semana', 'data_unica', 'inicio', 'parcelas_total',
    'parcela_no_inicio', 'confianca', 'renovacao', 'pessoa', 'ativo'
  ],
  baixas: ['id', 'previsto_id', 'ref', 'status', 'lancamento_id', 'nova_data', 'criado_em'],
  config: ['id', 'valor']
};

// Nome da aba na planilha para cada tabela.
var ABAS = {
  contas: 'Contas',
  categorias: 'Categorias',
  lancamentos: 'Lançamentos',
  previstos: 'Previstos',
  baixas: 'Baixas',
  config: 'Config',
  sessoes: 'Sessões'
};

var COLUNAS_SESSOES = ['token', 'email', 'aparelho', 'criada_em', 'ultimo_uso'];

var NUMERICAS = { valor: 1, saldo_inicial: 1, a_cada: 1, mes_ancora: 1, dia_inicio: 1, dia_fim: 1, dia_semana: 1, parcelas_total: 1, parcela_no_inicio: 1 };
var BOOLEANAS = { ativa: 1, ativo: 1, renovacao: 1 };

// ===== Planilha.gs =====
// Leitura e escrita genéricas nas abas. Toda escrita passa por um lock para os dois celulares não se atropelarem.

function aba_(tabela) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var nome = ABAS[tabela];
  var colunas = tabela === 'sessoes' ? COLUNAS_SESSOES : ESQUEMA[tabela];
  var sh = ss.getSheetByName(nome);
  if (!sh) {
    sh = ss.insertSheet(nome);
    sh.getRange(1, 1, 1, colunas.length).setValues([colunas]);
    sh.setFrozenRows(1);
    // Texto puro em tudo que não é número, para datas como 2026-10-16 não virarem data do Sheets.
    for (var i = 0; i < colunas.length; i++) {
      if (!NUMERICAS[colunas[i]] && !BOOLEANAS[colunas[i]] && tabela !== 'config') {
        sh.getRange(1, i + 1, sh.getMaxRows(), 1).setNumberFormat('@');
      }
    }
  }
  return sh;
}

function colunas_(tabela) {
  return tabela === 'sessoes' ? COLUNAS_SESSOES : ESQUEMA[tabela];
}

function paraCelula_(col, v) {
  if (v === null || v === undefined) return '';
  if (BOOLEANAS[col]) return v === true || v === 'true' || v === 'TRUE';
  if (NUMERICAS[col]) return v === '' ? '' : Number(v);
  if (typeof v === 'object') return JSON.stringify(v);
  return v;
}

function daCelula_(col, v) {
  if (v instanceof Date) return Utilities.formatDate(v, 'America/Sao_Paulo', 'yyyy-MM-dd');
  if (BOOLEANAS[col]) return v === true || v === 'TRUE' || v === 'true';
  if (NUMERICAS[col]) return v === '' || v === null ? '' : Number(v);
  return v === null || v === undefined ? '' : v;
}

function lerTabela_(tabela) {
  var sh = aba_(tabela);
  var cols = colunas_(tabela);
  var n = sh.getLastRow() - 1;
  if (n < 1) return [];
  var valores = sh.getRange(2, 1, n, cols.length).getValues();
  var out = [];
  for (var r = 0; r < valores.length; r++) {
    if (valores[r][0] === '' || valores[r][0] === null) continue;
    var obj = {};
    for (var c = 0; c < cols.length; c++) obj[cols[c]] = daCelula_(cols[c], valores[r][c]);
    if (tabela === 'config' && typeof obj.valor === 'string' && obj.valor !== '' && !isNaN(Number(obj.valor))) obj.valor = Number(obj.valor);
    out.push(obj);
  }
  return out;
}

function linhaDoId_(sh, id) {
  var n = sh.getLastRow() - 1;
  if (n < 1) return -1;
  var ids = sh.getRange(2, 1, n, 1).getValues();
  for (var i = 0; i < ids.length; i++) if (String(ids[i][0]) === String(id)) return i + 2;
  return -1;
}

function comLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function salvarLinha_(tabela, linha) {
  if (!ESQUEMA[tabela]) throw erro_('tabela-invalida', 'Tabela desconhecida: ' + tabela);
  if (!linha || !linha.id) throw erro_('linha-invalida', 'A linha precisa de um id.');
  var cols = ESQUEMA[tabela];
  var valores = cols.map(function (c) { return paraCelula_(c, linha[c]); });
  return comLock_(function () {
    var sh = aba_(tabela);
    var r = linhaDoId_(sh, linha.id);
    if (r > 0) sh.getRange(r, 1, 1, cols.length).setValues([valores]);
    else sh.getRange(sh.getLastRow() + 1, 1, 1, cols.length).setValues([valores]);
    return linha;
  });
}

function apagarLinha_(tabela, id) {
  if (!ESQUEMA[tabela]) throw erro_('tabela-invalida', 'Tabela desconhecida: ' + tabela);
  return comLock_(function () {
    var sh = aba_(tabela);
    var r = linhaDoId_(sh, id);
    if (r > 0) sh.deleteRow(r);
    return r > 0;
  });
}

// ===== Acesso.gs =====
// Login: o app manda o token do "Entrar com Google"; se o e-mail estiver autorizado, devolvemos uma sessão própria.
// Propriedades do script (Configurações do projeto > Propriedades do script):
//   GOOGLE_CLIENT_ID    = o Client ID OAuth do app
//   EMAILS_AUTORIZADOS  = email1@gmail.com,email2@gmail.com

var DIAS_SESSAO = 90;

function propriedade_(nome) {
  var v = PropertiesService.getScriptProperties().getProperty(nome);
  if (!v) throw erro_('configuracao', 'Falta configurar a propriedade ' + nome + ' no Apps Script.');
  return v;
}

function emailsAutorizados_() {
  return propriedade_('EMAILS_AUTORIZADOS').split(',').map(function (e) { return e.trim().toLowerCase(); }).filter(String);
}

function entrar_(dados) {
  if (!dados || !dados.idToken) throw erro_('login', 'Login sem token.');
  var resp = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(dados.idToken), { muteHttpExceptions: true });
  if (resp.getResponseCode() !== 200) throw erro_('login', 'O Google não confirmou o login. Tente entrar de novo.');
  var info = JSON.parse(resp.getContentText());
  if (info.aud !== propriedade_('GOOGLE_CLIENT_ID')) throw erro_('login', 'Login de outro aplicativo.');
  if (String(info.email_verified) !== 'true') throw erro_('login', 'E-mail do Google não verificado.');
  var email = String(info.email).toLowerCase();
  if (emailsAutorizados_().indexOf(email) < 0) throw erro_('nao-autorizado', 'O e-mail ' + email + ' não tem acesso. Peça para incluir na planilha.');
  var token = Utilities.getUuid() + Utilities.getUuid().replace(/-/g, '');
  var agora = new Date().toISOString();
  comLock_(function () {
    var sh = aba_('sessoes');
    sh.getRange(sh.getLastRow() + 1, 1, 1, COLUNAS_SESSOES.length).setValues([[token, email, String(dados.aparelho || '').slice(0, 80), agora, agora]]);
  });
  return { sessao: token, email: email };
}

// Confere a sessão e renova o último uso (no máximo uma escrita por hora).
function validarSessao_(token) {
  if (!token) throw erro_('sessao-invalida', 'Entre de novo.');
  var sh = aba_('sessoes');
  var r = linhaDoId_(sh, token);
  if (r < 0) throw erro_('sessao-invalida', 'Este aparelho foi desconectado. Entre de novo.');
  var linha = sh.getRange(r, 1, 1, COLUNAS_SESSOES.length).getValues()[0];
  var ultimo = new Date(linha[4]);
  var agora = new Date();
  if (agora - ultimo > DIAS_SESSAO * 86400000) {
    sh.deleteRow(r);
    throw erro_('sessao-invalida', 'Faz tempo que você não entra. Entre de novo.');
  }
  if (emailsAutorizados_().indexOf(String(linha[1]).toLowerCase()) < 0) throw erro_('sessao-invalida', 'Este e-mail não tem mais acesso.');
  if (agora - ultimo > 3600000) sh.getRange(r, 5).setValue(agora.toISOString());
  return { email: linha[1] };
}

// ===== Codigo.gs =====
// Ponto de entrada do Web App. O app manda POST com {acao, sessao, dados}.

function doPost(e) {
  var resposta;
  try {
    var pedido = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    resposta = { ok: true, dados: tratar_(pedido) };
  } catch (err) {
    resposta = { ok: false, codigo: err.codigo || 'erro', erro: err.codigo ? err.message : 'Erro na planilha: ' + err.message };
  }
  return ContentService.createTextOutput(JSON.stringify(resposta)).setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  return ContentService.createTextOutput(JSON.stringify({ ok: true, dados: 'Finanças da Casa no ar' })).setMimeType(ContentService.MimeType.JSON);
}

function tratar_(pedido) {
  if (pedido.acao === 'entrar') return entrar_(pedido.dados);
  var usuario = validarSessao_(pedido.sessao);
  var d = pedido.dados || {};
  switch (pedido.acao) {
    case 'carregar':
      var out = {};
      Object.keys(ESQUEMA).forEach(function (t) { out[t] = lerTabela_(t); });
      out._usuario = usuario;
      return out;
    case 'salvar':
      return salvarLinha_(d.tabela, d.linha);
    case 'apagar':
      return apagarLinha_(d.tabela, d.id);
    default:
      throw erro_('acao-invalida', 'Ação desconhecida: ' + pedido.acao);
  }
}

function erro_(codigo, mensagem) {
  var e = new Error(mensagem);
  e.codigo = codigo;
  return e;
}

// ===== Inicial.gs =====
// Gerado por scripts/gerar-inicial.mjs. Não edite à mão.
var DADOS_INICIAIS = {
  "contas": [
    {
      "id": "c6",
      "nome": "C6",
      "dono": "Marido",
      "grupo": "Empresa",
      "saldo_inicial": 0,
      "data_saldo_inicial": "",
      "cor": "#2b2b2b",
      "ativa": true
    },
    {
      "id": "inter",
      "nome": "Inter",
      "dono": "Marido",
      "grupo": "Empresa",
      "saldo_inicial": 0,
      "data_saldo_inicial": "",
      "cor": "#ff7a00",
      "ativa": true
    },
    {
      "id": "mp",
      "nome": "Mercado Pago",
      "dono": "Marido",
      "grupo": "Empresa",
      "saldo_inicial": 0,
      "data_saldo_inicial": "",
      "cor": "#009ee3",
      "ativa": true
    },
    {
      "id": "hotmart",
      "nome": "Hotmart",
      "dono": "Marido",
      "grupo": "Empresa",
      "saldo_inicial": 0,
      "data_saldo_inicial": "",
      "cor": "#f04e23",
      "ativa": true
    },
    {
      "id": "itau",
      "nome": "Itaú",
      "dono": "Marido",
      "grupo": "Pessoal",
      "saldo_inicial": 0,
      "data_saldo_inicial": "",
      "cor": "#ec7000",
      "ativa": true
    },
    {
      "id": "nubank",
      "nome": "Nubank",
      "dono": "Marido",
      "grupo": "Pessoal",
      "saldo_inicial": 0,
      "data_saldo_inicial": "",
      "cor": "#820ad1",
      "ativa": true
    },
    {
      "id": "bradesco",
      "nome": "Bradesco",
      "dono": "Marido",
      "grupo": "Pessoal",
      "saldo_inicial": 0,
      "data_saldo_inicial": "",
      "cor": "#cc092f",
      "ativa": true
    },
    {
      "id": "nubank-pf",
      "nome": "Nubank PF",
      "dono": "Esposa",
      "grupo": "Pessoal",
      "saldo_inicial": 0,
      "data_saldo_inicial": "",
      "cor": "#a35bd8",
      "ativa": true
    },
    {
      "id": "nubank-pj",
      "nome": "Nubank PJ",
      "dono": "Esposa",
      "grupo": "Pudim",
      "saldo_inicial": 0,
      "data_saldo_inicial": "",
      "cor": "#5d0a9c",
      "ativa": true
    }
  ],
  "categorias": [
    {
      "id": "cat-salario",
      "nome": "Salário",
      "tipo": "entrada",
      "origem_padrao": "Salario",
      "ativa": true
    },
    {
      "id": "cat-consultoria",
      "nome": "Consultoria",
      "tipo": "entrada",
      "origem_padrao": "Consultoria",
      "ativa": true
    },
    {
      "id": "cat-youtube",
      "nome": "YouTube (AdSense)",
      "tipo": "entrada",
      "origem_padrao": "YouTube",
      "ativa": true
    },
    {
      "id": "cat-venda-pudim",
      "nome": "Venda de pudim",
      "tipo": "entrada",
      "origem_padrao": "Pudim",
      "ativa": true
    },
    {
      "id": "cat-venda-hotmart",
      "nome": "Venda Hotmart",
      "tipo": "entrada",
      "origem_padrao": "Hotmart",
      "ativa": true
    },
    {
      "id": "cat-outras-entradas",
      "nome": "Outras entradas",
      "tipo": "entrada",
      "origem_padrao": "Casa",
      "ativa": true
    },
    {
      "id": "cat-mercado",
      "nome": "Mercado",
      "tipo": "saida",
      "origem_padrao": "Casa",
      "ativa": true
    },
    {
      "id": "cat-ingrediente",
      "nome": "Ingrediente",
      "tipo": "saida",
      "origem_padrao": "Pudim",
      "ativa": true
    },
    {
      "id": "cat-embalagem",
      "nome": "Embalagem",
      "tipo": "saida",
      "origem_padrao": "Pudim",
      "ativa": true
    },
    {
      "id": "cat-gas",
      "nome": "Gás",
      "tipo": "saida",
      "origem_padrao": "Casa",
      "ativa": true
    },
    {
      "id": "cat-anuncio",
      "nome": "Anúncio Meta",
      "tipo": "saida",
      "origem_padrao": "Hotmart",
      "ativa": true
    },
    {
      "id": "cat-taxa-hotmart",
      "nome": "Taxa Hotmart",
      "tipo": "saida",
      "origem_padrao": "Hotmart",
      "ativa": true
    },
    {
      "id": "cat-aluguel",
      "nome": "Aluguel",
      "tipo": "saida",
      "origem_padrao": "Casa",
      "ativa": true
    },
    {
      "id": "cat-luz",
      "nome": "Luz",
      "tipo": "saida",
      "origem_padrao": "Casa",
      "ativa": true
    },
    {
      "id": "cat-agua",
      "nome": "Água",
      "tipo": "saida",
      "origem_padrao": "Casa",
      "ativa": true
    },
    {
      "id": "cat-internet",
      "nome": "Internet e celular",
      "tipo": "saida",
      "origem_padrao": "Casa",
      "ativa": true
    },
    {
      "id": "cat-emprestimo",
      "nome": "Empréstimo e parcelas",
      "tipo": "saida",
      "origem_padrao": "Casa",
      "ativa": true
    },
    {
      "id": "cat-transporte",
      "nome": "Transporte",
      "tipo": "saida",
      "origem_padrao": "Casa",
      "ativa": true
    },
    {
      "id": "cat-saude",
      "nome": "Saúde",
      "tipo": "saida",
      "origem_padrao": "Casa",
      "ativa": true
    },
    {
      "id": "cat-lazer",
      "nome": "Lazer",
      "tipo": "saida",
      "origem_padrao": "Casa",
      "ativa": true
    },
    {
      "id": "cat-mei",
      "nome": "MEI e contador",
      "tipo": "saida",
      "origem_padrao": "Pudim",
      "ativa": true
    },
    {
      "id": "cat-dizimo",
      "nome": "Dízimo",
      "tipo": "saida",
      "origem_padrao": "Casa",
      "ativa": true
    },
    {
      "id": "cat-outros",
      "nome": "Outros",
      "tipo": "saida",
      "origem_padrao": "Casa",
      "ativa": true
    }
  ],
  "config": [
    {
      "id": "gasto_diario",
      "valor": 75
    },
    {
      "id": "reserva_minima",
      "valor": 0
    }
  ]
};

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
