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
