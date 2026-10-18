// Avisos no celular (Web Push): a cada 2 dias lembra das tarefas da casa pendentes e de lançar entradas e saídas.
//
// O iPhone recebe notificação de um site instalado na tela de início (iOS 16.4+). O aviso vai sem conteúdo
// (o Apps Script não tem a criptografia do conteúdo); quando chega, o celular busca o texto aqui em doGet(?aviso=id).
// A assinatura do servidor (VAPID, ES256) é feita aqui mesmo, com a curva P-256 em BigInt.
//
// Para os avisos saírem sozinhos: no editor do Apps Script, Acionadores > Adicionar acionador >
// função "avisosDaCasa", baseado no tempo, todo dia (ex.: entre 9h e 10h).

var DIAS_ENTRE_AVISOS = 2;
var URL_DO_APP = 'https://lawlagos.github.io/Financas-casa/';

// ---------- Curva P-256 ----------
var P256_ = null;
function p256_() {
  if (P256_) return P256_;
  var h = function (x) { return BigInt('0x' + x); };
  P256_ = {
    p: h('ffffffff00000001000000000000000000000000ffffffffffffffffffffffff'),
    n: h('ffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551'),
    gx: h('6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296'),
    gy: h('4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5'),
    zero: BigInt(0), um: BigInt(1), dois: BigInt(2), tres: BigInt(3)
  };
  return P256_;
}

function mod_(a, m) {
  var r = a % m;
  return r < P256_.zero ? r + m : r;
}

function inverso_(a, m) {
  var c = p256_();
  var t = c.zero, novoT = c.um, r = m, novoR = mod_(a, m);
  while (novoR !== c.zero) {
    var q = r / novoR;
    var tt = t - q * novoT; t = novoT; novoT = tt;
    var rr = r - q * novoR; r = novoR; novoR = rr;
  }
  return mod_(t, m);
}

// Pontos em coordenadas afins; null é o ponto no infinito.
function somar_(P, Q) {
  var c = p256_();
  if (!P) return Q;
  if (!Q) return P;
  var l;
  if (P[0] === Q[0]) {
    if (mod_(P[1] + Q[1], c.p) === c.zero) return null;
    l = mod_(c.tres * P[0] * P[0] - c.tres, c.p) * inverso_(c.dois * P[1], c.p) % c.p;
  } else {
    l = mod_(Q[1] - P[1], c.p) * inverso_(Q[0] - P[0], c.p) % c.p;
  }
  var x = mod_(l * l - P[0] - Q[0], c.p);
  return [x, mod_(l * (P[0] - x) - P[1], c.p)];
}

function multiplicar_(k, P) {
  var R = null;
  var A = P;
  while (k > P256_.zero) {
    if (k & P256_.um) R = somar_(R, A);
    A = somar_(A, A);
    k = k >> P256_.um;
  }
  return R;
}

// ---------- Bytes ----------
function semSinal_(bytes) { return bytes.map(function (b) { return b < 0 ? b + 256 : b; }); }
function comSinal_(bytes) { return bytes.map(function (b) { return b > 127 ? b - 256 : b; }); }
function bytesDeTexto_(t) { return semSinal_(Utilities.newBlob(t).getBytes()); }
function hexDeBytes_(bytes) { return bytes.map(function (b) { return (b < 16 ? '0' : '') + b.toString(16); }).join(''); }
function bigDeBytes_(bytes) { return BigInt('0x' + (hexDeBytes_(bytes) || '0')); }
function bytesDeBig_(n, tamanho) {
  var h = n.toString(16);
  while (h.length < tamanho * 2) h = '0' + h;
  var out = [];
  for (var i = 0; i < h.length; i += 2) out.push(parseInt(h.substr(i, 2), 16));
  return out;
}
function b64url_(bytes) { return Utilities.base64EncodeWebSafe(comSinal_(bytes)).replace(/=+$/, ''); }
function sha256_(bytes) { return semSinal_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, comSinal_(bytes))); }
function hmac_(bytes, chave) { return semSinal_(Utilities.computeHmacSha256Signature(comSinal_(bytes), comSinal_(chave))); }

