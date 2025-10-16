// WGauto CRM v2.0 - Complete System with PoS
// Global variables
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

// PoS variables
let posCart = [];
let posCurrentShift = null;
let posCurrency = 'USD';

// Initialize app
document.addEventListener('DOMContentLoaded', function() {
    checkAuthStatus();
    setupKeyboardShortcuts();
});

// Keyboard shortcuts
function setupKeyboardShortcuts() {
    document.addEventListener('keydown', function(e) {
        if (e.ctrlKey && e.key === 'f' && document.getElementById('pos').classList.contains('active')) {
            e.preventDefault();
            document.getElementById('posSearch').focus();
        }
    });
}

// Currency helper
function getCurrencySymbol(currency) {
    const symbols = { 
        USD: '$', 
        EUR: '€', 
        GEL: '₾',
        RUB: '₽'
    };
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
        }).catch(() => {
            showAuth();
        });
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
    checkCurrentShift();
}

// API helper
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

// Navigation
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
        case 'dashboard':
            loadDashboard();
            break;
        case 'cars':
            loadCars();
            break;
        case 'rentals':
            loadRentals();
            break;
        case 'warehouse':
            loadWarehouse();
            break;
        case 'pos':
            loadPoS();
            break;
        case 'admin':
            loadUsers();
            break;
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

// Cars functions (unchanged - working)
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
    
    const tabMap = {
        'info': 0,
        'finances': 1,
        'rentals': 2
    };
    
    document.getElementById(`car${tabName.charAt(0).toUpperCase() + tabName.slice(1)}`).classList.add('active');
    document.querySelectorAll('#carDetailsModal .tab')[tabMap[tabName]].classList.add('active');
}

// Rentals (unchanged - working)
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
                    <td>
                        <button class="btn" onclick="completeRental(${rental.id})">Complete</button>
                    </td>
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
    if (!confirm('Complete this rental?')) {
        return;
    }

    try {
        const response = await apiCall(`/api/rentals/${rentalId}/complete`, {
            method: 'POST'
        });

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
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];
    
    document.getElementById('calendarTitle').textContent = `${monthNames[month - 1]} ${year}`;
    
    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0);
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
        
        calendarHTML += `
            <div class="${dayClass}">
                ${currentDay.getDate()}
                ${rentalIndicator}
            </div>
        `;
    }
    
    document.getElementById('calendar').innerHTML = calendarHTML;
}

function changeMonth(direction) {
    currentDate.setMonth(currentDate.getMonth() + direction);
    loadRentalCalendar();
}

// ==================== WAREHOUSE FUNCTIONS ====================

async function loadWarehouse() {
    document.getElementById('warehouseActionBar').style.display = 'flex';
    await loadCategories();
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
                            <th>Мин. уровень</th>
                            <th>Дата первого поступления</th>
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
                                <td>${p.min_stock_level}</td>
                                <td>${p.first_received ? new Date(p.first_received).toLocaleDateString() : 'N/A'}</td>
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
        
        document.getElementById('productDetailsName').textContent = product.name;
        document.getElementById('productDetailsSKU').textContent = product.sku || 'N/A';
        document.getElementById('productDetailsTotal').textContent = product.total_quantity || 0;
        
        document.querySelector('#productInventoryTable tbody').innerHTML = inventoryHTML;
        
        document.getElementById('productDetailsModal').style.display = 'block';
    } catch (error) {
        console.error('Show product details error:', error);
    }
}

