// Modo demonstração: as tabelas ficam no localStorage deste aparelho.
import { demoTables } from '../core/seed.js';
import { TABELAS } from '../core/schema.js';

const KEY = 'fc-demo-v8';

export class LocalApi {
  constructor(hoje) {
    this.hoje = hoje;
    this.modo = 'demo';
  }

  read() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return JSON.parse(raw);
    } catch {
      /* armazenamento indisponível: segue com dados novos */
    }
    return null;
  }

  write(tables) {
    try {
      localStorage.setItem(KEY, JSON.stringify(tables));
    } catch {
      /* sem armazenamento: os dados valem só nesta sessão */
    }
  }

  async carregar() {
    let t = this.read();
    if (!t) {
      t = demoTables(this.hoje);
      this.write(t);
    }
    for (const nome of TABELAS) t[nome] ||= [];
    this.tables = t;
    return structuredClone(t);
  }

  async salvar(tabela, linha) {
    const lista = this.tables[tabela];
    const i = lista.findIndex((x) => x.id === linha.id);
    if (i >= 0) lista[i] = linha;
    else lista.push(linha);
    this.write(this.tables);
    return linha;
  }

  async apagar(tabela, id) {
    this.tables[tabela] = this.tables[tabela].filter((x) => x.id !== id);
    this.write(this.tables);
    return true;
  }

  async salvarVarias(tabela, linhas) {
    const ids = new Set(linhas.map((l) => l.id));
    this.tables[tabela] = (this.tables[tabela] || []).filter((l) => !ids.has(l.id)).concat(linhas);
    this.write(this.tables);
    return linhas;
  }

  async interpretar() {
    throw new Error('A leitura de prints usa a planilha. Abra o app sem o ?demo, já conectado.');
  }

  async reiniciar() {
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* nada a limpar */
    }
  }
}
