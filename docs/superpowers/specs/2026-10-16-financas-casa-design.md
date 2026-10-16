# Finanças da Casa — Especificação

Data: 2026-10-16 · Status: aguardando revisão

## 1. Objetivo

Substituir a planilha "Termômetro" (controle diário da casa) e a planilha "Pudim Perfeito" (precificação) por um app web
instalável no celular, com dados na nuvem, usado pelo casal. Resolve:

- Lançar entradas e saídas sem atrito: digitando, falando ou mandando print/foto.
- Separar o dinheiro por **conta** (8 contas) e por **origem** (Casa, Pudim, Hotmart, Salário, Consultoria).
- Calcular o **lucro semanal dos negócios** (Pudim + Hotmart, somados) e o **dízimo** automaticamente.
- Puxar automaticamente as vendas da Hotmart e o gasto de anúncio da Meta.
- Manter **histórico de preços dos ingredientes por marca**, com gráfico de tendência, e custo das receitas atualizado.
- **Projetar o saldo dia a dia até uma data futura** (padrão 31/12), como a planilha atual faz, mostrando o ponto mais baixo
  e quanto é preciso fazer até lá.

Fora do escopo: cartão de crédito (não usam), integração bancária automática (Open Finance), Google Ads/TikTok,
webhook do Mercado Pago (vendas do MP serão lançadas manualmente ou por print).

## 2. Arquitetura

```
 App (PWA estático, GitHub Pages)  ──HTTPS POST text/plain──▶  Google Apps Script (Web App, executa como o dono)
   login Google 1x por aparelho                                  ├─ auth / sessões
   voz: Web Speech API (pt-BR)                                   ├─ CRUD na planilha
   câmera / galeria                                              ├─ Gemini (texto/imagem → rascunho)
                                                                 ├─ doPost?rota=hotmart&chave=SEGREDO
                                                                 └─ sincronizar Meta (Graph API insights)
                                                                          │
                                                       Planilha Google "Finanças da Casa" + pasta no Drive (fotos)
```

- **Frontend:** HTML/CSS/JS sem build (ES modules), PWA com manifest e service worker (cache do app; dados sempre do servidor).
  Hospedado no GitHub Pages.
- **Backend:** um projeto Apps Script vinculado à planilha, publicado como Web App ("executar como: eu", "acesso: qualquer pessoa").
  Toda requisição do app é `POST` com `Content-Type: text/plain` (evita preflight CORS) contendo JSON `{acao, sessao, dados}`.
  Resposta JSON via `ContentService`.
- **Segredos** (chave Gemini, token Meta, segredo do webhook, Client ID do Google) ficam em `PropertiesService` do script,
  nunca no frontend.
- **Fotos** de comprovantes são salvas numa pasta do Drive; o lançamento guarda o ID do arquivo.
- Concorrência: escritas usam `LockService` para evitar linhas cruzadas quando os dois lançam ao mesmo tempo.

### 2.1 Autenticação

1. Primeiro acesso: botão "Entrar com Google" (Google Identity Services) devolve um ID token.
2. O script valida o token em `oauth2.googleapis.com/tokeninfo`, confere `aud` = Client ID e o e-mail contra a lista
   `EMAILS_AUTORIZADOS` (os 2 e-mails do casal).
3. O script cria uma sessão aleatória (aba `Sessoes`: token, e-mail, aparelho, criada, último uso) e devolve ao app,
   que guarda em `localStorage`.
4. Validade deslizante de 90 dias: cada uso renova. Apagar a linha da sessão revoga o aparelho.
5. Os dois usuários têm permissão total (ler e editar).

## 3. Modelo de dados (abas da planilha)

Todas as abas têm cabeçalho na linha 1 e um `id` (UUID curto) na coluna A. Valores em reais com 2 casas; datas em ISO `AAAA-MM-DD`.

