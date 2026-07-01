# Guia de Execução Segura dos Testes E2E (Playwright)

Para garantir que os problemas intermitentes (travamentos no banco de dados, bloqueio da sandbox do Mercado Pago, e erros de falta de produto) não voltem a acontecer, criamos este guia definitivo de como preparar o ambiente e rodar os testes.

Sempre que a suíte começar a demonstrar um comportamento instável, significa que os dados entre a base de dados de teste (Postgres) e a infraestrutura de pagamentos (Mercado Pago) podem ter ficado dessincronizados. A melhor solução é fazer um "Clean Run".

## 🛠️ Passo a Passo para um "Clean Run"

### 1. Pare a execução atual da API
Se você estiver com o terminal rodando o `dotnet run` (da ApiEcommerce), pare-o com `Ctrl + C`. A API não pode estar conectada ao banco no momento de recriá-lo.

### 2. Zere o Banco de Dados
Abra o terminal na pasta da API (`ApiEcommerce`) e execute o comando do Entity Framework para dropar a base de dados à força.

```bash
cd source\repos\Maicon-Tomasi\ApiEcommerce\ApiEcommerce
dotnet ef database drop -f
```
*Isso garante que qualquer carrinho preso, transação pendente ou chave de idempotência "suja" seja completamente apagada.*

### 3. Rebuilde e Inicie a API
Com o banco zerado, rode o comando abaixo para que a API aplique todas as Migrations do zero e rode os `Seeder`s (inserindo as configurações default de loja, cupons e transportadoras).

```bash
dotnet run --project ApiEcommerce.csproj
```
*(Aguarde até aparecer `Now listening on: http://localhost:5111` ou a porta equivalente na sua máquina)*

### 4. Rode os Testes no Modo "Worker 1"
Abra outro terminal, navegue para a pasta de testes e execute a suíte de pagamentos (ou a suíte completa).

🚨 **Regra de Ouro:** Testes ponta-a-ponta que alteram o mesmo produto/estoque não devem rodar em paralelo no backend. Por isso, eu configurei a variável `workers: 1` no `playwright.config.ts`. Caso precise forçar via terminal, rode:

**Para rodar apenas a suíte de checkout e pagamentos:**
```bash
cd Documents\Projetos\TestesInterfaceEcommerce
npx playwright test tests/checkout-pagamentos.spec.ts --workers=1
```

**Para rodar TODOS os testes do sistema:**
```bash
npx playwright test --workers=1
```

### 5. Comandos Rápidos para Rodar Suítes Individuais
Se você quiser isolar e testar apenas uma área do sistema, basta rodar o comando correspondente ao arquivo de teste. Usamos `--workers=1` para prevenir falhas de concorrência no banco local.

- **Admin - Gerenciamento de Categorias:**
  `npx playwright test tests/admin-categorias.spec.ts --workers=1`
- **Admin - Configurações de Frete:**
  `npx playwright test tests/admin-configuracoes-frete.spec.ts --workers=1`
- **Admin - Gerenciamento de Produtos e Variações:**
  `npx playwright test tests/admin-produtos.spec.ts --workers=1`
- **Jornada de Carrinho (Concorrência, Estoque e Lixeira):**
  `npx playwright test tests/cart-journey.spec.ts --workers=1`
- **Checkout - Idempotência e Duplo Clique:**
  `npx playwright test tests/checkout-idempotency.spec.ts --workers=1`
- **Checkout - Fluxo Completo de Pagamentos (Cartão e PIX):**
  `npx playwright test tests/checkout-pagamentos.spec.ts --workers=1`
- **Cloud Cart - Sincronização entre Devices:**
  `npx playwright test tests/cloud-cart.spec.ts --workers=1`
- **Home - Banner e Frete Fixo Dinâmico:**
  `npx playwright test tests/configuracoes-dinamicas.spec.ts --workers=1`
- **Status do Produto (Rascunho vs Publicado):**
  `npx playwright test tests/produtos-status.spec.ts --workers=1`
- **Vitrine do Produto (Troca de Imagens, Botão Esgotado):**
  `npx playwright test tests/vitrine-produto.spec.ts --workers=1`

---

## ℹ️ Como solucionamos os bloqueios do Mercado Pago?
Anteriormente, usar sempre o CPF `19119119100` e o email estático na Sandbox do Mercado Pago gerava rejeições HTTP 400 (`Invalid user identification number`) após 3 ou mais compras via Pix que ficavam "pendentes" na nuvem deles.

Na última alteração que fiz no código-fonte dos testes, implementei um **Gerador de CPFs e E-mails Dinâmicos**. Agora, cada vez que o teste de pagamentos roda, ele cadastra um usuário 100% fresco (com CPF válido matematicamente). 

**Você não precisará mais se preocupar em levar block do Mercado Pago nos testes!** Basta seguir os passos acima para manter a consistência do banco de dados local.
