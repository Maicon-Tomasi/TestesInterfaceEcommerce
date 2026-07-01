import { test, expect } from '@playwright/test';
import { ApiHelper } from './apiHelper';
import path from 'path';

async function searchAndFilterProduct(page: any, productName: string) {
  const searchInput = page.getByPlaceholder('Buscar produtos por nome, descrição ou SKU...');
  await expect(searchInput).toBeVisible();

  // Wait for initial/submit requests to settle
  await page.waitForTimeout(2000);

  for (let i = 0; i < 5; i++) {
    await searchInput.click();
    await searchInput.fill('');
    await page.waitForTimeout(200);

    // Setup response listener for the filtered search request
    const responsePromise = page.waitForResponse(
      (response: any) =>
        response.url().includes('/api/products/admin') &&
        response.url().includes(encodeURIComponent(productName)) &&
        response.status() === 200,
      { timeout: 5000 }
    ).catch(() => null);

    await searchInput.fill(productName);
    await responsePromise;
    await page.waitForTimeout(500); // Allow React to render table update

    const inputValue = await searchInput.inputValue();
    const tableText = await page.locator('table').textContent();
    const rowCount = await page.locator('table tbody tr').count();

    if (inputValue === productName && tableText.includes(productName) && rowCount === 1) {
      return;
    }
  }

  const currentInputValue = await searchInput.inputValue();
  const currentTableText = await page.locator('table').textContent();
  const currentRowCount = await page.locator('table tbody tr').count();
  throw new Error(`searchAndFilterProduct failed for "${productName}". Input: "${currentInputValue}", Rows: ${currentRowCount}, Table content: "${currentTableText}"`);
}