| Aba | Colunas |
|---|---|
| `Contas` | id, nome, dono (Marido/Esposa), grupo (Pessoal/Empresa/Pudim), saldo_inicial, data_saldo_inicial, ativa |
| `Categorias` | id, nome, tipo (entrada/saida), origem_padrao, ativa |
| `Lancamentos` | id, data, tipo (entrada/saida/transferencia), valor, descricao, conta_id, conta_destino_id, categoria_id, origem (Casa/Pudim/Hotmart/Salario/Consultoria), canal (manual/voz/foto/hotmart/meta), id_externo, foto_id, grupo_id, previsto_id, criado_por, criado_em, editado_em |
| `Liberacoes` | id, lancamento_id, valor, disponivel_em (só vendas Hotmart: 90% em D+2, 10% em D+30) |
| `Previstos` | id, descricao, tipo, valor, conta_id, conta_destino_id, categoria_id, origem, recorrencia (unica/mensal/semanal), dia (do mês ou da semana), data_unica, inicio, fim, ativo |
| `PrevistosBaixas` | previsto_id, data_ocorrencia, lancamento_id (ou `pulado`) |
| `Ingredientes` | id, nome, unidade_base (g/ml/un), tipo (ingrediente/embalagem) |
| `Produtos` | id, ingrediente_id, marca, tamanho (na unidade base) |
| `Precos` | id, data, produto_id, mercado, quantidade, preco_unitario, preco_por_base, lancamento_id |
| `Apelidos` | texto_nota (normalizado), produto_id, origem_fixa (vazio/Pudim/Casa), vezes_pudim, vezes_casa |
| `Receitas` | id, nome, rendimento_un, tempo_preparo_min, markup, preco_venda_atual, preco_definido_em |
| `ReceitaItens` | receita_id, ingrediente_id, quantidade (unidade base) |
| `Config` | chave, valor (salário produtora, dias/horas de trabalho, despesas fixas mensais do pudim, conta Hotmart, conta Meta, início da semana de apuração = sábado, modo de custo = ultimo/media30) |
| `Dizimo` | id, semana_inicio (sábado), lucro_semana, prejuizo_carregado_entrada, base, dizimo, pago_em, lancamento_id |
| `Sessoes` | token, email, aparelho, criada_em, ultimo_uso |
| `Webhooks` | recebido_em, rota, id_externo, payload (bruto), status (ok/duplicado/erro), erro |

**Saldo de uma conta** = saldo_inicial + entradas − saídas ± transferências, a partir de `data_saldo_inicial`.
**Transferência** nunca entra no lucro nem no dízimo.
Um comprovante de mercado gera até 2 lançamentos (parte Pudim e parte Casa) ligados pelo mesmo `grupo_id`.

### 3.1 Dados iniciais

- 9 contas: C6, Inter, Mercado Pago, Hotmart (Marido, Empresa; Hotmart = saldo dentro da plataforma); Itaú, Nubank, Bradesco (Marido, Pessoal); Nubank PF (Esposa, Pessoal);
  Nubank PJ (Esposa, Pudim). Saldos iniciais informados pelo usuário na configuração.
- Categorias iniciais derivadas das planilhas (Mercado casa, Ingrediente pudim, Embalagem, Gás, Luz, Água, Internet, MEI/Contador,
  Anúncio Meta, Taxa Hotmart, Venda pudim, Venda Hotmart, Salário, Consultoria, Dízimo, Outros).
- Ingredientes, produtos (marca + tamanho), preços atuais e as 15 receitas importados da planilha "Pudim Perfeito".
  Cada preço atual vira o primeiro registro em `Precos` com a data de compra da planilha (ou a data da importação, se vazia).
- Histórico da planilha "Termômetro": não importado linha a linha. Opcional: um lançamento-resumo por mês só para o gráfico.

## 4. Telas

Navegação inferior: **Início · Lançamentos · ＋ · Futuro · Negócios**. "Mais" (⚙️) fica no topo da tela Início.

