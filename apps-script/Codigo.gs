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
