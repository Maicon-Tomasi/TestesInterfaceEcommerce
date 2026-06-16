import { test, expect } from '@playwright/test';
import { ApiHelper } from './apiHelper';

async function loginAdmin(page: any) {
  await page.goto('/conta');
  await page.getByPlaceholder('voce@email.com').fill(process.env.TEST_USER_EMAIL || 'admin@ecommerce.com');
  await page.getByPlaceholder('Digite sua senha').fill(process.env.TEST_USER_PASSWORD || 'Admin@123');
  await page.getByRole('button', { name: 'Acessar Loja' }).click();
  await expect(page.getByRole('link', { name: 'Ir para Painel Administrativo' })).toBeVisible({ timeout: 30000 });
  await page.waitForTimeout(1000);
}

test.describe.serial('Cenários de Configuração de Frete (Painel Admin)', () => {
  let api: ApiHelper;
  let token: string;
  let apiBase: string;
  let productId: string;
  let productUrl: string;

  test.beforeAll(async ({ request }) => {
    api = new ApiHelper(request);
    
    // 1. Obter ou criar a categoria
    const categoryId = await api.getOrCreateCategory('Moda Frete', 'moda-frete');

    // 2. Fazer login na API para obter token
    token = await api.loginAdmin();
    apiBase = `${process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:5111'}/api`;

    // 3. Criar produto de teste para o simulador de frete
    const product = await api.createProduct({
      name: `Produto Frete Test ${Date.now()}`,
      description: 'Produto criado para simulação de frete E2E',
      basePrice: 199.90,
      weight: 0.5,
      width: 20,
      height: 5,
      length: 25,
      categoryIds: [categoryId],
    });

    productId = product.id;
    productUrl = `/produto/${productId}`;

    // 4. Cadastrar variação (para ser possível adicionar ao carrinho se necessário, 
    // mas o simulador na página do produto já deve funcionar sem variação se a regra de negócio permitir,
    // garantimos a variação só por precaução)
    await api.addVariation(productId, {
      sku: `FRET-TST-${Date.now()}`,
      size: 'Único',
      color: 'Padrão',
      stockQuantity: 50
    });

    // 5. Publicar produto
    await api.publishProduct(productId);
  });

  test('Cenário 4.1: Carregamento inicial das configurações de frete', async ({ page }) => {
    // Preparação (Setup): Interceptar as rotas com Mocks
    await page.route('**/api/configuration/shipping', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          availableCarriers: [
            { id: '1', name: 'Correios PAC' },
            { id: '2', name: 'Correios SEDEX' },
            { id: '3', name: 'Jadlog' }
          ]
        })
      });
    });

    await page.route('**/api/configuration', async (route) => {
      // Evita interceptar requisições para /api/configuration/shipping acidentalmente
      if (route.request().url().includes('/shipping')) {
        return route.fallback();
      }
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            shippingMode: 'Calculated',
            fixedShippingValue: null,
            freeShippingThreshold: null,
            activeShippingCarriers: ['1', '2'], // Apenas PAC e SEDEX ativos
            homeHeroBanner: { isActive: true, title: '', subtitle: '', imageUrl: '', buttonText: '', buttonLink: '' }
          })
        });
      } else {
        await route.fallback();
      }
    });

    // Ação: Fazer login e navegar para configurações
    await loginAdmin(page);
    await page.goto('/admin/configuracoes');
    
    // Aguarda o painel carregar (o form é renderizado após a API responder)
    await expect(page.getByRole('heading', { name: 'Configurações da Loja' })).toBeVisible({ timeout: 15000 });

    // Resultado Esperado:
    // O modo de cálculo deve ser Calculated
    await expect(page.locator('div:has(> label:has-text("Modo de Cálculo")) select')).toHaveValue('Calculated');

    // PAC deve estar checked (ativo)
    const pacCheckbox = page.locator('label').filter({ hasText: 'Correios PAC' }).locator('input[type="checkbox"]');
    await expect(pacCheckbox).toBeChecked();

    // SEDEX deve estar checked (ativo)
    const sedexCheckbox = page.locator('label').filter({ hasText: 'Correios SEDEX' }).locator('input[type="checkbox"]');
    await expect(sedexCheckbox).toBeChecked();

    // Jadlog deve estar unchecked (inativo)
    const jadlogCheckbox = page.locator('label').filter({ hasText: 'Jadlog' }).locator('input[type="checkbox"]');
    await expect(jadlogCheckbox).not.toBeChecked();
  });

  test('Cenário 4.2: Salvamento com sucesso da alteração de fretes', async ({ page }) => {
    // Configura os Mocks do GET (estado inicial idêntico ao 4.1)
    await page.route('**/api/configuration/shipping', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          availableCarriers: [
            { id: '1', name: 'Correios PAC' },
            { id: '2', name: 'Correios SEDEX' },
            { id: '3', name: 'Jadlog' }
          ]
        })
      });
    });

    // Flag para verificar se o POST foi chamado
    let wasPutOrPostCalled = false;

    await page.route('**/api/configuration', async (route) => {
      if (route.request().url().includes('/shipping')) {
        return route.fallback();
      }
      
      const method = route.request().method();
      if (method === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            shippingMode: 'Calculated',
            fixedShippingValue: null,
            freeShippingThreshold: null,
            activeShippingCarriers: ['1', '2'], // PAC e SEDEX ativos
            homeHeroBanner: { isActive: true, title: '', subtitle: '', imageUrl: '', buttonText: '', buttonLink: '' }
          })
        });
      } else if (method === 'POST' || method === 'PUT') {
        // Intercepta a rota de salvamento retornando status 200
        wasPutOrPostCalled = true;
        // Simulando delay para garantir que o estado de "loading" no botão seja testável
        await new Promise(r => setTimeout(r, 500)); 
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true })
        });
      } else {
        await route.fallback();
      }
    });

    // Ação: Fazer login e ir para a tela
    await loginAdmin(page);
    await page.goto('/admin/configuracoes');
    await expect(page.getByRole('heading', { name: 'Configurações da Loja' })).toBeVisible({ timeout: 15000 });

    // Desmarcar o "SEDEX"
    const sedexCheckbox = page.locator('label').filter({ hasText: 'Correios SEDEX' }).locator('input[type="checkbox"]');
    await expect(sedexCheckbox).toBeChecked();
    await sedexCheckbox.uncheck();
    await expect(sedexCheckbox).not.toBeChecked();

    // Clicar em "Salvar"
    const btnSalvar = page.getByRole('button', { name: /Salvar Todas as Configurações/i });
    await btnSalvar.click();

    // Resultado Esperado:
    // Botão entra em estado de loading
    const btnLoading = page.locator('button:has-text("Salvando Configurações...")');
    await expect(btnLoading).toBeVisible();

    // Esperar a notificação de sucesso aparecer
    const alertSuccess = page.locator('text=Configurações salvas e sincronizadas com sucesso no banco de dados!');
    await expect(alertSuccess).toBeVisible({ timeout: 5000 });

    // O switch do SEDEX deve permanecer desligado
    await expect(sedexCheckbox).not.toBeChecked();

    // Validar se o MOCK POST foi realmente invocado
    expect(wasPutOrPostCalled).toBeTruthy();
  });

  test('Cenário 4.3: Garantia de bloqueio para clientes após desativar transportadora', async ({ page, request }) => {
    // Preparação (Setup) E2E:
    // Precisamos buscar as transportadoras dinamicamente caso os IDs variem no backend do usuário
    const shippingConfigResponse = await request.get(`${apiBase}/configuration/shipping`);
    expect(shippingConfigResponse.ok()).toBeTruthy();
    const shippingData = await shippingConfigResponse.json();
    
    // Obter IDs reais de PAC e SEDEX para o ambiente
    const carriers: { id: string, name: string }[] = shippingData.availableCarriers || [];
    const pacCarrier = carriers.find(c => c.name.toLowerCase().includes('pac'));
    const sedexCarrier = carriers.find(c => c.name.toLowerCase().includes('sedex'));
    
    // Se o backend não tiver PAC e SEDEX, usamos IDs fictícios apenas para passar na validação,
    // porém o correto é garantir que existam no backend real
    const activeCarrierIds = [];
    if (pacCarrier) activeCarrierIds.push(pacCarrier.id);

    // Configurar o Backend Real para ativar apenas o PAC (ou o que sobrou), bloqueando o SEDEX explicitamente.
    const configResponse = await request.post(`${apiBase}/configuration`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        shippingMode: 'Calculated',
        fixedShippingValue: null,
        freeShippingThreshold: null,
        activeShippingCarriers: activeCarrierIds, // Apenas PAC
        homeHeroBanner: {
          title: 'Banner Teste', subtitle: 'Teste', imageUrl: '', buttonText: 'Click', buttonLink: '/', isActive: false
        }
      }
    });
    expect(configResponse.ok()).toBeTruthy();

    // Ação: 
    // Como um usuário comum, ir até a página do produto
    await page.goto(productUrl);
    await page.waitForTimeout(1000);

    // Simular frete com CEP genérico (ex: CEP da Av. Paulista, 01310-100)
    const cepInput = page.getByPlaceholder('Ex: 01001-000');
    await cepInput.fill('01310100');
    
    await page.getByRole('button', { name: 'Calcular Frete' }).click();

    // Resultado Esperado:
    // A tabela de prazos e valores de frete deve renderizar
    const resultsContainer = page.locator('.space-y-3').filter({ hasText: 'Receba em' });
    await expect(resultsContainer.first()).toBeVisible({ timeout: 15000 });

    // Valida que PAC aparece na lista
    if (pacCarrier) {
      await expect(page.locator('text=' + pacCarrier.name)).toBeVisible();
    } else {
      await expect(page.locator('text=PAC').first()).toBeVisible();
    }

    // Valida que SEDEX NÃO aparece na lista
    if (sedexCarrier) {
      await expect(page.locator('text=' + sedexCarrier.name)).not.toBeVisible();
    } else {
      await expect(page.locator('text=SEDEX')).not.toBeVisible();
    }
  });
});
