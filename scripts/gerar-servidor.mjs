// Junta os arquivos de apps-script/ num só (dist/servidor.gs), para colar de uma vez no editor do Apps Script.
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';

const ORDEM = ['Inicial.gs', 'Esquema.gs', 'Planilha.gs', 'Acesso.gs', 'Leitura.gs', 'Codigo.gs'];

export function conteudoServidor() {
  const dir = new URL('../apps-script/', import.meta.url);
  const existentes = readdirSync(dir).filter((f) => f.endsWith('.gs')).sort();
  const faltando = existentes.filter((f) => !ORDEM.includes(f));
  if (faltando.length) throw new Error(`Inclua em ORDEM: ${faltando.join(', ')}`);
  return '// Finanças da Casa: servidor completo. Gerado por scripts/gerar-servidor.mjs a partir de apps-script/.\n' +
    '// Cole tudo no arquivo Código.gs do Apps Script (apagando o que estiver lá).\n\n' +
    ORDEM.map((f) => `// ===== ${f} =====\n${readFileSync(new URL(f, dir), 'utf8')}`).join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  mkdirSync(new URL('../dist/', import.meta.url), { recursive: true });
  writeFileSync(new URL('../dist/servidor.gs', import.meta.url), conteudoServidor());
  console.log('dist/servidor.gs gerado');
}
