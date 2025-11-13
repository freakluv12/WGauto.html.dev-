const Warehouse = {
    currentCategoryId: null,
    currentSubcategoryId: null,
    currentProductId: null,
    categories: [],
    subcategories: [],
    products: [],
    inventory: [],

    init() {
        this.createModals();
        this.renderActionBar();
        this.loadCategories();
    },

    renderActionBar() {
        const actionBar = `
            <div class="warehouse-action-bar">
                <button class="btn" onclick="Warehouse.showAction('stock')">📦 Склад</button>
                <button class="btn" onclick="Warehouse.showAction('receive')">📥 Оприходование</button>
                <button class="btn" onclick="Warehouse.showAction('analytics')">📊 Аналитика</button>
            </div>
            <div id="warehouseMainContent"></div>
        `;
        document.getElementById('warehouseContent').innerHTML = actionBar;
    },

    createModals() {
        const modalsContainer = document.getElementById('modalsContainer');

        // Add Category Modal
        modalsContainer.innerHTML += Utils.createModal('addCategoryModal', 'Добавить категорию', `
            <div class="form-group">
                <label>Название</label>
                <input type="text" id="categoryName" required>
            </div>
            <div class="form-group">
                <label>Описание</label>
                <textarea id="categoryDescription" rows="3"></textarea>
            </div>
            <div class="form-group">
                <label>Иконка (emoji)</label>
                <input type="text" id="categoryIcon" placeholder="📦" maxlength="2">
            </div>
            <button class="btn" onclick="Warehouse.addCategory()">Добавить</button>
        `);

        // Add Subcategory Modal
        modalsContainer.innerHTML += Utils.createModal('addSubcategoryModal', 'Добавить подкатегорию', `
            <div class="form-group">
                <label>Название</label>
                <input type="text" id="subcategoryName" required>
            </div>
            <div class="form-group">
                <label>Описание</label>
                <textarea id="subcategoryDescription" rows="3"></textarea>
            </div>
            <button class="btn" onclick="Warehouse.addSubcategory()">Добавить</button>
        `);

        // Add Product Modal
        modalsContainer.innerHTML += Utils.createModal('addProductModal', 'Добавить товар', `
            <div class="form-group">
                <label>Название</label>
                <input type="text" id="productName" required>
            </div>
            <div class="form-group">
                <label>Описание</label>
                <textarea id="productDescription" rows="3"></textarea>
            </div>
            <div class="form-group">
                <label>SKU / Артикул</label>
                <input type="text" id="productSKU">
            </div>
            <div class="form-group">
                <label>Минимальный уровень запаса</label>
                <input type="number" id="productMinStock" value="0" min="0">
            </div>
            <button class="btn" onclick="Warehouse.addProduct()">Добавить товар</button>
        `);

        // Receive Inventory Modal
        modalsContainer.innerHTML += Utils.createModal('receiveInventoryModal', 'Оприходовать товар', `
            <div class="form-group">
                <label>Выберите товар</label>
                <select id="receiveProductSelect" required>
                    <option value="">-- Выберите товар --</option>
                </select>
            </div>
            <div class="form-group">
                <label>Количество</label>
                <input type="number" id="receiveQuantity" min="1" value="1" required>
            </div>
            <div class="form-group">
                <label>Цена закупки (за единицу)</label>
                <input type="number" id="receivePurchasePrice" step="0.01" min="0">
            </div>
            <div class="form-group">
                <label>Рекомендуемая цена продажи</label>
                <input type="number" id="receiveSalePrice" step="0.01" min="0">
            </div>
            <div class="form-group">
                <label>Валюта</label>
                <select id="receiveCurrency">
                    <option value="GEL">GEL</option>
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                </select>
            </div>
            <div class="form-group">
                <label>Место хранения</label>
                <input type="text" id="receiveLocation" placeholder="Полка A1">
            </div>
            <button class="btn" onclick="Warehouse.receiveInventory()">Оприходовать</button>
        `);

        // Product Details Modal
        modalsContainer.innerHTML += `
            <div id="productDetailsModal" class="modal">
                <div class="modal-content">
                    <span class="close" onclick="Utils.closeModal('productDetailsModal')">&times;</span>
                    <h2 id="productDetailsName">Product Details</h2>
                    <div style="margin-bottom: 20px; padding: 15px; background: #3d3d3d; border-radius: 8px;">
                        <p><strong>SKU:</strong> <span id="productDetailsSKU"></span></p>
                        <p><strong>Всего на складе:</strong> <span id="productDetailsTotal" style="font-weight: bold; color: #4CAF50;"></span></p>
                    </div>

                    <h3>Складские позиции</h3>
                    <table class="table" id="productInventoryTable">
                        <thead>
                            <tr>
                                <th>Источник</th>
                                <th>Количество</th>
                                <th>Цена закупки</th>
                                <th>Цена продажи</th>
                                <th>Место</th>
                                <th>Дата поступления</th>
                                <th>На складе</th>
                            </tr>
                        </thead>
                        <tbody></tbody>
                    </table>
                </div>
            </div>
        `;

        // Analytics Modal
        modalsContainer.innerHTML += `
            <div id="analyticsModal" class="modal">
                <div class="modal-content" style="max-width: 1000px;">
                    <span class="close" onclick="Utils.closeModal('analyticsModal')">&times;</span>
                    <h2>Аналитика продаж</h2>
                    
                    <div style="display: flex; gap: 15px; margin-bottom: 20px;">
                        <div class="form-group" style="flex: 1;">
                            <label>Начальная дата</label>
                            <input type="date" id="analyticsStartDate">
                        </div>
                        <div class="form-group" style="flex: 1;">
                            <label>Конечная дата</label>
                            <input type="date" id="analyticsEndDate">
                        </div>
                        <div style="display: flex; align-items: flex-end;">
                            <button class="btn" onclick="Warehouse.loadAnalytics()">Применить</button>
                        </div>
                    </div>

                    <h3>Итоги за период</h3>
                    <div class="profit-summary" id="analyticsTotals"></div>

                    <h3 style="margin-top: 30px;">Детализация по товарам</h3>
                    <table class="table" id="analyticsTable">
                        <thead>
                            <tr>
                                <th>Товар</th>
                                <th>Категория</th>
                                <th>Продано</th>
                                <th>Оборот</th>
                                <th>Себестоимость</th>
                                <th>Прибыль</th>
                                <th>Рентабельность</th>
                            </tr>
                        </thead>
                        <tbody></tbody>
                    </table>
                </div>
            </div>
        `;
    },

    showAction(action) {
        switch(action) {
            case 'stock':
                this.loadCategories();
                break;
            case 'receive':
                this.showReceiveModal();
                break;
            case 'analytics':
                this.showAnalyticsModal();
                break;
        }
    },

    async showReceiveModal() {
        // Load all products for selection
        try {
            const categoriesRes = await API.call('/api/warehouse/categories');
            if (!categoriesRes) return;
            const categories = await categoriesRes.json();
            
            let allProducts = [];
            for (const cat of categories) {
                const subRes = await API.call(`/api/warehouse/subcategories/${cat.id}`);
                if (!subRes) continue;
                const subs = await subRes.json();
                
                for (const sub of subs) {
                    const prodRes = await API.call(`/api/warehouse/products/${sub.id}`);
                    if (!prodRes) continue;
                    const prods = await prodRes.json();
                    allProducts = allProducts.concat(prods.map(p => ({
                        ...p,
                        categoryName: cat.name,
                        subcategoryName: sub.name
                    })));
                }
            }
            
            const select = document.getElementById('receiveProductSelect');
            select.innerHTML = '<option value="">-- Выберите товар --</option>' + 
                allProducts.map(p => 
                    `<option value="${p.id}">${p.categoryName} > ${p.subcategoryName} > ${p.name}</option>`
                ).join('');
            
            Utils.showModal('receiveInventoryModal');
        } catch (error) {
            console.error('Load products for receive error:', error);
            alert('Ошибка загрузки товаров');
        }
    },

    async receiveInventory() {
        const data = {
            product_id: parseInt(document.getElementById('receiveProductSelect').value),
            quantity: parseInt(document.getElementById('receiveQuantity').value),
            purchase_price: parseFloat(document.getElementById('receivePurchasePrice').value) || null,
            sale_price: parseFloat(document.getElementById('receiveSalePrice').value) || null,
            currency: document.getElementById('receiveCurrency').value,
            location: document.getElementById('receiveLocation').value,
            source_type: 'purchased'
        };
        
        if (!data.product_id) {
            alert('Выберите товар');
            return;
        }
        
        if (!data.quantity || data.quantity <= 0) {
            alert('Укажите количество');
            return;
        }
        
        try {
            const response = await API.call('/api/warehouse/inventory/receive', {
                method: 'POST',
                body: JSON.stringify(data)
            });
            
            if (response && response.ok) {
                alert('✅ Товар успешно оприходован!');
                Utils.closeModal('receiveInventoryModal');
                Utils.clearForm('receiveInventoryModal');
                
                // Reload current view if in products
                if (this.currentView === 'products' && this.currentSubcategoryId) {
                    this.loadProducts(this.currentSubcategoryId);
                }
            } else {
                const error = await response.json();
                alert('Ошибка: ' + (error.error || 'Не удалось оприходовать товар'));
            }
        } catch (error) {
            console.error('Receive inventory error:', error);
            alert('Ошибка: ' + error.message);
        }
    },

    async loadCategories() {
        try {
            const response = await API.call('/api/warehouse/categories');
            if (!response) return;

            this.categories = await response.json();
            this.currentCategoryId = null;
            this.currentSubcategoryId = null;
            this.renderCategories();
        } catch (error) {
            console.error('Load categories error:', error);
        }
    },

    renderCategories() {
        let html = '';
        
        if (this.categories.length === 0) {
            html = `
                <div class="loading">
                    <p>Нет категорий. Создайте первую категорию.</p>
                    <button class="btn" onclick="Warehouse.showAddCategoryModal()">+ Добавить категорию</button>
                </div>
            `;
        } else {
            html = this.categories.map(cat => `
                <div class="category-card" onclick="Warehouse.loadSubcategories(${cat.id})">
                    <div class="category-icon">${cat.icon || '📦'}</div>
                    <div class="category-name">${cat.name}</div>
                    <div class="category-desc">${cat.description || ''}</div>
                </div>
            `).join('');
        }
        
        document.getElementById('warehouseMainContent').innerHTML = `
            <div style="display: flex; justify-content: space-between; margin-bottom: 20px;">
                <h3>Категории</h3>
                <button class="btn" onclick="Warehouse.showAddCategoryModal()">+ Добавить категорию</button>
            </div>
            <div class="categories-grid">${html}</div>
        `;
    },

    showAddCategoryModal() {
        Utils.showModal('addCategoryModal');
    },

    async addCategory() {
        const data = {
            name: document.getElementById('categoryName').value,
            description: document.getElementById('categoryDescription').value,
            icon: document.getElementById('categoryIcon').value || '📦'
        };
        
        if (!data.name) {
            alert('Название обязательно');
            return;
        }
        
        try {
            const response = await API.call('/api/warehouse/categories', {
                method: 'POST',
                body: JSON.stringify(data)
            });
            
            if (response && response.ok) {
                Utils.closeModal('addCategoryModal');
                Utils.clearForm('addCategoryModal');
                this.loadCategories();
            } else {
                alert('Failed to add category');
            }
        } catch (error) {
            alert('Error: ' + error.message);
        }
    },

    async loadSubcategories(categoryId) {
        this.currentCategoryId = categoryId;
        this.currentSubcategoryId = null;
        
        try {
            const response = await API.call(`/api/warehouse/subcategories/${categoryId}`);
            if (!response) return;

            this.subcategories = await response.json();
            const category = this.categories.find(c => c.id === categoryId);
            
            let html = '';
            if (this.subcategories.length === 0) {
                html = `
                    <div class="loading">
                        <p>Нет подкатегорий в ${category.name}. Добавьте одну.</p>
                        <button class="btn" onclick="Warehouse.showAddSubcategoryModal()">+ Добавить подкатегорию</button>
                    </div>
                `;
            } else {
                html = this.subcategories.map(sub => `
                    <div class="category-card" onclick="Warehouse.loadProducts(${sub.id})">
                        <div class="category-icon">📋</div>
                        <div class="category-name">${sub.name}</div>
                        <div class="category-desc">${sub.description || ''}</div>
                    </div>
                `).join('');
            }
            
            document.getElementById('warehouseMainContent').innerHTML = `
                <div style="margin-bottom: 20px;">
                    <button class="btn" onclick="Warehouse.loadCategories()">← Назад к категориям</button>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 20px;">
                    <h3>${category.name} - Подкатегории</h3>
                    <button class="btn" onclick="Warehouse.showAddSubcategoryModal()">+ Добавить подкатегорию</button>
                </div>
                <div class="categories-grid">${html}</div>
            `;
        } catch (error) {
            console.error('Load subcategories error:', error);
        }
    },

    showAddSubcategoryModal() {
        Utils.showModal('addSubcategoryModal');
    },

    async addSubcategory() {
        const data = {
            category_id: this.currentCategoryId,
            name: document.getElementById('subcategoryName').value,
            description: document.getElementById('subcategoryDescription').value
        };
        
        if (!data.name) {
            alert('Название обязательно');
            return;
        }
        
        try {
            const response = await API.call('/api/warehouse/subcategories', {
                method: 'POST',
                body: JSON.stringify(data)
            });
            
            if (response && response.ok) {
                Utils.closeModal('addSubcategoryModal');
                Utils.clearForm('addSubcategoryModal');
                this.loadSubcategories(this.currentCategoryId);
            } else {
                alert('Failed to add subcategory');
            }
        } catch (error) {
            alert('Error: ' + error.message);
        }
    },

    async loadProducts(subcategoryId) {
        this.currentSubcategoryId = subcategoryId;
        
        try {
            const response = await API.call(`/api/warehouse/products/${subcategoryId}`);
            if (!response) return;

            this.products = await response.json();
            const subcategory = this.subcategories.find(s => s.id === subcategoryId);
            const category = this.categories.find(c => c.id === this.currentCategoryId);
            
            let html = '';
            if (this.products.length === 0) {
                html = `
                    <div class="loading">
                        <p>Нет товаров в ${subcategory.name}. Добавьте товар.</p>
                        <button class="btn" onclick="Warehouse.showAddProductModal()">+ Добавить товар</button>
                    </div>
                `;
            } else {
                html = `
                    <table class="table">
                        <thead>
                            <tr>
                                <th>Название</th>
                                <th>SKU</th>
                                <th>Остаток</th>
                                <th>Мин. уровень</th>
                                <th>Дата первого поступления</th>
                                <th>Действия</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${this.products.map(p => `
                                <tr>
                                    <td>${p.name}</td>
                                    <td>${p.sku || 'N/A'}</td>
                                    <td style="font-weight: bold; color: ${p.total_quantity > p.min_stock_level ? '#4CAF50' : '#f44336'}">
                                        ${p.total_quantity || 0}
                                    </td>
                                    <td>${p.min_stock_level}</td>
                                    <td>${p.first_received ? Utils.formatDate(p.first_received) : 'N/A'}</td>
                                    <td>
                                        <button class="btn" onclick="Warehouse.showProductDetails(${p.id})">Детали</button>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                `;
            }
            
            document.getElementById('warehouseMainContent').innerHTML = `
                <div style="margin-bottom: 20px;">
                    <button class="btn" onclick="Warehouse.loadSubcategories(${this.currentCategoryId})">← Назад к ${category.name}</button>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 20px;">
                    <h3>${category.name} > ${subcategory.name}</h3>
                    <button class="btn" onclick="Warehouse.showAddProductModal()">+ Добавить товар</button>
                </div>
                ${html}
            `;
        } catch (error) {
            console.error('Load products error:', error);
        }
    },

    showAddProductModal() {
        Utils.showModal('addProductModal');
    },

    async addProduct() {
        const data = {
            subcategory_id: this.currentSubcategoryId,
            name: document.getElementById('productName').value,
            description: document.getElementById('productDescription').value,
            sku: document.getElementById('productSKU').value,
            min_stock_level: parseInt(document.getElementById('productMinStock').value) || 0
        };
        
        if (!data.name) {
            alert('Название обязательно');
            return;
        }
        
        try {
            const response = await API.call('/api/warehouse/products', {
                method: 'POST',
                body: JSON.stringify(data)
            });
            
            if (response && response.ok) {
                Utils.closeModal('addProductModal');
                Utils.clearForm('addProductModal');
                this.loadProducts(this.currentSubcategoryId);
            } else {
                alert('Failed to add product');
            }
        } catch (error) {
            alert('Error: ' + error.message);
        }
    },

    async showProductDetails(productId) {
        this.currentProductId = productId;
        
        try {
            const response = await API.call(`/api/warehouse/inventory/${productId}`);
            if (!response) return;

            this.inventory = await response.json();
            const product = this.products.find(p => p.id === productId);
            
            let inventoryHTML = '';
            if (this.inventory.length === 0) {
                inventoryHTML = '<tr><td colspan="7">Нет остатков на складе</td></tr>';
            } else {
                inventoryHTML = this.inventory.map(inv => `
                    <tr>
                        <td>${inv.source_name}</td>
                        <td>${inv.quantity}</td>
                        <td>${inv.purchase_price ? Utils.getCurrencySymbol(inv.currency) + inv.purchase_price : 'N/A'}</td>
                        <td>${inv.sale_price ? Utils.getCurrencySymbol(inv.currency) + inv.sale_price : 'N/A'}</td>
                        <td>${inv.location || 'N/A'}</td>
                        <td>${Utils.formatDate(inv.received_date)}</td>
                        <td>${inv.days_in_storage} дней</td>
                    </tr>
                `).join('');
            }
            
            document.getElementById('productDetailsName').textContent = product.name;
            document.getElementById('productDetailsSKU').textContent = product.sku || 'N/A';
            document.getElementById('productDetailsTotal').textContent = product.total_quantity || 0;
            
            document.querySelector('#productInventoryTable tbody').innerHTML = inventoryHTML;
            
            Utils.showModal('productDetailsModal');
        } catch (error) {
            console.error('Show product details error:', error);
        }
    },

    showAnalyticsModal() {
        Utils.showModal('analyticsModal');
        this.loadAnalytics();
    },

    async loadAnalytics() {
        const startDate = document.getElementById('analyticsStartDate').value;
        const endDate = document.getElementById('analyticsEndDate').value;
        
        let url = '/api/warehouse/analytics?';
        if (startDate) url += `start_date=${startDate}&`;
        if (endDate) url += `end_date=${endDate}`;
        
        try {
            const response = await API.call(url);
            if (!response) return;
            
            const data = await response.json();
            
            let itemsHTML = '';
            if (data.items.length === 0) {
                itemsHTML = '<tr><td colspan="7">No sales data for selected period</td></tr>';
            } else {
                itemsHTML = data.items.map(item => {
                    const profitMargin = parseFloat(item.profit_margin_percent || 0).toFixed(2);
                    return `
                        <tr>
                            <td>${item.product_name}</td>
                            <td>${item.category_name} > ${item.subcategory_name}</td>
                            <td>${item.total_sold}</td>
                            <td>${Utils.getCurrencySymbol(item.currency)}${parseFloat(item.total_revenue || 0).toFixed(2)}</td>
                            <td>${Utils.getCurrencySymbol(item.currency)}${parseFloat(item.total_cost || 0).toFixed(2)}</td>
                            <td class="${parseFloat(item.net_profit) >= 0 ? 'positive' : 'negative'}">
                                ${Utils.getCurrencySymbol(item.currency)}${parseFloat(item.net_profit || 0).toFixed(2)}
                            </td>
                            <td>${profitMargin}%</td>
                        </tr>
                    `;
                }).join('');
            }
            
            document.querySelector('#analyticsTable tbody').innerHTML = itemsHTML;
            
            let totalsHTML = '';
            if (data.totals && data.totals.length > 0) {
                data.totals.forEach(total => {
                    totalsHTML += `
                        <div class="profit-card">
                            <div class="currency-label">${total.currency} Всего продано</div>
                            <div class="amount">${total.total_sold} шт</div>
                        </div>
                        <div class="profit-card">
                            <div class="currency-label">${total.currency} Оборот</div>
                            <div class="amount positive">${Utils.getCurrencySymbol(total.currency)}${parseFloat(total.total_revenue).toFixed(2)}</div>
                        </div>
                        <div class="profit-card">
                            <div class="currency-label">${total.currency} Себестоимость</div>
                            <div class="amount">${Utils.getCurrencySymbol(total.currency)}${parseFloat(total.total_cost).toFixed(2)}</div>
                        </div>
                        <div class="profit-card">
                            <div class="currency-label">${total.currency} Чистая прибыль</div>
                            <div class="amount ${parseFloat(total.net_profit) >= 0 ? 'positive' : 'negative'}">
                                ${Utils.getCurrencySymbol(total.currency)}${parseFloat(total.net_profit).toFixed(2)}
                            </div>
                        </div>
                        <div class="profit-card">
                            <div class="currency-label">${total.currency} Рентабельность</div>
                            <div class="amount">${total.profit_margin_percent}%</div>
                        </div>
                    `;
                });
            }
            
            document.getElementById('analyticsTotals').innerHTML = totalsHTML || '<p>Нет данных за выбранный период</p>';
            
        } catch (error) {
            console.error('Analytics error:', error);
        }
    }
};
