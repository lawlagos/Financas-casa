// Planilha falsa em memória para rodar o código do Apps Script fora do Google.
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';

const DIR = new URL('../../apps-script/', import.meta.url);

class Aba {
  constructor(nome) {
    this.nome = nome;
    this.linhas = [];
    this.formatos = {};
    this.maxRows = 1000; // como a planilha de verdade: escrever além da grade dá erro
  }
  getLastRow() {
    return this.linhas.length;
  }
  getLastColumn() {
    return Math.max(0, ...this.linhas.map((l) => l.length));
  }
  getMaxRows() {
    return this.maxRows;
  }
  insertRowsAfter(_depois, n) {
    this.maxRows += n;
  }
  setFrozenRows() {}
  getRange(r, c, nr = 1, nc = 1) {
    const aba = this;
    return {
      setValues(v) {
        if (r + nr - 1 > aba.maxRows) throw new Error('Those rows are out of bounds.');
        for (let i = 0; i < nr; i++) {
          while (aba.linhas.length < r + i) aba.linhas.push([]);
          for (let j = 0; j < nc; j++) aba.linhas[r - 1 + i][c - 1 + j] = v[i][j];
        }
      },
      setValue(v) {
        this.setValues([[v]]);
      },
      getValues() {
        const out = [];
        for (let i = 0; i < nr; i++) {
          const linha = aba.linhas[r - 1 + i] || [];
          out.push(Array.from({ length: nc }, (_, j) => (linha[c - 1 + j] === undefined ? '' : linha[c - 1 + j])));
        }
        return out;
      },
      setNumberFormat(f) {
        if (r > 1) (aba.formatosNovos ||= []).push([r, c, nr, f]);
        else aba.formatos[c] = f;
      },
    };
  }
  deleteRow(r) {
    this.linhas.splice(r - 1, 1);
  }
}

export function ambiente({ props = {}, tokeninfo, gemini, push } = {}) {
  const chamadasGemini = [];
  const chamadasPush = [];
  // Bytes como no Apps Script: com sinal (-128 a 127).
  const comSinal = (buf) => Array.from(buf, (b) => (b > 127 ? b - 256 : b));
  const buffer = (bytes) => Buffer.from(typeof bytes === 'string' ? Buffer.from(bytes, 'utf8') : bytes.map((b) => (b < 0 ? b + 256 : b)));
  const abas = {};
  const ss = {
    getSheetByName: (n) => abas[n] || null,
    insertSheet: (n) => (abas[n] = new Aba(n)),
    deleteSheet: (a) => delete abas[a.nome],
  };
  let uuid = 0;
  const ctx = {
    SpreadsheetApp: { getActiveSpreadsheet: () => ss },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props[k] || null, setProperty: (k, v) => { props[k] = v; } }) },
    UrlFetchApp: {
      fetch: (url, opcoes) => {
        if (/push|notify/.test(url)) {
          chamadasPush.push({ url, opcoes });
          const codigo = push ? push(url, opcoes) : 201;
          return { getResponseCode: () => codigo, getContentText: () => '' };
        }
        if (url.includes('generativelanguage.googleapis.com')) {
          chamadasGemini.push({ url, opcoes });
          const g = gemini ? gemini(url, opcoes) : { code: 500, body: '{}' };
          return { getResponseCode: () => g.code, getContentText: () => g.body };
        }
        const r = tokeninfo ? tokeninfo(url) : { code: 400, body: '{}' };
        return { getResponseCode: () => r.code, getContentText: () => r.body };
      },
    },
    Utilities: {
      getUuid: () => `00000000-0000-0000-0000-${String(++uuid).padStart(12, '0')}`,
      // Como o Apps Script: a data no fuso pedido (o servidor usa o de São Paulo), não em UTC.
      DigestAlgorithm: { SHA_256: 'sha256' },
      computeDigest: (alg, v) => comSinal(crypto.createHash(alg).update(buffer(v)).digest()),
      computeHmacSha256Signature: (v, chave) => comSinal(crypto.createHmac('sha256', buffer(chave)).update(buffer(v)).digest()),
      base64EncodeWebSafe: (bytes) => buffer(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_'),
      newBlob: (t) => ({ getBytes: () => comSinal(Buffer.from(String(t), 'utf8')) }),
      formatDate: (d, tz = 'UTC') => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d),
    },
    ContentService: {
      MimeType: { JSON: 'json' },
      createTextOutput: (t) => ({ texto: t, setMimeType() { return this; } }),
    },
    JSON,
    Date,
    Error,
    Object,
    String,
    Number,
    isNaN,
    encodeURIComponent,
  };
  vm.createContext(ctx);
  for (const f of readdirSync(DIR).filter((x) => x.endsWith('.gs'))) vm.runInContext(readFileSync(new URL(f, DIR), 'utf8'), ctx, { filename: f });
  const post = (corpo) => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(corpo) } }).texto);
  return { ctx, abas, post, chamadasGemini, chamadasPush, props };
}

