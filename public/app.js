// WGauto CRM - Final Version
let currentUser = null;
let currentCarId = null;
let currentDate = new Date();
let allCars = [];
let allRentals = [];
let filteredCars = [];

// Warehouse variables
let currentCategoryId = null;
let currentSubcategoryId = null;
let currentProductId = null;
let categories = [];
let subcategories = [];
let products = [];
let inventory = [];
let warehouseTab = 'stock'; // stock, receive, procurement

// Receive inventory
let receiveItems = [];

// POS variables
let posCart = [];
let posCategories = [];
let posSubcategories = [];
let posProducts = [];
let posCurrentCategoryId = null;
let posCurrentSubcategoryId = null;

document.addEventListener('DOMContentLoaded', function() {
    checkAuthStatus();
});

function getCurrencySymbol(currency) {
    const symbols = { USD: '$', EUR: '€', GEL: '₾', RUB: '₽' };
    return symbols[currency] || currency;
}

// Auth functions
function checkAuthStatus() {
    const token = localStorage.getItem('token');
    if (token) {
        apiCall('/api/stats/dashboard').then(response => {
            if (response) {
                const userEmail = localStorage.getItem('userEmail');
                const userRole = localStorage.getItem('userRole');
                if (userEmail && userRole) {
                    currentUser = { email: userEmail, role: userRole };
                    showApp();
                } else {
                    showAuth();
                }
            } else {
                showAuth();
            }
        }).catch(() => showAuth());
    } else {
        showAuth();
    }
}

function showAuth() {
    document.getElementById('authScreen').style.display = 'flex';
    document.getElementById('appScreen').style.display = 'none';
}

function showLoginForm() {
    document.getElementById('loginForm').style.display = 'block';
    document.getElementById('registerForm').style.display = 'none';
}

function showRegisterForm() {
    document.getElementById('loginForm').style.display = 'none';
    document.getElementById('registerForm').style.display = 'block';
}

async function attemptLogin() {
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    if (!email || !password) {
        alert('Please enter email and password');
        return;
    }
    try {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        if (response.ok) {
            const data = await response.json();
            localStorage.setItem('token', data.token);
            localStorage.setItem('userEmail', data.user.email);
            localStorage.setItem('userRole', data.user.role);
            currentUser = data.user;
            showApp();
        } else {
            const error = await response.json();
            alert('Login failed: ' + (error.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Login error:', error);
        alert('Login error: Cannot connect to server');
    }
}

async function attemptRegister() {
    const email = document.getElementById('registerEmail').value;
    const password = document.getElementById('registerPassword').value;
    if (!email || !password) {
        alert('Please enter email and password');
        return;
    }
    try {
        const response = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        if (response.ok) {
            const data = await response.json();
            localStorage.setItem('token', data.token);
            localStorage.setItem('userEmail', data.user.email);
            localStorage.setItem('userRole', data.user.role);
            currentUser = data.user;
            showApp();
        } else {
            const error = await response.json();
            alert('Registration failed: ' + error.error);
        }
    } catch (error) {
        console.error('Registration error:', error);
        alert('Registration error: Cannot connect to server');
    }
}

function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('userEmail');
    localStorage.removeItem('userRole');
    currentUser = null;
    showAuth();
}

function showApp() {
    document.getElementById('authScreen').style.display = 'none';
    document.getElementById('appScreen').style.display = 'flex';
    document.getElementById('userEmail').textContent = currentUser.email;
    if (currentUser.role === 'ADMIN') {
        document.getElementById('adminNav').style.display = 'block';
    }
    loadDashboard();
}

async function apiCall(endpoint, options = {}) {
    const token = localStorage.getItem('token');
    const defaultOptions = {
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        }
    };
    try {
        const response = await fetch(endpoint, { ...defaultOptions, ...options });
        if (response.status === 401) {
            logout();
            return null;
        }
        return response;
    } catch (error) {
        console.error('API call error:', error);
        return null;
    }
}

function showSection(sectionName) {
    const sections = document.querySelectorAll('.section');
    sections.forEach(section => section.classList.remove('active'));
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => item.classList.remove('active'));
    document.getElementById(sectionName).classList.add('active');
    navItems.forEach(button => {
        if (button.onclick && button.onclick.toString().includes(sectionName)) {
            button.classList.add('active');
        }
    });
    const titles = {
        dashboard: 'Dashboard',
        cars: 'Cars',
        rentals: 'Rentals',
        warehouse: 'Warehouse',
        pos: 'Point of Sale',
        admin: 'Admin Panel'
    };
    document.getElementById('pageTitle').textContent = titles[sectionName];
    switch(sectionName) {
        case 'dashboard': loadDashboard(); break;
        case 'cars': loadCars(); break;
        case 'rentals': loadRentals(); break;
        case 'warehouse': loadWarehouse(); break;
        case 'pos': loadPOS(); break;
        case 'admin': loadUsers(); break;
    }
}

// Dashboard
async function loadDashboard() {
    try {
        const response = await apiCall('/api/stats/dashboard');
        if (!response) return;
        const data = await response.json();
        let statsHTML = '';
        const currencies = ['USD', 'EUR', 'GEL', 'RUB'];
        currencies.forEach(currency => {
            const income = data.income.find(i => i.currency === currency);
            const expense = data.expenses.find(e => e.currency === currency);
            const incomeAmount = income ? parseFloat(income.total) : 0;
            const expenseAmount = expense ? parseFloat(expense.total) : 0;
            const profit = incomeAmount - expenseAmount;
            if (incomeAmount > 0 || expenseAmount > 0) {
                statsHTML += `
                    <div class="stat-card">
                        <div class="stat-value">${getCurrencySymbol(currency)}${incomeAmount.toFixed(2)}</div>
                        <div class="stat-label">Income ${currency}</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">${getCurrencySymbol(currency)}${expenseAmount.toFixed(2)}</div>
                        <div class="stat-label">Expenses ${currency}</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value" style="color: ${profit >= 0 ? '#4CAF50' : '#f44336'}">${getCurrencySymbol(currency)}${profit.toFixed(2)}</div>
                        <div class="stat-label">Profit ${currency}</div>
                    </div>
                `;
            }
        });
        const totalCars = data.cars.reduce((sum, car) => sum + parseInt(car.count), 0);
        const activeCars = data.cars.find(c => c.status === 'active')?.count || 0;
        statsHTML += `
            <div class="stat-card">
                <div class="stat-value">${totalCars}</div>
                <div class="stat-label">Total Cars</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${activeCars}</div>
                <div class="stat-label">Active Cars</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${data.activeRentals}</div>
                <div class="stat-label">Active Rentals</div>
            </div>
        `;
        document.getElementById('statsGrid').innerHTML = statsHTML;
    } catch (error) {
        console.error('Dashboard load error:', error);
        document.getElementById('statsGrid').innerHTML = '<div class="loading">Error loading dashboard data</div>';
    }
}

