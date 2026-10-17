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
  var tinha = sh.getLastColumn();
  if (tinha < colunas.length) {
    sh.getRange(1, 1, 1, colunas.length).setValues([colunas]);
    for (var j = tinha; j < colunas.length; j++) {
      if (!NUMERICAS[colunas[j]] && !BOOLEANAS[colunas[j]]) sh.getRange(1, j + 1, sh.getMaxRows(), 1).setNumberFormat('@');
    }
  }
  return sh;
}

function colunas_(tabela) {
  return tabela === 'sessoes' ? COLUNAS_SESSOES : ESQUEMA[tabela];
}

// Na Config a coluna "valor" guarda número ou texto (JSON dos custos do pudim): não converte.
function paraCelula_(col, v, tabela) {
  if (v === null || v === undefined) return '';
  if (BOOLEANAS[col]) return v === true || v === 'true' || v === 'TRUE';
  if (NUMERICAS[col] && tabela !== 'config') return v === '' ? '' : Number(v);
  if (typeof v === 'object') return JSON.stringify(v);
  return v;
}

function daCelula_(col, v, tabela) {
  if (v instanceof Date) return Utilities.formatDate(v, 'America/Sao_Paulo', 'yyyy-MM-dd');
  if (BOOLEANAS[col]) return v === true || v === 'TRUE' || v === 'true';
  if (NUMERICAS[col] && tabela !== 'config') return v === '' || v === null ? '' : Number(v);
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
    for (var c = 0; c < cols.length; c++) obj[cols[c]] = daCelula_(cols[c], valores[r][c], tabela);
    if (tabela === 'config' && typeof obj.valor === 'string' && obj.valor !== '' && !isNaN(Number(obj.valor))) obj.valor = Number(obj.valor);
    out.push(obj);
  }
  return out;
}

// A aba nasce com 1000 linhas; escrever depois da última dá erro. Acrescenta linhas (de 500 em 500)
// e põe as colunas de texto como texto puro, para datas não virarem data do Sheets.
function garantirLinhas_(sh, ultima, tabela) {
  var max = sh.getMaxRows();
  if (ultima <= max) return;
  var novas = Math.max(500, ultima - max);
  sh.insertRowsAfter(max, novas);
  if (tabela === 'config') return;
  var cols = colunas_(tabela);
  for (var i = 0; i < cols.length; i++) {
    if (!NUMERICAS[cols[i]] && !BOOLEANAS[cols[i]]) sh.getRange(max + 1, i + 1, novas, 1).setNumberFormat('@');
  }
}

// Acrescenta linhas no fim da aba, criando espaço se precisar.
function acrescentar_(sh, tabela, valores) {
  var inicio = sh.getLastRow() + 1;
  garantirLinhas_(sh, inicio + valores.length - 1, tabela);
  sh.getRange(inicio, 1, valores.length, valores[0].length).setValues(valores);
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
  var valores = cols.map(function (c) { return paraCelula_(c, linha[c], tabela); });
  return comLock_(function () {
    var sh = aba_(tabela);
    var r = linhaDoId_(sh, linha.id);
    if (r > 0) sh.getRange(r, 1, 1, cols.length).setValues([valores]);
    else acrescentar_(sh, tabela, [valores]);
    return linha;
  });
}

function apagarLinha_(tabela, id) {
  if (!ESQUEMA[tabela]) throw erro_('tabela-invalida', 'Tabela desconhecida: ' + tabela);
  return comLock_(function () {
    var sh = aba_(tabela);
    // Apaga todas as linhas com esse id (de baixo para cima), para não sobrar cópia de um envio repetido.
    var n = sh.getLastRow() - 1;
    var ids = n > 0 ? sh.getRange(2, 1, n, 1).getValues() : [];
    var apagou = false;
    for (var i = ids.length - 1; i >= 0; i--) {
      if (String(ids[i][0]) === String(id)) {
        sh.deleteRow(i + 2);
        apagou = true;
      }
    }
    return apagou;
  });
}

// Várias linhas de uma vez (ex.: itens de uma nota). Id que já existe é atualizado no lugar: se o celular
// mandar de novo porque a resposta se perdeu, não duplica.
function salvarVarias_(tabela, linhas) {
  if (!ESQUEMA[tabela]) throw erro_('tabela-invalida', 'Tabela desconhecida: ' + tabela);
  if (!linhas || !linhas.length) return [];
  var cols = ESQUEMA[tabela];
  var valores = linhas.map(function (linha) {
    if (!linha || !linha.id) throw erro_('linha-invalida', 'Toda linha precisa de um id.');
    return cols.map(function (c) { return paraCelula_(c, linha[c], tabela); });
  });
  return comLock_(function () {
    var sh = aba_(tabela);
    var n = sh.getLastRow() - 1;
    var ids = n > 0 ? sh.getRange(2, 1, n, 1).getValues() : [];
    var onde = {};
    for (var i = 0; i < ids.length; i++) onde[String(ids[i][0])] = i + 2;
    var novas = [];
    for (var j = 0; j < valores.length; j++) {
      var r = onde[String(linhas[j].id)];
      if (r) sh.getRange(r, 1, 1, cols.length).setValues([valores[j]]);
      else novas.push(valores[j]);
    }
    if (novas.length) acrescentar_(sh, tabela, novas);
    return linhas;
  });
}
