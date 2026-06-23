import { test, expect } from '@playwright/test';
import { ApiHelper } from './apiHelper';

test.describe.serial('Checkout Idempotency - Concorrência via API', () => {
  let apiHelper: ApiHelper;

  test.beforeAll(async ({ request }) => {
    apiHelper = new ApiHelper(request);
    await apiHelper.setShippingModeToFixed(15.0);
  });

  test('Cenário 1: Múltiplas requisições paralelas com a mesma Idempotency-Key', async ({ page, request }) => {
    test.setTimeout(90000); // 90 segundos para dar tempo de preencher todo o novo formulário
    const helper = new ApiHelper(request);
    
    // 1. Setup de Produto
    const catId = await helper.getOrCreateCategory('Idempotency Cat', 'idemp-cat');
    const p = await helper.createProduct({ name: 'Produto Idempotente', description: 'Teste de Idempotência', basePrice: 50, categoryIds: [catId] });
    await helper.addVariation(p.id, { sku: `IDEMP-${Date.now()}`, size: 'U', color: 'Blue', stockQuantity: 100 });
    await helper.publishProduct(p.id);

    // 2. Setup de Usuário
    const testUser = { name: 'User Idemp', email: `uidemp_${Date.now()}@test.com`, password: 'Password123!', document: `${Math.floor(10000000000 + Math.random() * 90000000000)}`, phone: '11999999999' };
    await helper.registerCustomer(testUser);

    // 3. Login
    await page.goto('/conta');
    await page.getByPlaceholder('voce@email.com').fill(testUser.email);
    await page.getByPlaceholder('Digite sua senha').fill(testUser.password);
    await page.getByRole('button', { name: /Acessar Loja/i }).click();
    await page.waitForSelector('text=Minha Conta');

    // 4. Adicionar ao Carrinho
    await page.goto(`/produto/${p.id}`);
    await page.waitForSelector(`text=Blue`);
    await page.getByRole('button', { name: /^U$/i }).click();
    await page.getByRole('button', { name: /^Blue$/i }).click();
    const addToCartBtn = page.getByRole('button', { name: /Adicionar/i });
    const addPromise = page.waitForResponse(r => r.url().includes('/api/cart/items') && r.request().method() === 'POST');
    await addToCartBtn.click();
    await addPromise;
    
    // Aguardar o carrinho atualizar (badge)
    await expect(page.locator('[data-testid="cart-icon"] span, a[href="/carrinho"] span').first()).toHaveText('1');

    // 5. Ir para o Checkout
    // Primeiramente vamos ao carrinho, que é o padrão
    await page.goto('/carrinho');
    
    // O botão para ir ao checkout ou finalizar a compra diretamente
    const btnCheckout = page.getByRole('button', { name: /Finalizar Compra|Ir para pagamento/i }).first();
    await btnCheckout.click();
    
    // Supondo que a navegação vá para a tela de checkout (ex: /checkout)
    // Usaremos a espera implícita do próximo seletor ao invés de waitForURL para evitar timeout no SPA.
    
    // 6. Preparar Interceptação da chamada final da API
    const checkoutApiUrl = '**/api/checkout';
    
    let capturedRequestData: any = null;
    let capturedHeaders: any = null;
    let idempotencyKey: string | null = null;
    
    // Usaremos essa promise para pausar o teste até que a requisição UI seja interceptada e resolvida
    let routePromiseResolver: () => void;
    const routeHoldPromise = new Promise<void>((resolve) => {
      routePromiseResolver = resolve;
    });

    await page.route(checkoutApiUrl, async (route) => {
      const req = route.request();
      if (req.method() === 'POST') {
        capturedRequestData = req.postDataJSON();
        capturedHeaders = req.headers();
        idempotencyKey = capturedHeaders['x-idempotency-key'] || capturedHeaders['X-Idempotency-Key'];
        
        // Avisar ao teste que capturamos os dados
        routePromiseResolver();
        
        // Seguramos a rota um pouco para simular a rede e dar tempo do teste disparar as paralelas
        await new Promise(r => setTimeout(r, 1500));
        
        await route.continue();
      } else {
        await route.continue();
      }
    });

    // 7. Preencher Endereço (Passo 1 do novo checkout)
    const cepInput = page.locator('input[name="zipCode"]');
    await cepInput.waitFor({ state: 'visible', timeout: 10000 });
    
    if (await cepInput.isVisible()) {
      await cepInput.fill('01001000');
      await page.keyboard.press('Tab');
      
      // Preencher outros campos obrigatórios do endereço
      await page.locator('input[name="address"]').fill('Rua Teste de Idempotencia');
      await page.locator('input[name="number"]').fill('123');
      await page.locator('input[name="city"]').fill('São Paulo');
      await page.locator('input[name="state"]').fill('SP');

      // Aguardar opções de frete carregarem (a div com animate-pulse desaparece)
      await page.waitForTimeout(1000); 
      const loadingShipping = page.locator('text=Calculando opções de frete...');
      if (await loadingShipping.isVisible()) {
        await loadingShipping.waitFor({ state: 'hidden', timeout: 5000 });
      }

      // Aguardar as opções de frete ficarem visíveis e o rádio button estar clicável
      const shippingRadio = page.locator('input[name="shipping"]').first();
      await shippingRadio.waitFor({ state: 'visible' });
      await shippingRadio.check();

      // Clicar em Continuar para Pagamento para avançar para a Etapa 2
      await page.getByRole('button', { name: /Continuar para Pagamento/i }).click();
      await page.waitForTimeout(1000); // Aguardar transição de tela
    }
    
    // 8. Passo 2: Selecionar Pix
    const pixOption = page.locator('text=Pix').first();
    if (await pixOption.isVisible()) {
      await pixOption.click();
    }

    // Agora o clique final
    await page.getByRole('button', { name: /Finalizar Pedido/i }).first().click();

    // 8. Aguardar a requisição ser interceptada
    await routeHoldPromise;
    
    expect(idempotencyKey, 'O header X-Idempotency-Key deve ser enviado pelo Frontend').toBeTruthy();
    expect(capturedRequestData).toBeTruthy();

    console.log(`Disparando requisições paralelas com a Idempotency-Key: ${idempotencyKey}`);
    
    // 9. Disparar 3 requisições concorrentes diretamente via API
    const customHeaders = {
      'Content-Type': 'application/json',
      'Authorization': capturedHeaders['authorization'] || capturedHeaders['Authorization'],
      'X-Idempotency-Key': idempotencyKey || ''
    };

    const parallelRequests = [];
    for (let i = 0; i < 3; i++) {
      parallelRequests.push(
        request.post(`${process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:5111'}/api/checkout`, {
          headers: customHeaders,
          data: capturedRequestData
        })
      );
    }

    const responses = await Promise.all(parallelRequests);
    
    // 10. Validar Respostas do Backend
    let successCount = 0;
    for (const res of responses) {
      if (res.status() === 200 || res.status() === 201) {
        successCount++;
      }
    }
    
    // Asserção backend: Esperamos que o sistema lide bem e não quebre (se ele retorna o cache, os status serão sucesso)
    // Como a sua regra pode variar (retornar 409 Conflict ou 200 OK do cache), garantimos pelo menos que não deu 500
    for (const res of responses) {
      expect(res.status()).toBeLessThan(500); 
    }

    // 11. Validar comportamento da UI
    // O Front-end deve processar a requisição original tranquilamente e redirecionar
    await page.waitForURL('**/pedido-confirmado*', { timeout: 15000 });
    
    // Verifica se a tela finalizou corretamente
    // Em vez de usar .or() (que encontrou 2 elementos na mesma tela),
    // busque especificamente o título principal (heading) da página de confirmação.
    const successMessage = page.getByRole('heading', { name: /Pedido Confirmado/i });
    await expect(successMessage).toBeVisible();
  });
});