// ---------- ECDSA P-256 (ES256) ----------
function assinarEs256_(mensagem, d) {
  var c = p256_();
  var e = bigDeBytes_(sha256_(bytesDeTexto_(mensagem)));
  var chave = bytesDeBig_(d, 32);
  for (var contador = 0; contador < 100; contador++) {
    // Nonce determinístico e secreto: HMAC da chave privada sobre a mensagem (dispensa sorteio confiável).
    var k = mod_(bigDeBytes_(hmac_(bytesDeBig_(e, 32).concat([contador]), chave)), c.n);
    if (k === c.zero) continue;
    var R = multiplicar_(k, [c.gx, c.gy]);
    var r = mod_(R[0], c.n);
    if (r === c.zero) continue;
    var s = mod_(inverso_(k, c.n) * mod_(e + r * d, c.n), c.n);
    if (s === c.zero) continue;
    return bytesDeBig_(r, 32).concat(bytesDeBig_(s, 32));
  }
  throw new Error('Não consegui assinar o aviso.');
}

// Chaves do servidor (VAPID): criadas na primeira vez e guardadas nas propriedades do script.
function chavesVapid_() {
  var props = PropertiesService.getScriptProperties();
  var c = p256_();
  var privada = props.getProperty('VAPID_PRIVADA');
  if (!privada) {
    var semente = sha256_(bytesDeTexto_(Utilities.getUuid() + Utilities.getUuid() + Utilities.getUuid() + new Date().getTime()));
    var d = mod_(bigDeBytes_(semente), c.n - c.um) + c.um;
    var Q = multiplicar_(d, [c.gx, c.gy]);
    privada = d.toString(16);
    props.setProperty('VAPID_PRIVADA', privada);
    props.setProperty('VAPID_PUBLICA', b64url_([4].concat(bytesDeBig_(Q[0], 32), bytesDeBig_(Q[1], 32))));
  }
  return { d: BigInt('0x' + privada), publica: props.getProperty('VAPID_PUBLICA') };
}

