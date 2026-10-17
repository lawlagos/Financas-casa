// Finanças da Casa: servidor completo. Gerado por scripts/gerar-servidor.mjs a partir de apps-script/.
// Cole tudo no arquivo Código.gs do Apps Script (apagando o que estiver lá).

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
  config: ['id', 'valor'],
  itens: ['id', 'data', 'mercado', 'descricao', 'quantidade', 'unidade', 'valor', 'preco_unitario', 'origem', 'lancamento_id', 'grupo_id', 'criado_em', 'categoria_id']
};

// Nome da aba na planilha para cada tabela.
var ABAS = {
  contas: 'Contas',
  categorias: 'Categorias',
  lancamentos: 'Lançamentos',
  previstos: 'Previstos',
  baixas: 'Baixas',
  config: 'Config',
  itens: 'Itens',
  sessoes: 'Sessões'
};

var COLUNAS_SESSOES = ['token', 'email', 'aparelho', 'criada_em', 'ultimo_uso'];

var NUMERICAS = { quantidade: 1, preco_unitario: 1, valor: 1, saldo_inicial: 1, a_cada: 1, mes_ancora: 1, dia_inicio: 1, dia_fim: 1, dia_semana: 1, parcelas_total: 1, parcela_no_inicio: 1 };
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
  // Colunas novas entram sempre no fim: se a aba é de uma versão anterior, completa o cabeçalho.
  if (sh.getLastColumn() < colunas.length) {
    sh.getRange(1, 1, 1, colunas.length).setValues([colunas]);
    for (var j = sh.getLastColumn(); j < colunas.length; j++) {
      if (!NUMERICAS[colunas[j]] && !BOOLEANAS[colunas[j]]) sh.getRange(1, j + 1, sh.getMaxRows(), 1).setNumberFormat('@');
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

// Várias linhas novas de uma vez (ex.: itens de uma nota), num único acesso à planilha.
function salvarVarias_(tabela, linhas) {
  if (!ESQUEMA[tabela]) throw erro_('tabela-invalida', 'Tabela desconhecida: ' + tabela);
  if (!linhas || !linhas.length) return [];
  var cols = ESQUEMA[tabela];
  var valores = linhas.map(function (linha) {
    if (!linha || !linha.id) throw erro_('linha-invalida', 'Toda linha precisa de um id.');
    return cols.map(function (c) { return paraCelula_(c, linha[c]); });
  });
  return comLock_(function () {
    var sh = aba_(tabela);
    sh.getRange(sh.getLastRow() + 1, 1, valores.length, cols.length).setValues(valores);
    return linhas;
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

// ===== Leitura.gs =====
// Leitura de prints e fotos com o Gemini. A chave fica só aqui, nas propriedades do script:
//   GEMINI_API_KEY  = chave criada em aistudio.google.com/apikey
//   GEMINI_MODELO   = (opcional) nome do modelo; padrão abaixo

var MODELO_PADRAO = 'gemini-2.5-flash';

function interpretar_(dados) {
  if (!dados || !dados.imagem) throw erro_('leitura', 'Nenhuma imagem recebida.');
  var chave = propriedade_('GEMINI_API_KEY');
  var modelo = PropertiesService.getScriptProperties().getProperty('GEMINI_MODELO') || MODELO_PADRAO;
  var corpo = {
    contents: [{
      role: 'user',
      parts: [
        { text: instrucoesLeitura_(dados.contexto || {}) },
        { inline_data: { mime_type: dados.mime || 'image/jpeg', data: dados.imagem } }
      ]
    }],
    generationConfig: { responseMimeType: 'application/json', temperature: 0.1 }
  };
  var resp = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models/' + modelo + ':generateContent', {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-goog-api-key': chave },
    payload: JSON.stringify(corpo),
    muteHttpExceptions: true
  });
  var codigo = resp.getResponseCode();
  if (codigo === 429) throw erro_('ia-limite', 'O limite gratuito do Gemini acabou por agora. Tente de novo em alguns minutos ou lance pelo formulário.');
  if (codigo === 404) throw erro_('ia-modelo', 'O modelo ' + modelo + ' não existe mais. Troque a propriedade GEMINI_MODELO no Apps Script.');
  if (codigo === 400 || codigo === 403) throw erro_('ia-chave', 'O Gemini recusou a chave. Confira a propriedade GEMINI_API_KEY no Apps Script.');
  if (codigo !== 200) throw erro_('ia', 'O Gemini não respondeu (erro ' + codigo + '). Tente de novo.');
  var json = JSON.parse(resp.getContentText());
  var texto = json.candidates && json.candidates[0] && json.candidates[0].content && json.candidates[0].content.parts &&
    json.candidates[0].content.parts.map(function (p) { return p.text || ''; }).join('');
  if (!texto) throw erro_('ia', 'O Gemini não conseguiu ler a imagem. Tente um print mais nítido.');
  try {
    return JSON.parse(texto.replace(/^```(json)?/, '').replace(/```$/, ''));
  } catch (e) {
    throw erro_('ia', 'A resposta do Gemini veio num formato inesperado. Tente de novo.');
  }
}

function instrucoesLeitura_(ctx) {
  return [
    'Você lê prints e fotos de comprovantes, notas fiscais e extratos de um casal brasileiro e devolve lançamentos financeiros em JSON.',
    'Hoje é ' + (ctx.hoje || '') + '. Valores em reais, positivos, com ponto decimal. Datas no formato AAAA-MM-DD.',
    '',
    'Contas do casal (use o id; identifique pelo banco, logotipo ou nome no print; se não der, use null):',
    JSON.stringify(ctx.contas || []),
    'Categorias (use o id):',
    JSON.stringify(ctx.categorias || []),
    'Origens possíveis: Casa, Pudim (negócio de pudins da esposa: ingredientes, embalagens), Hotmart (negócio digital do marido: anúncios, taxas, vendas),',
    'Salario, Consultoria, YouTube. Na dúvida entre Casa e Pudim, use null e explique em "duvida".',
    'Lançamentos recentes do casal, para seguir o mesmo jeito de classificar:',
    JSON.stringify(ctx.exemplos || []),
    '',
    'Responda SOMENTE com este JSON:',
    '{"tipo_documento":"comprovante|nota_mercado|extrato|outro","estabelecimento":string|null,"data":"AAAA-MM-DD"|null,"total":number|null,',
    ' "lancamentos":[{"tipo":"entrada|saida|transferencia","valor":number,"data":"AAAA-MM-DD"|null,"descricao":string,',
    '   "conta_id":string|null,"conta_destino_id":string|null,"categoria_id":string|null,"origem":string|null,"confianca":number,"duvida":string|null}],',
    ' "itens":[{"descricao":string,"quantidade":number,"unidade":"un"|"kg"|"g"|"l"|"ml","valor_total":number,"categoria_id":string|null,"origem":"Pudim"|"Casa"|null,"confianca":number,"duvida":string|null}]}',
    '',
    'Regras:',
    '- Comprovante de Pix, TED, boleto ou cartão: um item em "lancamentos". Pix enviado = saida; recebido = entrada.',
    '- Transferência entre duas contas da lista acima = "transferencia" com conta_id (origem do dinheiro) e conta_destino_id.',
    '- Nota ou cupom de mercado: preencha "itens" (um por produto, valor_total já com quantidade e descontos) e deixe "lancamentos" vazio.',
    '  "descricao" do item: escreva por extenso e legível (ex.: "LT COND MOCA 395G" vira "Leite condensado Moça 395g"); "unidade" como impressa (KG, UN...).',
    '  Linhas "Desconto sobre item" ou descontos no fim da nota: desconte do item correspondente; "total" é o VALOR A PAGAR, já com descontos.',
    '  Se a foto tiver mais de uma nota, junte os itens de todas, some os totais em "total" e liste os mercados em "estabelecimento" (ex.: "Swift + Hortifruti").',
    '  Foto torta, amassada ou com dedo na frente: leia o que der; item ilegível vai com valor_total null e "duvida".',
    '  Marque origem Pudim para ingredientes típicos de pudim e confeitaria (leite condensado, creme de leite, ovos, açúcar, leite, embalagens),',
    '  Casa para o resto; use null quando puder ser os dois. Em "categoria_id" escolha a categoria de saída que melhor descreve o item',
    '  (ex.: limpeza, construção, mercado), seguindo como o casal já classifica; null se nenhuma servir.',
    '- Extrato com vários movimentos: um item em "lancamentos" para cada movimento.',
    '- "confianca" de 0 a 1. Use "duvida" para dizer em português curto o que não deu para ler ou decidir.',
    '- Não invente valores: se não estiver legível, use null e explique em "duvida".'
  ].join('\n');
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
    case 'salvarVarias':
      return salvarVarias_(d.tabela, d.linhas);
    case 'interpretar':
      return interpretar_(d);
    default:
      throw erro_('acao-invalida', 'Ação desconhecida: ' + pedido.acao);
  }
}

function erro_(codigo, mensagem) {
  var e = new Error(mensagem);
  e.codigo = codigo;
  return e;
}
