import { test, expect } from '@playwright/test';
import { ApiHelper } from './apiHelper';

test.describe.serial('Cloud Cart (E2E Real)', () => {
  let apiHelper: ApiHelper;
  let testUser = {
    name: 'Cart Test User',
    email: `cart_user_${Date.now()}@test.com`,
    password: 'Password123!',
    document: Math.floor(Math.random() * 100000000000).toString().padStart(11, '0'),
    phone: '11999999999'
  };
  let testProductId: string;
  let testVariationId: string;

  test.beforeAll(async ({ request }) => {
    apiHelper = new ApiHelper(request);
    
    // Create Category
    const categoryId = await apiHelper.getOrCreateCategory('Cloud Cart Category', 'cloud-cart-cat');

    // Create Product
    const product = await apiHelper.createProduct({
      name: 'Cloud Cart Test Product',
      description: 'Test product for cloud cart E2E tests',
      basePrice: 150.00,
      categoryIds: [categoryId]
    });
    testProductId = product.id;

    // Create Variation
    const variation = await apiHelper.addVariation(testProductId, {
      sku: `CLOUD-${Date.now()}`,
      size: 'M',
      color: 'Blue',
      stockQuantity: 100
    });
    testVariationId = variation.id;

    // Publish product
    await apiHelper.publishProduct(testProductId);

    // Create Customer
    await apiHelper.registerCustomer(testUser);
  });

  test.afterAll(async ({ request }) => {
    // Optionally clean up here, though user requested a full TRUNCATE at the end of the whole run.
  });

  test('Cenário 1: Sincronização Real ao realizar Login (Envio do Carrinho Local)', async ({ page }) => {
    // 1. Acessar a aplicação deslogado.
    await page.goto('/');

    // 2. Adicionar 2 unidades da variação do Produto de Teste ao carrinho.
    // Assuming we navigate to the product page and add to cart
    await page.goto(`/produto/${testProductId}`);
    // Wait for the page to load the product
    await page.waitForSelector(`text=Cloud Cart Test Product`);
    
    // Select the variation size and color first so the add-to-cart button is enabled
    await page.getByRole('button', { name: /^M$/i }).click();
    await page.getByRole('button', { name: /^Blue$/i }).click();

    const addToCartBtn = page.getByRole('button', { name: /Adicionar/i });
    await addToCartBtn.click();
    await addToCartBtn.click(); // Add second unit
    await expect(page.locator('[data-testid="cart-icon"] span, a[href="/carrinho"] span').first()).toHaveText('2');

    // 3. Navegar até a tela de Login e realizar a autenticação
    await page.goto('/conta');
    await page.getByPlaceholder('voce@email.com').fill(testUser.email);
    await page.getByPlaceholder('Digite sua senha').fill(testUser.password);

    // Setup the listener for the sync request
    const syncPromise = page.waitForResponse(response => 
      response.url().includes('/api/cart/sync') && response.request().method() === 'POST'
    );

    await page.getByRole('button', { name: /Acessar Loja/i }).click();

    // Aguardar a resposta real da sincronização
    const syncResponse = await syncPromise;
    if (!syncResponse.ok()) {
      console.log('--- SYNC FAILED ---');
      console.log('Status:', syncResponse.status());
      console.log('Body:', await syncResponse.text());
      console.log('-------------------');
    }
    expect(syncResponse.ok()).toBeTruthy();
    expect(syncResponse.status()).toBe(200);

    // Validar se o carrinho reflete as 2 unidades na UI
    // Using the real cart badge selector
    const cartBadge = page.locator('a[href="/carrinho"] span').first();
    await expect(cartBadge).toHaveText('2');
  });

    test('Cenário 2: Sincronização de Mesclagem Real (Merge)', async ({ page, request }) => {
    // 1. Sujar o banco: adicionar 1 unidade usando a API diretamente
    // First, login to get token
    const localApiHelper = new ApiHelper(request);
    const token = await localApiHelper.loginCustomer(testUser.email, testUser.password);
    
    const apiBase = `${process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:5111'}/api`;

    // FIX: Limpa o carrinho do usuário no banco para não herdar o estado do Cenário 1
    await request.delete(`${apiBase}/cart`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    // GET o produto e pega a primeira variação verdadeira do banco!
    const pRes = await request.get(`${apiBase}/products/${testProductId}`);
    const pData = await pRes.json();
    const realVariationId = pData.variations[0].id;

    // Get current cart or add item to cart directly
    const setupResponse = await request.post(`${apiBase}/cart/items`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        productId: testProductId,
        variationId: realVariationId,
        quantity: 1
      }
    });
    if (!setupResponse.ok()) {
       console.log('FALHA SETUP POST:', setupResponse.status(), await setupResponse.text());
    }

    // 2. Fazer Logout / Iniciar nova sessão (Playwright contexts are isolated per test usually, 
    // but page is clean here since we didn't login on `page` in this test yet)
    
    // 3. Acessar aplicação deslogado e adicionar mais 1 unidade
    await page.goto(`/produto/${testProductId}`);
    await page.waitForSelector(`text=Cloud Cart Test Product`);
    await page.getByRole('button', { name: /^M$/i }).click();
    await page.getByRole('button', { name: /^Blue$/i }).click();
    const addToCartBtn = page.getByRole('button', { name: /Adicionar/i });
    await addToCartBtn.click(); // Add 1 unit local

    // 4. Fazer o Login com a mesma conta
    await page.goto('/conta');
    await page.getByPlaceholder('voce@email.com').fill(testUser.email);
    await page.getByPlaceholder('Digite sua senha').fill(testUser.password);

    const syncPromise = page.waitForResponse(response => 
      response.url().includes('/api/cart/sync') && response.request().method() === 'POST'
    );

    await page.getByRole('button', { name: /Acessar Loja/i }).click();

    const syncResponse = await syncPromise;
    expect(syncResponse.ok()).toBeTruthy();

    // Resultado esperado: 2 unidades totais (1 do banco + 1 local)
    const cartBadge = page.locator('a[href="/carrinho"] span').first();
    await expect(cartBadge).toHaveText('2');
  });

  test('Cenário 3: Ajuste Otimista ao Atualizar Quantidade Logado', async ({ page }) => {
    // 1. Logar na aplicação
    await page.goto('/conta');
    await page.getByPlaceholder('voce@email.com').fill(testUser.email);
    await page.getByPlaceholder('Digite sua senha').fill(testUser.password);
    await page.getByRole('button', { name: /Acessar Loja/i }).click();
    await page.waitForSelector('text=Minha Conta'); // Wait until login finishes

    // Limpar carrinho no backend
    const token = await page.evaluate(() => localStorage.getItem('secchi_token'));
    const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:5111';
    await page.request.delete(`${apiBase}/api/cart`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    // Esvaziar carrinho localmente também
    await page.evaluate(() => localStorage.removeItem('secchi_cart'));
    await page.reload();

    // 2. Adicionar o Produto ao carrinho
    await page.goto(`/produto/${testProductId}`);
    await page.waitForSelector(`text=Cloud Cart Test Product`);
    await page.getByRole('button', { name: /^M$/i }).click();
    await page.getByRole('button', { name: /^Blue$/i }).click();
    const addToCartBtn = page.getByRole('button', { name: /Adicionar/i });
    
    // Wait for the POST request to finish so we don't abort it by navigating
    const addPromise = page.waitForResponse(r => r.url().includes('/api/cart/items') && r.request().method() === 'POST');
    await addToCartBtn.click();
    await addPromise;

    // Abrir o carrinho (se for um drawer ou página)
    const cartIcon = page.locator('[data-testid="cart-icon"], .cart-icon').first();
    if (await cartIcon.isVisible()) {
      await cartIcon.click();
    } else {
      await page.goto('/carrinho');
    }

    // 3. Clicar no botão + do item no carrinho para aumentar a quantidade para 2
    // Setup listener
    const updatePromise = page.waitForResponse(response => 
      response.url().includes('/api/cart/items/') && response.request().method() === 'PUT'
    );

    const increaseBtn = page.locator('button:has-text("+"), [data-testid="increase-quantity"]').first();
    await increaseBtn.click();

    // Interface update instantly (optimistic)
    // Here we could check the quantity input value immediately
    const qtyInput = page.locator('input[type="number"], [data-testid="item-quantity"]').first();
    await expect(qtyInput).toHaveText('2');

    // Wait for real backend request
    const updateResponse = await updatePromise;
    expect(updateResponse.ok()).toBeTruthy();
    
    // A requisição PUT deve ter enviado { quantity: 2 }
    const postData = updateResponse.request().postDataJSON();
    expect(postData).toBe(2);
  });

  test('Cenário 4: Exclusão de Item', async ({ page }) => {
    // 1. Logar na aplicação
    await page.goto('/conta');
    await page.getByPlaceholder('voce@email.com').fill(testUser.email);
    await page.getByPlaceholder('Digite sua senha').fill(testUser.password);
    await page.getByRole('button', { name: /Acessar Loja/i }).click();
    await page.waitForSelector('text=Minha Conta');

    // 2. Adicionar item
    await page.goto(`/produto/${testProductId}`);
    await page.waitForSelector(`text=Cloud Cart Test Product`);
    await page.getByRole('button', { name: /^M$/i }).click();
    await page.getByRole('button', { name: /^Blue$/i }).click();
    const addToCartBtn = page.getByRole('button', { name: /Adicionar/i });
    await addToCartBtn.click();

    await page.goto('/carrinho');

    // 3. Remover item
    const deletePromise = page.waitForResponse(response => 
      response.url().includes('/api/cart') && response.request().method() === 'DELETE'
    );

    const removeBtn = page.locator('button[aria-label="Remover item"], [data-testid="remove-item"]').first();
    await removeBtn.click();

    // O item deve sumir da UI imediatamente
    await expect(removeBtn).toBeHidden();

    // E capturar o delete real
    const deleteResponse = await deletePromise;
    expect(deleteResponse.ok()).toBeTruthy();
  });

  test('Cenário 5: Limpeza Total do Carrinho (Clear Cart)', async ({ page }) => {
    // 1. Logar na aplicação
    await page.goto('/conta');
    await page.getByPlaceholder('voce@email.com').fill(testUser.email);
    await page.getByPlaceholder('Digite sua senha').fill(testUser.password);
    await page.getByRole('button', { name: /Acessar Loja/i }).click();
    await page.waitForSelector('text=Minha Conta');

    // 2. Adicionar itens
    await page.goto(`/produto/${testProductId}`);
    await page.waitForSelector(`text=Cloud Cart Test Product`);
    await page.getByRole('button', { name: /^M$/i }).click();
    await page.getByRole('button', { name: /^Blue$/i }).click();
    const addToCartBtn = page.getByRole('button', { name: /Adicionar/i });
    await addToCartBtn.click();

    await page.goto('/carrinho');

    // 3. Limpar Carrinho
    const clearPromise = page.waitForResponse(response => 
      response.url().endsWith('/api/cart') && response.request().method() === 'DELETE'
    );

    const clearCartBtn = page.getByRole('button', { name: /Limpar Carrinho|Esvaziar/i }).first();
    await clearCartBtn.click();

    // Carrinho vazio na UI
    const emptyMessage = page.locator('text=/carrinho est. vazio/i');
    await expect(emptyMessage).toBeVisible();

    // Backend request success
    const clearResponse = await clearPromise;
    expect(clearResponse.ok()).toBeTruthy();
  });
});