function jwtVapid_(audiencia, chaves) {
  var cab = b64url_(bytesDeTexto_(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  var corpo = b64url_(bytesDeTexto_(JSON.stringify({ aud: audiencia, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: URL_DO_APP })));
  var assinado = cab + '.' + corpo;
  return assinado + '.' + b64url_(assinarEs256_(assinado, chaves.d));
}

// ---------- Inscrições (cada celular que ativou os avisos) ----------
function idInscricao_(endpoint) { return hexDeBytes_(sha256_(bytesDeTexto_(endpoint))).slice(0, 32); }

function inscricoes_() {
  try {
    return JSON.parse(PropertiesService.getScriptProperties().getProperty('AVISOS_INSCRICOES') || '[]');
  } catch (e) {
    return [];
  }
}
function guardarInscricoes_(lista) { PropertiesService.getScriptProperties().setProperty('AVISOS_INSCRICOES', JSON.stringify(lista)); }

function estadoAvisos_(d, usuario) {
  var lista = inscricoes_();
  return {
    chavePublica: chavesVapid_().publica,
    inscrito: !!(d && d.endpoint && lista.some(function (x) { return x.endpoint === d.endpoint; })),
    aparelhos: lista.length,
    ultimo: JSON.parse(PropertiesService.getScriptProperties().getProperty('AVISO_ULTIMO') || 'null')
  };
}

function inscreverAviso_(d, usuario) {
  if (!d || !/^https:\/\//.test(d.endpoint || '')) throw erro_('aviso-invalido', 'Inscrição de aviso inválida.');
  var lista = inscricoes_().filter(function (x) { return x.endpoint !== d.endpoint; });
  lista.push({ id: idInscricao_(d.endpoint), endpoint: d.endpoint, quem: usuario, em: new Date().toISOString() });
  guardarInscricoes_(lista);
  return estadoAvisos_(d, usuario);
}

function desinscreverAviso_(d, usuario) {
  guardarInscricoes_(inscricoes_().filter(function (x) { return x.endpoint !== (d && d.endpoint); }));
  return estadoAvisos_(d, usuario);
}

// ---------- Mandar ----------
function mandarPush_(inscricao, chaves) {
  var aud = (inscricao.endpoint.match(/^https:\/\/[^/]+/) || [''])[0];
  var r = UrlFetchApp.fetch(inscricao.endpoint, {
    method: 'post',
    headers: { TTL: '86400', Urgency: 'normal', Authorization: 'vapid t=' + jwtVapid_(aud, chaves) + ', k=' + chaves.publica },
    payload: '',
    muteHttpExceptions: true
  });
  return r.getResponseCode();
}

// Guarda o texto do aviso (o celular busca quando a notificação chega) e avisa todos os aparelhos.
// Aparelho que desinstalou o app (404/410) sai da lista.
function avisarTodos_(aviso) {
  var props = PropertiesService.getScriptProperties();
  aviso.em = new Date().toISOString();
  props.setProperty('AVISO_ULTIMO', JSON.stringify(aviso));
  var chaves = chavesVapid_();
  var ficam = [];
  var enviados = 0;
  inscricoes_().forEach(function (x) {
    var codigo = mandarPush_(x, chaves);
    if (codigo === 404 || codigo === 410) return;
    if (codigo >= 200 && codigo < 300) enviados++;
    ficam.push(x);
  });
  guardarInscricoes_(ficam);
  return { enviados: enviados, aparelhos: ficam.length };
}

function testarAviso_(d, usuario) {
  return avisarTodos_({ titulo: 'Finanças da Casa', texto: 'Os avisos estão funcionando neste celular.', url: '#/inicio' });
}

// Texto do aviso para o celular que recebeu a notificação (só para aparelhos inscritos).
function textoDoAviso_(id) {
  var conhecido = inscricoes_().some(function (x) { return x.id === id; });
  if (!conhecido) return { titulo: 'Finanças da Casa', texto: 'Abra o app para ver.', url: '#/inicio' };
  return JSON.parse(PropertiesService.getScriptProperties().getProperty('AVISO_ULTIMO') || 'null') || { titulo: 'Finanças da Casa', texto: 'Abra o app para ver.', url: '#/inicio' };
}

// O que precisa ser lembrado agora: tarefas pendentes e dias sem lançar. Cada um no máximo a cada 2 dias.
function lembretes_(agora, ultimos) {
  var dia = 24 * 3600 * 1000;
  var passou = function (iso) { return !iso || agora - new Date(iso).getTime() >= DIAS_ENTRE_AVISOS * dia - 3600 * 1000; };
  var partes = [];
  var tipos = [];
  var url = '#/inicio';
  var pendentes = lerTabela_('tarefas').filter(function (t) { return !t.feita; });
  if (pendentes.length && passou(ultimos.tarefas)) {
    var nomes = pendentes.slice(0, 3).map(function (t) { return t.titulo; }).join(', ');
    partes.push((pendentes.length === 1 ? '1 tarefa da casa pendente: ' : pendentes.length + ' tarefas da casa pendentes: ') + nomes + (pendentes.length > 3 ? '…' : '.'));
    tipos.push('tarefas');
    url = '#/tarefas';
  }
  var ultimoLanc = lerTabela_('lancamentos').reduce(function (m, l) {
    var quando = l.criado_em || l.data || '';
    return quando > m ? quando : m;
  }, '');
  var semLancar = ultimoLanc ? Math.floor((agora - new Date(ultimoLanc).getTime()) / dia) : null;
  if (semLancar !== null && semLancar >= DIAS_ENTRE_AVISOS && passou(ultimos.lancamentos)) {
    partes.push('Faz ' + semLancar + ' dias sem lançar entradas e saídas.');
    tipos.push('lancamentos');
    if (url === '#/inicio') url = '#/lancamentos';
  }
  return { partes: partes, tipos: tipos, url: url };
}

// Rodada pelo acionador de tempo (todo dia). Também dá para rodar à mão no editor para testar.
function avisosDaCasa() {
  var props = PropertiesService.getScriptProperties();
  if (!inscricoes_().length) return 'Nenhum celular com os avisos ligados.';
  var ultimos = JSON.parse(props.getProperty('AVISOS_ULTIMOS') || '{}');
  var l = lembretes_(Date.now(), ultimos);
  if (!l.partes.length) return 'Nada para lembrar agora.';
  var r = avisarTodos_({ titulo: 'Finanças da Casa', texto: l.partes.join(' '), url: l.url });
  var agora = new Date().toISOString();
  l.tipos.forEach(function (t) { ultimos[t] = agora; });
  props.setProperty('AVISOS_ULTIMOS', JSON.stringify(ultimos));
  return 'Aviso mandado para ' + r.enviados + ' de ' + r.aparelhos + ' celulares: ' + l.partes.join(' ');
}
