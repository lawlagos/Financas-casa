# Como colocar o Finanças da Casa no ar

São 4 partes, feitas uma vez só. Leva uns 30 minutos. Dá para fazer pelo computador (mais fácil) ou pelo celular no modo "site para computador".

Enquanto isso não estiver pronto, o app funciona em **modo demonstração**, com dados de exemplo salvos só no aparelho.

---

## Parte 1: a planilha e o servidor (Google Apps Script)

1. Abra **sheets.new** e dê o nome **Finanças da Casa** à planilha.
2. Menu **Extensões > Apps Script**.
3. No editor, apague todo o conteúdo de `Código.gs`. Abra https://raw.githubusercontent.com/lawlagos/Financas-casa/main/dist/servidor.gs, copie tudo (Ctrl+A, Ctrl+C) e cole no `Código.gs`. Salve (Ctrl+S).
4. (Não precisa mexer no `appsscript.json`: o Google descobre as permissões sozinho.)
5. Selecione a função **configurar** no topo do editor e clique **Executar**. O Google vai pedir autorização: escolha sua conta, **Avançado > Acessar Finanças da Casa (não seguro) > Permitir**. Isso aparece porque o script é seu e não passou por revisão do Google; ele só acessa esta planilha e o endereço de verificação de login do Google.
6. Volte para a planilha: as abas Contas, Categorias, Lançamentos, Previstos, Baixas, Config e Sessões foram criadas, com as 9 contas e as categorias.

## Parte 2: o login com Google (Client ID)

1. Abra **console.cloud.google.com**, crie um projeto chamado **Finanças da Casa**.
2. **APIs e serviços > Tela de consentimento OAuth** (ou "Google Auth Platform"): tipo **Externo**, nome **Finanças da Casa**, seu e-mail como suporte e contato. Em **Público-alvo / Usuários de teste**, adicione os dois e-mails (o seu e o da sua esposa).
3. **Credenciais > Criar credenciais > ID do cliente OAuth**: tipo **Aplicativo da Web**. Em **Origens JavaScript autorizadas**, adicione o endereço do app (Parte 4), ou seja `https://lawlagos.github.io`. Salve e copie o **ID do cliente** (termina em `.apps.googleusercontent.com`).
4. De volta ao Apps Script: **Configurações do projeto > Propriedades do script > Adicionar propriedade**:
   - `GOOGLE_CLIENT_ID` = o ID do cliente copiado
   - `EMAILS_AUTORIZADOS` = os e-mails Google de vocês dois, separados por vírgula (um e-mail fora do Gmail só funciona se tiver uma Conta Google criada com ele)

## Parte 3: publicar o servidor

1. No Apps Script: **Implantar > Nova implantação > tipo App da Web**.
2. **Executar como: Eu**. **Quem pode acessar: Qualquer pessoa**. (A segurança fica no login: só os dois e-mails entram.)
3. Clique **Implantar** e copie o **URL do app da Web** (termina em `/exec`).

Sempre que o código do servidor mudar: **Implantar > Gerenciar implantações > lápis > Versão: Nova versão > Implantar**. O URL continua o mesmo.

## Parte 4: publicar o app e instalar no celular

1. No repositório do GitHub, edite `app/config.js`:
   ```js
   export const CONFIG = {
     apiUrl: 'URL do app da Web da Parte 3',
     googleClientId: 'ID do cliente da Parte 2',
   };
   ```
2. **Settings > Pages > Source: GitHub Actions**. A cada mudança no `main`, o workflow `Publicar app` roda os testes e publica a pasta `app/`.
3. O endereço fica em **Settings > Pages** (`https://lawlagos.github.io/Financas-casa/`). Confira se a origem `https://lawlagos.github.io` está nas origens autorizadas da Parte 2.
4. No celular, abra o endereço no **Chrome** (Android) ou **Safari** (iPhone), entre com o Google e use **Adicionar à tela inicial**. Pronto: vira um app com ícone.
5. Faça o mesmo no celular da sua esposa.

## Primeiros passos no app

1. **Mais > Contas**: em cada conta, coloque o saldo de hoje.
2. **Mais > Previstos**: cadastre aluguel, parcelas, contas de consumo e quem te paga (Katsuhiro, Danilo, renovações...). Ou mande a lista no chat que eu cadastro.
3. **Mais > Ajustes**: confirme o gasto diário (R$ 75) e, se quiser, uma reserva mínima.

## Problemas comuns

- **"O e-mail ... não tem acesso"**: confira `EMAILS_AUTORIZADOS` nas propriedades do script.
- **"Falta configurar a propriedade ..."**: faltou uma propriedade da Parte 2, passo 4.
- **Botão do Google não aparece / erro de origem**: o endereço do app precisa estar em "Origens JavaScript autorizadas".
- **Tirar o acesso de um celular perdido**: apague a linha dele na aba **Sessões** da planilha.

## Voltar para uma versão anterior

Cada versão que funcionou fica guardada num ramo `estavel-…` do GitHub (o primeiro é `estavel-v1`: leitura de prints funcionando, servidor `2026-10-17.4`).

- **Servidor:** em Implantar > Gerenciar implantações > lápis, escolha no campo Versão o número anterior e clique em Implantar. Volta na hora, sem colar nada. Se quiser o código antigo no editor, copie de `https://raw.githubusercontent.com/lawlagos/Financas-casa/estavel-v1/dist/servidor.gs`.
- **App:** peça ao Claude para "voltar o app para o estavel-v1"; ele publica o código daquele ramo de novo no GitHub Pages.
- **Planilha:** as versões novas só acrescentam colunas no fim das abas, então a versão anterior continua lendo a planilha normalmente. Para ter uma cópia dos dados, use Arquivo > Fazer uma cópia, ou Arquivo > Histórico de versões para voltar a planilha a um dia anterior.

## App Pudins

O pudim tem um app próprio, com a mesma planilha e o mesmo login: `https://lawlagos.github.io/Financas-casa/pudim/`.
Ele é publicado junto com o Finanças (mesmo repositório), então não precisa de nada novo no Google Cloud: o endereço
autorizado `https://lawlagos.github.io` vale para os dois. No iPhone, abra esse endereço no Safari e use
**Compartilhar → Adicionar à Tela de Início** para ter o ícone do Pudins. Veja `docs/PROXIMOS-APPS.md` para os próximos apps.
