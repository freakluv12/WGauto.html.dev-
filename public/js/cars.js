// ==================== CARS MODULE ====================
const Cars = {
    allCars: [],
    filteredCars: [],
    currentCarId: null,

    init() {
        this.createModals();
        this.loadCars();
    },

    createModals() {
        const modalsContainer = document.getElementById('modalsContainer');
        
        // Add Car Modal
        modalsContainer.innerHTML += Utils.createModal('addCarModal', 'Add New Car', `
            <div class="form-group">
                <label>Brand</label>
                <input type="text" id="carBrand" required>
            </div>
            <div class="form-group">
                <label>Model</label>
                <input type="text" id="carModel" required>
            </div>
            <div class="form-group">
                <label>Year</label>
                <input type="number" id="carYear" min="1950" max="2030">
            </div>
            <div class="form-group">
                <label>VIN</label>
                <input type="text" id="carVin">
            </div>
            <div class="form-group">
                <label>Purchase Price</label>
                <input type="number" id="carPrice" step="0.01" required>
            </div>
            <div class="form-group">
                <label>Currency</label>
                <select id="carCurrency" required>
                    <option value="USD">USD ($)</option>
                    <option value="EUR">EUR (€)</option>
                    <option value="GEL">GEL (₾)</option>
                    <option value="RUB">RUB (₽)</option>
                </select>
            </div>
            <button class="btn" onclick="Cars.addCar()">Add Car</button>
        `);

        // Car Details Modal
        modalsContainer.innerHTML += `
            <div id="carDetailsModal" class="modal">
                <div class="modal-content" style="max-width: 800px;">
                    <span class="close" onclick="Utils.closeModal('carDetailsModal')">&times;</span>
                    <h2 id="carDetailsTitle">Car Details</h2>
                    
                    <div class="tabs">
                        <button class="tab active" onclick="Cars.showTab('info')">Info</button>
                        <button class="tab" onclick="Cars.showTab('finances')">Finances</button>
                        <button class="tab" onclick="Cars.showTab('rentals')">Rental History</button>
                    </div>

                    <div id="carInfo" class="tab-content active">
                        <div id="carInfoContent"></div>
                        <div style="margin-top: 20px;">
                            <button class="btn btn-danger" onclick="Cars.dismantleCar()">🔧 Dismantle Car</button>
                        </div>
                    </div>

                    <div id="carFinances" class="tab-content">
                        <div class="profit-summary" id="carProfitSummary"></div>
                        
                        <div style="margin-top: 30px;">
                            <h3>Add Expense</h3>
                            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px;">
                                <div class="form-group">
                                    <label>Amount</label>
                                    <input type="number" id="expenseAmount" step="0.01" required>
                                </div>
                                <div class="form-group">
                                    <label>Currency</label>
                                    <select id="expenseCurrency" required>
                                        <option value="USD">USD ($)</option>
                                        <option value="EUR">EUR (€)</option>
                                        <option value="GEL">GEL (₾)</option>
                                        <option value="RUB">RUB (₽)</option>
                                    </select>
                                </div>
                                <div class="form-group">
                                    <label>Category</label>
                                    <select id="expenseCategory" required>
                                        <option value="repair">Repair</option>
                                        <option value="fuel">Fuel</option>
                                        <option value="insurance">Insurance</option>
                                        <option value="maintenance">Maintenance</option>
                                        <option value="parking">Parking</option>
                                        <option value="wash">Car Wash</option>
                                        <option value="parts">Parts Purchase</option>
                                        <option value="other">Other</option>
                                    </select>
                                </div>
                                <div class="form-group">
                                    <label>Description</label>
                                    <input type="text" id="expenseDescription" placeholder="Optional">
                                </div>
                            </div>
                            <button class="btn" onclick="Cars.addExpense()">Add Expense</button>
                        </div>

                        <h3 style="margin-top: 30px;">Transaction History</h3>
                        <table class="table" id="carTransactions">
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Type</th>
                                    <th>Amount</th>
                                    <th>Category</th>
                                    <th>Description</th>
                                </tr>
                            </thead>
                            <tbody></tbody>
                        </table>
                    </div>

                    <div id="carRentals" class="tab-content">
                        <table class="table" id="carRentalsTable">
                            <thead>
                                <tr>
                                    <th>Client</th>
                                    <th>Period</th>
                                    <th>Daily Price</th>
                                    <th>Total</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody></tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
    },

    async loadCars() {
        try {
            const response = await API.call('/api/cars');
            if (!response) return;

            this.allCars = await response.json();
            this.filteredCars = [...this.allCars];
            this.displayCars();
        } catch (error) {
            console.error('Cars load error:', error);
            document.getElementById('carsGrid').innerHTML = '<div class="loading">Error loading cars</div>';
        }
    },

    displayCars() {
        let carsHTML = '';

        if (this.filteredCars.length === 0) {
            carsHTML = '<div class="loading">No cars found</div>';
        } else {
            this.filteredCars.forEach(car => {
                const statusClass = `status-${car.status}`;
                carsHTML += `
                    <div class="car-card" onclick="Cars.showDetails(${car.id})">
                        <div class="car-header">
                            <div class="car-title">${car.brand} ${car.model} ${car.year || ''}</div>
                            <div class="car-status ${statusClass}">${car.status.toUpperCase()}</div>
                        </div>
                        <div style="color: #ccc;">
                            <div>VIN: ${car.vin || 'N/A'}</div>
                            <div>Price: ${Utils.getCurrencySymbol(car.currency)}${car.price || 0}</div>
                        </div>
                    </div>
                `;
            });
        }

        document.getElementById('carsGrid').innerHTML = carsHTML;
    },

    search() {
        const searchTerm = document.getElementById('carSearch').value.toLowerCase();
        const statusFilter = document.getElementById('carStatusFilter').value;

        this.filteredCars = this.allCars.filter(car => {
            const matchesSearch = !searchTerm || 
                car.brand.toLowerCase().includes(searchTerm) ||
                car.model.toLowerCase().includes(searchTerm) ||
                (car.vin && car.vin.toLowerCase().includes(searchTerm)) ||
                (car.year && car.year.toString().includes(searchTerm));
            
            const matchesStatus = !statusFilter || car.status === statusFilter;

            return matchesSearch && matchesStatus;
        });

        this.displayCars();
    },

    filter() {
        this.search();
    },

    showAddModal() {
        Utils.showModal('addCarModal');
    },

    async addCar() {
        const carData = {
            brand: document.getElementById('carBrand').value,
            model: document.getElementById('carModel').value,
            year: parseInt(document.getElementById('carYear').value) || null,
            vin: document.getElementById('carVin').value,
            price: parseFloat(document.getElementById('carPrice').value) || null,
            currency: document.getElementById('carCurrency').value
        };

        if (!carData.brand || !carData.model) {
            alert('Brand and model are required');
            return;
        }

        try {
            const response = await API.call('/api/cars', {
                method: 'POST',
                body: JSON.stringify(carData)
            });

            if (response && response.ok) {
                Utils.closeModal('addCarModal');
                Utils.clearForm('addCarModal');
                this.loadCars();
            } else {
                alert('Failed to add car');
            }
        } catch (error) {
            alert('Error adding car: ' + error.message);
        }
    },

    async showDetails(carId) {
        this.currentCarId = carId;
        
        try {
            const response = await API.call(`/api/cars/${carId}/details`);
            if (!response) return;

            const data = await response.json();
            const car = data.car;

            document.getElementById('carDetailsTitle').textContent = 
                `${car.brand} ${car.model} ${car.year || ''}`;
            
            const carInfoHTML = `
                <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px;">
                    <div>
                        <strong>Brand:</strong> ${car.brand}<br>
                        <strong>Model:</strong> ${car.model}<br>
                        <strong>Year:</strong> ${car.year || 'N/A'}<br>
                        <strong>VIN:</strong> ${car.vin || 'N/A'}
                    </div>
                    <div>
                        <strong>Purchase Price:</strong> ${Utils.getCurrencySymbol(car.currency)}${car.price || 0}<br>
                        <strong>Status:</strong> ${car.status.toUpperCase()}<br>
                        <strong>Added:</strong> ${Utils.formatDate(car.created_at)}
                    </div>
                </div>
            `;
            document.getElementById('carInfoContent').innerHTML = carInfoHTML;

            this.displayProfitSummary(data.profitability);
            this.displayTransactions(data.transactions);
            this.displayRentals(data.rentals);

            Utils.showModal('carDetailsModal');
        } catch (error) {
            console.error('Car details error:', error);
            alert('Error loading car details');
        }
    },

    displayProfitSummary(profitData) {
        let summaryHTML = '';
        
        if (profitData.length === 0) {
            summaryHTML = '<div class="profit-card"><div class="currency-label">No financial data</div></div>';
        } else {
            profitData.forEach(profit => {
                const income = parseFloat(profit.total_income) || 0;
                const expenses = parseFloat(profit.total_expenses) || 0;
                const net = income - expenses;
                
                summaryHTML += `
                    <div class="profit-card">
                        <div class="currency-label">${profit.currency} Income</div>
                        <div class="amount positive">${Utils.getCurrencySymbol(profit.currency)}${income.toFixed(2)}</div>
                    </div>
                    <div class="profit-card">
                        <div class="currency-label">${profit.currency} Expenses</div>
                        <div class="amount negative">${Utils.getCurrencySymbol(profit.currency)}${expenses.toFixed(2)}</div>
                    </div>
                    <div class="profit-card">
                        <div class="currency-label">${profit.currency} Net</div>
                        <div class="amount ${net >= 0 ? 'positive' : 'negative'}">
                            ${Utils.getCurrencySymbol(profit.currency)}${net.toFixed(2)}
                        </div>
                    </div>
                `;
            });
        }
        
        document.getElementById('carProfitSummary').innerHTML = summaryHTML;
    },

    displayTransactions(transactions) {
        let transactionsHTML = '';
        
        if (transactions.length === 0) {
            transactionsHTML = '<tr><td colspan="5">No transactions</td></tr>';
        } else {
            transactions.forEach(transaction => {
                const typeClass = transaction.type === 'income' ? 'positive' : 'negative';
                const typeSymbol = transaction.type === 'income' ? '+' : '-';
                
                transactionsHTML += `
                    <tr>
                        <td>${Utils.formatDate(transaction.date)}</td>
                        <td>${transaction.type.toUpperCase()}</td>
                        <td class="amount ${typeClass}">${typeSymbol}${Utils.getCurrencySymbol(transaction.currency)}${transaction.amount}</td>
                        <td>${transaction.category || 'N/A'}</td>
                        <td>${transaction.description || ''}</td>
                    </tr>
                `;
            });
        }
        
        document.querySelector('#carTransactions tbody').innerHTML = transactionsHTML;
    },

    displayRentals(rentals) {
        let rentalsHTML = '';
        
        if (rentals.length === 0) {
            rentalsHTML = '<tr><td colspan="5">No rental history</td></tr>';
        } else {
            rentals.forEach(rental => {
                const startDate = Utils.formatDate(rental.start_date);
                const endDate = Utils.formatDate(rental.end_date);
                
                rentalsHTML += `
                    <tr>
                        <td>${rental.client_name}</td>
                        <td>${startDate} - ${endDate}</td>
                        <td>${Utils.getCurrencySymbol(rental.currency)}${rental.daily_price}/day</td>
                        <td>${Utils.getCurrencySymbol(rental.currency)}${rental.total_amount}</td>
                        <td>${rental.status.toUpperCase()}</td>
                    </tr>
                `;
            });
        }
        
        document.querySelector('#carRentalsTable tbody').innerHTML = rentalsHTML;
    },

    async addExpense() {
        const expenseData = {
            amount: parseFloat(document.getElementById('expenseAmount').value),
            currency: document.getElementById('expenseCurrency').value,
            description: document.getElementById('expenseDescription').value,
            category: document.getElementById('expenseCategory').value
        };

        if (!expenseData.amount || !expenseData.currency || !expenseData.category) {
            alert('Amount, currency, and category are required');
            return;
        }

        try {
            const response = await API.call(`/api/cars/${this.currentCarId}/expense`, {
                method: 'POST',
                body: JSON.stringify(expenseData)
            });

            if (response && response.ok) {
                document.getElementById('expenseAmount').value = '';
                document.getElementById('expenseDescription').value = '';
                this.showDetails(this.currentCarId);
            } else {
                alert('Failed to add expense');
            }
        } catch (error) {
            alert('Error adding expense: ' + error.message);
        }
    },

    async dismantleCar() {
        if (!confirm('Are you sure you want to dismantle this car?')) {
            return;
        }

        try {
            const response = await API.call(`/api/cars/${this.currentCarId}/dismantle`, {
                method: 'POST'
            });

            if (response && response.ok) {
                alert('Car dismantled successfully');
                Utils.closeModal('carDetailsModal');
                this.loadCars();
            } else {
                alert('Failed to dismantle car');
            }
        } catch (error) {
            alert('Error dismantling car: ' + error.message);
        }
    },

    showTab(tabName) {
        const tabContents = document.querySelectorAll('#carDetailsModal .tab-content');
        tabContents.forEach(content => content.classList.remove('active'));
        
        const tabButtons = document.querySelectorAll('#carDetailsModal .tab');
        tabButtons.forEach(button => button.classList.remove('active'));
        
        const tabMap = {
            'info': 0,
            'finances': 1,
            'rentals': 2
        };
        
        document.getElementById(`car${tabName.charAt(0).toUpperCase() + tabName.slice(1)}`).classList.add('active');
        document.querySelectorAll('#carDetailsModal .tab')[tabMap[tabName]].classList.add('active');
    }
};