- **Início:** saldo total e por conta (agrupado Pessoal/Empresa/Pudim); card "Dízimo desta semana" (acumulado até agora);
  card "Dízimo do mês" (salário + consultoria); entradas × saídas do mês contra o mês anterior; botão 🔄 Sincronizar com a hora da última sincronização.
- **＋ Lançar:** três modos (🎤 falar, 📷 foto/print, ⌨️ digitar). Todos terminam num **cartão de rascunho** editável → Confirmar.
- **Lançamentos:** lista por dia; filtros mês/conta/origem/categoria; busca; tocar = editar, arrastar = apagar (com desfazer).
  Ícone do canal (🤖 para Hotmart/Meta) e quem lançou.
- **Futuro:** ver seção 7A. Seletor de data-limite (padrão 31/12) e de grupo (Tudo/Pessoal/Empresa/Pudim); destaque do
  ponto mais baixo e "quanto preciso fazer até DD/MM" (para zero e para a reserva mínima de `Config`); gráfico do saldo
  com área negativa em vermelho; tabela rolável Data · Entra · Sai · Diário · Saldo (real em preto, previsto em cinza,
  saldo negativo em vermelho, previstos atrasados com ⚠️). Gestão de previstos (criar/editar/pular uma ocorrência).
- **Negócios:** semana atual (sáb–sex, paga no sábado): colunas Hotmart (vendas − taxas − anúncio) e Pudim (vendas − custos), lucro do casal,
  prejuízo carregado, dízimo a pagar; botão "Marcar dízimo como pago" (gera saída categoria Dízimo); gráfico das semanas anteriores.
- **Mais → Pudim:**
  - *Bolsa dos ingredientes:* lista com preço atual/base, variação 30 dias ▲▼, sparkline; ranking de marcas mais compradas.
  - *Ingrediente:* gráfico de R$/base por marca ao longo do tempo; tabela por marca (compras, qtd total, média, último preço/mercado);
    dica de marca mais barata no último mês; filtro por mercado.
  - *Receitas:* custo por unidade, preço sugerido (markup), lucro com o preço atual; alerta quando o custo sobe ≥5% desde `preco_definido_em`.
- **Mais → Contas, Categorias, Configurações** (aparelhos conectados, parâmetros do pudim, contas de Hotmart/Meta).

## 5. Lançamento com IA

### 5.1 Fluxo

1. Entrada: texto (digitado ou transcrito pela Web Speech API em pt-BR) e/ou imagem (redimensionada no app para ≤1600px, JPEG).
2. O script chama o Gemini (modelo Flash do plano gratuito, nome configurável em `Config`) com:
   o texto/imagem, a lista de contas, categorias, ingredientes/produtos, `Apelidos` e os 30 lançamentos mais recentes como exemplos.
   Resposta exigida em JSON (schema fixo).
3. O script pós-processa: aplica `Apelidos`, compara preço com o último registro e valida a soma contra o total.
4. O app mostra o rascunho com cada campo/linha marcado ✅ ou ❓. **Nada é gravado sem confirmação.**

### 5.2 Schema da resposta da IA

```json
{
  "tipo_documento": "nota_mercado | comprovante_pix | texto_livre | outro",
  "data": "AAAA-MM-DD | null",
  "estabelecimento": "string | null",
  "conta_sugerida": "id | null",
  "total": 0.0,
  "lancamentos": [{ "tipo": "...", "valor": 0.0, "descricao": "...", "conta_id": "...", "conta_destino_id": null,
                    "categoria_id": "...", "origem": "...", "confianca": 0.0 }],
  "itens": [{ "texto_nota": "...", "quantidade": 0, "preco_unitario": 0.0, "produto_id": null,
              "sugestao_novo": { "ingrediente": "...", "marca": "...", "tamanho": 0 }, "origem": "Pudim|Casa|null", "confianca": 0.0 }],
  "duvidas": [{ "alvo": "item:3 | campo:conta | ...", "pergunta": "...", "opcoes": ["..."] }]
}
```

