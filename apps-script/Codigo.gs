// Ponto de entrada do Web App. O app manda POST com {acao, sessao, dados}.

// Mude a cada atualização do servidor: abrir o endereço /exec no navegador mostra este número.
var VERSAO_SERVIDOR = '2026-10-18.2';

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

function doGet(e) {
  // O celular que recebeu um aviso busca o texto dele aqui.
  if (e && e.parameter && e.parameter.aviso) {
    return ContentService.createTextOutput(JSON.stringify(textoDoAviso_(String(e.parameter.aviso)))).setMimeType(ContentService.MimeType.JSON);
  }
  var props = PropertiesService.getScriptProperties();
  var info = {
    app: 'Finanças da Casa',
    versao: VERSAO_SERVIDOR,
    leitura_de_prints: props.getProperty('GEMINI_API_KEY') ? 'chave do Gemini configurada' : 'FALTA a propriedade GEMINI_API_KEY',
    modelo: props.getProperty('GEMINI_MODELO') || props.getProperty('GEMINI_MODELO_AUTO') || 'escolhido sozinho no primeiro print',
    avisos: inscricoes_().length + ' celular(es) com avisos ligados'
  };
  return ContentService.createTextOutput(JSON.stringify(info, null, 2)).setMimeType(ContentService.MimeType.JSON);
}

function tratar_(pedido) {
  if (pedido.acao === 'entrar') return entrar_(pedido.dados);
  if (pedido.acao === 'sair') return sair_(pedido.sessao);
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
    case 'avisos':
      return estadoAvisos_(d, usuario);
    case 'inscreverAviso':
      return inscreverAviso_(d, usuario);
    case 'desinscreverAviso':
      return desinscreverAviso_(d, usuario);
    case 'testarAviso':
      return testarAviso_(d, usuario);
    default:
      throw erro_('acao-invalida', 'Ação desconhecida: ' + pedido.acao);
  }
}

function erro_(codigo, mensagem) {
  var e = new Error(mensagem);
  e.codigo = codigo;
  return e;
}
