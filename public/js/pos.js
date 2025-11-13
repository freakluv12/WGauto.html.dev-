const POS = {
    cart: [],
    categories: [],
    subcategories: [],
    products: [],
    currentView: 'categories',
    currentCategoryId: null,
    currentSubcategoryId: null,
    currentShift: null,

    init() {
        this.checkActiveShift();
    },

    async checkActiveShift() {
        try {
            const response = await API.call('/api/pos/active-shift');
            if (!response) return;
            
            const data = await response.json();
            
            if (data.shift) {
                this.currentShift = data.shift;
                this.renderPOS();
                this.loadCategories();
            } else {
                this.showOpenShiftScreen();
            }
        } catch (error) {
            console.error('Check shift error:', error);
            this.showOpenShiftScreen();
        }
    },

    showOpenShiftScreen() {
        document.getElementById('posContent').innerHTML = `
            <div style="display: flex; justify-content: center; align-items: center; min-height: 400px;">
                <div style="background: #3d3d3d; padding: 40px; border-radius: 12px; text-align: center; max-width: 400px;">
                    <h2 style="margin-bottom: 20px; color: #4CAF50;">Открыть смену</h2>
                    <p style="color: #ccc; margin-bottom: 30px;">Для начала работы в кассе необходимо открыть смену</p>
                    
                    <div class="form-group" style="text-align: left; margin-bottom: 20px;">
                        <label>Начало смены</label>
                        <input type="datetime-local" id="shiftStartTime" style="width: 100%; padding: 10px; border: 1px solid #555; border-radius: 4px; background: #2d2d2d; color: #fff;">
                    </div>
                    
                    <button class="btn" onclick="POS.openShift()" style="width: 100%; padding: 15px; font-size: 16px;">
                        Открыть смену
                    </button>
                </div>
            </div>
        `;
        
        // Set current time
        const now = new Date();
        now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
        document.getElementById('shiftStartTime').value = now.toISOString().slice(0, 16);
    },

    async openShift() {
        const startTime = document.getElementById('shiftStartTime').value;
        
        if (!startTime) {
            alert('Укажите время начала смены');
            return;
        }
        
        try {
            const response = await API.call('/api/pos/shifts/open', {
                method: 'POST',
                body: JSON.stringify({ start_time: startTime })
            });
            
            if (response && response.ok) {
                const data = await response.json();
                this.currentShift = data.shift;
                this.renderPOS();
                this.loadCategories();
            } else {
                alert('Не удалось открыть смену');
            }
        } catch (error) {
            alert('Ошибка: ' + error.message);
        }
    },

    renderPOS() {
        document.getElementById('posContent').innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                <div style="background: #3d3d3d; padding: 10px 20px; border-radius: 8px;">
                    <span style="color: #4CAF50; font-weight: bold;">Смена открыта:</span>
                    <span style="color: #ccc; margin-left: 10px;">${Utils.formatDateTime(this.currentShift.start_time)}</span>
                </div>
                <div style="display: flex; gap: 10px;">
                    <button class="btn" onclick="POS.showShiftHistory()" style="background: #2196F3;">📋 История смен</button>
                    <button class="btn btn-danger" onclick="POS.closeShift()">Закрыть смену</button>
                </div>
            </div>

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
        `;
        this.renderCart();
    },

    async closeShift() {
        if (!confirm('Закрыть текущую смену?')) return;
        
        try {
            const response = await API.call(`/api/pos/shifts/${this.currentShift.id}/close`, {
                method: 'POST'
            });
            
            if (response && response.ok) {
                this.currentShift = null;
                this.cart = [];
                this.showOpenShiftScreen();
            } else {
                alert('Не удалось закрыть смену');
            }
        } catch (error) {
            alert('Ошибка: ' + error.message);
        }
    },

    showShiftHistory() {
        Utils.showModal('shiftHistoryModal');
        this.loadShiftHistory();
    },

    async loadShiftHistory() {
        try {
            const response = await API.call('/api/pos/shifts/history');
            if (!response) return;
            
            const shifts = await response.json();
            
            let html = '';
            if (shifts.length === 0) {
                html = '<div class="loading">Нет истории смен</div>';
            } else {
                html = shifts.map(shift => `
                    <div style="background: #3d3d3d; padding: 20px; border-radius: 8px; margin-bottom: 15px; cursor: pointer;"
                         onclick="POS.showShiftReceipts(${shift.id})">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <div>
                                <div style="font-weight: bold; font-size: 16px; margin-bottom: 5px;">
                                    Смена #${shift.id}
                                </div>
                                <div style="color: #ccc; font-size: 14px;">
                                    ${Utils.formatDateTime(shift.start_time)} - ${shift.end_time ? Utils.formatDateTime(shift.end_time) : 'открыта'}
                                </div>
                            </div>
                            <div style="text-align: right;">
                                <div style="font-size: 24px; font-weight: bold; color: #4CAF50;">
                                    ${shift.total_sales || 0} ₾
                                </div>
                                <div style="color: #ccc; font-size: 14px;">
                                    ${shift.receipts_count || 0} чеков
                                </div>
                            </div>
                        </div>
                    </div>
                `).join('');
            }
            
            document.getElementById('shiftHistoryList').innerHTML = html;
        } catch (error) {
            console.error('Load shift history error:', error);
        }
    },

    async showShiftReceipts(shiftId) {
        try {
            const response = await API.call(`/api/pos/shifts/${shiftId}/receipts`);
            if (!response) return;
            
            const receipts = await response.json();
            
            let html = `
                <button class="btn" onclick="POS.loadShiftHistory()" style="margin-bottom: 20px;">← Назад к сменам</button>
                <h3 style="margin-bottom: 20px;">Чеки смены #${shiftId}</h3>
            `;
            
            if (receipts.length === 0) {
                html += '<div class="loading">Нет чеков в этой смене</div>';
            } else {
                html += receipts.map(receipt => `
                    <div style="background: #3d3d3d; padding: 15px; border-radius: 8px; margin-bottom: 10px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                            <div>
                                <span style="font-weight: bold;">Чек #${receipt.id}</span>
                                <span style="color: #ccc; margin-left: 15px;">${Utils.formatDateTime(receipt.sale_time)}</span>
                            </div>
                            <div style="display: flex; gap: 10px; align-items: center;">
                                <span style="font-size: 20px; font-weight: bold; color: #4CAF50;">
                                    ${receipt.total_amount} ${receipt.currency}
                                </span>
                                ${receipt.is_cancelled ? 
                                    '<span style="background: #f44336; padding: 4px 12px; border-radius: 4px; font-size: 12px;">ОТМЕНЁН</span>' :
                                    `<button class="btn btn-danger" onclick="POS.cancelReceipt(${receipt.id})" style="padding: 6px 12px; font-size: 12px;">Отменить</button>`
                                }
                            </div>
                        </div>
                        <div style="font-size: 14px; color: #ccc;">
                            ${receipt.items.map(item => `
                                <div style="padding: 5px 0; border-top: 1px solid #555;">
                                    ${item.product_name} × ${item.quantity} = ${(item.sale_price * item.quantity).toFixed(2)} ${receipt.currency}
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `).join('');
            }
            
            document.getElementById('shiftHistoryList').innerHTML = html;
        } catch (error) {
            console.error('Load receipts error:', error);
        }
    },

    async cancelReceipt(receiptId) {
        if (!confirm('Отменить чек? Товары вернутся на склад, продажа будет удалена из статистики.')) return;
        
        try {
            const response = await API.call(`/api/pos/receipts/${receiptId}/cancel`, {
                method: 'POST'
            });
            
            if (response && response.ok) {
                alert('Чек отменён');
                this.showShiftReceipts(this.currentShift.id);
            } else {
                alert('Не удалось отменить чек');
            }
        } catch (error) {
            alert('Ошибка: ' + error.message);
        }
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
                return `
                    <div class="pos-item" onclick='POS.addToCart(${JSON.stringify(prod).replace(/'/g, "&apos;")})'>
                        <div class="pos-item-info">
                            <div class="pos-item-name">${prod.name}</div>
                            <div class="pos-item-stock ${stockClass}">
                                На складе: ${prod.total_quantity || 0}
                            </div>
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
                return `
                    <div class="pos-item" onclick='POS.addToCart(${JSON.stringify(prod).replace(/'/g, "&apos;")})'>
                        <div class="pos-item-info">
                            <div class="pos-item-name">${prod.name}</div>
                            <div class="pos-item-stock ${stockClass}">
                                На складе: ${prod.total_quantity || 0}
                            </div>
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
                salePrice: 0
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
                <span>${total.toFixed(2)}</span>
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
        
        const saleData = {
            shift_id: this.currentShift.id,
            items: this.cart.map(item => ({
                product_id: item.id,
                quantity: item.quantity,
                sale_price: item.salePrice
            }))
        };
        
        try {
            const response = await API.call('/api/pos/sales/complete', {
                method: 'POST',
                body: JSON.stringify(saleData)
            });
            
            if (response && response.ok) {
                alert('Продажа завершена!');
                this.cart = [];
                this.renderCart();
            } else {
                alert('Не удалось завершить продажу');
            }
        } catch (error) {
            alert('Ошибка: ' + error.message);
        }
    }
};
