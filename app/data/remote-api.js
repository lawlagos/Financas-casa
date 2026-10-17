// Fala com o Google Apps Script. POST com text/plain evita a checagem CORS prévia, que o Apps Script não responde.
const SESSAO_KEY = 'fc-sessao';

export class RemoteApi {
  constructor(url) {
    this.url = url;
    this.modo = 'nuvem';
  }

  get sessao() {
    try {
      return localStorage.getItem(SESSAO_KEY);
    } catch {
      return null;
    }
  }

  set sessao(v) {
    try {
      if (v) localStorage.setItem(SESSAO_KEY, v);
      else localStorage.removeItem(SESSAO_KEY);
    } catch {
      /* sem armazenamento: o login vale só nesta aba */
    }
  }

  async chamar(acao, dados = {}) {
    let resp;
    try {
      resp = await fetch(this.url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ acao, sessao: this.sessao, dados }),
      });
    } catch {
      throw new ErroApi('sem-conexao', 'Sem conexão com a planilha. Confira a internet e tente de novo.');
    }
    const json = await resp.json().catch(() => null);
    if (!json) throw new ErroApi('resposta-invalida', 'A planilha respondeu algo inesperado. Tente de novo em instantes.');
    if (!json.ok) throw new ErroApi(json.codigo || 'erro', json.erro || 'Erro na planilha.');
    return json.dados;
  }

  async entrar(idToken, aparelho) {
    const r = await this.chamar('entrar', { idToken, aparelho });
    this.sessao = r.sessao;
    return r;
  }

  sair() {
    this.sessao = null;
  }

  carregar() {
    return this.chamar('carregar');
  }

  salvar(tabela, linha) {
    return this.chamar('salvar', { tabela, linha });
  }

  apagar(tabela, id) {
    return this.chamar('apagar', { tabela, id });
  }

  salvarVarias(tabela, linhas) {
    return this.chamar('salvarVarias', { tabela, linhas });
  }

  interpretar(dados) {
    return this.chamar('interpretar', dados);
  }
}

export class ErroApi extends Error {
  constructor(codigo, mensagem) {
    super(mensagem);
    this.codigo = codigo;
  }
}
