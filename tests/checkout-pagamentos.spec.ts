import { test, expect } from '@playwright/test';
import { ApiHelper } from './apiHelper';

function generateValidCPF(): string {
  const randomDigit = () => Math.floor(Math.random() * 9);
  const n1 = randomDigit(), n2 = randomDigit(), n3 = randomDigit();
  const n4 = randomDigit(), n5 = randomDigit(), n6 = randomDigit();
  const n7 = randomDigit(), n8 = randomDigit(), n9 = randomDigit();
  let d1 = n9 * 2 + n8 * 3 + n7 * 4 + n6 * 5 + n5 * 6 + n4 * 7 + n3 * 8 + n2 * 9 + n1 * 10;
  d1 = 11 - (d1 % 11);
  if (d1 >= 10) d1 = 0;
  let d2 = d1 * 2 + n9 * 3 + n8 * 4 + n7 * 5 + n6 * 6 + n5 * 7 + n4 * 8 + n3 * 9 + n2 * 10 + n1 * 11;
  d2 = 11 - (d2 % 11);
  if (d2 >= 10) d2 = 0;
  return `${n1}${n2}${n3}${n4}${n5}${n6}${n7}${n8}${n9}${d1}${d2}`;
}


test.describe.serial('Checkout, Pagamentos e Histórico (E2E)', () => {
  let apiHelper: ApiHelper;
  let productId: string;
  let variationId: string;
  let testUser: any;

  test.beforeAll(async ({ request }) => {
    apiHelper = new ApiHelper(request);
    await apiHelper.setShippingModeToFixed(15.0);

    // Setup base product and user
    const catId = await apiHelper.getOrCreateCategory('Test Category', 'test-category');
    const p = await apiHelper.createProduct({ name: 'Produto Checkout', description: 'Teste', basePrice: 100, categoryIds: [catId] });
    productId = p.id;
    const v = await apiHelper.addVariation(productId, { sku: `CHK-${Date.now()}`, size: 'M', color: 'Black', stockQuantity: 50 });
    variationId = v.variations[0].id;
    await apiHelper.publishProduct(productId);

    // Usando CPF dinâmico válido em vez do fixo que a sandbox bloqueia por "Invalid user identification number"
    const uniqueEmail = `comprador_fixo_${Date.now()}@test.com`;
    const uniqueCpf = generateValidCPF();
    testUser = { name: 'Comprador Teste', email: uniqueEmail, password: 'Password123!', document: uniqueCpf, phone: '11999999999' };
    try {
      await apiHelper.registerCustomer(testUser);
    } catch (e) {
      // Ignora erro se o CPF já estiver cadastrado de execuções anteriores
    }
  });

  const setupCartAndCheckout = async (page: any) => {
    // Login
    await page.goto('/conta', { timeout: 60000, waitUntil: 'load' });
    await page.getByPlaceholder('voce@email.com').fill(testUser.email);
    await page.getByPlaceholder('Digite sua senha').fill(testUser.password);
    await page.getByRole('button', { name: /Acessar Loja/i }).click();
    await page.waitForSelector('text=Minha Conta');

    // Add to cart
    await page.goto(`/produto/${productId}`, { timeout: 60000, waitUntil: 'load' });
    await page.waitForSelector('text=Black');
    await page.getByRole('button', { name: /^M$/i }).click();
    await page.getByRole('button', { name: /^Black$/i }).click();
    await page.getByRole('button', { name: /Adicionar/i }).click();

    // Go to checkout
    await page.goto('/checkout', { timeout: 60000, waitUntil: 'load' });
    await page.waitForSelector('text=Endereço & Entrega');

    await page.locator('input[name="zipCode"]').fill('01001-000');
    await page.locator('input[name="zipCode"]').press('Tab');
    await page.waitForTimeout(1000);
    await page.locator('input[name="address"]').fill('Rua Teste');
    await page.locator('input[name="number"]').fill('123');
    await page.locator('input[name="city"]').fill('São Paulo');
    await page.locator('input[name="state"]').fill('SP');

    // Wait and Select shipping
    await page.waitForSelector('input[name="shipping"]');
    await page.locator('input[name="shipping"]').first().click();

    await page.getByRole('button', { name: /Continuar para Pagamento/i }).click();

    await page.waitForSelector('text=Forma de Pagamento');
  };

  test('Cenário 1.1: Pagamento Aprovado com Cartão Visa', async ({ page }) => {
    await setupCartAndCheckout(page);

    await page.locator('text=Cartão de Crédito').click();

    await page.getByPlaceholder('NOME DO TITULAR').fill('APRO');

    const cardNumberIframe = page.locator('#cardNumber-container iframe').contentFrame();
    await cardNumberIframe.getByRole('textbox').pressSequentially('4235647728025682', { delay: 50 });

    await page.waitForTimeout(1000);

    const expirationIframe = page.locator('#expirationDate-container iframe').contentFrame();
    await expirationIframe.getByRole('textbox').pressSequentially('1130', { delay: 50 });

    const cvvIframe = page.locator('#securityCode-container iframe').contentFrame();
    await cvvIframe.getByRole('textbox').pressSequentially('123', { delay: 50 });

    // Esperar as opções de parcelamento carregarem e selecionar 1x
    await page.waitForSelector('select');
    await page.locator('select').selectOption({ index: 0 });

    await page.getByRole('button', { name: /Finalizar Pedido/i }).click();

    await page.waitForURL(/\/pedido-confirmado/, { timeout: 30000 });
    await expect(page.locator('text=Pedido Confirmado!')).toBeVisible();

    // Verificar status Pago no Histórico
    await page.goto('/conta', { timeout: 60000, waitUntil: 'load' });
    await expect(page.locator('text=Aprovado').first()).toBeVisible({ timeout: 10000 });
  });

  test('Cenário 1.2: Pagamento Recusado (Tratamento de Erros)', async ({ page }) => {
    await setupCartAndCheckout(page);

    await page.locator('text=Cartão de Crédito').click();

    await page.getByPlaceholder('NOME DO TITULAR').fill('RECHAZADO'); // Nome força o erro no MP

    const cardNumberIframe = page.locator('#cardNumber-container iframe').contentFrame();
    await cardNumberIframe.getByRole('textbox').pressSequentially('4235647728025682', { delay: 50 });

    const expirationIframe = page.locator('#expirationDate-container iframe').contentFrame();
    await expirationIframe.getByRole('textbox').pressSequentially('1130', { delay: 50 });

    const cvvIframe = page.locator('#securityCode-container iframe').contentFrame();
    await cvvIframe.getByRole('textbox').pressSequentially('123', { delay: 50 });

    await page.waitForSelector('select');
    await page.locator('select').selectOption({ index: 0 });

    await page.getByRole('button', { name: /Finalizar Pedido/i }).click();

    // A tela não deve redirecionar e a mensagem vermelha de erro deve aparecer
    const errorBox = page.locator('.bg-red-50');
    await expect(errorBox).toBeVisible({ timeout: 10000 });
  });

  test('Cenário 2.1: Geração de PIX Dinâmico com Sucesso', async ({ page }) => {
    await setupCartAndCheckout(page);

    await page.locator('text=PIX').click();
    await page.getByRole('button', { name: /Finalizar Pedido/i }).click();

    await page.waitForURL(/\/pedido-confirmado/, { timeout: 30000 });
    await expect(page.locator('text=Pedido Confirmado!')).toBeVisible();
    await expect(page.locator('text=Copia e Cola')).toBeVisible();

    // Verificar status Aguardando no Histórico
    await page.goto('/conta', { timeout: 60000, waitUntil: 'load' });
    await expect(page.locator('text=Pendente').first()).toBeVisible({ timeout: 10000 });
  });

  test.skip('Cenário 3.1: Validação de Exibição com Múltiplos Pedidos (Paginação)', async ({ page, request }) => {
    // Injetar 15 pedidos diretamente pela API para forçar a paginação (totalizando 18 com os 3 testes acima)
    const localApiHelper = new ApiHelper(request);
    const token = await localApiHelper.loginCustomer(testUser.email, testUser.password);

    for (let i = 0; i < 15; i++) {
      await request.post(`${process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:5111'}/api/checkout`, {
        headers: { Authorization: `Bearer ${token}` },
        data: {
          items: [{ productVariationId: variationId, quantity: 1 }],
          couponCode: null,
          shippingCarrierId: 'Fixed',
          shippingCost: 15.0,
          paymentMethod: 'Pix',
          zipCode: '01001000'
        }
      });
    }

    await page.goto('/conta', { timeout: 60000, waitUntil: 'load' });
    
    // Como estamos num novo contexto de página, precisamos logar para ver a tabela
    await page.getByPlaceholder('voce@email.com').fill(testUser.email);
    await page.getByPlaceholder('Digite sua senha').fill(testUser.password);
    await page.getByRole('button', { name: 'Acessar Loja' }).click();


    // Aguardar a tabela carregar os dados
    await page.waitForSelector('text=Pedido: PED-');

    // O limite padrão da paginação é 10 itens
    const rows = await page.locator('text=Pedido: PED-').count();
    expect(rows).toBe(10);

    // Clicar para ir à próxima página
    const nextBtn = page.getByRole('button', { name: /Próximo/i });
    if (await nextBtn.isVisible()) {
      await nextBtn.click();
      await page.waitForTimeout(1500);
      const rowsPage2 = await page.locator('text=Pedido: PED-').count();
      // O total era 3 (dos testes) + 15 criados agora = 18. Página 2 deve ter 8 registros.
      expect(rowsPage2).toBe(8);
    }
  });
});