// Cars
async function loadCars() {
    try {
        const response = await apiCall('/api/cars');
        if (!response) return;
        allCars = await response.json();
        filteredCars = [...allCars];
        displayCars();
    } catch (error) {
        console.error('Cars load error:', error);
        document.getElementById('carsGrid').innerHTML = '<div class="loading">Error loading cars</div>';
    }
}

function displayCars() {
    let carsHTML = '';
    if (filteredCars.length === 0) {
        carsHTML = '<div class="loading">No cars found</div>';
    } else {
        filteredCars.forEach(car => {
            const statusClass = `status-${car.status}`;
            carsHTML += `
                <div class="car-card" onclick="showCarDetails(${car.id})">
                    <div class="car-header">
                        <div class="car-title">${car.brand} ${car.model} ${car.year || ''}</div>
                        <div class="car-status ${statusClass}">${car.status.toUpperCase()}</div>
                    </div>
                    <div style="color: #ccc;">
                        <div>VIN: ${car.vin || 'N/A'}</div>
                        <div>Price: ${getCurrencySymbol(car.currency)}${car.price || 0}</div>
                    </div>
                </div>
            `;
        });
    }
    document.getElementById('carsGrid').innerHTML = carsHTML;
}

function searchCars() {
    const searchTerm = document.getElementById('carSearch').value.toLowerCase();
    const statusFilter = document.getElementById('carStatusFilter').value;
    filteredCars = allCars.filter(car => {
        const matchesSearch = !searchTerm || 
            car.brand.toLowerCase().includes(searchTerm) ||
            car.model.toLowerCase().includes(searchTerm) ||
            (car.vin && car.vin.toLowerCase().includes(searchTerm)) ||
            (car.year && car.year.toString().includes(searchTerm));
        const matchesStatus = !statusFilter || car.status === statusFilter;
        return matchesSearch && matchesStatus;
    });
    displayCars();
}

function filterCars() {
    searchCars();
}

function showAddCarModal() {
    document.getElementById('addCarModal').style.display = 'block';
}

async function addCar() {
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
        const response = await apiCall('/api/cars', {
            method: 'POST',
            body: JSON.stringify(carData)
        });
        if (response && response.ok) {
            closeModal('addCarModal');
            loadCars();
            document.getElementById('carBrand').value = '';
            document.getElementById('carModel').value = '';
            document.getElementById('carYear').value = '';
            document.getElementById('carVin').value = '';
            document.getElementById('carPrice').value = '';
        } else {
            alert('Failed to add car');
        }
    } catch (error) {
        alert('Error adding car: ' + error.message);
    }
}

async function showCarDetails(carId) {
    currentCarId = carId;
    try {
        const response = await apiCall(`/api/cars/${carId}/details`);
        if (!response) return;
        const data = await response.json();
        const car = data.car;
        document.getElementById('carDetailsTitle').textContent = `${car.brand} ${car.model} ${car.year || ''}`;
        const carInfoHTML = `
            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px;">
                <div>
                    <strong>Brand:</strong> ${car.brand}<br>
                    <strong>Model:</strong> ${car.model}<br>
                    <strong>Year:</strong> ${car.year || 'N/A'}<br>
                    <strong>VIN:</strong> ${car.vin || 'N/A'}
                </div>
                <div>
                    <strong>Purchase Price:</strong> ${getCurrencySymbol(car.currency)}${car.price || 0}<br>
                    <strong>Status:</strong> ${car.status.toUpperCase()}<br>
                    <strong>Added:</strong> ${new Date(car.created_at).toLocaleDateString()}
                </div>
            </div>
        `;
        document.getElementById('carInfoContent').innerHTML = carInfoHTML;
        displayCarProfitSummary(data.profitability);
        displayCarTransactions(data.transactions);
        displayCarRentals(data.rentals);
        document.getElementById('carDetailsModal').style.display = 'block';
    } catch (error) {
        console.error('Car details error:', error);
        alert('Error loading car details');
    }
}

