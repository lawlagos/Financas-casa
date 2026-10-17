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
    acrescentar_(aba_('sessoes'), 'sessoes', [[token, email, String(dados.aparelho || '').slice(0, 80), agora, agora]]);
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
    apagarSessao_(token);
    throw erro_('sessao-invalida', 'Faz tempo que você não entra. Entre de novo.');
  }
  if (emailsAutorizados_().indexOf(String(linha[1]).toLowerCase()) < 0) throw erro_('sessao-invalida', 'Este e-mail não tem mais acesso.');
  if (agora - ultimo > 3600000) {
    // Dentro do lock e procurando a linha de novo: outro aparelho pode ter entrado ou saído no meio.
    comLock_(function () {
      var r2 = linhaDoId_(sh, token);
      if (r2 > 0) sh.getRange(r2, 5).setValue(agora.toISOString());
    });
  }
  return { email: linha[1] };
}

function apagarSessao_(token) {
  return comLock_(function () {
    var sh = aba_('sessoes');
    var r = linhaDoId_(sh, token);
    if (r > 0) sh.deleteRow(r);
    return r > 0;
  });
}

// Sair deste aparelho: a sessão deixa de valer no servidor também.
function sair_(token) {
  if (token) apagarSessao_(token);
  return true;
}
