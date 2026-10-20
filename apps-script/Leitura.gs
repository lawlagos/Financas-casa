// Leitura de prints e fotos com o Gemini. A chave fica só aqui, nas propriedades do script:
//   GEMINI_API_KEY  = chave criada em aistudio.google.com/apikey
//   GEMINI_MODELO   = (opcional) força um modelo; sem ela, o servidor escolhe sozinho o Flash mais novo disponível

var MODELO_PADRAO = 'gemini-flash-latest';
var API_GEMINI = 'https://generativelanguage.googleapis.com/v1beta/';

// Escolhe o modelo: o fixado na propriedade, o já descoberto, ou descobre agora na lista de modelos da chave.
function modeloGemini_(chave, redescobrir) {
  var props = PropertiesService.getScriptProperties();
  if (!redescobrir) {
    var escolhido = props.getProperty('GEMINI_MODELO') || props.getProperty('GEMINI_MODELO_AUTO');
    if (escolhido) return escolhido;
  }
  var resp = UrlFetchApp.fetch(API_GEMINI + 'models?pageSize=1000', { headers: { 'x-goog-api-key': chave }, muteHttpExceptions: true });
  var codigo = resp.getResponseCode();
  if (codigo === 400 || codigo === 403) throw erro_('ia-chave', 'O Gemini recusou a chave. Confira a propriedade GEMINI_API_KEY no Apps Script.');
  if (codigo !== 200) return MODELO_PADRAO;
  var nome = melhorModelo_(JSON.parse(resp.getContentText()).models || []);
  if (!nome) return MODELO_PADRAO;
  props.setProperty('GEMINI_MODELO_AUTO', nome);
  return nome;
}