function showWarehouseAction(action) {
    switch(action) {
        case 'receive':
            alert('Выберите товар из списка, затем нажмите "Оприходовать" в деталях товара');
            break;
        case 'analytics':
            showAnalyticsModal();
            break;
        case 'stock':
            loadCategories();
            break;
    }
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

// COMPLETED: Receive Inventory Function
async function showReceiveForProduct() {
    const product = products.find(p => p.id === currentProductId);
    document.getElementById('receiveProductName').textContent = product.name;
    
    // Load dismantled cars for dropdown
    const response = await apiCall('/api/cars?status=dismantled');
    if (response) {
        const dismantledCars = await response.json();
        let carsHTML = '<option value="">Выберите машину...</option>';
        dismantledCars.forEach(car => {
            carsHTML += `<option value="${car.id}">${car.brand} ${car.model} ${car.year || ''}</option>`;
        });
        document.getElementById('receiveCarId').innerHTML = carsHTML;
    }
    
    document.getElementById('receiveInventoryModal').style.display = 'block';
}

function toggleReceiveSourceFields() {
    const sourceType = document.getElementById('receiveSourceType').value;
    const carGroup = document.getElementById('receiveCarGroup');
    
    if (sourceType === 'dismantled') {
        carGroup.style.display = 'block';
    } else {
        carGroup.style.display = 'none';
    }
}

async function receiveInventory() {
    const sourceType = document.getElementById('receiveSourceType').value;
    const data = {
        product_id: currentProductId,
        source_type: sourceType,
        source_id: sourceType === 'dismantled' ? parseInt(document.getElementById('receiveCarId').value) : null,
        quantity: parseInt(document.getElementById('receiveQuantity').value),
        purchase_price: parseFloat(document.getElementById('receivePurchasePrice').value) || null,
        currency: document.getElementById('receiveCurrency').value,
        location: document.getElementById('receiveLocation').value
    };
    
    if (!data.quantity || data.quantity <= 0) {
        alert('Укажите корректное количество');
        return;
    }
    
    if (sourceType === 'dismantled' && !data.source_id) {
        alert('Выберите машину');
        return;
    }
    
    try {
        const response = await apiCall('/api/warehouse/inventory/receive', {
            method: 'POST',
            body: JSON.stringify(data)
        });
        
        if (response && response.ok) {
            alert('Товар успешно оприходован!');
            closeModal('receiveInventoryModal');
            document.getElementById('receiveQuantity').value = '';
            document.getElementById('receivePurchasePrice').value = '';
            document.getElementById('receiveLocation').value = '';
            showProductDetails(currentProductId);
            loadProducts(currentSubcategoryId);
        } else {
            const error = await response.json();
            alert('Ошибка: ' + (error.error || 'Unknown error'));
        }
    } catch (error) {
        alert('Error: ' + error.message);
    }
}

async function showAnalyticsModal() {
    document.getElementById('analyticsModal').style.display = 'block';
    await loadAnalytics();
}

async function loadAnalytics() {
    const startDate = document.getElementById('analyticsStartDate').value;
    const endDate = document.getElementById('analyticsEndDate').value;
    
    let url = '/api/warehouse/analytics?';
    if (startDate) url += `start_date=${startDate}&`;
    if (endDate) url += `end_date=${endDate}`;
    
    try {
        const response = await apiCall(url);
        if (!response) return;
        
        const data = await response.json();
        
        let itemsHTML = '';
        if (data.items.length === 0) {
            itemsHTML = '<tr><td colspan="5">No inventory data</td></tr>';
        } else {
            itemsHTML = data.items.map(item => {
                const totalValue = (parseFloat(item.total_quantity || 0) * parseFloat(item.avg_purchase_price || 0)).toFixed(2);
                return `
                    <tr>
                        <td>${item.product_name}</td>
                        <td>${item.category_name} > ${item.subcategory_name}</td>
                        <td>${item.total_quantity || 0}</td>
                        <td>${item.avg_purchase_price ? getCurrencySymbol(item.currency) + parseFloat(item.avg_purchase_price).toFixed(2) : 'N/A'}</td>
                        <td>${item.avg_purchase_price ? getCurrencySymbol(item.currency) + totalValue : 'N/A'}</td>
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
                        <div class="currency-label">${total.currency} Всего позиций</div>
                        <div class="amount">${total.total_items} шт</div>
                    </div>
                    <div class="profit-card">
                        <div class="currency-label">${total.currency} Общая стоимость</div>
                        <div class="amount positive">${getCurrencySymbol(total.currency)}${parseFloat(total.total_value).toFixed(2)}</div>
                    </div>
                `;
            });
        } else {
            totalsHTML = '<div class="profit-card"><div class="currency-label">Нет данных</div></div>';
        }
        
        document.getElementById('analyticsTotals').innerHTML = totalsHTML;
        
    } catch (error) {
        console.error('Analytics error:', error);
    }
}

// ==================== POINT OF SALE FUNCTIONS ====================

async function loadPoS() {
    await checkCurrentShift();
    await loadPosCategories();
}

async function checkCurrentShift() {
    try {
        const response = await apiCall('/api/pos/shift/current');
        if (!response) return;
        
        if (response.ok) {
            const data = await response.json();
            posCurrentShift = data.shift;
            updateShiftUI();
        } else {
            posCurrentShift = null;
            updateShiftUI();
        }
    } catch (error) {
        console.error('Check shift error:', error);
    }
}

function updateShiftUI() {
    const shiftBtn = document.getElementById('posShiftBtn');
    const shiftSpan = document.getElementById('posCurrentShift');
    const container = document.getElementById('posContainer');
    
    if (posCurrentShift) {
        shiftBtn.textContent = 'Close Shift';
        shiftBtn.classList.remove('btn');
        shiftBtn.classList.add('btn-danger');
        shiftSpan.textContent = `Shift opened: ${new Date(posCurrentShift.opened_at).toLocaleTimeString()}`;
        container.style.display = 'grid';
    } else {
        shiftBtn.textContent = 'Open Shift';
        shiftBtn.classList.remove('btn-danger');
        shiftBtn.classList.add('btn');
        shiftSpan.textContent = 'No active shift';
        container.style.display = 'none';
    }
}

async function toggleShift() {
    if (posCurrentShift) {
        await closeShift();
    } else {
        await openShift();
    }
}

async function openShift() {
    try {
        const response = await apiCall('/api/pos/shift/open', {
            method: 'POST',
            body: JSON.stringify({ currency: posCurrency })
        });
        
        if (response && response.ok) {
            const data = await response.json();
            posCurrentShift = data.shift;
            updateShiftUI();
            loadPosCategories();
        } else {
            alert('Failed to open shift');
        }
    } catch (error) {
        alert('Error opening shift: ' + error.message);
    }
}

async function closeShift() {
    if (posCart.length > 0) {
        alert('Cannot close shift with items in cart. Complete or clear the sale first.');
        return;
    }
    
    if (!confirm('Close current shift? This will generate a shift report.')) {
        return;
    }
    
    try {
        const response = await apiCall(`/api/pos/shift/${posCurrentShift.id}/close`, {
            method: 'POST'
        });
        
        if (response && response.ok) {
            const data = await response.json();
            alert(`Shift closed!\nTotal Sales: ${getCurrencySymbol(data.report.currency)}${data.report.total_sales}\nTransactions: ${data.report.transaction_count}`);
            posCurrentShift = null;
            updateShiftUI();
            posClearCart();
        } else {
            alert('Failed to close shift');
        }
    } catch (error) {
        alert('Error closing shift: ' + error.message);
    }
}

async function loadPosCategories() {
    if (!posCurrentShift) return;
    
    try {
        const response = await apiCall('/api/warehouse/categories');
        if (!response) return;
        
        const cats = await response.json();
        displayPosBreadcrumb([]);
        displayPosItems(cats.map(c => ({
            id: c.id,
            name: c.name,
            type: 'category',
            icon: c.icon || '📦'
        })));
    } catch (error) {
        console.error('Load PoS categories error:', error);
    }
}

function displayPosBreadcrumb(path) {
    let html = '<div class="pos-breadcrumb-item" onclick="loadPosCategories()">🏠 Home</div>';
    path.forEach((item, index) => {
        if (item.type === 'category') {
            html += `<div class="pos-breadcrumb-item" onclick="loadPosSubcategories(${item.id})">${item.name}</div>`;
        } else if (item.type === 'subcategory') {
            html += `<div class="pos-breadcrumb-item" onclick="loadPosProducts(${item.id})">${item.name}</div>`;
        }
    });
    document.getElementById('posBreadcrumb').innerHTML = html;
}

function displayPosItems(items) {
    let html = '';
    
    if (items.length === 0) {
        html = '<div class="pos-receipt-empty">No items available</div>';
    } else {
        items.forEach(item => {
            if (item.type === 'category') {
                html += `
                    <div class="pos-item" onclick="loadPosSubcategories(${item.id})">
                        <div class="pos-item-info">
                            <div class="pos-item-name">${item.icon} ${item.name}</div>
                            <div class="pos-item-stock">Category</div>
                        </div>
                        <div class="pos-item-price">→</div>
                    </div>
                `;
            } else if (item.type === 'subcategory') {
                html += `
                    <div class="pos-item" onclick="loadPosProducts(${item.id})">
                        <div class="pos-item-info">
                            <div class="pos-item-name">📋 ${item.name}</div>
                            <div class="pos-item-stock">Subcategory</div>
                        </div>
                        <div class="pos-item-price">→</div>
                    </div>
                `;
            } else if (item.type === 'product') {
                const stockClass = item.quantity <= 0 ? 'out' : (item.quantity <= item.min_stock_level ? 'low' : '');
                const canAdd = item.quantity > 0;
                html += `
                    <div class="pos-item ${canAdd ? '' : 'disabled'}" ${canAdd ? `onclick="posAddToCart(${item.id}, '${item.name}', ${item.price})"` : ''}>
                        <div class="pos-item-info">
                            <div class="pos-item-name">${item.name}</div>
                            <div class="pos-item-stock ${stockClass}">In stock: ${item.quantity}</div>
                        </div>
                        <div class="pos-item-price">${item.price ? getCurrencySymbol(posCurrency) + item.price.toFixed(2) : 'N/A'}</div>
                    </div>
                `;
            }
        });
    }
    
    document.getElementById('posItemsList').innerHTML = html;
}

async function loadPosSubcategories(categoryId) {
    try {
        const response = await apiCall(`/api/warehouse/subcategories/${categoryId}`);
        if (!response) return;
        
        const subs = await response.json();
        const cat = categories.find(c => c.id === categoryId);
        
        displayPosBreadcrumb([{ id: categoryId, name: cat.name, type: 'category' }]);
        displayPosItems(subs.map(s => ({
            id: s.id,
            name: s.name,
            type: 'subcategory'
        })));
    } catch (error) {
        console.error('Load PoS subcategories error:', error);
    }
}

async function loadPosProducts(subcategoryId) {
    try {
        const response = await apiCall(`/api/warehouse/products/${subcategoryId}`);
        if (!response) return;
        
        const prods = await response.json();
        
        // Get products with stock info
        const productsWithStock = await Promise.all(prods.map(async (p) => {
            const invResponse = await apiCall(`/api/warehouse/inventory/${p.id}`);
            const invData = await invResponse.json();
            
            let avgPrice = null;
            let totalQty = 0;
            
            if (invData.length > 0) {
                const prices = invData.filter(i => i.purchase_price).map(i => parseFloat(i.purchase_price));
                avgPrice = prices.length > 0 ? prices.reduce((a, b) => a + b, 0) / prices.length * 1.5 : null; // 50% markup
                totalQty = invData.reduce((sum, i) => sum + parseInt(i.quantity), 0);
            }
            
            return {
                id: p.id,
                name: p.name,
                type: 'product',
                price: avgPrice,
                quantity: totalQty,
                min_stock_level: p.min_stock_level
            };
        }));
        
        displayPosItems(productsWithStock);
    } catch (error) {
        console.error('Load PoS products error:', error);
    }
}

function posSearchProducts() {
    const searchTerm = document.getElementById('posSearch').value.toLowerCase();
    if (searchTerm.length < 2) return;
    
    // Search across all products
    // This is a simplified version - in production, use a dedicated search API
    const allProducts = products.filter(p => 
        p.name.toLowerCase().includes(searchTerm) || 
        (p.sku && p.sku.toLowerCase().includes(searchTerm))
    );
    
    displayPosItems(allProducts.map(p => ({
        id: p.id,
        name: p.name,
        type: 'product',
        price: 10, // Default price for demo
        quantity: p.total_quantity || 0,
        min_stock_level: p.min_stock_level
    })));
}

function posAddToCart(productId, productName, price) {
    if (!price) {
        alert('Product has no price set');
        return;
    }
    
    const existingItem = posCart.find(item => item.product_id === productId);
    
    if (existingItem) {
        existingItem.quantity++;
    } else {
        posCart.push({
            product_id: productId,
            name: productName,
            price: price,
            quantity: 1
        });
    }
    
    posUpdateReceipt();
}

function posUpdateReceipt() {
    const itemsDiv = document.getElementById('posReceiptItems');
    const totalsDiv = document.getElementById('posTotals');
    const completeBtn = document.getElementById('posCompleteBtn');
    
    if (posCart.length === 0) {
        itemsDiv.innerHTML = '<div class="pos-receipt-empty">Cart is empty<br><small>Add items to start</small></div>';
        totalsDiv.style.display = 'none';
        completeBtn.disabled = true;
        return;
    }
    
    let html = '';
    let subtotal = 0;
    
    posCart.forEach((item, index) => {
        const itemTotal = item.price * item.quantity;
        subtotal += itemTotal;
        
        html += `
            <div class="pos-receipt-item">
                <div class="pos-receipt-item-header">
                    <div class="pos-receipt-item-name">${item.name}</div>
                    <button class="pos-receipt-item-remove" onclick="posRemoveFromCart(${index})">✕</button>
                </div>
                <div class="pos-receipt-item-controls">
                    <div class="pos-quantity-control">
                        <button class="pos-quantity-btn" onclick="posChangeQuantity(${index}, -1)">−</button>
                        <div class="pos-quantity-value">${item.quantity}</div>
                        <button class="pos-quantity-btn" onclick="posChangeQuantity(${index}, 1)">+</button>
                    </div>
                    <div class="pos-receipt-item-total">${getCurrencySymbol(posCurrency)}${itemTotal.toFixed(2)}</div>
                </div>
            </div>
        `;
    });
    
    itemsDiv.innerHTML = html;
    
    document.getElementById('posSubtotal').textContent = getCurrencySymbol(posCurrency) + subtotal.toFixed(2);
    document.getElementById('posTotal').textContent = getCurrencySymbol(posCurrency) + subtotal.toFixed(2);
    
    totalsDiv.style.display = 'block';
    completeBtn.disabled = false;
}

function posChangeQuantity(index, delta) {
    posCart[index].quantity += delta;
    
    if (posCart[index].quantity <= 0) {
        posCart.splice(index, 1);
    }
    
    posUpdateReceipt();
}

function posRemoveFromCart(index) {
    posCart.splice(index, 1);
    posUpdateReceipt();
}

function posClearCart() {
    if (posCart.length > 0 && !confirm('Clear all items from cart?')) {
        return;
    }
    
    posCart = [];
    posUpdateReceipt();
}

function posCompleteTransaction() {
    if (posCart.length === 0) return;
    
    const total = posCart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    
    document.getElementById('posPaymentTotal').textContent = getCurrencySymbol(posCurrency) + total.toFixed(2);
    document.getElementById('posPaymentModal').style.display = 'block';
}

async function posConfirmPayment() {
    const paymentData = {
        shift_id: posCurrentShift.id,
        items: posCart.map(item => ({
            product_id: item.product_id,
            quantity: item.quantity,
            price: item.price
        })),
        payment_method: document.getElementById('posPaymentMethod').value,
        buyer_name: document.getElementById('posBuyerName').value,
        buyer_phone: document.getElementById('posBuyerPhone').value,
        notes: document.getElementById('posPaymentNotes').value,
        currency: posCurrency
    };
    
    try {
        const response = await apiCall('/api/pos/sale', {
            method: 'POST',
            body: JSON.stringify(paymentData)
        });
        
        if (response && response.ok) {
            const data = await response.json();
            alert(`✓ Sale completed!\nTotal: ${getCurrencySymbol(posCurrency)}${data.sale.total_amount}\nReceipt #${data.sale.id}`);
            
            closeModal('posPaymentModal');
            posClearCart();
            
            // Clear form
            document.getElementById('posBuyerName').value = '';
            document.getElementById('posBuyerPhone').value = '';
            document.getElementById('posPaymentNotes').value = '';
            
            loadDashboard();
        } else {
            const error = await response.json();
            alert('Failed to complete sale: ' + (error.error || 'Unknown error'));
        }
    } catch (error) {
        alert('Error completing sale: ' + error.message);
    }
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
                        <td>
                            <button class="btn btn-danger" onclick="toggleUserStatus(${user.id})">${actionText}</button>
                        </td>
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
    if (!confirm('Toggle user status?')) {
        return;
    }

    try {
        const response = await apiCall(`/api/admin/users/${userId}/toggle`, {
            method: 'PUT'
        });

        if (response && response.ok) {
            loadUsers();
        } else {
            alert('Failed to toggle user status');
        }
    } catch (error) {
        alert('Error toggling user status: ' + error.message);
    }
}

// Modal functions
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

// Handle Enter key
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

// Auto-refresh dashboard
setInterval(() => {
    const dashboardSection = document.getElementById('dashboard');
    if (dashboardSection && dashboardSection.classList.contains('active')) {
        loadDashboard();
    }
}, 30000);
