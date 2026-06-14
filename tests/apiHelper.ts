import { APIRequestContext } from '@playwright/test';

const apiBase = `${process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:5111'}/api`;

export class ApiHelper {
  private token: string | null = null;

  constructor(private request: APIRequestContext) { }

  /**
   * Efetua o login como Admin para obter o token JWT
   */
  async loginAdmin(): Promise<string> {
    if (this.token) return this.token;

    const email = process.env.TEST_USER_EMAIL;
    const password = process.env.TEST_USER_PASSWORD;

    const response = await this.request.post(`${apiBase}/auth/login`, {
      data: { email, password }
    });

    if (!response.ok()) {
      const body = await response.text();
      throw new Error(`Falha no login da API: ${response.status()} - ${body}`);
    }

    const json = await response.json();
    this.token = json.token;
    return this.token!;
  }

  /**
   * Obtém a contagem de produtos no painel administrativo filtrando por termo
   */
  async getAdminProductsCount(search: string): Promise<number> {
    const token = await this.loginAdmin();
    const response = await this.request.get(`${apiBase}/products/admin`, {
      headers: { Authorization: `Bearer ${token}` },
      params: { search }
    });

    if (!response.ok()) {
      const body = await response.text();
      throw new Error(`Falha ao obter lista de produtos do admin: ${response.status()} - ${body}`);
    }

    const products = await response.json();
    return products.length;
  }

  /**
   * Obtém a categoria "Calças" ou cria uma nova se não existir
   */
  async getOrCreateCategory(name = 'Calças', slug = 'calcas'): Promise<string> {
    const token = await this.loginAdmin();

    // 1. Tentar buscar categorias existentes
    const getResponse = await this.request.get(`${apiBase}/products/categories`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (getResponse.ok()) {
      const categories = await getResponse.json();
      const existing = categories.find((c: any) => c.slug === slug);
      if (existing) {
        return existing.id;
      }
    }

    // 2. Criar a categoria caso não exista
    const createResponse = await this.request.post(`${apiBase}/products/categories`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { name, slug }
    });

    if (!createResponse.ok()) {
      const body = await createResponse.text();
      throw new Error(`Falha ao criar categoria: ${createResponse.status()} - ${body}`);
    }

    const category = await createResponse.json();
    return category.id;
  }

  /**
   * Cria um produto com status Rascunho por padrão
   */
  async createProduct(payload: {
    name: string;
    description: string;
    basePrice: number;
    costPrice?: number;
    weight?: number;
    width?: number;
    height?: number;
    length?: number;
    categoryIds: string[];
    imageUrls?: string[];
  }): Promise<any> {
    const token = await this.loginAdmin();

    const response = await this.request.post(`${apiBase}/products`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        name: payload.name,
        description: payload.description,
        basePrice: payload.basePrice,
        costPrice: payload.costPrice ?? 0,
        weight: payload.weight ?? 0.2,
        width: payload.width ?? 15,
        height: payload.height ?? 2,
        length: payload.length ?? 20,
        categoryIds: payload.categoryIds,
        imageUrls: payload.imageUrls ?? []
      }
    });

    if (!response.ok()) {
      const body = await response.text();
      throw new Error(`Falha ao criar produto: ${response.status()} - ${body}`);
    }

    return await response.json();
  }

  /**
   * Publica um produto existente
   */
  async publishProduct(productId: string): Promise<any> {
    const token = await this.loginAdmin();

    const response = await this.request.post(`${apiBase}/products/${productId}/publish`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!response.ok()) {
      const body = await response.text();
      throw new Error(`Falha ao publicar produto: ${response.status()} - ${body}`);
    }

    return await response.json();
  }

  /**
   * Adiciona uma variação a um produto
   */
  async addVariation(
    productId: string,
    payload: {
      sku: string;
      size: string;
      color: string;
      stockQuantity: number;
      priceOverride?: number | null;
    }
  ): Promise<any> {
    const token = await this.loginAdmin();

    const response = await this.request.post(`${apiBase}/products/${productId}/variations`, {
      headers: { Authorization: `Bearer ${token}` },
      data: payload
    });

    if (!response.ok()) {
      const body = await response.text();
      throw new Error(`Falha ao adicionar variação: ${response.status()} - ${body}`);
    }

    return await response.json();
  }

  /**
   * Realiza uma venda (checkout) para uma variação para simular histórico de vendas
   */
  async createOrderForVariation(variationId: string): Promise<any> {
    const token = await this.loginAdmin();

    // 1. Calcular frete para obter as opções válidas
    const shippingResponse = await this.request.post(`${apiBase}/shipping/calculate`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        zipCode: '01001000',
        items: [{ productVariationId: variationId, quantity: 1 }]
      }
    });

    if (!shippingResponse.ok()) {
      const body = await shippingResponse.text();
      throw new Error(`Falha ao calcular frete para checkout: ${shippingResponse.status()} - ${body}`);
    }

    const options = await shippingResponse.json();
    if (!options || options.length === 0) {
      throw new Error('Nenhuma opção de frete disponível para o CEP 01001000.');
    }

    // Selecionamos a primeira opção de frete
    const selectedShipping = options[0];

    // 2. Executar o Checkout
    const checkoutResponse = await this.request.post(`${apiBase}/checkout`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        items: [{ productVariationId: variationId, quantity: 1 }],
        couponCode: null,
        shippingCarrierId: selectedShipping.carrierId,
        shippingCost: selectedShipping.price,
        paymentMethod: 'Pix',
        cardToken: null,
        zipCode: '01001000'
      }
    });

    if (!checkoutResponse.ok()) {
      const body = await checkoutResponse.text();
      throw new Error(`Falha no checkout da API: ${checkoutResponse.status()} - ${body}`);
    }

    return await checkoutResponse.json();
  }
}
