const POS = {
    cart: [],
    categories: [],
    subcategories: [],
    products: [],
    currentView: 'categories',
    currentCategoryId: null,
    currentSubcategoryId: null,
    activeShift: null,

    async init() {
        await this.loadActiveShift();
        this.renderPOS();
        this.loadCategories();
    },

    async loadActiveShift() {
        try {
            const response = await API.call('/api/pos/shift/active');
            if (response && response.ok) {
                this.activeShift = await response.json();
            }
        } catch (error) {
            console.error('Load active shift error:', error);
        }
    },

    async startShift() {
        if (this.activeShift) {
            alert('У вас уже открыта смена');
            return;
        }

        try {
            const response = await API.call('/api/pos/shift/start', {
                method: 'POST'
            });

            if (response && response.ok) {
                this.activeShift = await response.json();
                alert('Смена открыта');
                this.renderPOS();
            }
        } catch (error) {
            alert('Ошибка открытия смены: ' + error.message);
        }
    },

    async endShift() {
        if (!this.activeShift) {
            alert('Нет активной смены');
            return;
        }

        if (this.cart.length > 0) {
            alert('Завершите текущую продажу перед закрытием смены');
            return;
        }

        if (!confirm('Закрыть смену?')) {
            return;
        }

        try {
            const response = await API.call('/api/pos/shift/end', {
                method: 'POST'
            });

            if (response && response.ok) {
                alert('Смена закрыта');
                this.activeShift = null;
                this.renderPOS();
            }
        } catch (error) {
            alert('Ошибка закрытия смены: ' + error.message);
        }
    },

    renderPOS() {
        const shiftStatus = this.activeShift 
            ? `<div class="shift-status active">Смена открыта с ${new Date(this.activeShift.start_time).toLocaleTimeString()}</div>`
            : `<div class="shift-status inactive">Смена не открыта <button class="btn" onclick="POS.startShift()">Открыть смену</button></div>`;

        document.getElementById('posContent').innerHTML = `
            ${shiftStatus}
            <div class="pos-container">
                <div class="pos-left">
                    <input type="text" id="posSearch" placeholder="Поиск товаров..." 
                           class="pos-search" oninput="POS.search()">
                    <div id="posBreadcrumb" class="pos-breadcrumb"></div>
                    <div id="posItemsList" class="pos-items-list"></div>
                </div>
                <div class="pos-right">
                    <div class="pos-receipt-header">
                        Текущая продажа
                        ${this.activeShift ? `<button class="btn btn-small" onclick="POS.endShift()" style="float: right;">Закрыть смену</button>` : ''}
                    </div>
                    <div id="posReceiptItems" class="pos-receipt-items"></div>
                    <div id="posTotals" class="pos-totals"></div>
                    <div class="pos-actions">
                        <button class="pos-btn pos-btn-clear" onclick="POS.clearCart()">Очистить</button>
                        <button class="pos-btn pos-btn-complete" onclick="POS.completeSale()" ${!this.activeShift ? 'disabled' : ''}>
                            Завершить продажу
                        </button>
                    </div>
                </div>
            </div>
        `;
        this.renderCart();
    },

    async loadCategories() {
        try {
            const response = await API.call('/api/warehouse/categories');
            if (!response) return;
            
            this.categories = await response.json();
            this.currentView = 'categories';
            this.renderBreadcrumb();
            this.renderItems();
        } catch (error) {
            console.error('POS load categories error:', error);
        }
    },

    async loadSubcategories(categoryId) {
        this.currentCategoryId = categoryId;
        try {
            const response = await API.call(`/api/warehouse/subcategories/${categoryId}`);
            if (!response) return;
            
            this.subcategories = await response.json();
            this.currentView = 'subcategories';
            this.renderBreadcrumb();
            this.renderItems();
        } catch (error) {
            console.error('POS load subcategories error:', error);
        }
    },

    async loadProducts(subcategoryId) {
        this.currentSubcategoryId = subcategoryId;
        try {
            const response = await API.call(`/api/warehouse/products/${subcategoryId}`);
            if (!response) return;
            
            this.products = await response.json();
            
            // Load inventory to get sale prices
            for (let product of this.products) {
                const invResponse = await API.call(`/api/warehouse/inventory/${product.id}`);
                if (invResponse && invResponse.ok) {
                    const inventory = await invResponse.json();
                    // Get average sale price from inventory
                    if (inventory.length > 0) {
                        const avgPrice = inventory.reduce((sum, inv) => sum + (parseFloat(inv.sale_price) || 0), 0) / inventory.length;
                        product.suggested_price = avgPrice > 0 ? avgPrice : null;
                    }
                }
            }
            
            this.currentView = 'products';
            this.renderBreadcrumb();
            this.renderItems();
        } catch (error) {
            console.error('POS load products error:', error);
        }
    },

    renderBreadcrumb() {
        let breadcrumbHTML = '<div class="pos-breadcrumb-item" onclick="POS.loadCategories()">🏠 Главная</div>';
        
        if (this.currentCategoryId) {
            const category = this.categories.find(c => c.id === this.currentCategoryId);
            breadcrumbHTML += `<div class="pos-breadcrumb-item" onclick="POS.loadSubcategories(${this.currentCategoryId})">${category.name}</div>`;
        }
        
        if (this.currentSubcategoryId) {
            const subcategory = this.subcategories.find(s => s.id === this.currentSubcategoryId);
            breadcrumbHTML += `<div class="pos-breadcrumb-item">${subcategory.name}</div>`;
        }
        
        document.getElementById('posBreadcrumb').innerHTML = breadcrumbHTML;
    },

    renderItems() {
        let itemsHTML = '';
        
        if (this.currentView === 'categories') {
            itemsHTML = this.categories.map(cat => `
                <div class="pos-item" onclick="POS.loadSubcategories(${cat.id})">
                    <div class="pos-item-info">
                        <div class="pos-item-name">${cat.icon || '📦'} ${cat.name}</div>
                        <div class="pos-item-stock">${cat.description || ''}</div>
                    </div>
                    <div style="font-size: 24px;">›</div>
                </div>
            `).join('');
        } else if (this.currentView === 'subcategories') {
            itemsHTML = this.subcategories.map(sub => `
                <div class="pos-item" onclick="POS.loadProducts(${sub.id})">
                    <div class="pos-item-info">
                        <div class="pos-item-name">📋 ${sub.name}</div>
                        <div class="pos-item-stock">${sub.description || ''}</div>
                    </div>
                    <div style="font-size: 24px;">›</div>
                </div>
            `).join('');
        } else if (this.currentView === 'products') {
            itemsHTML = this.products.map(prod => {
                const stockClass = prod.total_quantity <= 0 ? 'out' : 
                                  prod.total_quantity <= prod.min_stock_level ? 'low' : '';
                const priceHint = prod.suggested_price ? ` (${prod.suggested_price.toFixed(2)})` : '';
                return `
                    <div class="pos-item ${prod.total_quantity <= 0 ? 'disabled' : ''}" 
                         onclick='${prod.total_quantity > 0 ? `POS.addToCart(${JSON.stringify(prod).replace(/'/g, "&apos;")})` : ""}'>
                        <div class="pos-item-info">
                            <div class="pos-item-name">${prod.name}${priceHint}</div>
                            <div class="pos-item-stock ${stockClass}">
                                На складе: ${prod.total_quantity || 0}
                            </div>
                        </div>
                        <div class="pos-item-price">${prod.total_quantity > 0 ? '+' : '✕'}</div>
                    </div>
                `;
            }).join('');
        }
        
        document.getElementById('posItemsList').innerHTML = itemsHTML || '<div class="loading">Нет элементов</div>';
    },

    search() {
        const searchTerm = document.getElementById('posSearch').value.toLowerCase();
        if (!searchTerm) {
            this.renderItems();
            return;
        }
        
        if (this.currentView === 'products') {
            const filtered = this.products.filter(p => 
                p.name.toLowerCase().includes(searchTerm) ||
                (p.sku && p.sku.toLowerCase().includes(searchTerm))
            );
            
            let itemsHTML = filtered.map(prod => {
                const stockClass = prod.total_quantity <= 0 ? 'out' : 
                                  prod.total_quantity <= prod.min_stock_level ? 'low' : '';
                const priceHint = prod.suggested_price ? ` (${prod.suggested_price.toFixed(2)})` : '';
                return `
                    <div class="pos-item ${prod.total_quantity <= 0 ? 'disabled' : ''}" 
                         onclick='${prod.total_quantity > 0 ? `POS.addToCart(${JSON.stringify(prod).replace(/'/g, "&apos;")})` : ""}'>
                        <div class="pos-item-info">
                            <div class="pos-item-name">${prod.name}${priceHint}</div>
                            <div class="pos-item-stock ${stockClass}">
                                На складе: ${prod.total_quantity || 0}
                            </div>
                        </div>
                        <div class="pos-item-price">${prod.total_quantity > 0 ? '+' : '✕'}</div>
                    </div>
                `;
            }).join('');
            
            document.getElementById('posItemsList').innerHTML = itemsHTML || '<div class="loading">Нет результатов</div>';
        }
    },

    addToCart(product) {
        if (product.total_quantity <= 0) {
            alert('Товар отсутствует на складе');
            return;
        }

        if (!this.activeShift) {
            alert('Откройте смену перед началом продажи');
            return;
        }
        
        const existingItem = this.cart.find(item => item.id === product.id);
        if (existingItem) {
            if (existingItem.quantity >= product.total_quantity) {
                alert('Недостаточно товара на складе');
                return;
            }
            existingItem.quantity++;
        } else {
            this.cart.push({ 
                ...product, 
                quantity: 1,
                salePrice: product.suggested_price || 0
            });
        }
        
        this.renderCart();
    },

    removeFromCart(productId) {
        this.cart = this.cart.filter(item => item.id !== productId);
        this.renderCart();
    },

    updateQuantity(productId, delta) {
        const item = this.cart.find(i => i.id === productId);
        if (!item) return;
        
        item.quantity += delta;
        
        if (item.quantity <= 0) {
            this.removeFromCart(productId);
        } else if (item.quantity > item.total_quantity) {
            item.quantity = item.total_quantity;
            alert('Недостаточно товара на складе');
        }
        
        this.renderCart();
    },

    updatePrice(productId, price) {
        const item = this.cart.find(i => i.id === productId);
        if (item) {
            item.salePrice = parseFloat(price) || 0;
            this.renderCart();
        }
    },

    renderCart() {
        if (this.cart.length === 0) {
            document.getElementById('posReceiptItems').innerHTML = 
                '<div class="pos-receipt-empty">Корзина пуста</div>';
            document.getElementById('posTotals').innerHTML = '';
            return;
        }
        
        let cartHTML = this.cart.map(item => `
            <div class="pos-receipt-item">
                <div class="pos-receipt-item-header">
                    <span class="pos-receipt-item-name">${item.name}</span>
                    <button class="pos-receipt-item-remove" onclick="POS.removeFromCart(${item.id})">✕</button>
                </div>
                <div class="pos-receipt-item-controls">
                    <div class="pos-quantity-control">
                        <button class="pos-quantity-btn" onclick="POS.updateQuantity(${item.id}, -1)">-</button>
                        <span class="pos-quantity-value">${item.quantity}</span>
                        <button class="pos-quantity-btn" onclick="POS.updateQuantity(${item.id}, 1)">+</button>
                    </div>
                    <div>
                        <input type="number" placeholder="Цена" step="0.01" style="width: 80px; padding: 5px;"
                               value="${item.salePrice}" 
                               onchange="POS.updatePrice(${item.id}, this.value)">
                    </div>
                    <span class="pos-receipt-item-total">${(item.quantity * item.salePrice).toFixed(2)}</span>
                </div>
            </div>
        `).join('');
        
        const total = this.cart.reduce((sum, item) => sum + (item.quantity * item.salePrice), 0);
        
        let totalsHTML = `
            <div class="pos-total-row">
                <span>Товаров: ${this.cart.length}</span>
                <span>Кол-во: ${this.cart.reduce((sum, item) => sum + item.quantity, 0)}</span>
            </div>
            <div class="pos-total-row final">
                <span>ИТОГО:</span>
                <span>${total.toFixed(2)} ₾</span>
            </div>
        `;
        
        document.getElementById('posReceiptItems').innerHTML = cartHTML;
        document.getElementById('posTotals').innerHTML = totalsHTML;
    },

    clearCart() {
        if (this.cart.length === 0) return;
        
        if (confirm('Очистить корзину?')) {
            this.cart = [];
            this.renderCart();
        }
    },

    async completeSale() {
        if (!this.activeShift) {
            alert('Откройте смену перед началом продажи');
            return;
        }

        if (this.cart.length === 0) {
            alert('Корзина пуста');
            return;
        }
        
        const itemsWithoutPrice = this.cart.filter(item => !item.salePrice || item.salePrice <= 0);
        if (itemsWithoutPrice.length > 0) {
            alert('Укажите цену для всех товаров');
            return;
        }
        
        if (!confirm('Завершить продажу?')) {
            return;
        }
        
        try {
            const response = await API.call('/api/pos/sale', {
                method: 'POST',
                body: JSON.stringify({
                    items: this.cart,
                    currency: 'GEL'
                })
            });

            if (response && response.ok) {
                const result = await response.json();
                alert(`Продажа завершена! Чек #${result.receipt.id}`);
                this.cart = [];
                this.renderCart();
                
                // Reload products to update stock
                if (this.currentSubcategoryId) {
                    this.loadProducts(this.currentSubcategoryId);
                }
            }
        } catch (error) {
            alert('Ошибка завершения продажи: ' + error.message);
        }
    }
};