### 5.3 Regras de dúvida (❓) — o app pergunta antes de gravar

- Campo obrigatório ausente: valor, data, conta, origem.
- Item da nota sem `Apelido` conhecido e confiança < 0,85.
- Produto novo (não existe em `Produtos`): perguntar ingrediente, marca e tamanho.
- Item que pode ser Pudim ou Casa sem `origem_fixa` no apelido: perguntar (com opção "dividir unidades").
- Preço unitário com diferença > 30% do último registro do mesmo produto.
- Soma dos itens ≠ total (tolerância R$ 0,05): oferecer "ver de novo" ou "lançar diferença como Outros".
- Data ilegível ou no futuro.

### 5.4 Aprendizado

Ao confirmar: cada texto de item vira/atualiza um `Apelido` (produto + contadores Pudim/Casa).
Opção "sempre Pudim"/"sempre Casa" grava `origem_fixa`, e o item deixa de perguntar.

### 5.5 Gravação de nota de mercado

Uma saída para a soma dos itens Pudim (categoria Ingrediente pudim/Embalagem, origem Pudim) e uma para a soma Casa
(categoria Mercado casa, origem Casa), mesmo `grupo_id` e mesma foto; um registro em `Precos` por item que tem `produto_id`.

## 6. Integrações

### 6.1 Hotmart (webhook)

- URL: `<webapp>/exec?rota=hotmart&chave=<SEGREDO>` cadastrada no Postback 2.0 da Hotmart. Requisição sem a chave correta → ignorada.
- Eventos: `PURCHASE_APPROVED` → entrada (origem Hotmart, categoria Venda Hotmart) com a **comissão líquida do produtor**,
  na conta **Hotmart**, data = data de aprovação (vale para lucro e dízimo). Gera 2 `Liberacoes`: 90% em D+2 e 10% em D+30
  (prazos em `Config`). O saque para um banco é uma transferência lançada pelo usuário. `PURCHASE_REFUNDED` / `PURCHASE_CHARGEBACK` → saída de estorno
  com o mesmo valor, na data do evento.
- Idempotência: `id_externo` = `transacao:evento`; se já existe em `Lancamentos`, marca `duplicado` em `Webhooks` e não grava.
  Necessário porque o Apps Script responde com redirecionamento 302 e a Hotmart pode reenviar.
- Todo payload bruto é guardado em `Webhooks` para auditoria e reprocessamento.

### 6.2 Meta Ads (sincronizar)

- Token de usuário do sistema (Business Manager, permissão `ads_read`) + ID da conta de anúncios, em `PropertiesService`.
- Disparo: botão 🔄 Sincronizar e um gatilho diário às 06:00 (America/Sao_Paulo).
- `GET /act_<id>/insights?fields=spend&time_increment=1&time_range={desde: último dia sincronizado − 2, até: ontem}`.
- Para cada dia: lançamento de saída (origem Hotmart, categoria Anúncio Meta, conta configurada) com `id_externo` = `meta:AAAA-MM-DD`.
  Se o dia já existe com valor diferente (a Meta ajusta gastos), atualiza o valor.

## 7. Dízimo

- **Salário e Consultoria:** 10% de cada entrada com essas origens; agregado por mês civil.
- **Negócios (casal, Pudim + Hotmart somados):** a semana de apuração vai de **sábado 00:00 a sexta 23:59**
  (movimentos de sábado já contam para a semana seguinte); o dízimo da semana é pago no sábado seguinte ao fechamento.
  `semana_inicio` = o sábado em que a apuração começa.
  - `lucro_semana` = entradas (Pudim + Hotmart) − saídas (Pudim + Hotmart), excluindo transferências e excluindo a categoria Dízimo.
  - `base` = `lucro_semana` + `prejuizo_carregado_entrada` (≤ 0).
  - Se `base` > 0: `dizimo` = 10% da base, e nada é carregado. Senão: `dizimo` = 0, e carrega `base` para a semana seguinte.
  - Recalculado sempre que um lançamento da semana (ou de semanas anteriores) muda; semanas já pagas mostram aviso se o valor mudar depois.

