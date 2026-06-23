import { test, expect } from '@playwright/test';

async function searchAndFilterProduct(page: any, productName: string) {
  const searchInput = page.getByPlaceholder('Buscar produtos por nome, descrição ou SKU...');
  await expect(searchInput).toBeVisible();

  // Preenche o campo de busca (o debounce do frontend é de 500ms)
  await searchInput.fill(productName);

  // Usa o auto-retry do Playwright para aguardar o frontend renderizar a tabela com o resultado.
  // Isso é muito mais rápido e imune a race-conditions de requests perdidas.
  const table = page.locator('table');
  await expect(table).toContainText(productName, { timeout: 15000 });
  await expect(page.locator('table tbody tr')).toHaveCount(1, { timeout: 15000 });
}

test.describe('Tarefa 1.1 - Status de Rascunho vs Publicado', () => {

  test.beforeEach(async ({ page }) => {
    // 1. Ir para a página de login (/conta)
    await page.goto('/conta');
    
    // Tenta preencher email e senha usando seletores baseados nos placeholders da BoutiqueInput
    await page.getByPlaceholder('voce@email.com').fill(process.env.TEST_USER_EMAIL || 'admin@ecommerce.com');
    await page.getByPlaceholder('Digite sua senha').fill(process.env.TEST_USER_PASSWORD || 'Admin@123');
    
    // Clicar no botão para submeter o formulário
    await page.getByRole('button', { name: 'Acessar Loja' }).click();
    
    // Validar se o login foi bem-sucedido esperando o link administrativo aparecer com timeout estendido
    await expect(page.getByRole('link', { name: 'Ir para Painel Administrativo' })).toBeVisible({ timeout: 30000 });

    // Pequeno intervalo para garantir estabilização da sessão/localstorage pós-login
    await page.waitForTimeout(2000);
  });

  test('Fluxo 1: Criar produto como Rascunho (Draft)', async ({ page }) => {
    const productName = `Camiseta Playwright Draft ${Date.now()}`;
    
    // 1. Navegar até a página do painel administrativo (/admin/produtos) com timeout estendido
    await page.goto('/admin/produtos', { waitUntil: 'load', timeout: 30000 });

    // Aguardar o carregamento inicial e a hidratação do Next.js
    await page.waitForTimeout(2000);

    // 2. Aguardar o botão de "Cadastrar Produto" estar visível e clicável com timeout maior
    const btnCadastrar = page.getByRole('button', { name: 'Cadastrar Produto' });
    await btnCadastrar.waitFor({ state: 'visible', timeout: 30000 });
    await btnCadastrar.click();

    // 3. Preencher os campos obrigatórios
    await page.locator('label:has-text("Nome do Produto")').locator('..').locator('input').fill(productName);
    await page.locator('label:has-text("Descrição")').locator('..').locator('textarea').fill('Produto criado por automação para testar status rascunho.');
    await page.locator('label:has-text("Preço Venda")').locator('..').locator('input').fill('89.90');
    
    // Categoria: (Selecionar a primeira categoria disponível - index 1 pois o index 0 é "Selecione...")
    const selectCategoria = page.locator('label:has-text("Categoria")').locator('..').locator('select');
    await selectCategoria.selectOption({ index: 1 });

    // 4. No rodapé do modal, clicar no botão secundário "Salvar como Rascunho"
    await page.getByRole('button', { name: 'Salvar como Rascunho' }).click();

    // 5. Assert: Aguardar o fechamento do modal
    await expect(page.getByRole('heading', { name: 'Cadastrar Produto' })).not.toBeVisible({ timeout: 20000 });

    // Filtrar pelo nome do produto usando a nova barra de pesquisa para que ele apareça na tabela de forma robusta
    await searchAndFilterProduct(page, productName);

    // 6. Assert: Validar se o produto foi adicionado à tabela do painel administrativo
    const tabela = page.locator('table');
    await expect(tabela).toContainText(productName);

    // 7. Navegar até a página da Vitrine/Catálogo pública buscando pelo produto
    await page.goto(`/produtos?search=${encodeURIComponent(productName)}`);

    // 8. Assert CRÍTICO: Garantir que o produto NÃO está visível para os clientes no catálogo
    await expect(page.locator('text=Nenhum produto encontrado')).toBeVisible();
    await expect(page.getByText(productName)).not.toBeVisible();
  });

  test('Fluxo 2: Criar produto como Publicado (Published)', async ({ page }) => {
    const productName = `Camiseta Playwright Published ${Date.now()}`;
    
    // 1. Retornar para a página do painel administrativo (/admin/produtos) com timeout estendido
    await page.goto('/admin/produtos', { waitUntil: 'load', timeout: 30000 });

    // Aguardar o carregamento inicial e a hidratação do Next.js
    await page.waitForTimeout(2000);

    // 2. Aguardar o botão de "Cadastrar Produto" estar visível e clicável com timeout maior
    const btnCadastrar = page.getByRole('button', { name: 'Cadastrar Produto' });
    await btnCadastrar.waitFor({ state: 'visible', timeout: 30000 });
    await btnCadastrar.click();

    // 3. Preencher os campos obrigatórios
    await page.locator('label:has-text("Nome do Produto")').locator('..').locator('input').fill(productName);
    await page.locator('label:has-text("Descrição")').locator('..').locator('textarea').fill('Produto criado por automação para testar status publicado.');
    await page.locator('label:has-text("Preço Venda")').locator('..').locator('input').fill('129.90');
    
    // Categoria: (Selecionar a primeira categoria disponível)
    const selectCategoria = page.locator('label:has-text("Categoria")').locator('..').locator('select');
    await selectCategoria.selectOption({ index: 1 });

    // 4. No rodapé do modal, clicar no botão principal "Publicar Produto"
    await page.getByRole('button', { name: 'Publicar Produto' }).click();

    // 5. Assert: Aguardar o fechamento do modal
    await expect(page.getByRole('heading', { name: 'Cadastrar Produto' })).not.toBeVisible({ timeout: 20000 });

    // Filtrar pelo nome do produto usando a nova barra de pesquisa para que ele apareça na tabela de forma robusta
    await searchAndFilterProduct(page, productName);

    // 6. Assert: Validar se o produto foi adicionado à tabela do painel administrativo
    const tabela = page.locator('table');
    await expect(tabela).toContainText(productName);

    // 7. Navegar até a página da Vitrine/Catálogo pública buscando pelo produto
    await page.goto(`/produtos?search=${encodeURIComponent(productName)}`);

    // 8. Assert CRÍTICO: Garantir que o produto ESTÁ visível e renderizado corretamente
    await expect(page.getByText(productName)).toBeVisible();
    await expect(page.locator('text=Nenhum produto encontrado')).not.toBeVisible();
  });

});
