# Próximos apps (para quando a ideia estiver madura)

Hoje são dois apps com a **mesma planilha e o mesmo login**:

| App | Endereço | Para quê |
|---|---|---|
| Finanças da Casa | `https://lawlagos.github.io/Financas-casa/` | Lançamentos, futuro, contas, dízimo, compras e tarefas da casa. Do pudim, só o resumo (vendas, perdas, lucro, compras, iFood a receber). |
| Pudins | `https://lawlagos.github.io/Financas-casa/pudim/` | Tudo do pudim: estoque (São Roque e Ibiúna, lotes, validade), vender (PDV), receitas e custos, ingredientes, lista e pesquisa de preços. |

Como funciona por dentro: os dois apps usam o mesmo código (`app/ui`, `app/core`, `app/data`).
Cada um só escolhe as telas e o menu (`app/ui/app.js` para o Finanças, `app/pudim/main.js` para o Pudins),
e a casca comum (login, rotas, folhas) fica em `app/ui/shell.js`. Um app novo segue o mesmo molde:
uma pasta em `app/<nome>/` com `index.html`, `manifest.webmanifest`, ícones e `main.js`.

---

## 1. App da empresa (cursos da Hotmart e kimonos)

Objetivo: tirar do Finanças o que é operação da empresa, como foi feito com o pudim. O Finanças fica só com o
resumo (entradas, saídas, lucro da semana e dízimo, que já existem em Negócios).

O que o app teria:

- **Vendas de cursos (Hotmart)**
  - Começar com lançamento manual ou por print (a leitura de prints já existe).
  - Integração automática (webhook da Hotmart) fica para depois: precisa de um endereço que receba avisos
    da Hotmart. O Apps Script recebe POST, mas a Hotmart exige resposta rápida, então é preciso testar antes.
  - Separar por produto e por data de liberação do dinheiro (como o repasse do iFood: venda hoje, dinheiro
    na data de liberação).
- **Estoque de kimonos**
  - Mesmo modelo do estoque do pudim: produtos com tamanho (A1, A2, A3…) e cor, entradas (compra do
    fornecedor), saídas (venda, troca, brinde) e estoque mínimo por tamanho.
  - Custo de cada kimono (compra + frete dividido) e preço de venda, com lucro por venda.
- **Venda de produto**: um PDV como o do pudim (carrinho, canal, taxa do canal, lança no caixa e tira do estoque).
- **Gasto em anúncio (Meta)**: lançar o gasto por campanha e ver custo por venda (gasto ÷ vendas do período).
  A integração automática com o Meta Ads pode vir depois.

Planilha: abas novas (ex.: "Produtos da empresa", "Estoque da empresa", "Campanhas"), no mesmo esquema
(`apps-script/Esquema.gs` e `app/core/schema.js`).

---

## 2. Cardápio web do pudim (pedido + Pix, confirmação à mão)

Ideia: um site público só de **ver o cardápio** com os pudins que estão valendo e, depois, **fazer pedido**.
Sem entrega integrada por enquanto (sem motoboy do iFood), sem pagamento automático.

### Fase A: vitrine (mais simples)
- Página pública (sem login) em `.../cardapio/` com os pudins **ativos**, foto, preço de venda direta e se
  tem pronto (no copo, 1 kg e 500 g, geladinhos), na ordem do cardápio.
- Os dados vêm da planilha por um endereço público e só de leitura do Apps Script (`doGet?cardapio=1`), que
  devolve só nome, preço, foto e "tem/não tem" (nunca custo, estoque exato ou dados financeiros).
- Botão "Pedir pelo WhatsApp", com a mensagem já escrita com os itens escolhidos.

### Fase B: pedido com Pix
- O cliente monta o carrinho, informa nome, telefone e retirada/entrega, e vê o Pix (chave e valor, ou QR
  Code estático gerado com o valor).
- O pedido cai numa aba "Pedidos" da planilha e aparece no app **Pudins** como "a confirmar".
- Ao ver o Pix na conta, vocês tocam em **Confirmar**: o pedido vira uma venda no PDV (baixa no estoque e
  lançamento no caixa), como já acontece hoje.
- Cuidados: limitar pedidos por telefone/minuto (evitar spam), não expor dados de outros pedidos e mostrar só
  o que tem em estoque.

### Fase C (talvez): integração tipo Cardápio Web/iFood
- Plataformas como o Cardápio Web já ligam no iFood (pedido, entregador). Se a entrega crescer, vale avaliar
  usar uma delas e só **importar** os pedidos para o Pudins, em vez de construir a integração.
