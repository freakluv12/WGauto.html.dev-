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
                <button class="btn" onclick="Warehouse.showAction('procurements')">📋 История закупок</button>
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

        // Procurement Modal
        modalsContainer.innerHTML += `
            <div id="procurementModal" class="modal">
                <div class="modal-content" style="max-width: 900px;">
                    <span class="close" onclick="Utils.closeModal('procurementModal')">&times;</span>
                    <h2>Оприходование товара</h2>
                    
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px;">
                        <div class="form-group">
                            <label>Поставщик</label>
                            <input type="text" id="procSupplier" placeholder="Название поставщика">
                        </div>
                        <div class="form-group">
                            <label>Номер накладной</label>
                            <input type="text" id="procInvoice" placeholder="INV-001">
                        </div>
                        <div class="form-group">
                            <label>Дата</label>
                            <input type="date" id="procDate" value="${new Date().toISOString().split('T')[0]}">
                        </div>
                        <div class="form-group">
                            <label>Валюта</label>
                            <select id="procCurrency">
                                <option value="GEL">GEL</option>
                                <option value="USD">USD</option>
                                <option value="EUR">EUR</option>
                            </select>
                        </div>
                    </div>
                    
                    <div class="form-group">
                        <label>Примечания</label>
                        <textarea id="procNotes" rows="2"></textarea>
                    </div>

                    <h3>Товары</h3>
                    <div id="procItems"></div>
                    <button class="btn" onclick="Warehouse.addProcurementItem()" style="margin-bottom: 20px;">+ Добавить товар</button>
                    
                    <div style="text-align: right; font-size: 18px; font-weight: bold; margin-bottom: 20px;">
                        Итого: <span id="procTotal">0.00</span> <span id="procTotalCurrency">GEL</span>
                    </div>
                    
                    <button class="btn" onclick="Warehouse.submitProcurement()">Оприходовать</button>
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
                this.showProcurementModal();
                break;
            case 'procurements':
                this.loadProcurements();
                break;
            case 'analytics':
                this.showAnalyticsModal();
                break;
        }
    },

    // ==================== PROCUREMENT FUNCTIONS ====================
    procurementItems: [],

    showProcurementModal() {
        this.procurementItems = [];
        document.getElementById('procItems').innerHTML = '';
        document.getElementById('procSupplier').value = '';
        document.getElementById('procInvoice').value = '';
        document.getElementById('procNotes').value = '';
        this.addProcurementItem();
        Utils.showModal('procurementModal');
    },

    async addProcurementItem() {
        const itemId = Date.now();
        const itemHTML = `
            <div class="proc-item" id="procItem${itemId}" style="background: #2d2d2d; padding: 15px; margin-bottom: 10px; border-radius: 8px;">
                <div style="display: grid; grid-template-columns: 2fr 1fr 1fr 1fr auto; gap: 10px; align-items: end;">
                    <div class="form-group">
                        <label>Товар</label>
                        <select class="proc-product" data-item="${itemId}" onchange="Warehouse.updateProcTotal()">
                            <option value="">Выберите товар...</option>
                            ${await this.getProductsOptions()}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Количество</label>
                        <input type="number" class="proc-quantity" data-item="${itemId}" min="1" value="1" onchange="Warehouse.updateProcTotal()">
                    </div>
                    <div class="form-group">
                        <label>Цена закупки</label>
                        <input type="number" class="proc-price" data-item="${itemId}" step="0.01" min="0" value="0" onchange="Warehouse.updateProcTotal()">
                    </div>
                    <div class="form-group">
                        <label>Цена продажи</label>
                        <input type="number" class="proc-sale-price" data-item="${itemId}" step="0.01" min="0" value="0">
                    </div>
                    <button class="btn" onclick="Warehouse.removeProcurementItem(${itemId})" style="background: #d32f2f;">✕</button>
                </div>
            </div>
        `;
        
        document.getElementById('procItems').insertAdjacentHTML('beforeend', itemHTML);
    },

    async getProductsOptions() {
        try {
            const response = await API.call('/api/warehouse/categories');
            if (!response) return '';
            
            const categories = await response.json();
            let options = '';
            
            for (const cat of categories) {
                const subResponse = await API.call(`/api/warehouse/subcategories/${cat.id}`);
                const subcategories = await subResponse.json();
                
                for (const sub of subcategories) {
                    const prodResponse = await API.call(`/api/warehouse/products/${sub.id}`);
                    const products = await prodResponse.json();
                    
                    if (products.length > 0) {
                        options += `<optgroup label="${cat.name} - ${sub.name}">`;
                        products.forEach(prod => {
                            options += `<option value="${prod.id}">${prod.name} ${prod.sku ? '(' + prod.sku + ')' : ''}</option>`;
                        });
                        options += `</optgroup>`;
                    }
                }
            }
            
            return options;
        } catch (error) {
            console.error('Get products options error:', error);
            return '';
        }
    },

    removeProcurementItem(itemId) {
        document.getElementById(`procItem${itemId}`).remove();
        this.updateProcTotal();
    },

    updateProcTotal() {
        let total = 0;
        const items = document.querySelectorAll('.proc-item');
        
        items.forEach(item => {
            const qty = parseFloat(item.querySelector('.proc-quantity').value) || 0;
            const price = parseFloat(item.querySelector('.proc-price').value) || 0;
            total += qty * price;
        });
        
        const currency = document.getElementById('procCurrency').value;
        document.getElementById('procTotal').textContent = total.toFixed(2);
        document.getElementById('procTotalCurrency').textContent = currency;
    },

    async submitProcurement() {
        const items = [];
        const itemElements = document.querySelectorAll('.proc-item');
        
        itemElements.forEach(elem => {
            const productId = elem.querySelector('.proc-product').value;
            const quantity = parseInt(elem.querySelector('.proc-quantity').value);
            const price = parseFloat(elem.querySelector('.proc-price').value);
            const salePrice = parseFloat(elem.querySelector('.proc-sale-price').value);
            
            if (productId && quantity > 0 && price >= 0) {
                items.push({
                    product_id: parseInt(productId),
                    quantity: quantity,
                    unit_price: price,
                    sale_price: salePrice > 0 ? salePrice : null,
                    currency: document.getElementById('procCurrency').value
                });
            }
        });
        
        if (items.length === 0) {
            alert('Добавьте хотя бы один товар');
            return;
        }
        
        const data = {
            supplier_name: document.getElementById('procSupplier').value,
            invoice_number: document.getElementById('procInvoice').value,
            procurement_date: document.getElementById('procDate').value,
            notes: document.getElementById('procNotes').value,
            items: items
        };
        
        try {
            const response = await API.call('/api/warehouse/procurements', {
                method: 'POST',
                body: JSON.stringify(data)
            });
            
            if (response && response.ok) {
                alert('Оприходование выполнено успешно!');
                Utils.closeModal('procurementModal');
                this.loadProcurements();
            } else {
                const error = await response.json();
                alert('Ошибка: ' + (error.error || 'Не удалось выполнить оприходование'));
            }
        } catch (error) {
            console.error('Submit procurement error:', error);
            alert('Ошибка при оприходовании');
        }
    },

    async loadProcurements() {
        try {
            const response = await API.call('/api/warehouse/procurements');
            if (!response) return;
            
            const procurements = await response.json();
            
            let html = `
                <div style="margin-bottom: 20px;">
                    <h3>История оприходований</h3>
                </div>
            `;
            
            if (procurements.length === 0) {
                html += '<div class="loading">Нет оприходований</div>';
            } else {
                html += `
                    <table class="table">
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>Дата</th>
                                <th>Поставщик</th>
                                <th>Накладная</th>
                                <th>Сумма</th>
                                <th>Примечания</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${procurements.map(p => `
                                <tr>
                                    <td>${p.id}</td>
                                    <td>${Utils.formatDate(p.procurement_date)}</td>
                                    <td>${p.supplier_name || 'N/A'}</td>
                                    <td>${p.invoice_number || 'N/A'}</td>
                                    <td>${Utils.getCurrencySymbol(p.currency)}${parseFloat(p.total_amount).toFixed(2)}</td>
                                    <td>${p.notes || ''}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                `;
            }
            
            document.getElementById('warehouseMainContent').innerHTML = html;
        } catch (error) {
            console.error('Load procurements error:', error);
        }
    },

    // ==================== STOCK MANAGEMENT ====================
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
                inventoryHTML = '<tr><td colspan="6">Нет остатков на складе</td></tr>';
            } else {
                inventoryHTML = this.inventory.map(inv => `
                    <tr>
                        <td>${inv.source_name}</td>
                        <td>${inv.quantity}</td>
                        <td>${inv.purchase_price ? Utils.getCurrencySymbol(inv.currency) + inv.purchase_price : 'N/A'}</td>
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
                            <td>${Utils.getCurrencySymbol(item.currency)}${parseFloat(item.total_revenue ||