test.describe('Painel Administrativo de Produtos - Cenários de Teste', () => {
  let api: ApiHelper;
  let categoryId: string;

  test.beforeEach(async ({ page, request }) => {
    api = new ApiHelper(request);
    await api.setShippingModeToFixed();
    // Garantir que a categoria padrão "Calças" exista e obter seu ID
    categoryId = await api.getOrCreateCategory();

    // Pré-requisito: Executar login com usuário de perfil Admin
    await page.goto('/conta', { timeout: 60000, waitUntil: 'load' });

    await page.getByPlaceholder('voce@email.com').fill(process.env.TEST_USER_EMAIL || 'admin@ecommerce.com');
    await page.getByPlaceholder('Digite sua senha').fill(process.env.TEST_USER_PASSWORD || 'Admin@123');

    await page.getByRole('button', { name: 'Acessar Loja' }).click();

    // Aguarda o login e redirecionamento para o perfil
    await expect(page.getByRole('link', { name: 'Ir para Painel Administrativo' })).toBeVisible({ timeout: 30000 });
    await page.waitForTimeout(2000); // Aguarda estabilização da sessão
  });

  test('Cenário 1: Edição e Publicação de Produto', async ({ page }) => {
    const productName = `Draft Edit Test ${Date.now()}`;

    // 1. Seed: Criar um produto como Rascunho (Draft) via API
    await api.createProduct({
      name: productName,
      description: 'Descrição original do produto rascunho.',
      basePrice: 99.90,
      categoryIds: [categoryId]
    });

    // 2. Navegar até o painel administrativo
    await page.goto('/admin/produtos', { waitUntil: 'load', timeout: 30000 });

    // Aguardar o carregamento inicial e a hidratação do Next.js
    await page.waitForTimeout(2000);

    // Filtrar pelo nome do produto usando a nova barra de pesquisa
    await searchAndFilterProduct(page, productName);

    // 3. Localizar o produto na lista e clicar no botão de edição
    const row = page.locator('tr').filter({ hasText: productName });
    await row.getByTitle('Editar produto').click();

    // 4. Aguardar abertura do modal de edição e preencher nova descrição
    await expect(page.getByRole('heading', { name: 'Editar Produto' })).toBeVisible({ timeout: 15000 });
    await page.locator('label:has-text("Descrição")').locator('..').locator('textarea').fill('Descrição editada por automação.');

    // 5. Clicar em "Publicar Produto"
    await page.getByRole('button', { name: 'Publicar Produto' }).click();

    // 6. Validar o fechamento do modal
    await expect(page.getByRole('heading', { name: 'Editar Produto' })).not.toBeVisible({ timeout: 20000 });

    // Garante que o filtro de busca continua ativo e o produto editado permanece visível na tabela
    await searchAndFilterProduct(page, productName);

    // 7. Assert: Validar se o status na tabela administrativa mudou para "Publicado"
    await expect(row.locator('td').nth(3)).toContainText('Publicado');

    // 8. Assert: Validar se o produto agora é exibido no catálogo público
    await page.goto(`/produtos?search=${encodeURIComponent(productName)}`);
    await expect(page.getByText(productName)).toBeVisible({ timeout: 20000 });
  });

  test('Cenário 2: Paginação Dinâmica no Painel', async ({ page }) => {
    // 1. Seed: Garantir que existam pelo menos 11 produtos com o prefixo "Paginacao"
    const prefix = 'Paginacao';
    const existingCount = await api.getAdminProductsCount(prefix);
    if (existingCount < 11) {
      for (let i = existingCount + 1; i <= 11; i++) {
        await api.createProduct({
          name: `${prefix} Produto ${i}`,
          description: `Paginacao desc ${i}`,
          basePrice: 50.00 + i,
          categoryIds: [categoryId]
        });
      }
    }

    // 2. Navegar até o painel administrativo
    await page.goto('/admin/produtos', { waitUntil: 'load', timeout: 30000 });
    await page.waitForTimeout(2000); // Aguarda carregamento inicial

    // Filtrar pelo prefixo na barra de pesquisa para isolar os produtos do teste
    const searchInput = page.getByPlaceholder('Buscar produtos por nome, descrição ou SKU...');
    await searchInput.fill(prefix);
    await page.waitForResponse(
      (response: any) =>
        response.url().includes('/api/products/admin') &&
        response.url().includes(encodeURIComponent(prefix)) &&
        response.status() === 200,
      { timeout: 10000 }
    );
    await page.waitForTimeout(1000); // Permite ao React atualizar a tabela

    // 3. Alterar a exibição para "10 por página"
    const selectExibir = page.locator('select').filter({ hasText: /por página/ });
    await selectExibir.selectOption('10');

    // 4. Assert: Garantir que a tabela exibe no máximo 10 produtos
    const rows = page.locator('table tbody tr');
    await expect(rows).toHaveCount(10);

    // 5. Navegar para a próxima página
    await page.getByRole('button', { name: 'Próximo' }).click();
    await page.waitForTimeout(1000); // Intervalo de transição

    // 6. Assert: Garantir que a quantidade de linhas mudou na página 2 (no mínimo 1 produto sobrou)
    const countPageTwo = await rows.count();
    expect(countPageTwo).toBeGreaterThanOrEqual(1);
    expect(countPageTwo).toBeLessThanOrEqual(10);

    // 7. Alterar seletor de limite para "25 por página"
    await selectExibir.selectOption('25');
    await page.waitForTimeout(1000);

    // 8. Assert: Mudar o limite de exibição deve reiniciar para a página 1 (mostrando todas as 11 linhas e ocultando botões extras)
    const countTotal = await rows.count();
    expect(countTotal).toBeGreaterThanOrEqual(11);

    // Como total é 11 e o limite é 25, não há mais de uma página. Logo, a paginação deve sumir.
    await expect(page.getByRole('button', { name: 'Próximo' })).not.toBeVisible();
  });

  test('Cenário 3: Exclusão Permanente de Produto sem Vendas', async ({ page }) => {
    const productName = `Delete Test Product ${Date.now()}`;

    // 1. Seed: Criar um produto qualquer via API
    await api.createProduct({
      name: productName,
      description: 'Produto para teste de exclusão física imediata.',
      basePrice: 29.90,
      categoryIds: [categoryId]
    });

    // 2. Navegar até o painel administrativo
    await page.goto('/admin/produtos', { waitUntil: 'load', timeout: 30000 });

    // Aguardar o carregamento inicial e a hidratação do Next.js
    await page.waitForTimeout(2000);

    // Filtrar pelo nome do produto usando a nova barra de pesquisa
    await searchAndFilterProduct(page, productName);

    // 3. Localizar o produto na lista e preparar para lidar com a caixa de diálogo de confirmação
    const row = page.locator('tr').filter({ hasText: productName });

    page.once('dialog', async (dialog) => {
      expect(dialog.message()).toContain('Tem certeza');
      await dialog.accept();
    });

    // 4. Clicar no botão vermelho de lixeira
    await row.getByTitle('Inativar produto').click();

    // 5. Assert: Aguardar que o produto suma da tabela administrativa
    await expect(row).not.toBeVisible({ timeout: 15000 });
  });

  test.skip('Cenário 4: Impedimento de Exclusão de Produto com Vendas Realizadas', async ({ page }) => {
    const productName = `Sold Product Test ${Date.now()}`;
    const sku = `SOLD-${Date.now().toString().slice(-4)}`;

    // 1. Seed: Criar produto publicado e com estoque no banco
    const product = await api.createProduct({
      name: productName,
      description: 'Produto vendido não elegível para exclusão física.',
      basePrice: 150.00,
      categoryIds: [categoryId]
    });

    // Publica o produto para que ele fique visível para compra
    await api.publishProduct(product.id);

    // Adiciona variação para poder realizar checkout
    const variation = await api.addVariation(product.id, {
      sku,
      size: 'M',
      color: 'Vermelho',
      stockQuantity: 10
    });

    const variationId = variation.variations[0].id;

    // Realiza a compra/checkout via API para gerar histórico de vendas
    await api.createOrderForVariation(variationId);

    // 2. Navegar até o painel administrativo
    await page.goto('/admin/produtos', { waitUntil: 'load', timeout: 30000 });

    // Aguardar o carregamento inicial e a hidratação do Next.js
    await page.waitForTimeout(2000);

    // Filtrar pelo nome do produto usando a nova barra de pesquisa
    await searchAndFilterProduct(page, productName);

    // 3. Localizar o produto na lista e preparar para lidar com a caixa de diálogo de confirmação
    const row = page.locator('tr').filter({ hasText: productName });

    page.once('dialog', async (dialog) => {
      expect(dialog.message()).toContain('Tem certeza');
      await dialog.accept();
    });

    // 4. Clicar no botão vermelho de lixeira
    await row.getByTitle('Inativar produto').click();

    // 5. Assert: Validar a mensagem de erro vermelha na tela bloqueando a exclusão
    const errorAlert = page.locator('div.bg-red-50');
    await expect(errorAlert).toBeVisible({ timeout: 15000 });
    await expect(errorAlert).toContainText('Este produto não pode ser excluído permanentemente');

    // 6. Assert: Garantir que o produto continua presente na lista
    await expect(row).toBeVisible();
  });

  test('Cenário 5: Cadastro de Variações de Estoque', async ({ page }) => {
    const productName = `Variation Test Product ${Date.now()}`;

    // 1. Seed: Criar produto sem variações via API
    await api.createProduct({
      name: productName,
      description: 'Produto para teste de adição de variação/grade.',
      basePrice: 119.90,
      categoryIds: [categoryId]
    });

    // 2. Navegar até o painel administrativo
    await page.goto('/admin/produtos', { waitUntil: 'load', timeout: 30000 });

    // Aguardar o carregamento inicial e a hidratação do Next.js
    await page.waitForTimeout(2000);

    // Filtrar pelo nome do produto usando a nova barra de pesquisa
    await searchAndFilterProduct(page, productName);

    // 3. Localizar o produto na lista e clicar no botão de variações (sliders)
    const row = page.locator('tr').filter({ hasText: productName });
    await row.getByTitle('Adicionar variação de estoque').click();

    // 4. Aguardar o modal abrir e preencher as informações
    await expect(page.getByRole('heading', { name: 'Adicionar Grade / Variação' })).toBeVisible({ timeout: 15000 });

    await page.locator('div:has(> label:has-text("Tamanho")) select').selectOption('M');
    await page.locator('div:has(> label:has-text("Cor")) select').selectOption('azul');
    await page.locator('label:has-text("Estoque Inicial")').locator('..').locator('input').fill('15');

    // 5. Clicar em "Adicionar Grade"
    await page.getByRole('button', { name: 'Adicionar Grade' }).click();

    // 6. Validar o fechamento do modal
    await expect(page.getByRole('heading', { name: 'Adicionar Grade / Variação' })).not.toBeVisible({ timeout: 20000 });

    // Garante que o filtro de busca continua ativo e o produto permanece visível na tabela
    await searchAndFilterProduct(page, productName);

    // 7. Assert: Validar se a quantidade de estoque total na tabela foi atualizada para "15 un"
    await expect(row.locator('td').nth(5)).toContainText('15 un', { timeout: 15000 });
  });
  test.describe.serial('Gestão de Imagens e Variações (Novos Cenários)', () => {
    let productName: string;

    test.beforeAll(async () => {
      productName = `Image Var Product ${Date.now()}`;
    });

    test('Setup: Criar Produto e Fazer Upload de Imagens da Galeria', async ({ page }) => {
      // 1. Criar produto base via API
      await api.createProduct({
        name: productName,
        description: 'Produto para testes complexos de grade e imagens.',
        basePrice: 199.90,
        categoryIds: [categoryId]
      });

      // 2. Navegar e pesquisar
      await page.goto('/admin/produtos', { waitUntil: 'load', timeout: 30000 });
      await page.waitForTimeout(2000);
      await searchAndFilterProduct(page, productName);

      // 3. Abrir edição
      const row = page.locator('tr').filter({ hasText: productName });
      await row.getByTitle('Editar produto').click();
      await expect(page.getByRole('heading', { name: 'Editar Produto' })).toBeVisible({ timeout: 15000 });

      // 4. Fazer upload das imagens
      const imgDir = path.join(__dirname, '../imgProducts');
      const filesToUpload = [
        'teste2.jpg', 'teste3.jpg', 'teste4.jpg',
        'teste5.jpg', 'teste6.jpg', 'teste7.jpg', 'treste.jpg'
      ].map(f => path.join(imgDir, f));

      await page.locator('#edit-upload-file').setInputFiles(filesToUpload);

      await page.waitForTimeout(1000); // preview render

      // 5. Salvar como publicado
      await page.getByRole('button', { name: 'Publicar Produto' }).click();
      await expect(page.getByRole('heading', { name: 'Editar Produto' })).not.toBeVisible({ timeout: 20000 });
    });

    test('Cenário 6 Novo: Cadastro da Primeira Variação (Vinculando Fotos Azul)', async ({ page }) => {
      await page.goto('/admin/produtos', { waitUntil: 'load', timeout: 30000 });
      await page.waitForTimeout(2000);
      await searchAndFilterProduct(page, productName);

      const row = page.locator('tr').filter({ hasText: productName });
      await row.getByTitle('Adicionar variação de estoque').click();
      await expect(page.getByRole('heading', { name: 'Adicionar Grade / Variação' })).toBeVisible({ timeout: 15000 });

      await page.locator('div:has(> label:has-text("Tamanho")) select').selectOption('P');
      await page.locator('div:has(> label:has-text("Cor")) select').selectOption('azul');

      const imageButtons = page.locator('.aspect-square.border-2').filter({ has: page.locator('img') });
      await imageButtons.nth(0).click();
      await imageButtons.nth(1).click();

      await expect(imageButtons.nth(0)).toHaveClass(/ring-primary/);
      await expect(imageButtons.nth(1)).toHaveClass(/ring-primary/);

      await page.locator('label:has-text("Estoque Inicial")').locator('..').locator('input').fill('10');

      await page.getByRole('button', { name: 'Adicionar Grade' }).click();
      await expect(page.getByRole('heading', { name: 'Adicionar Grade / Variação' })).not.toBeVisible({ timeout: 20000 });

      await searchAndFilterProduct(page, productName);
      await expect(row.locator('td').nth(5)).toContainText('10 un', { timeout: 15000 });
    });

    test('Cenário 7: Cadastro de Outro Tamanho na Mesma Cor (Auto-preenchimento)', async ({ page }) => {
      await page.goto('/admin/produtos', { waitUntil: 'load', timeout: 30000 });
      await page.waitForTimeout(2000);
      await searchAndFilterProduct(page, productName);

      const row = page.locator('tr').filter({ hasText: productName });
      await row.getByTitle('Adicionar variação de estoque').click();
      await expect(page.getByRole('heading', { name: 'Adicionar Grade / Variação' })).toBeVisible({ timeout: 15000 });

      await page.locator('div:has(> label:has-text("Tamanho")) select').selectOption('M');
      await page.locator('div:has(> label:has-text("Cor")) select').selectOption('azul');

      const imageButtons = page.locator('.aspect-square.border-2').filter({ has: page.locator('img') });

      await expect(imageButtons.nth(0)).toHaveClass(/ring-primary/);
      await expect(imageButtons.nth(1)).toHaveClass(/ring-primary/);

      await page.locator('label:has-text("Estoque Inicial")').locator('..').locator('input').fill('5');

      await page.getByRole('button', { name: 'Adicionar Grade' }).click();
      await expect(page.getByRole('heading', { name: 'Adicionar Grade / Variação' })).not.toBeVisible({ timeout: 20000 });

      await searchAndFilterProduct(page, productName);
      await expect(row.locator('td').nth(5)).toContainText('15 un', { timeout: 15000 });
    });

    test('Cenário 8: Cadastro de Nova Cor e Validação de Conflito de Imagens (Preto)', async ({ page }) => {
      await page.goto('/admin/produtos', { waitUntil: 'load', timeout: 30000 });
      await page.waitForTimeout(2000);
      await searchAndFilterProduct(page, productName);

      const row = page.locator('tr').filter({ hasText: productName });
      await row.getByTitle('Adicionar variação de estoque').click();
      await expect(page.getByRole('heading', { name: 'Adicionar Grade / Variação' })).toBeVisible({ timeout: 15000 });

      await page.locator('div:has(> label:has-text("Tamanho")) select').selectOption('P');
      await page.locator('div:has(> label:has-text("Cor")) select').selectOption('preto');

      const imageButtons = page.locator('.aspect-square.border-2').filter({ has: page.locator('img') });
      await expect(imageButtons.nth(0)).toHaveClass(/cursor-not-allowed/);
      await expect(imageButtons.nth(0)).toContainText(/Em uso/i);
      await expect(imageButtons.nth(1)).toHaveClass(/cursor-not-allowed/);

      await expect(imageButtons.nth(5)).not.toHaveClass(/cursor-not-allowed/);
      await imageButtons.nth(5).click();
      await expect(imageButtons.nth(5)).toHaveClass(/ring-primary/);

      await page.locator('label:has-text("Estoque Inicial")').locator('..').locator('input').fill('12');

      await page.getByRole('button', { name: 'Adicionar Grade' }).click();
      await expect(page.getByRole('heading', { name: 'Adicionar Grade / Variação' })).not.toBeVisible({ timeout: 20000 });

      await searchAndFilterProduct(page, productName);
      await expect(row.locator('td').nth(5)).toContainText('27 un', { timeout: 15000 });
    });

    test('Cenário Extra: Adicionando variações diferentes (Verde, Tamanhos Variados)', async ({ page }) => {
      test.setTimeout(60000);

      await page.goto('/admin/produtos', { waitUntil: 'load', timeout: 30000 });
      await page.waitForTimeout(2000);
      await searchAndFilterProduct(page, productName);

      const row = page.locator('tr').filter({ hasText: productName });
      await row.getByTitle('Adicionar variação de estoque').click();
      await expect(page.getByRole('heading', { name: 'Adicionar Grade / Variação' })).toBeVisible({ timeout: 15000 });

      await page.locator('div:has(> label:has-text("Tamanho")) select').selectOption('G');
      await page.locator('div:has(> label:has-text("Cor")) select').selectOption('verde');

      const imageButtons = page.locator('.aspect-square.border-2').filter({ has: page.locator('img') });
      await imageButtons.nth(6).click();
      await expect(imageButtons.nth(6)).toHaveClass(/ring-primary/);

      await page.locator('label:has-text("Estoque Inicial")').locator('..').locator('input').fill('20');

      await page.getByRole('button', { name: 'Adicionar Grade' }).click();
      await expect(page.getByRole('heading', { name: 'Adicionar Grade / Variação' })).not.toBeVisible({ timeout: 20000 });

      // GG Verde
      await page.goto('/admin/produtos', { waitUntil: 'load', timeout: 30000 });
      await page.waitForTimeout(2000);
      await searchAndFilterProduct(page, productName);
      await row.getByTitle('Adicionar variação de estoque').click();
      await expect(page.getByRole('heading', { name: 'Adicionar Grade / Variação' })).toBeVisible({ timeout: 15000 });

      await page.locator('div:has(> label:has-text("Tamanho")) select').selectOption('GG');
      await page.locator('div:has(> label:has-text("Cor")) select').selectOption('verde');

      await page.waitForTimeout(1000); // Aguarda o react disparar o useEffect do auto-preenchimento
      await expect(page.locator('.aspect-square.border-2').filter({ has: page.locator('img') }).nth(6)).toHaveClass(/ring-primary/);

      await page.locator('label:has-text("Estoque Inicial")').locator('..').locator('input').fill('8');
      await page.getByRole('button', { name: 'Adicionar Grade' }).click();
      await expect(page.getByRole('heading', { name: 'Adicionar Grade / Variação' })).not.toBeVisible({ timeout: 20000 });

      await page.goto('/admin/produtos', { waitUntil: 'load', timeout: 30000 });
      await page.waitForTimeout(2000);
      await searchAndFilterProduct(page, productName);
      await expect(row.locator('td').nth(5)).toContainText('55 un', { timeout: 15000 });
    });
  });
});
