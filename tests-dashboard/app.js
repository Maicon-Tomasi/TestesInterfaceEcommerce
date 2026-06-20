const scenarios = [
    // Vitrine
    { group: 'Vitrine de Produto', file: 'vitrine-produto.spec.ts', name: 'Validação de Estado Inicial (Sem Seleções)', focus: 'ProductPurchaseActions / Initial State' },
    { group: 'Vitrine de Produto', file: 'vitrine-produto.spec.ts', name: 'Seleção Dinâmica de Variação e Atualização de Galeria', focus: 'ProductGallery / Image Mapping' },
    { group: 'Vitrine de Produto', file: 'vitrine-produto.spec.ts', name: 'Bloqueio e Desativação Visual de Tamanho Sem Estoque', focus: 'UI Disablement Logic' },
    { group: 'Vitrine de Produto', file: 'vitrine-produto.spec.ts', name: 'Ajuste do Botão para Variações Esgotadas', focus: 'Add to Cart Button State' },
    { group: 'Vitrine de Produto', file: 'vitrine-produto.spec.ts', name: 'Limites no Seletor de Quantidade', focus: 'Quantity Selector (+/- limits)' },
    
    // Cloud Cart
    { group: 'Cloud Cart Sync', file: 'cloud-cart.spec.ts', name: 'Sincronização Real ao realizar Login', focus: 'StoreContext / Auth Integration' },
    { group: 'Cloud Cart Sync', file: 'cloud-cart.spec.ts', name: 'Sincronização de Mesclagem Real (Merge)', focus: 'StoreContext / State Merging' },
    { group: 'Cloud Cart Sync', file: 'cloud-cart.spec.ts', name: 'Ajuste Otimista ao Atualizar Quantidade', focus: 'Optimistic UI Updates' },
    { group: 'Cloud Cart Sync', file: 'cloud-cart.spec.ts', name: 'Exclusão de Item', focus: 'CartItem API Delete' },
    { group: 'Cloud Cart Sync', file: 'cloud-cart.spec.ts', name: 'Limpeza Total do Carrinho', focus: 'Clear Cart HTTP Integration' },
    
    // Cart Journey (Fase 2)
    { group: 'Jornada do Carrinho E2E', file: 'cart-journey.spec.ts', name: 'Deleção em Massa (Clear Cart)', focus: 'CartDrawer / Context Clear' },
    { group: 'Jornada do Carrinho E2E', file: 'cart-journey.spec.ts', name: 'Deleção Gradual pelo Botão Menos (-)', focus: 'CartItem Delete Threshold' },
    { group: 'Jornada do Carrinho E2E', file: 'cart-journey.spec.ts', name: 'Deleção pelo Botão Remover', focus: 'Trash Icon Interaction' },
    { group: 'Jornada do Carrinho E2E', file: 'cart-journey.spec.ts', name: 'Bloqueio Local ao ultrapassar estoque', focus: 'Client-side Validation' },
    { group: 'Jornada do Carrinho E2E', file: 'cart-journey.spec.ts', name: 'Adição direta estourando estoque', focus: 'UI Maximum Bounds' },
    { group: 'Jornada do Carrinho E2E', file: 'cart-journey.spec.ts', name: 'Auto-correção (Corte Assíncrono do Backend)', focus: 'StoreContext Silent Sync & Toast' },
    { group: 'Jornada do Carrinho E2E', file: 'cart-journey.spec.ts', name: 'Metralhadora de Cliques (Debounce)', focus: 'API Rate Limiting / UX Stability' },
    { group: 'Jornada do Carrinho E2E', file: 'cart-journey.spec.ts', name: 'Concorrência de Clientes (Multi-Browser)', focus: 'Race Condition Prevention' },
    { group: 'Jornada do Carrinho E2E', file: 'cart-journey.spec.ts', name: 'Refresh Seguro da Página', focus: 'Hydration / LocalStorage Resilience' },
    
    // Configurações Dinâmicas
    { group: 'Configurações Globais', file: 'configuracoes-dinamicas.spec.ts', name: 'Edição e Gravação de Configurações', focus: 'AdminSettingsForm' },
    { group: 'Configurações Globais', file: 'configuracoes-dinamicas.spec.ts', name: 'Exibição Dinâmica do Banner na Home', focus: 'BannerComponent / Layout' },
    { group: 'Configurações Globais', file: 'configuracoes-dinamicas.spec.ts', name: 'Cálculos de Frete Grátis e Fixo no Carrinho', focus: 'CheckoutSummary / Shipping Logic' },
    { group: 'Configurações Globais', file: 'configuracoes-dinamicas.spec.ts', name: 'Garantias Promocionais na Página do Produto', focus: 'Product Promises Panel' },
    
    // Admin Produtos
    { group: 'Painel Admin: Produtos', file: 'admin-produtos.spec.ts', name: 'Edição e Publicação de Produto', focus: 'EditProductModal' },
    { group: 'Painel Admin: Produtos', file: 'admin-produtos.spec.ts', name: 'Paginação Dinâmica no Painel', focus: 'Admin Table Pagination' },
    { group: 'Painel Admin: Produtos', file: 'admin-produtos.spec.ts', name: 'Exclusão Permanente de Produto sem Vendas', focus: 'Delete Restrictions' },
    { group: 'Painel Admin: Produtos', file: 'admin-produtos.spec.ts', name: 'Cadastro de Variações de Estoque', focus: 'CreateVariationModal / Form Validation' },
    { group: 'Painel Admin: Produtos', file: 'admin-produtos.spec.ts', name: 'Vinculação de Fotos na Primeira Variação', focus: 'Image Upload & Mapping' },
    { group: 'Painel Admin: Produtos', file: 'admin-produtos.spec.ts', name: 'Auto-preenchimento (Novo Tamanho, Mesma Cor)', focus: 'Form Helpers / UX' },
    { group: 'Painel Admin: Produtos', file: 'admin-produtos.spec.ts', name: 'Nova Cor e Conflito de Imagens', focus: 'Color/Image Conflict Resolution' },
    { group: 'Painel Admin: Produtos', file: 'admin-produtos.spec.ts', name: 'Adicionando Variações Diferentes', focus: 'Multi-variation State Integrity' },
    
    // Admin Categorias & Frete
    { group: 'Painel Admin: Frete', file: 'admin-configuracoes-frete.spec.ts', name: 'Carregamento de configurações de frete', focus: 'Shipping Settings Load' },
    { group: 'Painel Admin: Frete', file: 'admin-configuracoes-frete.spec.ts', name: 'Salvamento de alteração de fretes', focus: 'Settings API Save' },
    { group: 'Painel Admin: Frete', file: 'admin-configuracoes-frete.spec.ts', name: 'Bloqueio após desativar transportadora', focus: 'Checkout Process Flow' },
    { group: 'Painel Admin: Categorias', file: 'admin-categorias.spec.ts', name: 'Listagem de Categorias', focus: 'Category Table Read' },
    { group: 'Painel Admin: Categorias', file: 'admin-categorias.spec.ts', name: 'Cadastro de Nova Categoria', focus: 'Category Create Modal' },
    { group: 'Painel Admin: Categorias', file: 'admin-categorias.spec.ts', name: 'Edição de Categoria Existente', focus: 'Category Edit Modal' },
    { group: 'Painel Admin: Categorias', file: 'admin-categorias.spec.ts', name: 'Cancelamento de Edição de Categoria', focus: 'Modal Dismissal Logic' },
    { group: 'Painel Admin: Categorias', file: 'admin-categorias.spec.ts', name: 'Inativação de Categoria com Produtos (Erro)', focus: 'Referential Integrity UI Feedback' }
];

