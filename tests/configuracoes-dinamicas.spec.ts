import { test, expect } from '@playwright/test';
import { ApiHelper } from './apiHelper';
import fs from 'fs';
import path from 'path';

async function loginAdmin(page: any) {
  await page.goto('/conta', { timeout: 60000, waitUntil: 'load' });
  await page.getByPlaceholder('voce@email.com').fill(process.env.TEST_USER_EMAIL || 'admin@ecommerce.com');
  await page.getByPlaceholder('Digite sua senha').fill(process.env.TEST_USER_PASSWORD || 'Admin@123');
  await page.getByRole('button', { name: 'Acessar Loja' }).click();
  await expect(page.getByRole('link', { name: 'Ir para Painel Administrativo' })).toBeVisible({ timeout: 30000 });
  await page.waitForTimeout(1000);
}

test.describe.serial('Testes de Configurações Dinâmicas (Frete Fixo e Banner na Home)', () => {
  let api: ApiHelper;
  let categoryId: string;
  let productId100: string;
  let productUrl100: string;
  let token: string;
  let apiBase: string;
  const imageUrls: string[] = [];

  test.beforeAll(async ({ request }) => {
    api = new ApiHelper(request);
    
    // 1. Obter ou criar a categoria
    categoryId = await api.getOrCreateCategory('Moda E2E', 'moda-e2e');

    // 2. Fazer login na API para obter token
    token = await api.loginAdmin();
    apiBase = `${process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:5111'}/api`;

    // 3. Upload de imagens locais para o teste
    const imgDir = path.join(__dirname, '../imgProducts');
    const imageFiles = ['teste2.jpg', 'teste3.jpg'];

    for (const fileName of imageFiles) {
      const filePath = path.join(imgDir, fileName);
      if (!fs.existsSync(filePath)) {
        throw new Error(`Imagem necessária não encontrada: ${filePath}`);
      }
      const fileBuffer = fs.readFileSync(filePath);

      const response = await request.post(`${apiBase}/media/upload-product`, {
        headers: { Authorization: `Bearer ${token}` },
        multipart: {
          file: {
            name: fileName,
            mimeType: 'image/jpeg',
            buffer: fileBuffer
          }
        }
      });

      if (!response.ok()) {
        const body = await response.text();
        throw new Error(`Falha no upload de imagem: ${response.status()} - ${body}`);
      }

      const json = await response.json();
      imageUrls.push(json.url);
    }

    if (imageUrls.length < 2) {
      throw new Error('Não foi possível obter as URLs de imagens necessárias.');
    }

    // 4. Criar produto de teste com valor fixo de R$ 100,00
    const product = await api.createProduct({
      name: "Vestido de Teste Carrinho R$ 100",
      description: "Produto criado com preço base fixo de R$ 100,00 para testar regras de frete no carrinho.",
      basePrice: 100.00,
      categoryIds: [categoryId],
      imageUrls: [imageUrls[0]]
    });

    productId100 = product.id;
    productUrl100 = `/produto/${productId100}`;

    // 5. Associar imagem à cor azul
    const mappingResponse = await request.put(`${apiBase}/products/${productId100}/color-images`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      data: {
        color: 'azul',
        images: [imageUrls[0]]
      }
    });

    if (!mappingResponse.ok()) {
      throw new Error(`Falha ao mapear cor azul: ${mappingResponse.status()}`);
    }

    // 6. Cadastrar variação (P / azul / estoque: 10)
    await api.addVariation(productId100, {
      sku: `VEST-100-P-AZUL-${Date.now()}`,
      size: 'P',
      color: 'azul',
      stockQuantity: 10
    });

    // 7. Publicar produto
    await api.publishProduct(productId100);
  });

  test('Cenário 1: Edição e Gravação de Configurações no Admin', async ({ page }) => {
    // 1. Login administrador
    await loginAdmin(page);

    // 2. Acessar configurações
    await page.goto('/admin/configuracoes', { timeout: 60000, waitUntil: 'load' });
    await expect(page.getByRole('heading', { name: 'Configurações da Loja' })).toBeVisible({ timeout: 15000 });

    // 3. Selecionar modo de cálculo Frete Fixo
    await page.locator('div:has(> label:has-text("Modo de Cálculo")) select').selectOption('Fixed');

    // 4. Preencher valor do frete fixo (15.00)
    await page.locator('div:has(> label:has-text("Valor do Frete Fixo")) input').fill('15.00');

    // 5. Preencher limite de frete grátis (150.00)
    await page.locator('div:has(> label:has-text("Valor Limite para Frete Grátis")) input').fill('150.00');

    // 6. Preencher dados do banner
    await page.locator('div:has(> label:has-text("Título do Banner")) input').fill("Moda Outono-Inverno 2026\nNova Coleção Secchi");
    await page.locator('div:has(> label:has-text("Subtítulo do Banner")) textarea').fill("Aproveite até 30% de desconto em peças selecionadas.");
    await page.locator('div:has(> label:has-text("Texto do Botão")) input').fill("Comprar Outono");
    await page.locator('div:has(> label:has-text("Link do Botão")) input').fill("/produtos?categoria=outono");

    // 7. Habilitar o toggle "Ativo" usando { force: true } para evitar overlap de cliques causados pelo estilo sr-only
    const checkbox = page.locator('label:has-text("Ativo") input[type="checkbox"]');
    await checkbox.setChecked(true, { force: true });

    // 8. Fazer upload de arquivo de imagem de teste local para o banner
    const fileToUpload = path.join(__dirname, '../imgProducts', 'teste3.jpg');
    await page.locator('input[type="file"]').setInputFiles(fileToUpload);
    await page.waitForTimeout(1500); // Aguarda renderização do preview

    // 9. Clicar em "Salvar Todas as Configurações"
    await page.getByRole('button', { name: 'Salvar Todas as Configurações' }).click();

    // 10. Validar mensagem de sucesso
    await expect(page.locator('text=Configurações salvas e sincronizadas com sucesso no banco de dados!')).toBeVisible({ timeout: 15000 });

    // 11. Recarregar a página e validar se as informações permanecem nos campos
    await page.reload();
    // Como o elemento do título do banner é um <input type="text">, a quebra de linha (\n)
    // é automaticamente convertida em espaço pelo navegador. Validamos a string resultante correspondente.
    await expect(page.locator('div:has(> label:has-text("Título do Banner")) input')).toHaveValue("Moda Outono-Inverno 2026 Nova Coleção Secchi");
    await expect(page.locator('div:has(> label:has-text("Valor do Frete Fixo")) input')).toHaveValue('15');
    await expect(page.locator('div:has(> label:has-text("Valor Limite para Frete Grátis")) input')).toHaveValue('150');
  });

  test('Cenário 2: Exibição Dinâmica do Banner na Home Page', async ({ page }) => {
    // Parte A - Banner Ativo:
    await page.goto('/', { timeout: 60000, waitUntil: 'load' });
    await page.waitForTimeout(1000);

    // Verificar se o Hero Section está renderizado com o texto configurado
    const heroTitle = page.locator('section h1');
    await expect(heroTitle).toBeVisible();
    await expect(heroTitle).toContainText("Moda Outono-Inverno 2026");
    await expect(heroTitle).toContainText("Nova Coleção Secchi");

    // Descrição
    await expect(page.locator('section p').first()).toContainText("Aproveite até 30% de desconto em peças selecionadas.");

    // Botão e Link
    const heroBtn = page.locator('section a').filter({ hasText: 'Comprar Outono' });
    await expect(heroBtn).toBeVisible();
    await expect(heroBtn).toHaveAttribute('href', '/produtos?categoria=outono');

    // Imagem do banner - usando o alt text específico para evitar violações de strict mode
    const heroImg = page.getByRole('img', { name: 'Fashion Banner' });
    await expect(heroImg).toBeVisible();
    await expect(heroImg).toHaveAttribute('src', /.*\/uploads\/.*/);

    // Parte B - Banner Inativo:
    // Retornar ao painel administrativo de configurações
    await loginAdmin(page);
    await page.goto('/admin/configuracoes', { timeout: 60000, waitUntil: 'load' });

    // Desativar checkbox usando { force: true } devido ao overlay do design sr-only
    const checkbox = page.locator('label:has-text("Ativo") input[type="checkbox"]');
    await checkbox.setChecked(false, { force: true });

    // Salvar
    await page.getByRole('button', { name: 'Salvar Todas as Configurações' }).click();
    await expect(page.locator('text=Configurações salvas e sincronizadas com sucesso no banco de dados!')).toBeVisible();

    // Acessar Home
    await page.goto('/', { timeout: 60000, waitUntil: 'load' });
    await page.waitForTimeout(1000);

    // Garantir que a seção Hero não é exibida (o h1 do banner deve sumir)
    await expect(page.getByRole('heading', { name: 'Moda Outono-Inverno 2026' })).not.toBeVisible();
  });

  test('Cenário 3: Regras e Cálculos de Frete Grátis e Frete Fixo no Carrinho', async ({ page, request }) => {
    // Configuração Prévia via API para garantir integridade:
    // Frete Fixo ativo a R$ 15.00 e Threshold de Frete Grátis configurado em R$ 150.00
    const configResponse = await request.post(`${apiBase}/configuration`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        shippingMode: 'Fixed',
        fixedShippingValue: 15.00,
        freeShippingThreshold: 150.00,
        homeHeroBanner: {
          title: 'Banner Teste',
          subtitle: 'Sub banner teste',
          imageUrl: imageUrls[0],
          buttonText: 'Clique',
          buttonLink: '/produtos',
          isActive: false
        }
      }
    });
    expect(configResponse.ok()).toBeTruthy();

    // Limpar o carrinho antes do teste
    await page.goto('/carrinho', { timeout: 60000, waitUntil: 'load' });
    await page.evaluate(() => localStorage.removeItem('secchi_cart'));

    // Passos (Parte A - Subtotal Abaixo do Threshold):
    // 1. Adicionar o produto de R$ 100 ao carrinho
    await page.goto(productUrl100);
    await page.waitForTimeout(1000);

    await page.getByRole('button', { name: /^azul$/i }).click();
    await page.getByRole('button', { name: /^P$/i }).click();
    await page.getByRole('button', { name: 'Adicionar ao Carrinho' }).click();
    await expect(page.locator('text=Produto adicionado ao carrinho com sucesso!')).toBeVisible();

    // 2. Acessar o carrinho
    await page.goto('/carrinho', { timeout: 60000, waitUntil: 'load' });
    await page.waitForTimeout(1000);

    // Validações Parte A:
    // - Subtotal deve exibir R$ 100,00
    const subtotalText = page.locator('div:has(> span:has-text("Subtotal")) > span').last();
    await expect(subtotalText).toContainText('100,00');

    // - Frete deve exibir R$ 15,00
    const freteText = page.locator('div:has(> span:has-text("Frete")) > span').last();
    await expect(freteText).toContainText('15,00');

    // - Total deve exibir R$ 115,00
    const totalText = page.locator('div:has(> span:has-text("Total")) span.text-2xl');
    await expect(totalText).toContainText('115,00');

    // - Aviso "Adicione R$ 50,00 para ter frete grátis!"
    const avisoText = page.locator('text=Adicione R$ 50,00 para ter frete grátis!');
    await expect(avisoText).toBeVisible();

    // Passos (Parte B - Subtotal Atinge o Threshold):
    // 1. Incrementar a quantidade para 2 (subtotal R$ 200)
    const btnPlus = page.locator('button:has(svg.lucide-plus), button:has-text("+")').first();
    await btnPlus.click();
    await page.waitForTimeout(1000);

    // Validações Parte B:
    // - Subtotal deve exibir R$ 200,00
    await expect(subtotalText).toContainText('200,00');

    // - Frete deve ser "Grátis"
    await expect(freteText).toContainText('Grátis');

    // - Total deve ser R$ 200,00
    await expect(totalText).toContainText('200,00');

    // - Alerta de valor faltante não deve ser renderizado
    await expect(avisoText).not.toBeVisible();

    // Passos (Parte C - Sem Configuração de Frete Grátis):
    // 1. Alterar via API para Cotação Dinâmica, frete grátis = null
    const configCalculatedResponse = await request.post(`${apiBase}/configuration`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        shippingMode: 'Calculated',
        fixedShippingValue: 0,
        freeShippingThreshold: 0,
        homeHeroBanner: {
          title: 'Banner Teste',
          subtitle: 'Sub banner teste',
          imageUrl: imageUrls[0],
          buttonText: 'Clique',
          buttonLink: '/produtos',
          isActive: false
        }
      }
    });
    expect(configCalculatedResponse.ok()).toBeTruthy();

    // 2. Retornar ao carrinho
    await page.goto('/carrinho', { timeout: 60000, waitUntil: 'load' });
    await page.waitForTimeout(1000);

    // Validações Parte C:
    // - Aviso de frete grátis não deve ser exibido sob nenhuma circunstância
    await expect(page.locator('text=Adicione')).not.toBeVisible();

    // - Frete no sumário deve ser "A calcular"
    await expect(freteText).toContainText('A calcular');
  });

  test('Cenário 4: Exibição Dinâmica das Garantias na Página do Produto', async ({ page, request }) => {
    // Passos (Parte A - Threshold Ativo):
    // 1. Configurar limite de frete grátis para 150.00 via API
    const configResponse = await request.post(`${apiBase}/configuration`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        shippingMode: 'Calculated',
        fixedShippingValue: 0,
        freeShippingThreshold: 150.00,
        homeHeroBanner: {
          title: 'Banner Teste',
          subtitle: 'Sub banner teste',
          imageUrl: imageUrls[0],
          buttonText: 'Clique',
          buttonLink: '/produtos',
          isActive: false
        }
      }
    });
    expect(configResponse.ok()).toBeTruthy();

    // 2. Acessar a página do produto
    await page.goto(productUrl100);
    await page.waitForTimeout(1000);

    // Validação Parte A:
    // - Garantias deve exibir mensagem de frete grátis acima de R$ 150
    await expect(page.locator('text=Frete grátis para todo o Brasil em compras acima de R$ 150')).toBeVisible();

    // Passos (Parte B - Sem Threshold):
    // 1. Configurar limite de frete grátis para null via API
    const configNullResponse = await request.post(`${apiBase}/configuration`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        shippingMode: 'Calculated',
        fixedShippingValue: 0,
        freeShippingThreshold: 0,
        homeHeroBanner: {
          title: 'Banner Teste',
          subtitle: 'Sub banner teste',
          imageUrl: imageUrls[0],
          buttonText: 'Clique',
          buttonLink: '/produtos',
          isActive: false
        }
      }
    });
    expect(configNullResponse.ok()).toBeTruthy();

    // 2. Acessar a página do produto
    await page.goto(productUrl100);
    await page.waitForTimeout(1000);

    // Validação Parte B:
    // - Mensagem sobre frete grátis não deve ser exibida na seção de garantias
    await expect(page.locator('text=Frete grátis para todo o Brasil')).not.toBeVisible();
  });
});