// Flash estável de versão mais alta que aceita generateContent; "lite" só se não houver outro.
function melhorModelo_(modelos) {
  var candidatos = modelos
    .filter(function (m) { return (m.supportedGenerationMethods || []).indexOf('generateContent') >= 0; })
    .map(function (m) { return String(m.name || '').replace(/^models\//, ''); })
    .filter(function (n) { return /flash/.test(n) && !/(preview|exp|image|tts|live|audio|thinking|embedding|8b)/.test(n); });
  function versao(n) { var v = n.match(/gemini-(\d+(?:\.\d+)?)/); return v ? Number(v[1]) : 0; }
  function nota(n) { return versao(n) * 10 - (/lite/.test(n) ? 1000 : 0) - (/latest/.test(n) ? 1 : 0); }
  candidatos.sort(function (a, b) { return nota(b) - nota(a); });
  return candidatos[0] || null;
}

function chamarGemini_(modelo, chave, corpo) {
  return UrlFetchApp.fetch(API_GEMINI + 'models/' + modelo + ':generateContent', {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-goog-api-key': chave },
    payload: JSON.stringify(corpo),
    muteHttpExceptions: true
  });
}

function interpretar_(dados) {
  if (!dados || !dados.imagem) throw erro_('leitura', 'Nenhuma imagem recebida.');
  var chave = propriedade_('GEMINI_API_KEY');
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
  // Tenta o modelo de sempre; se ele foi aposentado, está sem cota ou fora do ar, tenta outros (cada modelo tem a sua cota).
  var props = PropertiesService.getScriptProperties();
  var fila = [modeloGemini_(chave)];
  var redescoberto = false;
  var tentados = {};
  var resp = null, codigo = 0, modelo = '', motivo = '';
  while (fila.length) {
    modelo = fila.shift();
    if (!modelo || tentados[modelo]) continue;
    tentados[modelo] = true;
    resp = chamarGemini_(modelo, chave, corpo);
    codigo = resp.getResponseCode();
    if (codigo === 200) break;
    var detalhe = {};
    try { detalhe = JSON.parse(resp.getContentText()).error || {}; } catch (e) { detalhe = {}; }
    motivo = String(detalhe.message || '').slice(0, 200);
    var texto = String(detalhe.status || '') + ' ' + String(detalhe.message || '') + ' ' + JSON.stringify(detalhe.details || '');
    if (codigo === 403 || (codigo === 400 && /API_KEY|PERMISSION_DENIED|api key/i.test(texto))) throw erro_('ia-chave', 'O Gemini recusou a chave. Confira a propriedade GEMINI_API_KEY no Apps Script.' + (motivo ? ' (' + motivo + ')' : ''));
    // 400 de imagem ruim não melhora trocando de modelo; 400 que fala do modelo, sim.
    if (codigo === 400 && !/model|not supported|unsupported|mime|response_mime/i.test(texto)) break;
    if (!redescoberto) {
      redescoberto = true;
      fila.push(modeloGemini_(chave, true));
    }
    fila.push('gemini-flash-latest', 'gemini-2.5-flash', 'gemini-flash-lite-latest', 'gemini-2.5-flash-lite');
  }
  var extra = motivo ? ' Detalhe: ' + motivo : '';
  if (codigo === 200 && !props.getProperty('GEMINI_MODELO')) props.setProperty('GEMINI_MODELO_AUTO', modelo);
  if (codigo === 429) throw erro_('ia-limite', 'O limite gratuito do Gemini acabou por agora. Tente de novo em alguns minutos ou lance pelo formulário.' + extra);
  if (codigo === 404) throw erro_('ia-modelo', 'Não achei um modelo do Gemini disponível para a sua chave (tentei ' + Object.keys(tentados).join(', ') + '). Apague a propriedade GEMINI_MODELO, se existir, e tente de novo.');
  if (codigo === 400) throw erro_('ia', 'O Gemini não conseguiu ler esta imagem. Tente um print mais nítido ou menor, ou lance pelo formulário.' + extra);
  if (codigo !== 200) throw erro_('ia', 'O Gemini não respondeu (erro ' + codigo + '). Tente de novo.' + extra);
  var json = JSON.parse(resp.getContentText());
  // Modelos que "pensam" mandam partes com thought: true antes da resposta; só vale o texto final.
  var partes = (json.candidates && json.candidates[0] && json.candidates[0].content && json.candidates[0].content.parts) || [];
  var resposta = partes.filter(function (p) { return !p.thought; }).map(function (p) { return p.text || ''; }).join('').trim();
  if (!resposta) throw erro_('ia', 'O Gemini não conseguiu ler a imagem' + (json.candidates && json.candidates[0] && json.candidates[0].finishReason ? ' (' + json.candidates[0].finishReason + ')' : '') + '. Tente um print mais nítido.');
  try {
    var inicio = resposta.indexOf('{');
    var fim = resposta.lastIndexOf('}');
    return JSON.parse(inicio >= 0 && fim > inicio ? resposta.slice(inicio, fim + 1) : resposta);
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
    ' "itens":[{"descricao":string,"produto":string,"marca":string|null,"tamanho":number|null,"tamanho_unidade":"g"|"kg"|"ml"|"l"|null,"quantidade":number,"unidade":"un"|"kg"|"g"|"l"|"ml","valor_total":number,"categoria_id":string|null,"origem":"Pudim"|"Casa"|null,"confianca":number,"duvida":string|null}]}',
    '',
    'Regras:',
    '- Comprovante de Pix, TED, boleto ou cartão: um item em "lancamentos". Pix enviado = saida; recebido = entrada.',
    '- Transferência entre duas contas da lista acima = "transferencia" com conta_id (origem do dinheiro) e conta_destino_id.',
    '- Nota ou cupom de mercado: preencha "itens" (um por produto, valor_total já com quantidade e descontos) e deixe "lancamentos" vazio.',
    '  "descricao" do item: escreva por extenso e legível (ex.: "LT COND MOCA 395G" vira "Leite condensado Moça 395g"); "unidade" como impressa (KG, UN...).',
    '  "produto": nome genérico, sem marca nem tamanho, igual para o mesmo produto em notas diferentes (ex.: "Leite condensado", "Papel higiênico", "Banana prata").',
    '  Quando o item for um destes ingredientes do pudim, use exatamente este nome em "produto": ' + JSON.stringify(ctx.produtos_pudim || []) + '.',
    '  "marca": só a marca (ex.: "Moça"); null para hortifruti, granel ou quando não aparecer. "tamanho" e "tamanho_unidade": conteúdo de UMA embalagem',
    '  (ex.: 395 e "g"; 1 e "l"); null quando o item é vendido por peso ou não tiver tamanho impresso.',
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