## 7A. Projeção (Futuro)

- Ponto de partida: saldo real de hoje das contas do grupo escolhido. Na conta Hotmart, só entra o valor já liberado;
  cada `Liberacao` futura entra como entrada na sua data `disponivel_em`.
- Para cada dia de amanhã até a data-limite, somar: ocorrências de `Previstos` ativos sem baixa; dízimo previsto
  (10% de cada previsto com origem Salário/Consultoria, no mesmo dia); e o **gasto diário estimado** (`Config`, ex.: R$ 75).
- **Não** se projetam vendas futuras de Hotmart ou Pudim (cenário só com o que é certo).
- Previsto com data passada e sem baixa = atrasado: aparece com ⚠️ e é contado no dia de hoje.
- Baixa: ao salvar um lançamento real, o app procura um previsto aberto com a mesma conta/categoria, valor ±10% e data ±5 dias
  e pergunta "É o <previsto> do dia X?". Se sim, grava `previsto_id` e a baixa. Transferências previstas não afetam o saldo "Tudo".
- Resultado: série diária (data, entradas, saídas, diário, saldo), mínimo (valor e data) e "precisa fazer" = max(0, reserva − mínimo).

## 8. Erros e casos-limite

- Sem internet: o app mostra um aviso e mantém o rascunho em `localStorage` até enviar (não há fila offline de lançamentos confirmados).
- Gemini indisponível ou cota estourada: mensagem clara e cai para o formulário manual com a foto anexada.
- Sessão inválida/expirada: volta para a tela de login.
- Webhook com erro de parse: grava `erro` em `Webhooks`; a tela Configurações lista erros pendentes.
- Exclusão de lançamento ligado a `Precos`: remove os preços junto (com confirmação).

## 9. Testes

- **Lógica pura** (cálculo de saldo, semana do dízimo com carry, divisão Pudim/Casa, normalização R$/base, regras de dúvida,
  idempotência) em módulos JS sem dependência de Apps Script, testados com `node --test`.
- Backend: funções de acesso à planilha atrás de uma interface pequena; testes com planilha em memória (mock).
- Webhook Hotmart: testes com payloads de exemplo (aprovado, reembolso, duplicado, chave errada).
- Frontend: teste ponta a ponta com Playwright contra um backend falso (lançar manual, rascunho com ❓, confirmar).
- Verificação manual final: deploy real, login nos 2 celulares, um webhook de teste da Hotmart, uma sincronização da Meta e uma nota de mercado real.

## 10. Configuração que o usuário fornece

E-mails do casal; saldo atual de cada conta; conta onde cai o saque Hotmart; conta que paga a Meta; chave da API Gemini
(Google AI Studio); token e ID da conta Meta; criação do Client ID OAuth no Google Cloud (passo a passo será fornecido).

## 11. Entregas por etapa

1. **Base:** planilha + Apps Script + auth + contas/categorias/lançamentos + lançamento manual + Início/Lançamentos + dízimo.
2. **IA:** voz, foto/print, rascunho com dúvidas, apelidos.
3. **Pudim:** ingredientes/produtos/preços (importação), bolsa de preços, receitas e custos.
4. **Integrações:** webhook Hotmart (com liberações), sincronização Meta.

A tela Futuro (7A) entra na Etapa 1, já que usa só lançamentos e previstos; as liberações da Hotmart passam a aparecer na Etapa 4.

### Etapas futuras (escopo resumido; cada uma terá sua própria especificação)

5. **Estoque do pudim:** entradas e saídas de estoque com validade; "dinheiro potencial" (valor do estoque) e
   "dinheiro perdido" (itens vencidos).
6. **Radar de ofertas:** a cada 3 dias, buscar preços dos ingredientes críticos mais comprados e mostrar ofertas.
   Precisa definir a fonte de preços conforme a região onde compram.
