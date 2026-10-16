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
