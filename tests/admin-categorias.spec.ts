import { test, expect } from '@playwright/test';
import { ApiHelper } from './apiHelper';

async function loginAdmin(page: any) {
  page.on('console', (msg: any) => console.log(`[BROWSER CONSOLE] ${msg.type()}: ${msg.text()}`));
  page.on('pageerror', (err: any) => console.log(`[BROWSER ERROR] ${err.message}`));
  page.on('request', (req: any) => {
    if (req.url().includes('/api')) {
      console.log(`[NET REQ] ${req.method()} ${req.url()}`);
    }
  });
  page.on('response', async (res: any) => {
    if (res.url().includes('/api')) {
      let bodyText = '';
      try { bodyText = await res.text(); } catch { }
      console.log(`[NET RES] ${res.status()} ${res.url()} -> ${bodyText.substring(0, 300)}`);
    }
  });

  await page.goto('/conta', { timeout: 60000, waitUntil: 'load' });
  await page.getByPlaceholder('voce@email.com').fill(process.env.TEST_USER_EMAIL || 'admin@ecommerce.com');
  await page.getByPlaceholder('Digite sua senha').fill(process.env.TEST_USER_PASSWORD || 'Admin@123');
  await page.getByRole('button', { name: 'Acessar Loja' }).click();
  await expect(page.getByRole('link', { name: 'Ir para Painel Administrativo' })).toBeVisible({ timeout: 30000 });
  await page.waitForTimeout(2000);
}

