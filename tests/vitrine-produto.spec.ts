import { test, expect } from '@playwright/test';
import { ApiHelper } from './apiHelper';
import fs from 'fs';
import path from 'path';

test.describe.serial('Testes de Vitrine do Produto - Página do Produto', () => {
  let api: ApiHelper;
  let categoryId: string;
  let productId: string;
  let productUrl: string;
  const imageUrls: string[] = [];

  test.beforeAll(async ({ request }) => {
    api = new ApiHelper(request);
    
    // 1. Obter ou criar a categoria de teste
    categoryId = await api.getOrCreateCategory('Vestidos', 'vestidos');

    // 2. Fazer login administrativo para obter o token para chamadas adicionais
    const token = await api.loginAdmin();
    const apiBase = `${process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:5111'}/api`;

    // 3. Fazer o upload de 3 imagens locais da pasta imgProducts
    const imgDir = path.join(__dirname, '../imgProducts');
    const imageFiles = ['teste2.jpg', 'teste3.jpg', 'teste4.jpg'];

    for (const fileName of imageFiles) {
      const filePath = path.join(imgDir, fileName);
      if (!fs.existsSync(filePath)) {
        throw new Error(`Imagem de teste obrigatória não encontrada: ${filePath}`);
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
        throw new Error(`Falha no upload da imagem ${fileName}: ${response.status()} - ${body}`);
      }

      const json = await response.json();
      imageUrls.push(json.url);
    }

    if (imageUrls.length < 3) {
      throw new Error('Não foi possível obter as 3 URLs de imagens necessárias.');
    }

    // 4. Criar o produto base
    const product = await api.createProduct({
      name: "Vestido Midi de Teste E2E",
      description: "Descrição detalhada do vestido midi de teste criado para validações de automação E2E.",
      basePrice: 199.90,
      categoryIds: [categoryId],
      imageUrls: imageUrls
    });

    productId = product.id;
    productUrl = `/produto/${productId}`;

    // 5. Vincular as imagens às cores correspondentes (colorImagesMap)
    // Cor Azul -> Imagem 1 (imageUrls[0]) e Imagem 2 (imageUrls[1])
    const mappingAzulResponse = await request.put(`${apiBase}/products/${productId}/color-images`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      data: {
        color: 'azul',
        images: [imageUrls[0], imageUrls[1]]
      }
    });

    if (!mappingAzulResponse.ok()) {
      throw new Error(`Falha ao mapear cor azul: ${mappingAzulResponse.status()} - ${await mappingAzulResponse.text()}`);
    }

    // Cor Preto -> Imagem 3 (imageUrls[2])
    const mappingPretoResponse = await request.put(`${apiBase}/products/${productId}/color-images`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      data: {
        color: 'preto',
        images: [imageUrls[2]]
      }
    });

    if (!mappingPretoResponse.ok()) {
      throw new Error(`Falha ao mapear cor preto: ${mappingPretoResponse.status()} - ${await mappingPretoResponse.text()}`);
    }

    // 6. Cadastrar as 3 variações com estoque exatamente conforme o requisito
    // Variação 1: P / azul / estoque: 5
    await api.addVariation(productId, {
      sku: `VEST-E2E-P-AZUL-${Date.now()}`,
      size: 'P',
      color: 'azul',
      stockQuantity: 5
    });

    // Variação 2: M / azul / estoque: 0 (Sem estoque)
    await api.addVariation(productId, {
      sku: `VEST-E2E-M-AZUL-${Date.now()}`,
      size: 'M',
      color: 'azul',
      stockQuantity: 0
    });

    // Variação 3: G / preto / estoque: 10
    await api.addVariation(productId, {
      sku: `VEST-E2E-G-PRETO-${Date.now()}`,
      size: 'G',
      color: 'preto',
      stockQuantity: 10
    });

    // 7. Publicar o produto para torná-lo visível no catálogo
    await api.publishProduct(productId);
  });

  test('Cenário 1: Validação de Estado Inicial (Sem Seleções)', async ({ page }) => {
    // Ações: Navegar diretamente para a URL do produto criado
    await page.goto(productUrl);
    await page.waitForTimeout(1000); // Aguarda a hidratação da página

    // Resultado Esperado:
    // - Nenhum tamanho deve vir pré-selecionado (ausência do indicador visual de seleção)
    await expect(page.locator('text=Selecionado:')).not.toBeVisible();

    // - Nenhuma cor deve vir pré-selecionada (ausência do indicador visual de seleção)
    await expect(page.locator('text=Selecionada:')).not.toBeVisible();

    // - O preço exibido deve ser o Preço Base do produto (R$ 199,90)
    const priceText = page.locator('span.text-3xl.font-bold.text-foreground');
    await expect(priceText).toContainText('199,90');

    // - A galeria deve mostrar a imagem principal padrão do produto (Imagem 1)
    const mainImage = page.getByTestId('gallery-image');
    await expect(mainImage).toBeVisible();
    await expect(mainImage).toHaveAttribute('src', imageUrls[0]);

    // - Os botões "Adicionar ao Carrinho" e "Comprar Agora" devem estar desabilitados
    const btnAddCart = page.getByRole('button', { name: 'Adicionar ao Carrinho' });
    const btnBuyNow = page.getByRole('button', { name: 'Comprar Agora' });

    await expect(btnAddCart).toBeDisabled();
    await expect(btnBuyNow).toBeDisabled();

    // - Verificar classes de opacidade reduzida e cursor bloqueado nos botões
    await expect(btnAddCart).toHaveClass(/opacity-50/);
    await expect(btnAddCart).toHaveClass(/cursor-not-allowed/);
    await expect(btnBuyNow).toHaveClass(/opacity-50/);
    await expect(btnBuyNow).toHaveClass(/cursor-not-allowed/);

    // - O campo de quantidade deve mostrar 1
    const qtyValue = page.locator('span.border-x.border-pink-100');
    await expect(qtyValue).toHaveText('1');
  });

  test('Cenário 2: Seleção Dinâmica de Variação e Atualização de Galeria', async ({ page }) => {
    await page.goto(productUrl);
    await page.waitForTimeout(1000);

    const btnAzul = page.getByRole('button', { name: /^azul$/i });
    const btnP = page.getByRole('button', { name: /^P$/i });

    // Ações: Clicar na cor Azul e no tamanho P
    await btnAzul.click();
    await btnP.click();

    // Resultado Esperado:
    // - A galeria de imagens deve ser atualizada para mostrar a foto vinculada
    const mainImage = page.getByTestId('gallery-image');
    await expect(mainImage).toHaveAttribute('src', imageUrls[0]);

    // - Os botões "Adicionar ao Carrinho" e "Comprar Agora" devem se tornar ativos (habilitados) e com cursor pointer
    const btnAddCart = page.getByRole('button', { name: 'Adicionar ao Carrinho' });
    const btnBuyNow = page.getByRole('button', { name: 'Comprar Agora' });

    await expect(btnAddCart).toBeEnabled();
    await expect(btnBuyNow).toBeEnabled();
    await expect(btnAddCart).not.toHaveClass(/cursor-not-allowed/);
    await expect(btnBuyNow).not.toHaveClass(/cursor-not-allowed/);

    // - O estoque exibido ao lado da quantidade deve atualizar para "5 unidades disponíveis"
    const stockText = page.locator('text=5 unidades disponíveis');
    await expect(stockText).toBeVisible();
  });

  test('Cenário 3: Bloqueio e Desativação Visual de Tamanho Sem Estoque', async ({ page }) => {
    await page.goto(productUrl);
    await page.waitForTimeout(1000);

    const btnAzul = page.getByRole('button', { name: /^azul$/i });
    
    // Ações: Clicar na cor Azul
    await btnAzul.click();

    // Resultado Esperado:
    // - O botão do tamanho M (estoque 0 para a cor Azul) deve ficar desabilitado
    const btnM = page.getByRole('button', { name: /^M$/i });
    await expect(btnM).toBeDisabled();

    // - O botão do tamanho M deve exibir opacidade reduzida, risco e cursor not-allowed
    await expect(btnM).toHaveClass(/opacity-40/);
    await expect(btnM).toHaveClass(/line-through/);
    await expect(btnM).toHaveClass(/cursor-not-allowed/);

    // - Clicar no botão do tamanho M não deve alterar o estado de tamanho selecionado
    await btnM.click({ force: true });
    await expect(page.locator('text=Selecionado: M')).not.toBeVisible();
  });

  test('Cenário 4: Ajuste do Botão de Compra para Variações Esgotadas (Botão "Esgotado")', async ({ page }) => {
    await page.goto(productUrl);
    await page.waitForTimeout(1000);

    const btnAzul = page.getByRole('button', { name: /^azul$/i });
    const btnM = page.getByRole('button', { name: /^M$/i });

    // 1. Seleciona a cor Azul primeiro (esta cor está habilitada no estado inicial)
    await btnAzul.click();

    // 2. Com a cor Azul selecionada, o tamanho M fica desabilitado (estoque 0).
    // Para contornar a desabilitação e garantir o teste do estado de variação esgotada,
    // invocamos diretamente o manipulador de clique do React (onClick) do botão M usando os objetos internos do React.
    await btnM.evaluate(el => {
      const key = Object.keys(el).find(k => k.startsWith('__reactProps') || k.startsWith('__reactEventHandlers'));
      if (key && (el as any)[key]?.onClick) {
        (el as any)[key].onClick({ preventDefault: () => {}, stopPropagation: () => {} });
      }
    });

    await page.waitForTimeout(500); // Aguarda o processamento do clique pelo React

    // Resultado Esperado:
    // - Os botões de compra devem ser desabilitados instantaneamente
    const btnAddCart = page.getByRole('button', { name: 'Adicionar ao Carrinho' });
    const btnBuyNow = page.getByRole('button', { name: 'Esgotado' });

    await expect(btnAddCart).toBeDisabled();
    await expect(btnBuyNow).toBeDisabled();

    // - O texto do botão principal deve mudar para "Esgotado"
    await expect(btnBuyNow).toHaveText('Esgotado');

    // - A quantidade deve mostrar "Sem estoque"
    const stockText = page.locator('text=Sem estoque');
    await expect(stockText).toBeVisible();
  });

  test('Cenário 5: Limites no Seletor de Quantidade', async ({ page }) => {
    await page.goto(productUrl);
    await page.waitForTimeout(1000);

    const btnAzul = page.getByRole('button', { name: /^azul$/i });
    const btnP = page.getByRole('button', { name: /^P$/i });

    // Seleciona Azul e tamanho P (estoque = 5)
    await btnAzul.click();
    await btnP.click();

    // Localiza os botões de incremento (+) e decremento (-)
    const btnPlus = page.locator('button:has(svg.lucide-plus), button:has-text("+")').first();
    const qtyValue = page.locator('span.border-x.border-pink-100');

    // Clicar no botão de incremento (+) 4 vezes (totalizando quantidade = 5)
    for (let i = 0; i < 4; i++) {
      await btnPlus.click();
      await page.waitForTimeout(100);
    }

    // Resultado Esperado:
    // - Quantidade deve ser 5
    await expect(qtyValue).toHaveText('5');

    // - Ao atingir a quantidade 5, o botão + deve ficar desabilitado
    await expect(btnPlus).toBeDisabled();

    // - Tentar clicar novamente no botão + não deve incrementar a quantidade além de 5
    await btnPlus.click({ force: true });
    await expect(qtyValue).toHaveText('5');
  });
});
