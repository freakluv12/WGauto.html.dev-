const POS = {
    cart: [],
    categories: [],
    subcategories: [],
    products: [],
    currentView: 'categories',
    currentCategoryId: null,
    currentSubcategoryId: null,

    init() {
        this.renderPOS();
        this.loadCategories();
    },

    renderPOS() {
        document.getElementById('posContent').innerHTML = `
            <div class="pos-container">
                <div class="pos-left">
                    <input type="text" id="posSearch" placeholder="Поиск товаров..." 
                           class="pos-search" oninput="POS.search()">
                    <div id="posBreadcrumb" class="pos-breadcrumb"></div>
                    <div id="posItemsList" class="pos-items-list"></div>
                </div>
                <div class="pos-right">
                    <div class="pos-receipt-header">Текущая продажа</div>
                    <div id="posReceiptItems" class="pos-receipt-items"></div>
                    <div id="posTotals" class="pos-totals"></div>
                    <div class="pos-actions">
                        <button class="pos-btn pos-btn-clear" onclick="POS.clearCart()">Очистить</button>
                        <button class="pos-btn pos-btn-complete" onclick="POS.completeSale()">Завершить продажу</button>
                    </div>
                </div>
            </div>
            
            <!-- Модальное окно скидки -->
            <div id="discountModal" class="modal" style="display: none;">
                <div class="modal-content" style="max-width: 400px;">
                    <h3>Применить скидку</h3>
                    <div style="margin: 20px 0;">
                        <div style="display: flex; gap: 10px; margin-bottom: 20px;">
                            <button class="pos-btn" onclick="POS.setDiscountType('percent')" 
                                    id="discountTypePercent" style="flex: 1;">%</button>
                            <button class="pos-btn" onclick="POS.setDiscountType('fixed')" 
                                    id="discountTypeFixed" style="flex: 1;">₾</button>
                        </div>
                        <div style="margin-bottom: 15px;">
                            <label style="display: block; margin-bottom: 5px;">Сумма до скидки:</label>
                            <div style="font-size: 24px; font-weight: bold; color: #333;" id="discountOriginalTotal"></div>
                        </div>
                        <div style="margin-bottom: 15px;">
                            <label style="display: block; margin-bottom: 5px;">Размер скидки:</label>
                            <input type="number" id="discountValue" placeholder="0" 
                                   style="width: 100%; padding: 10px; font-size: 18px;" 
                                   oninput="POS.calculateDiscount()">
                        </div>
                        <div style="margin-bottom: 20px; padding: 15px; background: #f0f9ff; border-radius: 8px;">
                            <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                                <span>Скидка:</span>
                                <span id="discountAmount" style="color: #e74c3c; font-weight: bold;">0.00 ₾</span>
                            </div>
                            <div style="display: flex; justify-content: space-between; font-size: 20px; font-weight: bold;">
                                <span>К оплате:</span>
                                <span id="discountFinalTotal" style="color: #27ae60;">0.00 ₾</span>
                            </div>
                        </div>
                    </div>
                    <div style="display: flex; gap: 10px;">
                        <button class="btn btn-secondary" onclick="POS.closeDiscountModal()" style="flex: 1;">Отмена</button>
                        <button class="btn btn-primary" onclick="POS.applyDiscountAndComplete()" style="flex: 1;">Подтвердить</button>
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
            // Загружаем продукты с ценами из инвентаря
            const response = await API.call(`/api/warehouse/products/${subcategoryId}`);
            if (!response) return;
            
            const products = await response.json();
            
            // Для каждого продукта загружаем инвентарь с ценами
            for (let product of products) {
                try {
                    const invResponse = await API.call(`/api/warehouse/inventory?product_id=${product.id}`);
                    if (invResponse) {
                        const inventory = await invResponse.json();
                        // Берем первую цену продажи из инвентаря
                        const itemWithPrice = inventory.find(inv => inv.sale_price && inv.sale_price > 0);
                        product.defaultSalePrice = itemWithPrice ? itemWithPrice.sale_price : 0;
                    }
                } catch (err) {
                    console.error('Error loading inventory for product:', product.id, err);
                }
            }
            
            this.products = products;
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
                const priceInfo = prod.defaultSalePrice > 0 ? 
                    `<div style="color: #27ae60; font-weight: bold; font-size: 14px;">${prod.defaultSalePrice.toFixed(2)} ₾</div>` : 
                    '<div style="color: #999; font-size: 12px;">Цена не указана</div>';
                return `
                    <div class="pos-item" onclick='POS.addToCart(${JSON.stringify(prod).replace(/'/g, "&apos;")})'>
                        <div class="pos-item-info">
                            <div class="pos-item-name">${prod.name}</div>
                            <div class="pos-item-stock ${stockClass}">
                                На складе: ${prod.total_quantity || 0}
                            </div>
                            ${priceInfo}
                        </div>
                        <div class="pos-item-price">+</div>
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
                const priceInfo = prod.defaultSalePrice > 0 ? 
                    `<div style="color: #27ae60; font-weight: bold; font-size: 14px;">${prod.defaultSalePrice.toFixed(2)} ₾</div>` : 
                    '<div style="color: #999; font-size: 12px;">Цена не указана</div>';
                return `
                    <div class="pos-item" onclick='POS.addToCart(${JSON.stringify(prod).replace(/'/g, "&apos;")})'>
                        <div class="pos-item-info">
                            <div class="pos-item-name">${prod.name}</div>
                            <div class="pos-item-stock ${stockClass}">
                                На складе: ${prod.total_quantity || 0}
                            </div>
                            ${priceInfo}
                        </div>
                        <div class="pos-item-price">+</div>
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
                salePrice: product.defaultSalePrice || 0 // Автоматически подставляем цену
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

    completeSale() {
        if (this.cart.length === 0) {
            alert('Корзина пуста');
            return;
        }
        
        const itemsWithoutPrice = this.cart.filter(item => !item.salePrice || item.salePrice <= 0);
        if (itemsWithoutPrice.length > 0) {
            alert('Укажите цену для всех товаров');
            return;
        }
        
        // Открываем модальное окно скидки
        this.openDiscountModal();
    },

    openDiscountModal() {
        const total = this.cart.reduce((sum, item) => sum + (item.quantity * item.salePrice), 0);
        
        document.getElementById('discountOriginalTotal').textContent = `${total.toFixed(2)} ₾`;
        document.getElementById('discountValue').value = '';
        document.getElementById('discountAmount').textContent = '0.00 ₾';
        document.getElementById('discountFinalTotal').textContent = `${total.toFixed(2)} ₾`;
        
        this.discountType = 'percent';
        this.setDiscountType('percent');
        
        document.getElementById('discountModal').style.display = 'flex';
    },

    closeDiscountModal() {
        document.getElementById('discountModal').style.display = 'none';
    },

    setDiscountType(type) {
        this.discountType = type;
        
        document.getElementById('discountTypePercent').style.background = 
            type === 'percent' ? '#3498db' : '#95a5a6';
        document.getElementById('discountTypeFixed').style.background = 
            type === 'fixed' ? '#3498db' : '#95a5a6';
        
        const input = document.getElementById('discountValue');
        input.placeholder = type === 'percent' ? '0-100%' : '0.00 ₾';
        
        this.calculateDiscount();
    },

    calculateDiscount() {
        const total = this.cart.reduce((sum, item) => sum + (item.quantity * item.salePrice), 0);
        const discountValue = parseFloat(document.getElementById('discountValue').value) || 0;
        
        let discountAmount = 0;
        
        if (this.discountType === 'percent') {
            if (discountValue > 100) {
                document.getElementById('discountValue').value = 100;
                discountAmount = total;
            } else {
                discountAmount = (total * discountValue) / 100;
            }
        } else {
            if (discountValue > total) {
                document.getElementById('discountValue').value = total.toFixed(2);
                discountAmount = total;
            } else {
                discountAmount = discountValue;
            }
        }
        
        const finalTotal = total - discountAmount;
        
        document.getElementById('discountAmount').textContent = `${discountAmount.toFixed(2)} ₾`;
        document.getElementById('discountFinalTotal').textContent = `${finalTotal.toFixed(2)} ₾`;
    },

    async applyDiscountAndComplete() {
        const total = this.cart.reduce((sum, item) => sum + (item.quantity * item.salePrice), 0);
        const discountValue = parseFloat(document.getElementById('discountValue').value) || 0;
        
        let discountAmount = 0;
        if (this.discountType === 'percent') {
            discountAmount = (total * Math.min(discountValue, 100)) / 100;
        } else {
            discountAmount = Math.min(discountValue, total);
        }
        
        const finalTotal = total - discountAmount;
        
        // TODO: Отправить данные на сервер
        console.log('Sale data:', {
            items: this.cart,
            originalTotal: total,
            discount: discountAmount,
            finalTotal: finalTotal,
            discountType: this.discountType
        });
        
        alert(`Продажа завершена!\nИтого: ${finalTotal.toFixed(2)} ₾\n(Скидка: ${discountAmount.toFixed(2)} ₾)`);
        
        this.closeDiscountModal();
        this.cart = [];
        this.renderCart();
    }
};