test.describe.serial('Testes de Gerenciamento de Categorias (Admin)', () => {
  let api: ApiHelper;
  let token: string;
  let apiBase: string;
  let testCategoryId: string;
  let errorCategoryName: string;

  const tempEditCategoryName = `Calças E2E ${Date.now()}`;
  const tempEditCategorySlug = `calcas-e2e-${Date.now()}`;
  const finalEditCategoryName = `Calças de Alfaiataria E2E ${Date.now()}`;

  const newCategoryName = `Acessórios Especiais ${Date.now()}`;

  test.beforeAll(async ({ request }) => {
    api = new ApiHelper(request);
    token = await api.loginAdmin();
    apiBase = `${process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:5111'}/api`;

    // 1. Criar a categoria de teste para o cenário de Edição
    testCategoryId = await api.getOrCreateCategory(tempEditCategoryName, tempEditCategorySlug);

    // 2. Criar a categoria de teste para o cenário de Erro (Inativação com produtos ativos)
    errorCategoryName = `Categoria Ativa com Produto ${Date.now()}`;
    const errorCategorySlug = `categoria-ativa-com-produto-${Date.now()}`;
    const errorCatId = await api.getOrCreateCategory(errorCategoryName, errorCategorySlug);

    // 3. Criar produto ativo associado a essa categoria
    const product = await api.createProduct({
      name: `Produto Ativo Cat Erro ${Date.now()}`,
      description: "Produto para testar bloqueio de inativacao de categoria.",
      basePrice: 50.00,
      categoryIds: [errorCatId]
    });
    await api.publishProduct(product.id);
  });

  test('Cenário 1: Acesso ao Painel e Listagem de Categorias', async ({ page }) => {
    // 1. Login
    await loginAdmin(page);

    // 2. Acessar produtos admin
    await page.getByRole('link', { name: 'Ir para Painel Administrativo' }).click();
    await page.locator('a[href="/admin/produtos"]').click();
    await page.waitForTimeout(1500);

    // 3. Clicar em Gerenciar Categorias
    await page.getByRole('button', { name: 'Gerenciar Categorias' }).click();

    // 4. Verificar modal
    const modalHeading = page.getByRole('heading', { name: 'Gerenciar Categorias' });
    await expect(modalHeading).toBeVisible();

    // Verificar se categorias estão listadas (deve conter a nossa categoria criada)
    await expect(page.locator('span.font-bold.text-foreground', { hasText: tempEditCategoryName })).toBeVisible();
  });

  test('Cenário 2: Cadastro de Nova Categoria', async ({ page }) => {
    await loginAdmin(page);
    await page.getByRole('link', { name: 'Ir para Painel Administrativo' }).click();
    await page.locator('a[href="/admin/produtos"]').click();
    await page.waitForTimeout(1500);

    // Abrir modal
    await page.getByRole('button', { name: 'Gerenciar Categorias' }).click();
    await expect(page.getByText('Nova Categoria')).toBeVisible();

    // Preencher formulário
    await page.getByPlaceholder('Ex: Calçados').fill(newCategoryName);

    const checkbox = page.locator('#cat-active-checkbox');
    await expect(checkbox).toBeChecked();

    // Salvar
    await page.getByRole('button', { name: 'Salvar Categoria' }).click();

    // Mensagem de sucesso
    const expectedToast = `Categoria "${newCategoryName}" cadastrada com sucesso!`;
    await expect(page.getByText(expectedToast)).toBeVisible({ timeout: 15000 });

    // Verificar se o campo foi limpo
    await page.getByRole('button', { name: 'Gerenciar Categorias' }).click();
    await expect(page.getByPlaceholder('Ex: Calçados')).toHaveValue('');

    // Verificar se a categoria aparece listada no modal
    await expect(page.locator('span.font-bold.text-foreground', { hasText: newCategoryName })).toBeVisible();

    // Validar a badge Ativa (verde) correspondente à nova categoria
    const categoryRow = page.locator('div.flex.items-center.justify-between').filter({ has: page.locator('span.font-bold.text-foreground', { hasText: newCategoryName }) });
    await expect(categoryRow.locator('span', { hasText: 'Ativa' })).toBeVisible();
  });

  test('Cenário 3: Edição de Categoria Existente', async ({ page }) => {
    await loginAdmin(page);
    await page.getByRole('link', { name: 'Ir para Painel Administrativo' }).click();
    await page.locator('a[href="/admin/produtos"]').click();
    await page.waitForTimeout(1500);

    await page.getByRole('button', { name: 'Gerenciar Categorias' }).click();

    // Localizar a categoria tempEditCategoryName e clicar no ícone de lápis
    const categoryRow = page.locator('div.flex.items-center.justify-between').filter({ has: page.locator('span.font-bold.text-foreground', { hasText: tempEditCategoryName }) });
    await categoryRow.getByTitle('Editar Categoria').click();

    // Verificar se o formulário mudou para o modo de edição
    await expect(page.getByText('Editar Categoria')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cancelar Edição' })).toBeVisible();

    // Validar pré-preenchimento
    await expect(page.getByPlaceholder('Ex: Calçados')).toHaveValue(tempEditCategoryName);

    // Alterar o valor do nome
    await page.getByPlaceholder('Ex: Calçados').fill(finalEditCategoryName);

    // Desmarcar o checkbox
    const checkbox = page.locator('#cat-active-checkbox');
    await checkbox.setChecked(false);

    // Clicar em Atualizar Categoria
    await page.getByRole('button', { name: 'Atualizar Categoria' }).click();

    // Validar toast de sucesso
    const expectedToast = `Categoria "${finalEditCategoryName}" atualizada com sucesso!`;
    await expect(page.getByText(expectedToast)).toBeVisible({ timeout: 15000 });

    // Verificar se formulário voltou ao modo Nova Categoria
    await expect(page.getByText('Nova Categoria')).toBeVisible();
    await expect(page.getByPlaceholder('Ex: Calçados')).toHaveValue('');

    // Verificar se a categoria editada está listada com o novo nome e status Inativo
    const updatedRow = page.locator('div.flex.items-center.justify-between').filter({ has: page.locator('span.font-bold.text-foreground', { hasText: finalEditCategoryName }) });
    await expect(updatedRow).toBeVisible();
    await expect(updatedRow.locator('span', { hasText: 'Inativa' })).toBeVisible();
  });

  test('Cenário 4: Cancelamento de Edição de Categoria', async ({ page }) => {
    await loginAdmin(page);
    await page.getByRole('link', { name: 'Ir para Painel Administrativo' }).click();
    await page.locator('a[href="/admin/produtos"]').click();
    await page.waitForTimeout(1500);

    await page.getByRole('button', { name: 'Gerenciar Categorias' }).click();

    // Clicar em editar qualquer categoria da lista
    const categoryRow = page.locator('div.flex.items-center.justify-between').filter({ has: page.locator('span.font-bold.text-foreground') }).first();
    const originalName = await categoryRow.locator('span.font-bold.text-foreground').textContent() || '';
    await categoryRow.getByTitle('Editar Categoria').click();

    // Verificar se está no modo de edição
    await expect(page.getByText('Editar Categoria')).toBeVisible();
    await expect(page.getByPlaceholder('Ex: Calçados')).toHaveValue(originalName);

    // Cancelar
    await page.getByRole('button', { name: 'Cancelar Edição' }).click();

    // Verificar se voltou ao modo cadastro
    await expect(page.getByText('Nova Categoria')).toBeVisible();
    await expect(page.getByPlaceholder('Ex: Calçados')).toHaveValue('');
    await expect(page.locator('#cat-active-checkbox')).toBeChecked();
  });

  test('Cenário 5: Tentativa de Inativação de Categoria com Produtos Ativos (Erro)', async ({ page }) => {
    await loginAdmin(page);
    await page.getByRole('link', { name: 'Ir para Painel Administrativo' }).click();
    await page.locator('a[href="/admin/produtos"]').click();
    await page.waitForTimeout(1500);

    await page.getByRole('button', { name: 'Gerenciar Categorias' }).click();

    // Localizar a categoria errorCategoryName e clicar no lápis
    const categoryRow = page.locator('div.flex.items-center.justify-between').filter({ has: page.locator('span.font-bold.text-foreground', { hasText: errorCategoryName }) });
    await categoryRow.getByTitle('Editar Categoria').click();

    // Desmarcar checkbox
    const checkbox = page.locator('#cat-active-checkbox');
    await checkbox.setChecked(false);

    // Atualizar Categoria
    await page.getByRole('button', { name: 'Atualizar Categoria' }).click();

    // Validar mensagem de erro 400 Bad Request que o frontend exibe
    await expect(page.getByText('Não é possível inativar uma categoria que possui produtos ativos (publicados).')).toBeVisible({ timeout: 15000 });

    // Validar se o modal continua aberto e no modo de edição
    await expect(page.getByText('Editar Categoria')).toBeVisible();
  });
});