document.addEventListener('DOMContentLoaded', () => {
    
    // 1. Initialize Chart
    const ctx = document.getElementById('coverageChart').getContext('2d');
    
    const categoryCounts = {
        'Vitrine e Carrinho E2E': 23,
        'Painel Administrativo': 14,
        'Cloud Sync & Auth': 4
    };

    new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: Object.keys(categoryCounts),
            datasets: [{
                data: Object.values(categoryCounts),
                backgroundColor: [
                    '#f43f5e', // Rose 500
                    '#8b5cf6', // Violet 500
                    '#0ea5e9'  // Sky 500
                ],
                borderWidth: 0,
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '75%',
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: '#a1a1aa',
                        font: { family: "'Inter', sans-serif", size: 12 },
                        padding: 20,
                        usePointStyle: true
                    }
                }
            }
        }
    });

    // 2. Populate Table
    const tableBody = document.getElementById('scenariosTableBody');
    const noResults = document.getElementById('noResults');
    const searchInput = document.getElementById('searchInput');

    function renderTable(data) {
        tableBody.innerHTML = '';
        if (data.length === 0) {
            noResults.classList.remove('hidden');
        } else {
            noResults.classList.add('hidden');
            data.forEach((s, idx) => {
                const tr = document.createElement('tr');
                tr.className = `hover:bg-white/5 transition-colors ${idx !== data.length - 1 ? 'border-b border-white/5' : ''}`;
                
                tr.innerHTML = `
                    <td class="py-4">
                        <span class="block font-medium text-white">${s.group}</span>
                        <span class="block text-xs text-muted font-mono mt-1">${s.file}</span>
                    </td>
                    <td class="py-4 font-semibold text-white">${s.name}</td>
                    <td class="py-4 text-xs">
                        <span class="inline-flex items-center px-2.5 py-0.5 rounded-full font-medium bg-primary/10 text-primary border border-primary/20">
                            ${s.focus}
                        </span>
                    </td>
                    <td class="py-4 text-center">
                        <i data-lucide="check" class="inline-block w-4 h-4 text-emerald-400"></i>
                    </td>
                `;
                tableBody.appendChild(tr);
            });
            // Re-initialize icons for newly added elements
            if (window.lucide) {
                window.lucide.createIcons();
            }
        }
    }

    renderTable(scenarios);

    // 3. Search Logic
    searchInput.addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase();
        const filtered = scenarios.filter(s => 
            s.name.toLowerCase().includes(term) || 
            s.group.toLowerCase().includes(term) ||
            s.focus.toLowerCase().includes(term) ||
            s.file.toLowerCase().includes(term)
        );
        renderTable(filtered);
    });

    // 4. Populate Features Grid
    const featuresGrid = document.getElementById('featuresGrid');
    const features = [
        { 
            title: 'Sincronização de Carrinho', 
            icon: 'refresh-ccw', 
            color: 'text-blue-400',
            components: ['StoreContext.tsx', 'CartController.cs'],
            desc: 'Garante merge entre local e nuvem sem perda de itens.'
        },
        { 
            title: 'Proteção de Estoque', 
            icon: 'shield-alert', 
            color: 'text-orange-400',
            components: ['ProductPurchaseActions.tsx', 'CartService.cs'],
            desc: 'Limites na UI e auto-correção assíncrona (snap back).'
        },
        { 
            title: 'Concorrência Multi-Cliente', 
            icon: 'users', 
            color: 'text-purple-400',
            components: ['CheckoutService.cs', 'UnitOfWork.cs'],
            desc: 'Previne race conditions comprando a última unidade.'
        },
        { 
            title: 'Formulários Complexos', 
            icon: 'file-edit', 
            color: 'text-pink-400',
            components: ['CreateVariationModal.tsx', 'AdminProductTable.tsx'],
            desc: 'Gerenciamento de slugs únicos, fotos e auto-preenchimento.'
        },
        { 
            title: 'Configurações Dinâmicas', 
            icon: 'settings', 
            color: 'text-emerald-400',
            components: ['BannerComponent.tsx', 'CheckoutSummary.tsx'],
            desc: 'Cálculos de frete fixo, frete grátis e banners em tempo real.'
        },
        { 
            title: 'Navegação e Vitrine', 
            icon: 'shopping-bag', 
            color: 'text-rose-400',
            components: ['ProductGallery.tsx', 'CatalogGrid.tsx'],
            desc: 'Desativação visual de tamanhos esgotados e imagens por cor.'
        }
    ];

    features.forEach(f => {
        const div = document.createElement('div');
        div.className = 'bg-secondary/50 rounded-xl p-4 border border-white/5 hover:border-white/20 transition-colors';
        div.innerHTML = `
            <div class="flex items-center mb-3">
                <i data-lucide="${f.icon}" class="w-5 h-5 mr-3 ${f.color}"></i>
                <h4 class="font-bold text-white text-sm">${f.title}</h4>
            </div>
            <p class="text-xs text-muted leading-relaxed mb-3">${f.desc}</p>
            <div class="flex flex-wrap gap-2">
                ${f.components.map(c => `<span class="px-2 py-1 bg-black/40 border border-white/10 rounded text-[10px] text-gray-300 font-mono">${c}</span>`).join('')}
            </div>
        `;
        featuresGrid.appendChild(div);
    });

    // Re-init icons for the newly injected feature blocks
    if (window.lucide) {
        window.lucide.createIcons();
    }
});
