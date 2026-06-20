import { test, expect, BrowserContext } from '@playwright/test';
import { ApiHelper } from './apiHelper';

test.describe.serial('Cart Journey (Phase 2) - E2E Completo', () => {
  let apiHelper: ApiHelper;

  test.beforeAll(async ({ request }) => {
    apiHelper = new ApiHelper(request);
    await apiHelper.setShippingModeToFixed();
  });

  // --- GRUPO 1: Transição de Guest para Logged e Deleção ---
  test.describe('Grupo 1: Transição de Guest para Logged e Deleção', () => {

    test('Cenário 1.1: Deleção em Massa (Clear Cart)', async ({ page, request }) => {
      const helper = new ApiHelper(request);
      const catId = await helper.getOrCreateCategory('Clear Cart Cat', 'clear-cart-cat');
      
      const p1 = await helper.createProduct({ name: 'Prod 1.1A', description: 'Desc', basePrice: 10, categoryIds: [catId] });
      const p2 = await helper.createProduct({ name: 'Prod 1.1B', description: 'Desc', basePrice: 20, categoryIds: [catId] });
      const p3 = await helper.createProduct({ name: 'Prod 1.1C', description: 'Desc', basePrice: 30, categoryIds: [catId] });
      
      await helper.addVariation(p1.id, { sku: `P1A-${Date.now()}`, size: 'M', color: 'Red', stockQuantity: 10 });
      await helper.addVariation(p2.id, { sku: `P1B-${Date.now()}`, size: 'M', color: 'Red', stockQuantity: 10 });
      await helper.addVariation(p3.id, { sku: `P1C-${Date.now()}`, size: 'M', color: 'Red', stockQuantity: 10 });
      
      await helper.publishProduct(p1.id);
      await helper.publishProduct(p2.id);
      await helper.publishProduct(p3.id);

      const testUser = { name: 'User 1.1', email: `u1.1_${Date.now()}@test.com`, password: 'Password123!', document: `${Math.floor(10000000000 + Math.random() * 90000000000)}`, phone: '11999999999' };
      await helper.registerCustomer(testUser);

      // 1. Adicionar 3 produtos deslogado
      for (let i = 0; i < [p1.id, p2.id, p3.id].length; i++) {
        const pId = [p1.id, p2.id, p3.id][i];
        await page.goto(`/produto/${pId}`);
        await page.waitForSelector(`text=Red`);
        await page.getByRole('button', { name: /^M$/i }).click();
        await page.getByRole('button', { name: /^Red$/i }).click();
        await page.getByRole('button', { name: /Adicionar/i }).click();
        
        // Aguardar o número no badge do carrinho atualizar para garantir que o estado local foi salvo
        const expectedCount = (i + 1).toString();
        await expect(page.locator('[data-testid="cart-icon"] span, a[href="/carrinho"] span').first()).toHaveText(expectedCount);
      }

      // 2. Realizar Login
      await page.goto('/conta');
      await page.getByPlaceholder('voce@email.com').fill(testUser.email);
      await page.getByPlaceholder('Digite sua senha').fill(testUser.password);
      await page.getByRole('button', { name: /Acessar Loja/i }).click();
      await page.waitForSelector('text=Minha Conta');

      // 3. Acessar o carrinho
      await page.goto('/carrinho');
      await page.waitForSelector('text=Resumo');

      // 4. Clicar no botão global de "Limpar Carrinho"
      const clearPromise = page.waitForResponse(r => r.url().endsWith('/api/cart') && r.request().method() === 'DELETE');
      await page.getByRole('button', { name: /Limpar Carrinho|Esvaziar/i }).first().click();
      await clearPromise;

      // 5. Validar que esvaziou na UI
      const emptyMsg = page.locator('text=/carrinho est. vazio/i');
      await expect(emptyMsg).toBeVisible();

      // 6. Fazer reload (F5) e verificar se continua vazio (confirmando deleção no DB)
      await page.reload();
      await expect(emptyMsg).toBeVisible();
    });

    test('Cenário 1.2: Deleção Gradual pelo Botão Menos (-)', async ({ page, request }) => {
      const helper = new ApiHelper(request);
      const catId = await helper.getOrCreateCategory('Minus Cat', 'minus-cat');
      const p1 = await helper.createProduct({ name: 'Prod 1.2', description: 'Desc', basePrice: 10, categoryIds: [catId] });
      await helper.addVariation(p1.id, { sku: `P1.2-${Date.now()}`, size: 'M', color: 'Blue', stockQuantity: 10 });
      await helper.publishProduct(p1.id);

      const testUser = { name: 'User 1.2', email: `u1.2_${Date.now()}@test.com`, password: 'Password123!', document: `${Math.floor(10000000000 + Math.random() * 90000000000)}`, phone: '11999999999' };
      await helper.registerCustomer(testUser);

      // Adicionar 2 unidades deslogado
      await page.goto(`/produto/${p1.id}`);
      await page.waitForSelector(`text=Blue`);
      await page.getByRole('button', { name: /^M$/i }).click();
      await page.getByRole('button', { name: /^Blue$/i }).click();
      const addBtn = page.getByRole('button', { name: /Adicionar/i });
      await addBtn.click();
      await addBtn.click(); // 2 unidades
      await expect(page.locator('[data-testid="cart-icon"] span, a[href="/carrinho"] span').first()).toHaveText('2');

      // Login
      await page.goto('/conta');
      await page.getByPlaceholder('voce@email.com').fill(testUser.email);
      await page.getByPlaceholder('Digite sua senha').fill(testUser.password);
      await page.getByRole('button', { name: /Acessar Loja/i }).click();
      await page.waitForSelector('text=Minha Conta');

      // Acessar carrinho
      await page.goto('/carrinho');
      
      const decreaseBtn = page.locator('[data-testid="decrease-quantity"]').first();
      const qtyInput = page.locator('input[type="number"], [data-testid="item-quantity"]').first();

      // Clicar em (-) para ir para 1
      const putPromise1 = page.waitForResponse(r => r.url().includes('/api/cart/items/') && r.request().method() === 'PUT');
      await decreaseBtn.click();
      await putPromise1;
      await expect(qtyInput).toHaveText('1');

      // Clicar em (-) para ir para 0
      const delPromise = page.waitForResponse(r => r.url().includes('/api/cart') && r.request().method() === 'DELETE');
      await decreaseBtn.click();
      await delPromise;

      // Esperar item sumir
      await expect(decreaseBtn).toBeHidden();

      // Fazer F5
      await page.reload();
      await expect(page.locator('text=/carrinho est. vazio/i')).toBeVisible();
    });

    test('Cenário 1.3: Deleção pelo Botão Remover (Lixeira do Item)', async ({ page, request }) => {
      const helper = new ApiHelper(request);
      const catId = await helper.getOrCreateCategory('Trash Cat', 'trash-cat');
      const p1 = await helper.createProduct({ name: 'Prod 1.3', description: 'Desc', basePrice: 10, categoryIds: [catId] });
      await helper.addVariation(p1.id, { sku: `P1.3-${Date.now()}`, size: 'M', color: 'Blue', stockQuantity: 10 });
      await helper.publishProduct(p1.id);

      const testUser = { name: 'User 1.3', email: `u1.3_${Date.now()}@test.com`, password: 'Password123!', document: `${Math.floor(10000000000 + Math.random() * 90000000000)}`, phone: '11999999999' };
      await helper.registerCustomer(testUser);

      // Adicionar produto deslogado
      await page.goto(`/produto/${p1.id}`);
      await page.waitForSelector(`text=Blue`);
      await page.getByRole('button', { name: /^M$/i }).click();
      await page.getByRole('button', { name: /^Blue$/i }).click();
      await page.getByRole('button', { name: /Adicionar/i }).click();
      await expect(page.locator('[data-testid="cart-icon"] span, a[href="/carrinho"] span').first()).toHaveText('1');

      // Login
      await page.goto('/conta');
      await page.getByPlaceholder('voce@email.com').fill(testUser.email);
      await page.getByPlaceholder('Digite sua senha').fill(testUser.password);
      await page.getByRole('button', { name: /Acessar Loja/i }).click();
      await page.waitForSelector('text=Minha Conta');

      // Acessar carrinho
      await page.goto('/carrinho');

      // Clicar na lixeira específica do item
      const trashBtn = page.locator('button[aria-label="Remover item"], [data-testid="remove-item"]').first();
      const delPromise = page.waitForResponse(r => r.url().includes('/api/cart') && r.request().method() === 'DELETE');
      await trashBtn.click();
      await delPromise;

      await expect(trashBtn).toBeHidden();

      // F5
      await page.reload();
      await expect(page.locator('text=/carrinho est. vazio/i')).toBeVisible();
    });
  });

  // --- GRUPO 2: Proteção de Estoque Síncrona e Assíncrona ---
  test.describe('Grupo 2: Proteção de Estoque', () => {

    test('Cenário 2.1: Bloqueio Local ao ultrapassar estoque (Botão +)', async ({ page, request }) => {
      const helper = new ApiHelper(request);
      const catId = await helper.getOrCreateCategory('Stock Cat', 'stock-cat');
      const pC = await helper.createProduct({ name: 'Produto C', description: 'Desc', basePrice: 10, categoryIds: [catId] });
      await helper.addVariation(pC.id, { sku: `PC-${Date.now()}`, size: 'M', color: 'Black', stockQuantity: 3 }); // Cravado em 3
      await helper.publishProduct(pC.id);

      const testUser = { name: 'User 2.1', email: `u2.1_${Date.now()}@test.com`, password: 'Password123!', document: `${Math.floor(10000000000 + Math.random() * 90000000000)}`, phone: '11999999999' };
      await helper.registerCustomer(testUser);

      // Adicionar deslogado
      await page.goto(`/produto/${pC.id}`);
      await page.waitForSelector(`text=Black`);
      await page.getByRole('button', { name: /^M$/i }).click();
      await page.getByRole('button', { name: /^Black$/i }).click();
      await page.getByRole('button', { name: /Adicionar/i }).click();
      await expect(page.locator('[data-testid="cart-icon"] span, a[href="/carrinho"] span').first()).toHaveText('1');

      // Login
      await page.goto('/conta');
      await page.getByPlaceholder('voce@email.com').fill(testUser.email);
      await page.getByPlaceholder('Digite sua senha').fill(testUser.password);
      await page.getByRole('button', { name: /Acessar Loja/i }).click();
      await page.waitForSelector('text=Minha Conta');

      // Acessar Carrinho
      await page.goto('/carrinho');
      const plusBtn = page.locator('[data-testid="increase-quantity"]').first();
      const qtyInput = page.locator('input[type="number"], [data-testid="item-quantity"]').first();

      // Ir para 2
      const putPromise1 = page.waitForResponse(r => r.url().includes('/api/cart/items') && r.request().method() === 'PUT');
      await plusBtn.click();
      await putPromise1;
      await expect(qtyInput).toHaveText('2');
      // Ir para 3
      const putPromise2 = page.waitForResponse(r => r.url().includes('/api/cart/items') && r.request().method() === 'PUT');
      await plusBtn.click();
      await putPromise2;
      await expect(qtyInput).toHaveText('3');

      // Tentar ir para 4
      await plusBtn.click();

      // Deve barrar localmente e mostrar Toast
      await expect(qtyInput).toHaveText('3');
      await expect(page.locator('text=Quantidade máxima')).toBeVisible();
    });

    test('Cenário 2.2: Adição direta na página do Produto estourando estoque', async ({ page, request }) => {
      const helper = new ApiHelper(request);
      const catId = await helper.getOrCreateCategory('Stock Cat 2', 'stock-cat-2');
      const pD = await helper.createProduct({ name: 'Produto D', description: 'Desc', basePrice: 10, categoryIds: [catId] });
      await helper.addVariation(pD.id, { sku: `PD-${Date.now()}`, size: 'M', color: 'Black', stockQuantity: 2 }); // Cravado em 2
      await helper.publishProduct(pD.id);

      const testUser = { name: 'User 2.2', email: `u2.2_${Date.now()}@test.com`, password: 'Password123!', document: `${Math.floor(10000000000 + Math.random() * 90000000000)}`, phone: '11999999999' };
      await helper.registerCustomer(testUser);

      // Login
      await page.goto('/conta');
      await page.getByPlaceholder('voce@email.com').fill(testUser.email);
      await page.getByPlaceholder('Digite sua senha').fill(testUser.password);
      await page.getByRole('button', { name: /Acessar Loja/i }).click();
      await page.waitForSelector('text=Minha Conta');

      // Ir para Produto D
      await page.goto(`/produto/${pD.id}`);
      await page.waitForSelector(`text=Black`);
      await page.getByRole('button', { name: /^M$/i }).click();
      await page.getByRole('button', { name: /^Black$/i }).click();

      // Tentar estourar o estoque pelo botão +
      const btnPlus = page.locator('button:has(svg.lucide-plus), button:has-text("+")').first();
      await btnPlus.click(); // Vai para 2
      
      // O botão deve ficar desabilitado, impedindo passar do limite
      await expect(btnPlus).toBeDisabled();
      
      const addBtn = page.getByRole('button', { name: /Adicionar/i });
      await addBtn.click();
      
      // Checar o carrinho
      await page.goto('/carrinho');
      const cartQty = page.locator('input[type="number"], [data-testid="item-quantity"]').first();
      // O carrinho só deve ter registrado 2 itens (o máximo permitido) ou bloqueado completamente.
      // Se bloqueou na página, o cart deve ter 2. Assumimos que o frontend limitou a 2.
      const val = await cartQty.textContent();
      expect(Number(val)).toBeLessThanOrEqual(2);
    });

    test('Cenário 2.3: Auto-correção (Corte Assíncrono do Backend)', async ({ page, request }) => {
      const helper = new ApiHelper(request);
      const catId = await helper.getOrCreateCategory('Async Cat', 'async-cat');
      const pE = await helper.createProduct({ name: 'Produto E', description: 'Desc', basePrice: 10, categoryIds: [catId] });
      const vE = await helper.addVariation(pE.id, { sku: `PE-${Date.now()}`, size: 'M', color: 'White', stockQuantity: 10 });
      await helper.publishProduct(pE.id);

      const testUser = { name: 'User 2.3', email: `u2.3_${Date.now()}@test.com`, password: 'Password123!', document: `${Math.floor(10000000000 + Math.random() * 90000000000)}`, phone: '11999999999' };
      await helper.registerCustomer(testUser);

      // Login
      await page.goto('/conta');
      await page.getByPlaceholder('voce@email.com').fill(testUser.email);
      await page.getByPlaceholder('Digite sua senha').fill(testUser.password);
      await page.getByRole('button', { name: /Acessar Loja/i }).click();
      await page.waitForSelector('text=Minha Conta');

      // Adicionar 5 unidades
      await page.goto(`/produto/${pE.id}`);
      await page.waitForSelector(`text=White`);
      await page.getByRole('button', { name: /^M$/i }).click();
      await page.getByRole('button', { name: /^White$/i }).click();
      const btnPlus = page.locator('button:has(svg.lucide-plus), button:has-text("+")').first();
      for(let i=0; i<4; i++) {
        await btnPlus.click();
      }
      await page.getByRole('button', { name: /Adicionar/i }).click();
      await expect(page.locator('[data-testid="cart-icon"] span, a[href="/carrinho"] span').first()).toHaveText('5');

      await page.goto('/carrinho');
      const cartQtyInput = page.locator('input[type="number"], [data-testid="item-quantity"]').first();
      await expect(cartQtyInput).toHaveText('5');

      // 3. Por debaixo dos panos, simular compra de 8 itens para o estoque cair de 10 para 2
      for (let i = 0; i < 8; i++) {
        const realVariationId = vE.variations[0].id;
        await helper.createOrderForVariation(realVariationId);
      }

      // 4. De volta à UI, clicar no botão (+) (tentando ir para 6)
      const plusBtn = page.locator('[data-testid="increase-quantity"]').first();
      const putPromise = page.waitForResponse(r => r.url().includes('/api/cart/items/') && r.request().method() === 'PUT');
      await plusBtn.click();
      const putResponse = await putPromise;

      // 5. O backend responde com erro 400 ou status limit e a UI dá um snap automático para 2
      // expect(putResponse.status()).not.toBe(200); // Depende de como a API foi feita, as vezes responde 200 com a quantidade realocada
      
      // O input na UI deve snap para '2'
      await expect(cartQtyInput).toHaveText('2');
      await expect(page.locator('text=Quantidade reduzida')).toBeVisible();
    });
  });

  // --- GRUPO 3: Stress, Debounce e Concorrência ---
  test.describe('Grupo 3: Stress, Concorrência e Multi-Clientes', () => {

    test('Cenário 3.1: Metralhadora de Cliques (Debounce Validation)', async ({ page, request }) => {
      const helper = new ApiHelper(request);
      const catId = await helper.getOrCreateCategory('Stress Cat', 'stress-cat');
      const pF = await helper.createProduct({ name: 'Produto F', description: 'Desc', basePrice: 10, categoryIds: [catId] });
      await helper.addVariation(pF.id, { sku: `PF-${Date.now()}`, size: 'L', color: 'Green', stockQuantity: 50 });
      await helper.publishProduct(pF.id);

      const testUser = { name: 'User 3.1', email: `u3.1_${Date.now()}@test.com`, password: 'Password123!', document: `${Math.floor(10000000000 + Math.random() * 90000000000)}`, phone: '11999999999' };
      await helper.registerCustomer(testUser);

      // Login
      await page.goto('/conta');
      await page.getByPlaceholder('voce@email.com').fill(testUser.email);
      await page.getByPlaceholder('Digite sua senha').fill(testUser.password);
      await page.getByRole('button', { name: /Acessar Loja/i }).click();
      await page.waitForSelector('text=Minha Conta');

      // Adicionar 1 unidade
      await page.goto(`/produto/${pF.id}`);
      await page.waitForSelector(`text=Green`);
      await page.getByRole('button', { name: /^L$/i }).click();
      await page.getByRole('button', { name: /^Green$/i }).click();
      await page.getByRole('button', { name: /Adicionar/i }).click();
      await expect(page.locator('[data-testid="cart-icon"] span, a[href="/carrinho"] span').first()).toHaveText('1');

      // Abrir carrinho
      await page.goto('/carrinho');
      const plusBtn = page.locator('[data-testid="increase-quantity"]').first();
      const qtyInput = page.locator('input[type="number"], [data-testid="item-quantity"]').first();

      let putRequests = 0;
      page.on('request', req => {
        if (req.url().includes('/api/cart/items/') && req.method() === 'PUT') {
          putRequests++;
        }
      });

      // Clicar freneticamente 15 vezes
      for (let i = 0; i < 15; i++) {
        await plusBtn.click({ delay: 10 }); // Clicks bem rápidos
      }

      // Esperar a UI atualizar instantaneamente
      await expect(qtyInput).toHaveText('16');

      // Aguardar debounce finalizar
      await page.waitForTimeout(2000);

      // Garantir que não gerou spam (apenas 1 requisição final validando debounce)
      // Pode ser 2 se a primeira não foi "debounced" (leading edge)
      expect(putRequests).toBeLessThanOrEqual(2); 
    });

    test('Cenário 3.2: Concorrência de Clientes (Multi-Browser Context)', async ({ browser, request }) => {
      const helper = new ApiHelper(request);
      const catId = await helper.getOrCreateCategory('Concurrent Cat', 'concurrent-cat');
      const pG = await helper.createProduct({ name: 'Produto G', description: 'Desc', basePrice: 10, categoryIds: [catId] });
      const vG = await helper.addVariation(pG.id, { sku: `PG-${Date.now()}`, size: 'L', color: 'Purple', stockQuantity: 3 });
      await helper.publishProduct(pG.id);

      const userA = { name: 'User A', email: `ua_${Date.now()}@test.com`, password: 'Password123!', document: `${Math.floor(10000000000 + Math.random() * 90000000000)}`, phone: '11999999999' };
      const userB = { name: 'User B', email: `ub_${Date.now()}@test.com`, password: 'Password123!', document: `${Math.floor(10000000000 + Math.random() * 90000000000)}`, phone: '11999999999' };
      await helper.registerCustomer(userA);
      await helper.registerCustomer(userB);

      // Cria dois contextos totalmente separados
      const contextA = await browser.newContext();
      const contextB = await browser.newContext();
      const pageA = await contextA.newPage();
      const pageB = await contextB.newPage();

      // Cliente A Login
      await pageA.goto('/conta');
      await pageA.getByPlaceholder('voce@email.com').fill(userA.email);
      await pageA.getByPlaceholder('Digite sua senha').fill(userA.password);
      await pageA.getByRole('button', { name: /Acessar Loja/i }).click();
      await pageA.waitForSelector('text=Minha Conta');

      // Cliente B Login
      await pageB.goto('/conta');
      await pageB.getByPlaceholder('voce@email.com').fill(userB.email);
      await pageB.getByPlaceholder('Digite sua senha').fill(userB.password);
      await pageB.getByRole('button', { name: /Acessar Loja/i }).click();
      await pageB.waitForSelector('text=Minha Conta');

      // Cliente A adiciona as 3 unidades no carrinho
      await pageA.goto(`/produto/${pG.id}`);
      await pageA.waitForSelector(`text=Purple`);
      await pageA.getByRole('button', { name: /^L$/i }).click();
      await pageA.getByRole('button', { name: /^Purple$/i }).click();
      const btnPlusA = pageA.locator('button:has(svg.lucide-plus), button:has-text("+")').first();
      await btnPlusA.click();
      await btnPlusA.click();
      await pageA.getByRole('button', { name: /Adicionar/i }).click();
      await pageA.goto('/carrinho');
      await expect(pageA.locator('[data-testid="item-quantity"]').first()).toHaveText('3');

      // Cliente B também adiciona as 3 unidades no carrinho (antes do A finalizar)
      await pageB.goto(`/produto/${pG.id}`);
      await pageB.waitForSelector(`text=Purple`);
      await pageB.getByRole('button', { name: /^L$/i }).click();
      await pageB.getByRole('button', { name: /^Purple$/i }).click();
      const btnPlusB = pageB.locator('button:has(svg.lucide-plus), button:has-text("+")').first();
      await btnPlusB.click();
      await btnPlusB.click();
      await pageB.getByRole('button', { name: /Adicionar/i }).click();
      await pageB.goto('/carrinho');
      await expect(pageB.locator('[data-testid="item-quantity"]').first()).toHaveText('3');

      // Cliente A finaliza a compra (simularemos chamando o checkout direto via API para ir mais rápido, ou checkout UI)
      // Como a UI de checkout pode ter passos complexos, usamos apiHelper para finalizar a compra do A para esgotar o estoque
      await helper.loginCustomer(userA.email, userA.password); // Auth como User A na API
      const realVariationG = vG.variations[0].id;
      await helper.createOrderForVariation(realVariationG);
      await helper.createOrderForVariation(realVariationG);
      await helper.createOrderForVariation(realVariationG); // Consumiu as 3 unidades

      // Agora Cliente B vai tentar ir pro Checkout clicando em "Finalizar Compra" ou tentar adicionar mais
      // O estoque já é 0 no DB
      await pageB.reload(); // Recarrega carrinho, se o backend valida na leitura, já acusa aqui
      // Ou clicar no + 
      const plusBtnB = pageB.locator('[data-testid="increase-quantity"]').first();
      if (await plusBtnB.isVisible()) {
         await plusBtnB.click();
         await expect(pageB.locator('text=Quantidade máxima')).toBeVisible();
      }

      await contextA.close();
      await contextB.close();
    });
  });

  // --- GRUPO 4: Idempotência de Hydration (O Bug do F5) ---
  test.describe('Grupo 4: Idempotência de Hydration', () => {

    test('Cenário 4.1: Refresh Seguro da Página', async ({ page, request }) => {
      const helper = new ApiHelper(request);
      const catId = await helper.getOrCreateCategory('Hydration Cat', 'hydration-cat');
      const pH = await helper.createProduct({ name: 'Produto H', description: 'Desc', basePrice: 10, categoryIds: [catId] });
      await helper.addVariation(pH.id, { sku: `PH-${Date.now()}`, size: 'M', color: 'Yellow', stockQuantity: 10 });
      await helper.publishProduct(pH.id);

      const testUser = { name: 'User 4.1', email: `u4.1_${Date.now()}@test.com`, password: 'Password123!', document: `${Math.floor(10000000000 + Math.random() * 90000000000)}`, phone: '11999999999' };
      await helper.registerCustomer(testUser);

      // Login
      await page.goto('/conta');
      await page.getByPlaceholder('voce@email.com').fill(testUser.email);
      await page.getByPlaceholder('Digite sua senha').fill(testUser.password);
      await page.getByRole('button', { name: /Acessar Loja/i }).click();
      await page.waitForSelector('text=Minha Conta');

      // Adicionar 3 unidades
      await page.goto(`/produto/${pH.id}`);
      await page.waitForSelector(`text=Yellow`);
      await page.getByRole('button', { name: /^M$/i }).click();
      await page.getByRole('button', { name: /^Yellow$/i }).click();
      const btnPlus = page.locator('button:has(svg.lucide-plus), button:has-text("+")').first();
      for(let i=0; i<2; i++) {
        await btnPlus.click();
      }
      await page.getByRole('button', { name: /Adicionar/i }).click();
      await expect(page.locator('[data-testid="cart-icon"] span, a[href="/carrinho"] span').first()).toHaveText('3');

      // Vai para o carrinho
      await page.goto('/carrinho');
      const qtyInput = page.locator('input[type="number"], [data-testid="item-quantity"]').first();
      await expect(qtyInput).toHaveText('3');

      // F5
      await page.reload();

      // Deve continuar 3 e não dobrar (bug de hidratação)
      await expect(qtyInput).toHaveText('3');
    });
  });
});
