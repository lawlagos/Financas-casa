// Os apps que usam a mesma planilha: Finanças (na raiz) e Pudins (em pudim/). Mantém o ?demo ao trocar de app.
let atual = 'financas';
export const definirApp = (a) => (atual = a);
export const appAtual = () => atual;

export function urlDoApp(app, hash = '') {
  const base = location.pathname.replace(/pudim\/(index\.html)?$/, '').replace(/index\.html$/, '');
  const demo = /[?&]demo\b/.test(location.search) ? '?demo' : '';
  return `${app === 'pudim' ? `${base}pudim/` : base}${demo}${hash ? `#${hash}` : ''}`;
}