function displayCarProfitSummary(profitData) {
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
                    <div class="amount positive">${getCurrencySymbol(profit.currency)}${income.toFixed(2)}</div>
                </div>
                <div class="profit-card">
                    <div class="currency-label">${profit.currency} Expenses</div>
                    <div class="amount negative">${getCurrencySymbol(profit.currency)}${expenses.toFixed(2)}</div>
                </div>
                <div class="profit-card">
                    <div class="currency-label">${profit.currency} Net</div>
                    <div class="amount ${net >= 0 ? 'positive' : 'negative'}">${getCurrencySymbol(profit.currency)}${net.toFixed(2)}</div>
                </div>
            `;
        });
    }
    document.getElementById('carProfitSummary').innerHTML = summaryHTML;
}

function displayCarTransactions(transactions) {
    let transactionsHTML = '';
    if (transactions.length === 0) {
        transactionsHTML = '<tr><td colspan="5">No transactions</td></tr>';
    } else {
        transactions.forEach(transaction => {
            const typeClass = transaction.type === 'income' ? 'positive' : 'negative';
            const typeSymbol = transaction.type === 'income' ? '+' : '-';
            transactionsHTML += `
                <tr>
                    <td>${new Date(transaction.date).toLocaleDateString()}</td>
                    <td>${transaction.type.toUpperCase()}</td>
                    <td class="amount ${typeClass}">${typeSymbol}${getCurrencySymbol(transaction.currency)}${transaction.amount}</td>
                    <td>${transaction.category || 'N/A'}</td>
                    <td>${transaction.description || ''}</td>
                </tr>
            `;
        });
    }
    document.querySelector('#carTransactions tbody').innerHTML = transactionsHTML;
}

function displayCarRentals(rentals) {
    let rentalsHTML = '';
    if (rentals.length === 0) {
        rentalsHTML = '<tr><td colspan="5">No rental history</td></tr>';
    } else {
        rentals.forEach(rental => {
            const startDate = new Date(rental.start_date).toLocaleDateString();
            const endDate = new Date(rental.end_date).toLocaleDateString();
            rentalsHTML += `
                <tr>
                    <td>${rental.client_name}</td>
                    <td>${startDate} - ${endDate}</td>
                    <td>${getCurrencySymbol(rental.currency)}${rental.daily_price}/day</td>
                    <td>${getCurrencySymbol(rental.currency)}${rental.total_amount}</td>
                    <td>${rental.status.toUpperCase()}</td>
                </tr>
            `;
        });
    }
    document.querySelector('#carRentalsTable tbody').innerHTML = rentalsHTML;
}

async function addExpense() {
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
        const response = await apiCall(`/api/cars/${currentCarId}/expense`, {
            method: 'POST',
            body: JSON.stringify(expenseData)
        });
        if (response && response.ok) {
            document.getElementById('expenseAmount').value = '';
            document.getElementById('expenseDescription').value = '';
            showCarDetails(currentCarId);
        } else {
            alert('Failed to add expense');
        }
    } catch (error) {
        alert('Error adding expense: ' + error.message);
    }
}

async function dismantleCar() {
    if (!confirm('Are you sure you want to dismantle this car?')) {
        return;
    }
    try {
        const response = await apiCall(`/api/cars/${currentCarId}/dismantle`, {
            method: 'POST'
        });
        if (response && response.ok) {
            alert('Car dismantled successfully');
            closeModal('carDetailsModal');
            loadCars();
        } else {
            alert('Failed to dismantle car');
        }
    } catch (error) {
        alert('Error dismantling car: ' + error.message);
    }
}

function showCarTab(tabName) {
    const tabContents = document.querySelectorAll('#carDetailsModal .tab-content');
    tabContents.forEach(content => content.classList.remove('active'));
    const tabButtons = document.querySelectorAll('#carDetailsModal .tab');
    tabButtons.forEach(button => button.classList.remove('active'));
    const tabMap = { 'info': 0, 'finances': 1, 'rentals': 2 };
    document.getElementById(`car${tabName.charAt(0).toUpperCase() + tabName.slice(1)}`).classList.add('active');
    document.querySelectorAll('#carDetailsModal .tab')[tabMap[tabName]].classList.add('active');
}

// Rentals
async function loadRentals() {
    try {
        const response = await apiCall('/api/rentals');
        if (!response) return;
        allRentals = await response.json();
        displayActiveRentals();
        displayRentalHistory();
        loadRentalCalendar();
        await loadAvailableCarsForRental();
    } catch (error) {
        console.error('Rentals load error:', error);
    }
}

function displayActiveRentals() {
    const activeRentals = allRentals.filter(r => r.status === 'active');
    let rentalsHTML = '';
    if (activeRentals.length === 0) {
        rentalsHTML = '<tr><td colspan="7">No active rentals</td></tr>';
    } else {
        activeRentals.forEach(rental => {
            rentalsHTML += `
                <tr>
                    <td>${rental.brand} ${rental.model} ${rental.year || ''}</td>
                    <td>${rental.client_name}<br><small>${rental.client_phone || ''}</small></td>
                    <td>${new Date(rental.start_date).toLocaleDateString()}</td>
                    <td>${new Date(rental.end_date).toLocaleDateString()}</td>
                    <td>${getCurrencySymbol(rental.currency)}${rental.daily_price}/day</td>
                    <td>${getCurrencySymbol(rental.currency)}${rental.total_amount}</td>
                    <td><button class="btn" onclick="completeRental(${rental.id})">Complete</button></td>
                </tr>
            `;
        });
    }
    document.querySelector('#activeRentalsTable tbody').innerHTML = rentalsHTML;
}

function displayRentalHistory() {
    const completedRentals = allRentals.filter(r => r.status === 'completed');
    let historyHTML = '';
    if (completedRentals.length === 0) {
        historyHTML = '<tr><td colspan="5">No rental history</td></tr>';
    } else {
        completedRentals.forEach(rental => {
            const startDate = new Date(rental.start_date).toLocaleDateString();
            const endDate = new Date(rental.end_date).toLocaleDateString();
            historyHTML += `
                <tr>
                    <td>${rental.brand} ${rental.model} ${rental.year || ''}</td>
                    <td>${rental.client_name}</td>
                    <td>${startDate} - ${endDate}</td>
                    <td>${getCurrencySymbol(rental.currency)}${rental.total_amount}</td>
                    <td>${rental.status.toUpperCase()}</td>
                </tr>
            `;
        });
    }
    document.querySelector('#historyTable tbody').innerHTML = historyHTML;
}

async function loadAvailableCarsForRental() {
    const response = await apiCall('/api/cars?status=active');
    if (!response) return;
    const availableCars = await response.json();
    let optionsHTML = '<option value="">Select a car...</option>';
    availableCars.forEach(car => {
        optionsHTML += `<option value="${car.id}">${car.brand} ${car.model} ${car.year || ''}</option>`;
    });
    document.getElementById('rentalCar').innerHTML = optionsHTML;
}

function showRentalTab(tabName) {
    const tabContents = document.querySelectorAll('#rentals .tab-content');
    tabContents.forEach(content => content.classList.remove('active'));
    const tabButtons = document.querySelectorAll('#rentals .tab');
    tabButtons.forEach(button => button.classList.remove('active'));
    if (tabName === 'active') {
        document.getElementById('activeRentals').classList.add('active');
        document.querySelector('#rentals .tab').classList.add('active');
    } else if (tabName === 'calendar') {
        document.getElementById('rentalCalendar').classList.add('active');
        document.querySelectorAll('#rentals .tab')[1].classList.add('active');
        loadRentalCalendar();
    } else if (tabName === 'history') {
        document.getElementById('rentalHistory').classList.add('active');
        document.querySelectorAll('#rentals .tab')[2].classList.add('active');
    }
}

function showAddRentalModal() {
    document.getElementById('addRentalModal').style.display = 'block';
    loadAvailableCarsForRental();
}

async function addRental() {
    const rentalData = {
        car_id: parseInt(document.getElementById('rentalCar').value),
        client_name: document.getElementById('rentalClient').value,
        client_phone: document.getElementById('rentalPhone').value,
        start_date: document.getElementById('rentalStart').value,
        end_date: document.getElementById('rentalEnd').value,
        daily_price: parseFloat(document.getElementById('rentalPrice').value),
        currency: document.getElementById('rentalCurrency').value
    };
    if (!rentalData.car_id || !rentalData.client_name || !rentalData.start_date || !rentalData.end_date || !rentalData.daily_price) {
        alert('Please fill in all required fields');
        return;
    }
    try {
        const response = await apiCall('/api/rentals', {
            method: 'POST',
            body: JSON.stringify(rentalData)
        });
        if (response && response.ok) {
            closeModal('addRentalModal');
            loadRentals();
            document.getElementById('rentalCar').value = '';
            document.getElementById('rentalClient').value = '';
            document.getElementById('rentalPhone').value = '';
            document.getElementById('rentalStart').value = '';
            document.getElementById('rentalEnd').value = '';
            document.getElementById('rentalPrice').value = '';
        } else {
            const error = await response.json();
            alert('Failed to create rental: ' + (error.error || 'Unknown error'));
        }
    } catch (error) {
        alert('Error creating rental: ' + error.message);
    }
}

async function completeRental(rentalId) {
    if (!confirm('Complete this rental?')) return;
    try {
        const response = await apiCall(`/api/rentals/${rentalId}/complete`, { method: 'POST' });
        if (response && response.ok) {
            alert('Rental completed successfully');
            loadRentals();
            loadDashboard();
        } else {
            alert('Failed to complete rental');
        }
    } catch (error) {
        alert('Error completing rental: ' + error.message);
    }
}

async function loadRentalCalendar() {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth() + 1;
    try {
        const response = await apiCall(`/api/rentals/calendar/${year}/${month}`);
        if (!response) return;
        const calendarRentals = await response.json();
        displayCalendar(year, month, calendarRentals);
    } catch (error) {
        console.error('Calendar load error:', error);
    }
}

function displayCalendar(year, month, rentals) {
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    document.getElementById('calendarTitle').textContent = `${monthNames[month - 1]} ${year}`;
    const firstDay = new Date(year, month - 1, 1);
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - firstDay.getDay());
    let calendarHTML = '';
    const dayHeaders = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    dayHeaders.forEach(day => {
        calendarHTML += `<div class="calendar-header">${day}</div>`;
    });
    for (let i = 0; i < 42; i++) {
        const currentDay = new Date(startDate);
        currentDay.setDate(startDate.getDate() + i);
        const isCurrentMonth = currentDay.getMonth() === month - 1;
        const dayClass = isCurrentMonth ? 'calendar-day' : 'calendar-day other-month';
        const dayRentals = rentals.filter(rental => {
            const rentalStart = new Date(rental.start_date);
            const rentalEnd = new Date(rental.end_date);
            return currentDay >= rentalStart && currentDay <= rentalEnd;
        });
        let rentalIndicator = '';
        if (dayRentals.length > 0) {
            rentalIndicator = `<div class="rental-indicator" title="${dayRentals.map(r => r.brand + ' ' + r.model).join(', ')}"></div>`;
        }
        calendarHTML += `<div class="${dayClass}">${currentDay.getDate()}${rentalIndicator}</div>`;
    }
    document.getElementById('calendar').innerHTML = calendarHTML;
}

function changeMonth(direction) {
    currentDate.setMonth(currentDate.getMonth() + direction);
    loadRentalCalendar();
}

// ==================== WAREHOUSE ====================

async function loadWarehouse() {
    await loadCategories();
    warehouseTab = 'stock';
    showWarehouseTab('stock');
}

function showWarehouseTab(tab) {
    warehouseTab = tab;
    const tabs = document.querySelectorAll('.warehouse-tab');
    tabs.forEach(t => t.classList.remove('active'));
    document.querySelector(`.warehouse-tab[onclick*="${tab}"]`).classList.add('active');
    
    if (tab === 'stock') {
        loadCategories();
    } else if (tab === 'receive') {
        showReceiveView();
    } else if (tab === 'procurement') {
        showProcurementView();
    }
}

async function loadCategories() {
    try {
        const response = await apiCall('/api/warehouse/categories');
        if (!response) return;
        categories = await response.json();
        let html = '';
        if (categories.length === 0) {
            html = `
                <div class="loading">
                    <p>No categories yet. Create your first category to get started.</p>
                    <button class="btn" onclick="showAddCategoryModal()">+ Add Category</button>
                </div>
            `;
        } else {
            html = categories.map(cat => `
                <div class="category-card" onclick="loadSubcategories(${cat.id})">
                    <div class="category-icon">${cat.icon || '📦'}</div>
                    <div class="category-name">${cat.name}</div>
                    <div class="category-desc">${cat.description || ''}</div>
                </div>
            `).join('');
        }
        document.getElementById('warehouseContent').innerHTML = `
            <div style="display: flex; justify-content: space-between; margin-bottom: 20px;">
                <h3>Категории</h3>
                <button class="btn" onclick="showAddCategoryModal()">+ Добавить категорию</button>
            </div>
            <div class="categories-grid">${html}</div>
        `;
        currentCategoryId = null;
        currentSubcategoryId = null;
        currentProductId = null;
    } catch (error) {
        console.error('Load categories error:', error);
    }
}

async function loadSubcategories(categoryId) {
    currentCategoryId = categoryId;
    currentSubcategoryId = null;
    currentProductId = null;
    try {
        const response = await apiCall(`/api/warehouse/subcategories/${categoryId}`);
        if (!response) return;
        subcategories = await response.json();
        const category = categories.find(c => c.id === categoryId);
        let html = '';
        if (subcategories.length === 0) {
            html = `
                <div class="loading">
                    <p>No subcategories in ${category.name}. Add one to continue.</p>
                    <button class="btn" onclick="showAddSubcategoryModal()">+ Add Subcategory</button>
                </div>
            `;
        } else {
            html = subcategories.map(sub => `
                <div class="category-card" onclick="loadProducts(${sub.id})">
                    <div class="category-icon">📋</div>
                    <div class="category-name">${sub.name}</div>
                    <div class="category-desc">${sub.description || ''}</div>
                </div>
            `).join('');
        }
        document.getElementById('warehouseContent').innerHTML = `
            <div style="margin-bottom: 20px;">
                <button class="btn" onclick="loadCategories()">← Назад к категориям</button>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 20px;">
                <h3>${category.name} - Подкатегории</h3>
                <button class="btn" onclick="showAddSubcategoryModal()">+ Добавить подкатегорию</button>
            </div>
            <div class="categories-grid">${html}</div>
        `;
    } catch (error) {
        console.error('Load subcategories error:', error);
    }
}

async function loadProducts(subcategoryId) {
    currentSubcategoryId = subcategoryId;
    currentProductId = null;
    try {
        const response = await apiCall(`/api/warehouse/products/${subcategoryId}`);
        if (!response) return;
        products = await response.json();
        const subcategory = subcategories.find(s => s.id === subcategoryId);
        const category = categories.find(c => c.id === currentCategoryId);
        let html = '';
        if (products.length === 0) {
            html = `
                <div class="loading">
                    <p>No products in ${subcategory.name}. Add one to start tracking inventory.</p>
                    <button class="btn" onclick="showAddProductModal()">+ Add Product</button>
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
                            <th>Цена закупа</th>
                            <th>Цена продажи</th>
                            <th>Мин. уровень</th>
                            <th>Действия</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${products.map(p => `
                            <tr>
                                <td>${p.name}</td>
                                <td>${p.sku || 'N/A'}</td>
                                <td style="font-weight: bold; color: ${p.total_quantity > p.min_stock_level ? '#4CAF50' : '#f44336'}">
                                    ${p.total_quantity || 0}
                                </td>
                                <td>${p.purchase_price ? getCurrencySymbol(p.currency || 'GEL') + p.purchase_price : 'N/A'}</td>
                                <td>${p.sale_price ? getCurrencySymbol(p.currency || 'GEL') + p.sale_price : 'N/A'}</td>
                                <td>${p.min_stock_level}</td>
                                <td>
                                    <button class="btn" onclick="showProductDetails(${p.id})">Детали</button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;
        }
        document.getElementById('warehouseContent').innerHTML = `
            <div style="margin-bottom: 20px;">
                <button class="btn" onclick="loadSubcategories(${currentCategoryId})">← Назад к ${category.name}</button>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 20px;">
                <h3>${category.name} > ${subcategory.name}</h3>
                <button class="btn" onclick="showAddProductModal()">+ Добавить товар</button>
            </div>
            ${html}
        `;
    } catch (error) {
        console.error('Load products error:', error);
    }
}

async function showProductDetails(productId) {
    currentProductId = productId;
    try {
        const response = await apiCall(`/api/warehouse/inventory/${productId}`);
        if (!response) return;
        inventory = await response.json();
        const product = products.find(p => p.id === productId);
        document.getElementById('productDetailsName').textContent = product.name;
        document.getElementById('productDetailsSKU').textContent = product.sku || 'N/A';
        document.getElementById('productDetailsTotal').textContent = product.total_quantity || 0;
        document.getElementById('editPurchasePrice').value = product.purchase_price || '';
        document.getElementById('editSalePrice').value = product.sale_price || '';
        document.getElementById('editCurrency').value = product.currency || 'GEL';
        let inventoryHTML = '';
        if (inventory.length === 0) {
            inventoryHTML = '<tr><td colspan="6">Нет остатков на складе</td></tr>';
        } else {
            inventoryHTML = inventory.map(inv => `
                <tr>
                    <td>${inv.source_name}</td>
                    <td>${inv.quantity}</td>
                    <td>${inv.purchase_price ? getCurrencySymbol(inv.currency) + inv.purchase_price : 'N/A'}</td>
                    <td>${inv.location || 'N/A'}</td>
                    <td>${new Date(inv.received_date).toLocaleDateString()}</td>
                    <td>${inv.days_in_storage} дней</td>
                </tr>
            `).join('');
        }
        document.querySelector('#productInventoryTable tbody').innerHTML = inventoryHTML;
        document.getElementById('productDetailsModal').style.display = 'block';
    } catch (error) {
        console.error('Show product details error:', error);
    }
}

async function updateProductPrices() {
    const data = {
        purchase_price: parseFloat(document.getElementById('editPurchasePrice').value),
        sale_price: parseFloat(document.getElementById('editSalePrice').value),
        currency: document.getElementById('editCurrency').value
    };
    try {
        const response = await apiCall(`/api/warehouse/products/${currentProductId}/prices`, {
            method: 'PUT',
            body: JSON.stringify(data)
        });
        if (response && response.ok) {
            alert('Цены успешно обновлены!');
            closeModal('productDetailsModal');
            if (currentSubcategoryId) {
                loadProducts(currentSubcategoryId);
            }
        } else {
            alert('Ошибка обновления цен');
        }
    } catch (error) {
        alert('Error: ' + error.message);
    }
}

function showReceiveView() {
    receiveItems = [];
    document.getElementById('warehouseContent').innerHTML = `
        <div style="background: #2d2d2d; padding: 20px; border-radius: 12px;">
            <h3 style="margin-bottom: 20px;">Оприходование товаров</h3>
            
            <div style="margin-bottom: 20px;">
                <button class="btn" onclick="showProductSearchModal()">+ Добавить товар</button>
            </div>
            
            <div id="receiveItemsList"></div>
            
            <div style="margin-top: 20px; padding-top: 20px; border-top: 2px solid #555;">
                <button class="btn" onclick="saveReceiveItems()" style="width: 200px;">Сохранить оприходование</button>
            </div>
        </div>
    `;
    updateReceiveList();
}

function showProductSearchModal() {
    document.getElementById('productSearchModal').style.display = 'block';
    loadSearchCategories();
}

async function loadSearchCategories() {
    try {
        const response = await apiCall('/api/warehouse/categories');
        if (!response) return;
        const cats = await response.json();
        let html = cats.map(cat => `
            <div class="category-card" onclick="loadSearchSubcategories(${cat.id})">
                <div class="category-icon">${cat.icon || '📦'}</div>
                <div class="category-name">${cat.name}</div>
            </div>
        `).join('');
        document.getElementById('productSearchContent').innerHTML = `
            <div class="categories-grid">${html}</div>
        `;
    } catch (error) {
        console.error('Error:', error);
    }
}

async function loadSearchSubcategories(catId) {
    try {
        const response = await apiCall(`/api/warehouse/subcategories/${catId}`);
        if (!response) return;
        const subs = await response.json();
        let html = `<button class="btn" onclick="loadSearchCategories()" style="margin-bottom: 15px;">← Назад</button>`;
        html += subs.map(sub => `
            <div class="category-card" onclick="loadSearchProducts(${sub.id})">
                <div class="category-icon">📋</div>
                <div class="category-name">${sub.name}</div>
            </div>
        `).join('');
        document.getElementById('productSearchContent').innerHTML = `
            <div>${html}</div>
        `;
    } catch (error) {
        console.error('Error:', error);
    }
}

async function loadSearchProducts(subId) {
    try {
        const response = await apiCall(`/api/warehouse/products/${subId}`);
        if (!response) return;
        const prods = await response.json();
        let html = `<button class="btn" onclick="loadSearchCategories()" style="margin-bottom: 15px;">← Назад</button>`;
        html += '<div class="pos-items-list">';
        html += prods.map(p => `
            <div class="pos-item" onclick='addToReceiveList(${JSON.stringify(p)})'>
                <div class="pos-item-info">
                    <div class="pos-item-name">${p.name}</div>
                    <div class="pos-item-stock">SKU: ${p.sku || 'N/A'} | Остаток: ${p.total_quantity || 0}</div>
                </div>
                <div class="pos-item-price">Добавить</div>
            </div>
        `).join('');
        html += '</div>';
        document.getElementById('productSearchContent').innerHTML = html;
    } catch (error) {
        console.error('Error:', error);
    }
}

function searchProductsInModal() {
    const query = document.getElementById('productSearchInput').value.toLowerCase();
    if (query.length < 2) {
        loadSearchCategories();
        return;
    }
    // Simple search implementation - you can enhance this
    alert('Поиск: ' + query);
}

function addToReceiveList(product) {
    const existing = receiveItems.find(item => item.id === product.id);
    if (existing) {
        alert('Товар уже добавлен в список');
        return;
    }
    receiveItems.push({
        id: product.id,
        name: product.name,
        quantity: 1,
        purchase_price: product.purchase_price || 0,
        sale_price: product.sale_price || 0,
        currency: product.currency || 'GEL'
    });
    updateReceiveList();
    closeModal('productSearchModal');
}

function updateReceiveList() {
    const container = document.getElementById('receiveItemsList');
    if (receiveItems.length === 0) {
        container.innerHTML = '<div class="loading">Нет товаров. Добавьте товары для оприходования.</div>';
        return;
    }
    let html = '<div style="background: #3d3d3d; padding: 15px; border-radius: 8px;">';
    receiveItems.forEach((item, index) => {
        html += `
            <div style="padding: 15px; background: #2d2d2d; border-radius: 8px; margin-bottom: 10px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                    <strong>${item.name}</strong>
                    <button class="btn btn-danger" onclick="removeFromReceiveList(${index})">Удалить</button>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 10px;">
                    <div class="form-group">
                        <label>Количество</label>
                        <input type="number" value="${item.quantity}" min="1" 
                               onchange="updateReceiveItem(${index}, 'quantity', this.value)">
                    </div>
                    <div class="form-group">
                        <label>Цена закупа</label>
                        <input type="number" value="${item.purchase_price}" step="0.01" 
                               onchange="updateReceiveItem(${index}, 'purchase_price', this.value)">
                    </div>
                    <div class="form-group">
                        <label>Цена продажи</label>
                        <input type="number" value="${item.sale_price}" step="0.01" 
                               onchange="updateReceiveItem(${index}, 'sale_price', this.value)">
                    </div>
                    <div class="form-group">
                        <label>Валюта</label>
                        <select onchange="updateReceiveItem(${index}, 'currency', this.value)">
                            <option value="USD" ${item.currency === 'USD' ? 'selected' : ''}>USD</option>
                            <option value="EUR" ${item.currency === 'EUR' ? 'selected' : ''}>EUR</option>
                            <option value="GEL" ${item.currency === 'GEL' ? 'selected' : ''}>GEL</option>
                            <option value="RUB" ${item.currency === 'RUB' ? 'selected' : ''}>RUB</option>
                        </select>
                    </div>
                </div>
            </div>
        `;
    });
    html += '</div>';
    container.innerHTML = html;
}

function updateReceiveItem(index, field, value) {
    if (field === 'quantity') {
        receiveItems[index][field] = parseInt(value);
    } else if (field === 'purchase_price' || field === 'sale_price') {
        receiveItems[index][field] = parseFloat(value);
    } else {
        receiveItems[index][field] = value;
    }
}

function removeFromReceiveList(index) {
    receiveItems.splice(index, 1);
    updateReceiveList();
}

async function saveReceiveItems() {
    if (receiveItems.length === 0) {
        alert('Добавьте хотя бы один товар');
        return;
    }
    try {
        for (const item of receiveItems) {
            const data = {
                product_id: item.id,
                source_type: 'purchased',
                quantity: item.quantity,
                purchase_price: item.purchase_price,
                sale_price: item.sale_price,
                currency: item.currency
            };
            const response = await apiCall('/api/warehouse/inventory/receive', {
                method: 'POST',
                body: JSON.stringify(data)
            });
            if (!response || !response.ok) {
                throw new Error('Failed to receive inventory');
            }
        }
        alert('Товары успешно оприходованы!');
        showReceiveView();
    } catch (error) {
        alert('Ошибка: ' + error.message);
    }
}

function showProcurementView() {
    document.getElementById('warehouseContent').innerHTML = `
        <div style="background: #2d2d2d; padding: 40px; border-radius: 12px; text-align: center;">
            <h3 style="color: #ff9800; margin-bottom: 20px;">🚧 Раздел в разработке</h3>
            <p style="color: #ccc; font-size: 16px;">Функционал "Закупки" находится в разработке.<br>Скоро будет доступен!</p>
        </div>
    `;
}

function showAddCategoryModal() {
    document.getElementById('addCategoryModal').style.display = 'block';
}

async function addCategory() {
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
        const response = await apiCall('/api/warehouse/categories', {
            method: 'POST',
            body: JSON.stringify(data)
        });
        if (response && response.ok) {
            closeModal('addCategoryModal');
            document.getElementById('categoryName').value = '';
            document.getElementById('categoryDescription').value = '';
            document.getElementById('categoryIcon').value = '';
            loadCategories();
        } else {
            alert('Failed to add category');
        }
    } catch (error) {
        alert('Error: ' + error.message);
    }
}

function showAddSubcategoryModal() {
    document.getElementById('addSubcategoryModal').style.display = 'block';
}

async function addSubcategory() {
    const data = {
        category_id: currentCategoryId,
        name: document.getElementById('subcategoryName').value,
        description: document.getElementById('subcategoryDescription').value
    };
    if (!data.name) {
        alert('Название обязательно');
        return;
    }
    try {
        const response = await apiCall('/api/warehouse/subcategories', {
            method: 'POST',
            body: JSON.stringify(data)
        });
        if (response && response.ok) {
            closeModal('addSubcategoryModal');
            document.getElementById('subcategoryName').value = '';
            document.getElementById('subcategoryDescription').value = '';
            loadSubcategories(currentCategoryId);
        } else {
            alert('Failed to add subcategory');
        }
    } catch (error) {
        alert('Error: ' + error.message);
    }
}

function showAddProductModal() {
    document.getElementById('addProductModal').style.display = 'block';
}

async function addProduct() {
    const data = {
        subcategory_id: currentSubcategoryId,
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
        const response = await apiCall('/api/warehouse/products', {
            method: 'POST',
            body: JSON.stringify(data)
        });
        if (response && response.ok) {
            closeModal('addProductModal');
            document.getElementById('productName').value = '';
            document.getElementById('productDescription').value = '';
            document.getElementById('productSKU').value = '';
            document.getElementById('productMinStock').value = '';
            loadProducts(currentSubcategoryId);
        } else {
            alert('Failed to add product');
        }
    } catch (error) {
        alert('Error: ' + error.message);
    }
}

// ==================== POS ====================

async function loadPOS() {
    try {
        const response = await apiCall('/api/warehouse/categories');
        if (!response) return;
        posCategories = await response.json();
        posCart = [];
        posCurrentCategoryId = null;
        posCurrentSubcategoryId = null;
        displayPOSCategories();
        updatePOSReceipt();
    } catch (error) {
        console.error('POS load error:', error);
    }
}

function displayPOSCategories() {
    let breadcrumb = '<div class="pos-breadcrumb-item" onclick="displayPOSCategories()">🏠 Главная</div>';
    let html = '';
    if (posCategories.length === 0) {
        html = '<div class="loading">Нет категорий. Создайте категории в разделе "Склад"</div>';
    } else {
        html = posCategories.map(cat => `
            <div class="pos-item" onclick="displayPOSSubcategories(${cat.id})">
                <div class="pos-item-info">
                    <div class="pos-item-name">${cat.icon || '📦'} ${cat.name}</div>
                    <div class="pos-item-stock">${cat.description || ''}</div>
                </div>
                <div style="font-size: 24px;">›</div>
            </div>
        `).join('');
    }
    document.getElementById('posBreadcrumb').innerHTML = breadcrumb;
    document.getElementById('posItemsList').innerHTML = html;
}

async function displayPOSSubcategories(categoryId) {
    posCurrentCategoryId = categoryId;
    try {
        const response = await apiCall(`/api/warehouse/subcategories/${categoryId}`);
        if (!response) return;
        posSubcategories = await response.json();
        const category = posCategories.find(c => c.id === categoryId);
        let breadcrumb = `
            <div class="pos-breadcrumb-item" onclick="displayPOSCategories()">🏠 Главная</div>
            <div class="pos-breadcrumb-item">${category.name}</div>
        `;
        let html = '';
        if (posSubcategories.length === 0) {
            html = '<div class="loading">Нет подкатегорий</div>';
        } else {
            html = posSubcategories.map(sub => `
                <div class="pos-item" onclick="displayPOSProducts(${sub.id})">
                    <div class="pos-item-info">
                        <div class="pos-item-name">📋 ${sub.name}</div>
                        <div class="pos-item-stock">${sub.description || ''}</div>
                    </div>
                    <div style="font-size: 24px;">›</div>
                </div>
            `).join('');
        }
        document.getElementById('posBreadcrumb').innerHTML = breadcrumb;
        document.getElementById('posItemsList').innerHTML = html;
    } catch (error) {
        console.error('POS subcategories error:', error);
    }
}

async function displayPOSProducts(subcategoryId) {
    posCurrentSubcategoryId = subcategoryId;
    try {
        const response = await apiCall(`/api/warehouse/products/${subcategoryId}`);
        if (!response) return;
        posProducts = await response.json();
        const subcategory = posSubcategories.find(s => s.id === subcategoryId);
        const category = posCategories.find(c => c.id === posCurrentCategoryId);
        let breadcrumb = `
            <div class="pos-breadcrumb-item" onclick="displayPOSCategories()">🏠 Главная</div>
            <div class="pos-breadcrumb-item" onclick="displayPOSSubcategories(${posCurrentCategoryId})">${category.name}</div>
            <div class="pos-breadcrumb-item">${subcategory.name}</div>
        `;
        let html = '';
        if (posProducts.length === 0) {
            html = '<div class="loading">Нет товаров</div>';
        } else {
            html = posProducts.map(product => {
                const stockClass = product.total_quantity <= 0 ? 'out' : 
                                  product.total_quantity <= product.min_stock_level ? 'low' : '';
                const price = product.sale_price || 0;
                return `
                    <div class="pos-item" onclick='addToCart(${JSON.stringify(product)})' ${product.total_quantity <= 0 ? 'style="opacity: 0.5; cursor: not-allowed;"' : ''}>
                        <div class="pos-item-info">
                            <div class="pos-item-name">${product.name}</div>
                            <div class="pos-item-stock ${stockClass}">
                                На складе: ${product.total_quantity || 0} шт | Цена: ${getCurrencySymbol(product.currency || 'GEL')}${price}
                            </div>
                        </div>
                        <div class="pos-item-price">Добавить</div>
                    </div>
                `;
            }).join('');
        }
        document.getElementById('posBreadcrumb').innerHTML = breadcrumb;
        document.getElementById('posItemsList').innerHTML = html;
    } catch (error) {
        console.error('POS products error:', error);
    }
}

function addToCart(product) {
    if (product.total_quantity <= 0) {
        alert('Товар отсутствует на складе');
        return;
    }
    if (!product.sale_price || product.sale_price <= 0) {
        alert('Не установлена цена продажи для этого товара');
        return;
    }
    const existingItem = posCart.find(item => item.id === product.id);
    if (existingItem) {
        if (existingItem.quantity < product.total_quantity) {
            existingItem.quantity++;
        } else {
            alert('Недостаточно товара на складе');
            return;
        }
    } else {
        posCart.push({
            id: product.id,
            name: product.name,
            quantity: 1,
            max_quantity: product.total_quantity,
            sale_price: product.sale_price,
            currency: product.currency || 'GEL'
        });
    }
    updatePOSReceipt();
}

function removeFromCart(productId) {
    posCart = posCart.filter(item => item.id !== productId);
    updatePOSReceipt();
}

function updateQuantity(productId, delta) {
    const item = posCart.find(i => i.id === productId);
    if (!item) return;
    const newQuantity = item.quantity + delta;
    if (newQuantity <= 0) {
        removeFromCart(productId);
    } else if (newQuantity <= item.max_quantity) {
        item.quantity = newQuantity;
        updatePOSReceipt();
    } else {
        alert('Недостаточно товара на складе');
    }
}

function updatePOSReceipt() {
    const receiptItems = document.getElementById('posReceiptItems');
    const subtotalElement = document.getElementById('posSubtotal');
    const totalElement = document.getElementById('posTotal');
    const completeBtn = document.getElementById('posCompleteBtn');
    
    if (posCart.length === 0) {
        receiptItems.innerHTML = '<div class="pos-receipt-empty">Корзина пуста<br>Добавьте товары для продажи</div>';
        subtotalElement.textContent = '0.00';
        totalElement.textContent = '0.00';
        completeBtn.disabled = true;
        return;
    }
    let html = '';
    let subtotal = 0;
    posCart.forEach(item => {
        const itemTotal = item.quantity * item.sale_price;
        subtotal += itemTotal;
        html += `
            <div class="pos-receipt-item">
                <div class="pos-receipt-item-header">
                    <div class="pos-receipt-item-name">${item.name}</div>
                    <button class="pos-receipt-item-remove" onclick="removeFromCart(${item.id})">×</button>
                </div>
                <div class="pos-receipt-item-controls">
                    <div class="pos-quantity-control">
                        <button class="pos-quantity-btn" onclick="updateQuantity(${item.id}, -1)">-</button>
                        <span class="pos-quantity-value">${item.quantity}</span>
                        <button class="pos-quantity-btn" onclick="updateQuantity(${item.id}, 1)">+</button>
                    </div>
                    <div style="text-align: right;">
                        <div style="font-size: 12px; color: #999;">${getCurrencySymbol(item.currency)}${item.sale_price} × ${item.quantity}</div>
                        <div class="pos-receipt-item-total">${getCurrencySymbol(item.currency)}${itemTotal.toFixed(2)}</div>
                    </div>
                </div>
            </div>
        `;
    });
    receiptItems.innerHTML = html;
    subtotalElement.textContent = subtotal.toFixed(2);
    totalElement.textContent = subtotal.toFixed(2);
    completeBtn.disabled = false;
}

function clearPOSCart() {
    if (posCart.length === 0) return;
    if (confirm('Очистить корзину?')) {
        posCart = [];
        updatePOSReceipt();
    }
}

function completePOSSale() {
    if (posCart.length === 0) {
        alert('Корзина пуста');
        return;
    }
    const subtotal = posCart.reduce((sum, item) => sum + (item.quantity * item.sale_price), 0);
    document.getElementById('saleSubtotal').textContent = subtotal.toFixed(2);
    document.getElementById('saleDiscount').textContent = '0.00';
    document.getElementById('saleTotal').textContent = subtotal.toFixed(2);
    document.getElementById('saleDiscountInput').value = '';
    document.getElementById('completeSaleModal').style.display = 'block';
}

function applySaleDiscount() {
    const subtotal = posCart.reduce((sum, item) => sum + (item.quantity * item.sale_price), 0);
    const discountValue = parseFloat(document.getElementById('saleDiscountInput').value) || 0;
    const discountType = document.querySelector('input[name="discountType"]:checked').value;
    
    let discount = 0;
    if (discountType === 'amount') {
        discount = Math.min(discountValue, subtotal);
    } else {
        discount = (subtotal * discountValue) / 100;
    }
    
    const total = subtotal - discount;
    document.getElementById('saleDiscount').textContent = discount.toFixed(2);
    document.getElementById('saleTotal').textContent = total.toFixed(2);
}

async function confirmSale() {
    const buyerName = document.getElementById('saleBuyerName').value || '';
    const buyerPhone = document.getElementById('saleBuyerPhone').value || '';
    const total = parseFloat(document.getElementById('saleTotal').textContent);
    
    try {
        for (const item of posCart) {
            const data = {
                product_id: item.id,
                quantity: item.quantity,
                sale_price: item.sale_price,
                currency: item.currency,
                buyer_name: buyerName,
                buyer_phone: buyerPhone,
                notes: 'POS Sale'
            };
            const response = await apiCall('/api/warehouse/sales', {
                method: 'POST',
                body: JSON.stringify(data)
            });
            if (!response || !response.ok) {
                throw new Error('Failed to process sale');
            }
        }
        alert('Продажа успешно оформлена! Итого: ' + getCurrencySymbol(posCart[0].currency) + total.toFixed(2));
        closeModal('completeSaleModal');
        posCart = [];
        updatePOSReceipt();
        if (posCurrentSubcategoryId) {
            displayPOSProducts(posCurrentSubcategoryId);
        }
    } catch (error) {
        alert('Ошибка оформления продажи: ' + error.message);
    }
}

function searchPOSProducts() {
    const query = document.getElementById('posSearchInput').value.toLowerCase();
    if (query.length < 2) {
        if (posCurrentSubcategoryId) {
            displayPOSProducts(posCurrentSubcategoryId);
        } else {
            displayPOSCategories();
        }
        return;
    }
    const filteredProducts = posProducts.filter(product => 
        product.name.toLowerCase().includes(query) ||
        (product.sku && product.sku.toLowerCase().includes(query))
    );
    let html = '';
    if (filteredProducts.length === 0) {
        html = '<div class="loading">Товары не найдены</div>';
    } else {
        html = filteredProducts.map(product => {
            const stockClass = product.total_quantity <= 0 ? 'out' : 
                              product.total_quantity <= product.min_stock_level ? 'low' : '';
            const price = product.sale_price || 0;
            return `
                <div class="pos-item" onclick='addToCart(${JSON.stringify(product)})' ${product.total_quantity <= 0 ? 'style="opacity: 0.5; cursor: not-allowed;"' : ''}>
                    <div class="pos-item-info">
                        <div class="pos-item-name">${product.name}</div>
                        <div class="pos-item-stock ${stockClass}">
                            На складе: ${product.total_quantity || 0} шт | Цена: ${getCurrencySymbol(product.currency || 'GEL')}${price}
                        </div>
                    </div>
                    <div class="pos-item-price">Добавить</div>
                </div>
            `;
        }).join('');
    }
    document.getElementById('posItemsList').innerHTML = html;
}

// Admin
async function loadUsers() {
    if (currentUser.role !== 'ADMIN') {
        document.querySelector('#usersTable tbody').innerHTML = '<tr><td colspan="5">Access denied</td></tr>';
        return;
    }
    try {
        const response = await apiCall('/api/admin/users');
        if (!response) return;
        const users = await response.json();
        let usersHTML = '';
        if (users.length === 0) {
            usersHTML = '<tr><td colspan="5">No users found</td></tr>';
        } else {
            users.forEach(user => {
                const statusClass = user.active ? 'status-active' : 'status-sold';
                const statusText = user.active ? 'ACTIVE' : 'INACTIVE';
                const actionText = user.active ? 'Deactivate' : 'Activate';
                usersHTML += `
                    <tr>
                        <td>${user.email}</td>
                        <td>${user.role}</td>
                        <td><span class="car-status ${statusClass}">${statusText}</span></td>
                        <td>${new Date(user.created_at).toLocaleDateString()}</td>
                        <td><button class="btn btn-danger" onclick="toggleUserStatus(${user.id})">${actionText}</button></td>
                    </tr>
                `;
            });
        }
        document.querySelector('#usersTable tbody').innerHTML = usersHTML;
    } catch (error) {
        console.error('Users load error:', error);
        document.querySelector('#usersTable tbody').innerHTML = '<tr><td colspan="5">Error loading users</td></tr>';
    }
}

async function toggleUserStatus(userId) {
    if (!confirm('Toggle user status?')) return;
    try {
        const response = await apiCall(`/api/admin/users/${userId}/toggle`, { method: 'PUT' });
        if (response && response.ok) {
            loadUsers();
        } else {
            alert('Failed to toggle user status');
        }
    } catch (error) {
        alert('Error toggling user status: ' + error.message);
    }
}

// Modals
function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
}

window.onclick = function(event) {
    const modals = document.querySelectorAll('.modal');
    modals.forEach(modal => {
        if (event.target === modal) {
            modal.style.display = 'none';
        }
    });
}

document.addEventListener('keydown', function(event) {
    if (event.key === 'Enter') {
        const activeElement = document.activeElement;
        if (activeElement.id === 'loginEmail' || activeElement.id === 'loginPassword') {
            attemptLogin();
        }
        if (activeElement.id === 'registerEmail' || activeElement.id === 'registerPassword') {
            attemptRegister();
        }
    }
});

setInterval(() => {
    const dashboardSection = document.getElementById('dashboard');
    if (dashboardSection && dashboardSection.classList.contains('active')) {
        loadDashboard();
    }
}, 30000);
