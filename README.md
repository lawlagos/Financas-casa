# Finanças da Casa

Controle financeiro da casa, do pudim e da Hotmart: lançamentos por voz ou formulário, saldo por conta,
dízimo automático (semanal nos negócios, mensal no salário e consultoria) e o **Futuro**: o saldo dia a dia até 31/12
com quanto falta fazer para não ficar no vermelho.

- `app/`: o app (PWA sem build; Preact + htm vendorizados). Sem `apiUrl` em `app/config.js`, roda em modo demonstração.
- `apps-script/`: o servidor no Google Apps Script, que grava na Planilha Google.
- `docs/`: especificação, plano e o guia de implantação (`docs/IMPLANTACAO.md`).

## Testes

```bash
npm test                                   # núcleo de cálculo e servidor (planilha simulada)
NODE_PATH=$(npm root -g) npm run test:e2e  # ponta a ponta com Playwright/Chromium
npm run serve                              # app em http://localhost:8080
```

Depois de mudar contas ou categorias iniciais em `app/core/seed.js`, rode `node scripts/gerar-inicial.mjs`.
