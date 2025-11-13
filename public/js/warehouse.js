// ==================== WAREHOUSE MODULE ====================
const Warehouse = {
    currentCategoryId: null,
    currentSubcategoryId: null,
    currentProductId: null,
    categories: [],
    subcategories: [],
    products: [],
    inventory: [],
    receiveCart: [], // Корзина для оприходования

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

        // Quick Add Product Modal для оприходования
        modalsContainer.innerHTML += Utils.createModal('quickAddProductModal', 'Быстрое добавление товара', `
            <div class="form-group">
                <label>Категория</label>
                <select id="quickCategorySelect" onchange="Warehouse.loadQuickSubcategories()">
                    <option value="">Выберите категорию</option>
                </select>
                <button class="btn" style="margin-top: 5px;" onclick="Warehouse.showAddCategoryFromQuick()">+ Новая категория</button>
            </div>
            <div class="form-group">
                <label>Подкатегория</label>
                <select id="quickSubcategorySelect">
                    <option value="">Выберите подкатегорию</option>
                </select>
                <button class="btn" style="margin-top: 5px;" onclick="Warehouse.showAddSubcategoryFromQuick()">+ Новая подкатегория</button>
            </div>
            <div class="form-group">
                <label>Название товара</label>
                <input type="text" id="quickProductName" required>
            </div>
            <div class="form-group">
                <label>SKU / Артикул</label>
                <input type="text" id="quickProductSKU">
            </div>
            <button class="btn" onclick="Warehouse.quickAddProduct()">Добавить товар</button>
        `);
    },

    showAction(action) {
        switch(action) {
            case 'stock':
                this.loadCategories();
                break;
            case 'receive':
                this.showReceiveInterface();
                break;
            case 'analytics':
                this.showAnalyticsModal();
                break;
        }
    },

    // ==================== ОПРИХОДОВАНИЕ ====================
    
    async showReceiveInterface() {
        this.receiveCart = [];
        
        const html = `
            <div style="margin-bottom: 20px;">
                <h3>Оприходование товара</h3>
            </div>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                <div>
                    <div class="form-group">
                        <label>Поиск товара</label>
                        <input type="text" id="receiveSearch" placeholder="Введите название или SKU..." 
                               oninput="Warehouse.searchProductsForReceive()">
                    </div>
                    
                    <div id="receiveSearchResults" style="margin-top: 20px;">
                        <p style="color: #888;">Введите запрос для поиска товаров...</p>
                    </div>
                    
                    <button class="btn" onclick="Warehouse.showQuickAddProductModal()" style="margin-top: 15px;">
                        + Добавить новый товар
                    </button>
                </div>
                
                <div>
                    <h4>Товары для оприходования</h4>
                    <div id="receiveCartContent"></div>
                    
                    <button class="btn" onclick="Warehouse.completeReceive()" 
                            style="width: 100%; margin-top: 20px; background: #4CAF50;">
                        Оприходовать
                    </button>
                </div>
            </div>
        `;
        
        document.getElementById('warehouseMainContent').innerHTML = html;
        this.renderReceiveCart();
    },

    async searchProductsForReceive() {
        const query = document.getElementById('receiveSearch').value.trim();
        const resultsDiv = document.getElementById('receiveSearchResults');
        
        if (query.length < 2) {
            resultsDiv.innerHTML = '<p style="color: #888;">Введите минимум 2 символа...</p>';
            return;
        }

        try {
            const response = await API.call(`/api/warehouse/products/search/all?q=${encodeURIComponent(query)}`);
            if (!response) return;
            
            const products = await response.json();
            
            if (products.length === 0) {
                resultsDiv.innerHTML = '<p style="color: #888;">Товары не найдены</p>';
                return;
            }

            let html = '<div class="categories-grid">';
            products.forEach(prod => {
                html += `
                    <div class="category-card" onclick='Warehouse.addToReceiveCart(${JSON.stringify(prod).replace(/'/g, "&apos;")})' 
                         style="cursor: pointer;">
                        <div class="category-icon">${prod.category_icon || '📦'}</div>
                        <div class="category-name">${prod.name}</div>
                        <div class="category-desc">${prod.category_name} › ${prod.subcategory_name}</div>
                        <div style="margin-top: 5px; color: #888; font-size: 12px;">Остаток: ${prod.total_quantity || 0}</div>
                    </div>
                `;
            });
            html += '</div>';
            
            resultsDiv.innerHTML = html;
            
        } catch (error) {
            console.error('Search error:', error);
        }
    },

    addToReceiveCart(product) {
        const existing = this.receiveCart.find(item => item.id === product.id);
        
        if (existing) {
            alert('Товар уже добавлен в список оприходования');
            return;
        }

        this.receiveCart.push({
            ...product,
            receiveQuantity: 1,
            receivePurchasePrice: 0,
            receiveSalePrice: 0,
            receiveCurrency: 'GEL',
            receiveLocation: ''
        });

        this.renderReceiveCart();
    },

    removeFromReceiveCart(productId) {
        this.receiveCart = this.receiveCart.filter(item => item.id !== productId);
        this.renderReceiveCart();
    },

    updateReceiveItem(productId, field, value) {
        const item = this.receiveCart.find(i => i.id === productId);
        if (item) {
            item[field] = value;
        }
    },

    renderReceiveCart() {
        const cartDiv = document.getElementById('receiveCartContent');
        
        if (!cartDiv) return;

        if (this.receiveCart.length === 0) {
            cartDiv.innerHTML = '<p style="color: #888;">Список пуст</p>';
            return;
        }

        let html = '<table class="table"><thead><tr><th>Товар</th><th>Кол-во</th><th>Цена закупки</th><th>Цена продажи</th><th>Место</th><th></th></tr></thead><tbody>';

        this.receiveCart.forEach(item => {
            html += `
                <tr>
                    <td>${item.name}</td>
                    <td>
                        <input type="number" value="${item.receiveQuantity}" min="1" 
                               style="width: 60px; padding: 5px;"
                               onchange="Warehouse.updateReceiveItem(${item.id}, 'receiveQuantity', parseInt(this.value))">
                    </td>
                    <td>
                        <input type="number" value="${item.receivePurchasePrice}" step="0.01" 
                               style="width: 80px; padding: 5px;" placeholder="0.00"
                               onchange="Warehouse.updateReceiveItem(${item.id}, 'receivePurchasePrice', parseFloat(this.value))">
                    </td>
                    <td>
                        <input type="number" value="${item.receiveSalePrice}" step="0.01" 
                               style="width: 80px; padding: 5px;" placeholder="0.00"
                               onchange="Warehouse.updateReceiveItem(${item.id}, 'receiveSalePrice', parseFloat(this.value))">
                    </td>
                    <td>
                        <input type="text" value="${item.receiveLocation}" 
                               style="width: 100px; padding: 5px;" placeholder="A1"
                               onchange="Warehouse.updateReceiveItem(${item.id}, 'receiveLocation', this.value)">
                    </td>
                    <td>
                        <button class="btn" onclick="Warehouse.removeFromReceiveCart(${item.id})" 
                                style="background: #f44336; padding: 5px 10px;">✕</button>
                    </td>
                </tr>
            `;
        });

        html += '</tbody></table>';
        cartDiv.innerHTML = html;
    },

    async completeReceive() {
        if (this.receiveCart.length === 0) {
            alert('Добавьте товары для оприходования');
            return;
        }

        const invalidItems = this.receiveCart.filter(item => !item.receiveQuantity || item.receiveQuantity <= 0);
        if (invalidItems.length > 0) {
            alert('Укажите корректное количество для всех товаров');
            return;
        }

        if (!confirm(`Оприходовать ${this.receiveCart.length} товаров?`)) {
            return;
        }

        try {
            for (const item of this.receiveCart) {
                const data = {
                    product_id: item.id,
                    source_type: 'purchased',
                    quantity: item.receiveQuantity,
                    purchase_price: item.receivePurchasePrice || null,
                    sale_price: item.receiveSalePrice || null,
                    currency: item.receiveCurrency,
                    location: item.receiveLocation
                };

                const response = await API.call('/api/warehouse/inventory/receive', {
                    method: 'POST',
                    body: JSON.stringify(data)
                });

                if (!response || !response.ok) {
                    throw new Error(`Ошибка при оприходовании ${item.name}`);
                }
            }

            alert('Оприходование успешно завершено!');
            this.receiveCart = [];
            this.showReceiveInterface();

        } catch (error) {
            console.error('Complete receive error:', error);
            alert('Ошибка: ' + error.message);
        }
    },

    // Quick Add Product
    async showQuickAddProductModal() {
        await this.loadCategories();
        
        const select = document.getElementById('quickCategorySelect');
        if (select) {
            select.innerHTML = '<option value="">Выберите категорию</option>' +
                this.categories.map(cat => `<option value="${cat.id}">${cat.name}</option>`).join('');
        }
        
        Utils.showModal('quickAddProductModal');
    },

    async loadQuickSubcategories() {
        const categoryId = document.getElementById('quickCategorySelect').value;
        const select = document.getElementById('quickSubcategorySelect');
        
        if (!categoryId) {
            select.innerHTML = '<option value="">Выберите подкатегорию</option>';
            return;
        }

        try {
            const response = await API.call(`/api/warehouse/subcategories/${categoryId}`);
            if (!response) return;
            
            const subcategories = await response.json();
            select.innerHTML = '<option value="">Выберите подкатегорию</option>' +
                subcategories.map(sub => `<option value="${sub.id}">${sub.name}</option>`).join('');
        } catch (error) {
            console.error('Load subcategories error:', error);
        }
    },

    async quickAddProduct() {
        const subcategoryId = document.getElementById('quickSubcategorySelect').value;
        const name = document.getElementById('quickProductName').value;
        const sku = document.getElementById('quickProductSKU').value;

        if (!subcategoryId || !name) {
            alert('Выберите подкатегорию и введите название');
            return;
        }

        try {
            const response = await API.call('/api/warehouse/products', {
                method: 'POST',
                body: JSON.stringify({
                    subcategory_id: subcategoryId,
                    name: name,
                    sku: sku,
                    min_stock_level: 0
                })
            });

            if (response && response.ok) {
                const product = await response.json();
                Utils.closeModal('quickAddProductModal');
                Utils.clearForm('quickAddProductModal');
                
                this.addToReceiveCart(product);
                document.getElementById('receiveSearch').value = '';
                document.getElementById('receiveSearchResults').innerHTML = '<p style="color: #888;">Товар добавлен!</p>';
            }
        } catch (error) {
            alert('Ошибка: ' + error.message);
        }
    },

    showAddCategoryFromQuick() {
        Utils.showModal('addCategoryModal');
    },

    showAddSubcategoryFromQuick() {
        const categoryId = document.getElementById('quickCategorySelect').value;
        if (!categoryId) {
            alert('Сначала выберите категорию');
            return;
        }
        this.currentCategoryId = categoryId;
        Utils.showModal('addSubcategoryModal');
    },

    // ==================== СКЛАД ====================

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
                await this.loadCategories();
                
                if (document.getElementById('quickCategorySelect')) {
                    await this.showQuickAddProductModal();
                }
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
                await this.loadSubcategories(this.currentCategoryId);
                
                if (document.getElementById('quickSubcategorySelect')) {
                    await this.loadQuickSubcategories();
                }
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
            if (this.inventory
