// WGauto CRM - Складская система с аналитикой
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
let currentWarehouseTab = 'stock'; // NEW: Track current warehouse tab

// POS variables (NEW)
let posReceipt = []; // Items in current receipt
let allProducts = []; // All products for POS
let posCurrentCategory = null;
let posCurrentSubcategory = null;

// Receiving variables (NEW)
let receivingItems = []; // Items being received
let receivingCurrentCategory = null;
let receivingCurrentSubcategory = null;

// Initialize app
document.addEventListener('DOMContentLoaded', function() {
    checkAuthStatus();
    setDefaultAnalyticsDates(); // NEW: Set default dates for analytics
});

// NEW: Set default analytics dates (last 30 days)
function setDefaultAnalyticsDates() {
    const today = new Date();
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(today.getDate() - 30);
    
    if (document.getElementById('analyticsStartDateFilter')) {
        document.getElementById('analyticsStartDateFilter').value = thirtyDaysAgo.toISOString().split('T')[0];
    }
    if (document.getElementById('analyticsEndDateFilter')) {
        document.getElementById('analyticsEndDateFilter').value = today.toISOString().split('T')[0];
    }
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
        pos: 'Касса (POS)',
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
            loadPOS();
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

// Cars functions (kept same as before)
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

// Rentals (kept same)
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
    // Show warehouse tabs
    document.getElementById('warehouseTabs').style.display = 'flex';
    
    // Load based on current tab
    if (currentWarehouseTab === 'stock') {
        showWarehouseTab('stock');
    } else {
        showWarehouseTab('analytics');
    }
}

// NEW: Warehouse tab navigation
function showWarehouseTab(tabName) {
    currentWarehouseTab = tabName;
    
    // Update tab buttons
    const tabButtons = document.querySelectorAll('#warehouseTabs .tab');
    tabButtons.forEach(btn => btn.classList.remove('active'));
    
    // Update tab content
    const tabContents = document.querySelectorAll('.warehouse-tab-content');
    tabContents.forEach(content => content.classList.remove('active'));
    
    if (tabName === 'stock') {
        tabButtons[0].classList.add('active');
        document.getElementById('warehouseStockTab').classList.add('active');
        document.getElementById('warehouseActionBar').style.display = 'flex';
        loadCategories();
    } else if (tabName === 'analytics') {
        tabButtons[1].classList.add('active');
        document.getElementById('warehouseAnalyticsTab').classList.add('active');
        document.getElementById('warehouseActionBar').style.display = 'none';
        setDefaultAnalyticsDates();
        loadWarehouseAnalytics();
    }
}

function hideWarehouseActionBar() {
    document.getElementById('warehouseActionBar').style.display = 'none';
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
        
        // Reset navigation
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
        // Load inventory for this product
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
        
        // Add edit button and prices
        const priceInfo = `
            <div style="margin-top: 20px; padding: 15px; background: #3d3d3d; border-radius: 8px;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <p><strong>Цена закупки:</strong> $${(product.purchase_price || 0).toFixed(2)}</p>
                        <p><strong>Цена продажи:</strong> $${(product.sale_price || 0).toFixed(2)}</p>
                    </div>
                    <button class="btn" onclick="showEditProductModal(${productId})">✏️ Редактировать</button>
                </div>
            </div>
        `;
        
        document.querySelector('#productInventoryTable').insertAdjacentHTML('beforebegin', priceInfo);
        
        document.querySelector('#productInventoryTable tbody').innerHTML = inventoryHTML;
        
        document.getElementById('productDetailsModal').style.display = 'block';
    } catch (error) {
        console.error('Show product details error:', error);
    }
}

// Warehouse action bar functions
function showWarehouseAction(action) {
    switch(action) {
        case 'sell':
            showSellInventoryModal();
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

function showReceiveInventoryModal() {
    document.getElementById('receiveInventoryModal').style.display = 'block';
}

function showSellInventoryModal() {
    document.getElementById('sellInventoryModal').style.display = 'block';
}

function showProcurementModal() {
    document.getElementById('procurementModal').style.display = 'block';
}

// ==================== NEW: WAREHOUSE ANALYTICS ====================

// Analytics sorting state
let analyticsSortColumn = null;
let analyticsSortDirection = 'desc'; // 'asc' or 'desc'
let currentAnalyticsData = null; // Store current data for sorting

// Reset analytics filters to default
function resetAnalyticsFilters() {
    setDefaultAnalyticsDates();
    document.getElementById('analyticsSalesCompare').value = '';
    document.getElementById('analyticsSalesValue').value = '';
    document.getElementById('analyticsRevenueCompare').value = '';
    document.getElementById('analyticsRevenueValue').value = '';
    document.getElementById('analyticsProfitCompare').value = '';
    document.getElementById('analyticsProfitValue').value = '';
    document.getElementById('analyticsMarginCompare').value = '';
    document.getElementById('analyticsMarginValue').value = '';
    analyticsSortColumn = null;
    analyticsSortDirection = 'desc';
    loadWarehouseAnalytics();
}

// Load warehouse analytics with filters
async function loadWarehouseAnalytics() {
    try {
        // Build query parameters
        const params = new URLSearchParams();
        
        const startDate = document.getElementById('analyticsStartDateFilter').value;
        const endDate = document.getElementById('analyticsEndDateFilter').value;
        
        if (startDate) params.append('start_date', startDate);
        if (endDate) params.append('end_date', endDate);
        
        // Sales filter
        const salesCompare = document.getElementById('analyticsSalesCompare').value;
        const salesValue = document.getElementById('analyticsSalesValue').value;
        if (salesCompare && salesValue) {
            params.append('sales_compare', salesCompare);
            params.append('sales_value', salesValue);
        }
        
        // Revenue filter
        const revenueCompare = document.getElementById('analyticsRevenueCompare').value;
        const revenueValue = document.getElementById('analyticsRevenueValue').value;
        if (revenueCompare && revenueValue) {
            params.append('revenue_compare', revenueCompare);
            params.append('revenue_value', revenueValue);
        }
        
        // Profit filter
        const profitCompare = document.getElementById('analyticsProfitCompare').value;
        const profitValue = document.getElementById('analyticsProfitValue').value;
        if (profitCompare && profitValue) {
            params.append('profit_compare', profitCompare);
            params.append('profit_value', profitValue);
        }
        
        // Margin filter
        const marginCompare = document.getElementById('analyticsMarginCompare').value;
        const marginValue = document.getElementById('analyticsMarginValue').value;
        if (marginCompare && marginValue) {
            params.append('margin_compare', marginCompare);
            params.append('margin_value', marginValue);
        }
        
        const response = await apiCall(`/api/warehouse/analytics-detailed?${params.toString()}`);
        if (!response) return;
        
        const data = await response.json();
        
        // Store data for sorting
        currentAnalyticsData = data;
        
        // Display period
        const periodStart = new Date(data.period.start).toLocaleDateString();
        const periodEnd = new Date(data.period.end).toLocaleDateString();
        document.getElementById('analyticsPeriodDisplay').textContent = `${periodStart} - ${periodEnd}`;
        
        // Display summary cards
        displayAnalyticsSummary(data.totals);
        
        // Apply sorting if set
        if (analyticsSortColumn && data.items.length > 0) {
            data.items = sortAnalyticsData(data.items, analyticsSortColumn, analyticsSortDirection);
        }
        
        // Display analytics table
        displayAnalyticsTable(data.items, data.totals);
        
    } catch (error) {
        console.error('Analytics load error:', error);
        document.getElementById('analyticsTableBody').innerHTML = '<tr><td colspan="8">Error loading analytics</td></tr>';
    }
}

// Display summary cards
function displayAnalyticsSummary(totals) {
    let summaryHTML = '';
    
    if (!totals || totals.length === 0) {
        summaryHTML = '<div class="profit-card"><div class="currency-label">Нет данных за период</div></div>';
    } else {
        totals.forEach(total => {
            summaryHTML += `
                <div class="profit-card">
                    <div class="currency-label">${total.currency} Всего продано</div>
                    <div class="amount">${total.total_sold} шт</div>
                </div>
                <div class="profit-card">
                    <div class="currency-label">${total.currency} Выручка</div>
                    <div class="amount positive">${getCurrencySymbol(total.currency)}${parseFloat(total.total_revenue).toFixed(2)}</div>
                </div>
                <div class="profit-card">
                    <div class="currency-label">${total.currency} Себестоимость</div>
                    <div class="amount">${getCurrencySymbol(total.currency)}${parseFloat(total.total_cost).toFixed(2)}</div>
                </div>
                <div class="profit-card">
                    <div class="currency-label">${total.currency} Прибыль</div>
                    <div class="amount ${parseFloat(total.net_profit) >= 0 ? 'positive' : 'negative'}">
                        ${getCurrencySymbol(total.currency)}${parseFloat(total.net_profit).toFixed(2)}
                    </div>
                </div>
                <div class="profit-card">
                    <div class="currency-label">${total.currency} Рентабельность</div>
                    <div class="amount">${parseFloat(total.profit_margin_percent).toFixed(2)}%</div>
                </div>
            `;
        });
    }
    
    document.getElementById('analyticsSummaryCards').innerHTML = summaryHTML;
}

// Display analytics table with data
function displayAnalyticsTable(items, totals) {
    let tableHTML = '';
    
    if (!items || items.length === 0) {
        tableHTML = '<tr><td colspan="8">Нет данных за выбранный период</td></tr>';
    } else {
        items.forEach(item => {
            const profitMargin = parseFloat(item.profit_margin_percent || 0).toFixed(2);
            const netProfit = parseFloat(item.net_profit || 0);
            const profitClass = netProfit >= 0 ? 'positive' : 'negative';
            
            tableHTML += `
                <tr>
                    <td><strong>${item.product_name}</strong></td>
                    <td>${item.category_name} > ${item.subcategory_name}</td>
                    <td>${item.sku || 'N/A'}</td>
                    <td style="text-align: center; font-weight: bold;">${item.total_sold}</td>
                    <td>${getCurrencySymbol(item.currency)}${parseFloat(item.total_revenue || 0).toFixed(2)}</td>
                    <td>${getCurrencySymbol(item.currency)}${parseFloat(item.total_cost || 0).toFixed(2)}</td>
                    <td class="${profitClass}" style="font-weight: bold;">${getCurrencySymbol(item.currency)}${netProfit.toFixed(2)}</td>
                    <td style="text-align: center;">${profitMargin}%</td>
                </tr>
            `;
        });
    }
    
    document.getElementById('analyticsTableBody').innerHTML = tableHTML;
    
    // Update table headers with sort indicators
    updateSortIndicators();
    
    // Display footer with totals
    let footerHTML = '';
    if (totals && totals.length > 0) {
        totals.forEach(total => {
            footerHTML += `
                <tr>
                    <td colspan="3"><strong>ИТОГО (${total.currency})</strong></td>
                    <td style="text-align: center;"><strong>${total.total_sold} шт</strong></td>
                    <td><strong>${getCurrencySymbol(total.currency)}${parseFloat(total.total_revenue).toFixed(2)}</strong></td>
                    <td><strong>${getCurrencySymbol(total.currency)}${parseFloat(total.total_cost).toFixed(2)}</strong></td>
                    <td><strong>${getCurrencySymbol(total.currency)}${parseFloat(total.net_profit).toFixed(2)}</strong></td>
                    <td style="text-align: center;"><strong>${parseFloat(total.profit_margin_percent).toFixed(2)}%</strong></td>
                </tr>
            `;
        });
    }
    
    document.getElementById('analyticsTableFooter').innerHTML = footerHTML;
}

// NEW: Sort analytics data
function sortAnalyticsData(items, column, direction) {
    const sortedItems = [...items];
    
    sortedItems.sort((a, b) => {
        let aVal, bVal;
        
        switch(column) {
            case 'name':
                aVal = a.product_name.toLowerCase();
                bVal = b.product_name.toLowerCase();
                break;
            case 'category':
                aVal = (a.category_name + a.subcategory_name).toLowerCase();
                bVal = (b.category_name + b.subcategory_name).toLowerCase();
                break;
            case 'sku':
                aVal = (a.sku || '').toLowerCase();
                bVal = (b.sku || '').toLowerCase();
                break;
            case 'sales':
                aVal = parseFloat(a.total_sold || 0);
                bVal = parseFloat(b.total_sold || 0);
                break;
            case 'revenue':
                aVal = parseFloat(a.total_revenue || 0);
                bVal = parseFloat(b.total_revenue || 0);
                break;
            case 'cost':
                aVal = parseFloat(a.total_cost || 0);
                bVal = parseFloat(b.total_cost || 0);
                break;
            case 'profit':
                aVal = parseFloat(a.net_profit || 0);
                bVal = parseFloat(b.net_profit || 0);
                break;
            case 'margin':
                aVal = parseFloat(a.profit_margin_percent || 0);
                bVal = parseFloat(b.profit_margin_percent || 0);
                break;
            default:
                return 0;
        }
        
        if (typeof aVal === 'string') {
            return direction === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
        } else {
            return direction === 'asc' ? aVal - bVal : bVal - aVal;
        }
    });
    
    return sortedItems;
}

// NEW: Handle column sort click
function sortAnalyticsByColumn(column) {
    if (!currentAnalyticsData || !currentAnalyticsData.items) return;
    
    // Toggle direction if same column, otherwise default to desc
    if (analyticsSortColumn === column) {
        analyticsSortDirection = analyticsSortDirection === 'desc' ? 'asc' : 'desc';
    } else {
        analyticsSortColumn = column;
        analyticsSortDirection = 'desc';
    }
    
    // Sort and display
    const sortedItems = sortAnalyticsData(currentAnalyticsData.items, analyticsSortColumn, analyticsSortDirection);
    displayAnalyticsTable(sortedItems, currentAnalyticsData.totals);
}

// NEW: Update sort indicators in table headers
function updateSortIndicators() {
    // Remove all existing indicators
    document.querySelectorAll('.analytics-table thead th').forEach(th => {
        th.classList.remove('sorted-asc', 'sorted-desc');
        const arrow = th.querySelector('.sort-arrow');
        if (arrow) arrow.remove();
    });
    
    // Add indicator to current sorted column
    if (analyticsSortColumn) {
        const columnMap = {
            'name': 0,
            'category': 1,
            'sku': 2,
            'sales': 3,
            'revenue': 4,
            'cost': 5,
            'profit': 6,
            'margin': 7
        };
        
        const columnIndex = columnMap[analyticsSortColumn];
        if (columnIndex !== undefined) {
            const th = document.querySelectorAll('.analytics-table thead th')[columnIndex];
            if (th) {
                th.classList.add(`sorted-${analyticsSortDirection}`);
                const arrow = document.createElement('span');
                arrow.className = 'sort-arrow';
                arrow.textContent = analyticsSortDirection === 'desc' ? ' ▼' : ' ▲';
                th.appendChild(arrow);
            }
        }
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

// ==================== POS (КАССА) FUNCTIONS ====================

// Load POS section
async function loadPOS() {
    try {
        const response = await apiCall('/api/warehouse/products-all');
        if (!response) return;
        
        allProducts = await response.json();
        loadPOSCategories();
    } catch (error) {
        console.error('Load POS error:', error);
    }
}

// Load POS categories
function loadPOSCategories() {
    posCurrentCategory = null;
    posCurrentSubcategory = null;
    
    // Get unique categories
    const uniqueCategories = {};
    allProducts.forEach(p => {
        if (!uniqueCategories[p.category_id]) {
            uniqueCategories[p.category_id] = {
                id: p.category_id,
                name: p.category_name,
                icon: p.category_icon
            };
        }
    });
    
    let html = '';
    Object.values(uniqueCategories).forEach(cat => {
        html += `
            <div class="pos-item" onclick="loadPOSSubcategories(${cat.id}, '${cat.name}')">
                <div class="pos-item-info">
                    <div class="pos-item-name">${cat.icon || '📦'} ${cat.name}</div>
                    <div class="pos-item-stock">Категория</div>
                </div>
                <div style="font-size: 24px;">›</div>
            </div>
        `;
    });
    
    document.getElementById('posItemsList').innerHTML = html || '<p style="text-align:center; color:#ccc;">Нет категорий</p>';
    document.getElementById('posBreadcrumb').innerHTML = '<div class="pos-breadcrumb-item" onclick="loadPOSCategories()">📦 Все категории</div>';
}

// Load POS subcategories
function loadPOSSubcategories(categoryId, categoryName) {
    posCurrentCategory = categoryId;
    posCurrentSubcategory = null;
    
    const uniqueSubcategories = {};
    allProducts.filter(p => p.category_id === categoryId).forEach(p => {
        if (!uniqueSubcategories[p.subcategory_id]) {
            uniqueSubcategories[p.subcategory_id] = {
                id: p.subcategory_id,
                name: p.subcategory_name
            };
        }
    });
    
    let html = '';
    Object.values(uniqueSubcategories).forEach(sub => {
        html += `
            <div class="pos-item" onclick="loadPOSProducts(${sub.id}, '${sub.name}')">
                <div class="pos-item-info">
                    <div class="pos-item-name">📋 ${sub.name}</div>
                    <div class="pos-item-stock">Подкатегория</div>
                </div>
                <div style="font-size: 24px;">›</div>
            </div>
        `;
    });
    
    document.getElementById('posItemsList').innerHTML = html;
    document.getElementById('posBreadcrumb').innerHTML = `
        <div class="pos-breadcrumb-item" onclick="loadPOSCategories()">📦 Все категории</div>
        <div class="pos-breadcrumb-item">${categoryName}</div>
    `;
}

// Load POS products
function loadPOSProducts(subcategoryId, subcategoryName) {
    posCurrentSubcategory = subcategoryId;
    
    const products = allProducts.filter(p => p.subcategory_id === subcategoryId);
    
    let html = '';
    products.forEach(p => {
        const stockClass = p.stock_quantity <= 0 ? 'out' : (p.stock_quantity < 5 ? 'low' : '');
        const stockText = p.stock_quantity <= 0 ? 'Нет в наличии' : `В наличии: ${p.stock_quantity} шт`;
        
        html += `
            <div class="pos-item" onclick="addToPOSReceipt(${p.id})" ${p.stock_quantity <= 0 ? 'style="opacity: 0.5; cursor: not-allowed;"' : ''}>
                <div class="pos-item-info">
                    <div class="pos-item-name">${p.name}</div>
                    <div class="pos-item-stock ${stockClass}">${stockText}</div>
                </div>
                <div class="pos-item-price">$${(p.sale_price || 0).toFixed(2)}</div>
            </div>
        `;
    });
    
    document.getElementById('posItemsList').innerHTML = html || '<p style="text-align:center; color:#ccc;">Нет товаров</p>';
    
    const categoryName = allProducts.find(p => p.subcategory_id === subcategoryId)?.category_name || '';
    document.getElementById('posBreadcrumb').innerHTML = `
        <div class="pos-breadcrumb-item" onclick="loadPOSCategories()">📦 Все категории</div>
        <div class="pos-breadcrumb-item" onclick="loadPOSSubcategories(${posCurrentCategory}, '${categoryName}')">${categoryName}</div>
        <div class="pos-breadcrumb-item">${subcategoryName}</div>
    `;
}

// Search POS products
function searchPOSProducts() {
    const query = document.getElementById('posSearchInput').value.toLowerCase();
    
    if (!query) {
        loadPOSCategories();
        return;
    }
    
    const filtered = allProducts.filter(p => 
        p.name.toLowerCase().includes(query) || 
        (p.sku && p.sku.toLowerCase().includes(query))
    );
    
    let html = '';
    filtered.forEach(p => {
        const stockClass = p.stock_quantity <= 0 ? 'out' : (p.stock_quantity < 5 ? 'low' : '');
        const stockText = p.stock_quantity <= 0 ? 'Нет в наличии' : `В наличии: ${p.stock_quantity} шт`;
        
        html += `
            <div class="pos-item" onclick="addToPOSReceipt(${p.id})" ${p.stock_quantity <= 0 ? 'style="opacity: 0.5; cursor: not-allowed;"' : ''}>
                <div class="pos-item-info">
                    <div class="pos-item-name">${p.name}</div>
                    <div class="pos-item-stock ${stockClass}">${stockText} • ${p.category_name} › ${p.subcategory_name}</div>
                </div>
                <div class="pos-item-price">$${(p.sale_price || 0).toFixed(2)}</div>
            </div>
        `;
    });
    
    document.getElementById('posItemsList').innerHTML = html || '<p style="text-align:center; color:#ccc;">Ничего не найдено</p>';
    document.getElementById('posBreadcrumb').innerHTML = `
        <div class="pos-breadcrumb-item" onclick="loadPOSCategories(); document.getElementById('posSearchInput').value=''">📦 Все категории</div>
        <div class="pos-breadcrumb-item">🔍 Результаты поиска: "${query}"</div>
    `;
}

// Add item to POS receipt
function addToPOSReceipt(productId) {
    const product = allProducts.find(p => p.id === productId);
    
    if (!product || product.stock_quantity <= 0) {
        alert('Товар отсутствует на складе');
        return;
    }
    
    const existingItem = posReceipt.find(item => item.product_id === productId);
    
    if (existingItem) {
        if (existingItem.quantity >= product.stock_quantity) {
            alert(`Недостаточно товара на складе (доступно: ${product.stock_quantity})`);
            return;
        }
        existingItem.quantity++;
        existingItem.total_price = existingItem.quantity * existingItem.unit_price;
    } else {
        posReceipt.push({
            product_id: productId,
            name: product.name,
            unit_price: product.sale_price || 0,
            quantity: 1,
            total_price: product.sale_price || 0,
            max_quantity: product.stock_quantity
        });
    }
    
    updatePOSReceipt();
}

// Update POS receipt display
function updatePOSReceipt() {
    if (posReceipt.length === 0) {
        document.getElementById('posReceiptItems').innerHTML = '<div class="pos-receipt-empty">Добавьте товары из каталога</div>';
        document.getElementById('posTotals').style.display = 'none';
        document.getElementById('posCompleteBtn').disabled = true;
        return;
    }
    
    let html = '';
    posReceipt.forEach((item, index) => {
        html += `
            <div class="pos-receipt-item">
                <div class="pos-receipt-item-header">
                    <div class="pos-receipt-item-name">${item.name}</div>
                    <button class="pos-receipt-item-remove" onclick="removeFromPOSReceipt(${index})">✕</button>
                </div>
                <div class="pos-receipt-item-controls">
                    <div class="pos-quantity-control">
                        <button class="pos-quantity-btn" onclick="changePOSQuantity(${index}, -1)">−</button>
                        <div class="pos-quantity-value">${item.quantity}</div>
                        <button class="pos-quantity-btn" onclick="changePOSQuantity(${index}, 1)">+</button>
                    </div>
                    <div class="pos-receipt-item-total">$${item.total_price.toFixed(2)}</div>
                </div>
            </div>
        `;
    });
    
    document.getElementById('posReceiptItems').innerHTML = html;
    
    const totalItems = posReceipt.reduce((sum, item) => sum + item.quantity, 0);
    const totalAmount = posReceipt.reduce((sum, item) => sum + item.total_price, 0);
    
    document.getElementById('posTotalItems').textContent = `${totalItems} шт`;
    document.getElementById('posTotalAmount').textContent = `$${totalAmount.toFixed(2)}`;
    document.getElementById('posTotals').style.display = 'block';
    document.getElementById('posCompleteBtn').disabled = false;
}

// Change quantity in POS receipt
function changePOSQuantity(index, delta) {
    const item = posReceipt[index];
    const newQty = item.quantity + delta;
    
    if (newQty <= 0) {
        removeFromPOSReceipt(index);
        return;
    }
    
    if (newQty > item.max_quantity) {
        alert(`Недостаточно товара на складе (доступно: ${item.max_quantity})`);
        return;
    }
    
    item.quantity = newQty;
    item.total_price = item.quantity * item.unit_price;
    updatePOSReceipt();
}

// Remove item from POS receipt
function removeFromPOSReceipt(index) {
    posReceipt.splice(index, 1);
    updatePOSReceipt();
}

// Clear POS receipt
function clearPOSReceipt() {
    if (posReceipt.length === 0) return;
    
    if (confirm('Очистить чек?')) {
        posReceipt = [];
        updatePOSReceipt();
    }
}

// Show POS checkout modal
function showPOSCheckout() {
    if (posReceipt.length === 0) return;
    
    const totalAmount = posReceipt.reduce((sum, item) => sum + item.total_price, 0);
    
    let itemsHTML = '';
    posReceipt.forEach(item => {
        itemsHTML += `
            <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
                <span>${item.name} × ${item.quantity}</span>
                <span>$${item.total_price.toFixed(2)}</span>
            </div>
        `;
    });
    
    document.getElementById('posCheckoutItemsList').innerHTML = itemsHTML;
    document.getElementById('posCheckoutSubtotal').textContent = `$${totalAmount.toFixed(2)}`;
    document.getElementById('posCheckoutFinal').textContent = `$${totalAmount.toFixed(2)}`;
    
    document.getElementById('posDiscountType').value = 'none';
    document.getElementById('posDiscountValue').value = '';
    document.getElementById('posDiscountValue').disabled = true;
    
    document.getElementById('posCheckoutModal').style.display = 'block';
}

// Calculate POS discount
function calculatePOSDiscount() {
    const totalAmount = posReceipt.reduce((sum, item) => sum + item.total_price, 0);
    const discountType = document.getElementById('posDiscountType').value;
    const discountValue = parseFloat(document.getElementById('posDiscountValue').value) || 0;
    
    document.getElementById('posDiscountValue').disabled = discountType === 'none';
    
    let finalAmount = totalAmount;
    
    if (discountType === 'percent') {
        finalAmount = totalAmount * (1 - discountValue / 100);
    } else if (discountType === 'amount') {
        finalAmount = totalAmount - discountValue;
    }
    
    finalAmount = Math.max(0, finalAmount);
    
    document.getElementById('posCheckoutFinal').textContent = `$${finalAmount.toFixed(2)}`;
}

// Complete POS sale
async function completePOSSale() {
    const totalAmount = posReceipt.reduce((sum, item) => sum + item.total_price, 0);
    const discountType = document.getElementById('posDiscountType').value;
    const discountValue = parseFloat(document.getElementById('posDiscountValue').value) || 0;
    const finalAmount = parseFloat(document.getElementById('posCheckoutFinal').textContent.replace('$', ''));
    
    const saleData = {
        items: posReceipt,
        discount_type: discountType === 'none' ? null : discountType,
        discount_value: discountType === 'none' ? 0 : discountValue,
        total_amount: totalAmount,
        final_amount: finalAmount
    };
    
    try {
        const response = await apiCall('/api/pos/sale', {
            method: 'POST',
            body: JSON.stringify(saleData)
        });
        
        if (response && response.ok) {
            const result = await response.json();
            alert(`✅ Продажа #${result.sale_id} успешно завершена!\nСумма: $${finalAmount.toFixed(2)}`);
            
            posReceipt = [];
            updatePOSReceipt();
            closeModal('posCheckoutModal');
            
            // Reload products to update stock
            loadPOS();
        } else {
            const error = await response.json();
            alert('Ошибка: ' + (error.error || 'Не удалось завершить продажу'));
        }
    } catch (error) {
        console.error('Complete sale error:', error);
        alert('Ошибка при завершении продажи');
    }
}

// ==================== RECEIVING (ОПРИХОДОВАНИЕ) FUNCTIONS ====================

// Show receiving interface
function showReceivingInterface() {
    receivingItems = [];
    document.getElementById('receivingModal').style.display = 'block';
    document.getElementById('receivingItemsList').innerHTML = '<p style="color: #ccc; text-align: center; padding: 40px;">Нажмите "Добавить товар" для начала оприходования</p>';
    document.getElementById('receivingSaveBtn').style.display = 'none';
}

// Show receiving search
async function showReceivingSearch() {
    try {
        const response = await apiCall('/api/warehouse/products-all');
        if (!response) return;
        
        allProducts = await response.json();
        
        document.getElementById('receivingSearchModal').style.display = 'block';
        loadReceivingCategories();
    } catch (error) {
        console.error('Load products error:', error);
    }
}

// Load receiving categories
function loadReceivingCategories() {
    receivingCurrentCategory = null;
    receivingCurrentSubcategory = null;
    
    const uniqueCategories = {};
    allProducts.forEach(p => {
        if (!uniqueCategories[p.category_id]) {
            uniqueCategories[p.category_id] = {
                id: p.category_id,
                name: p.category_name,
                icon: p.category_icon
            };
        }
    });
    
    let html = '';
    Object.values(uniqueCategories).forEach(cat => {
        html += `
            <div class="pos-item" onclick="loadReceivingSubcategories(${cat.id}, '${cat.name}')">
                <div class="pos-item-info">
                    <div class="pos-item-name">${cat.icon || '📦'} ${cat.name}</div>
                    <div class="pos-item-stock">Категория</div>
                </div>
                <div style="font-size: 24px;">›</div>
            </div>
        `;
    });
    
    document.getElementById('receivingSearchList').innerHTML = html;
    document.getElementById('receivingBreadcrumb').innerHTML = '<div class="pos-breadcrumb-item" onclick="loadReceivingCategories()">📦 Все категории</div>';
}

// Load receiving subcategories
function loadReceivingSubcategories(categoryId, categoryName) {
    receivingCurrentCategory = categoryId;
    
    const uniqueSubcategories = {};
    allProducts.filter(p => p.category_id === categoryId).forEach(p => {
        if (!uniqueSubcategories[p.subcategory_id]) {
            uniqueSubcategories[p.subcategory_id] = {
                id: p.subcategory_id,
                name: p.subcategory_name
            };
        }
    });
    
    let html = '';
    Object.values(uniqueSubcategories).forEach(sub => {
        html += `
            <div class="pos-item" onclick="loadReceivingProducts(${sub.id}, '${sub.name}')">
                <div class="pos-item-info">
                    <div class="pos-item-name">📋 ${sub.name}</div>
                    <div class="pos-item-stock">Подкатегория</div>
                </div>
                <div style="font-size: 24px;">›</div>
            </div>
        `;
    });
    
    document.getElementById('receivingSearchList').innerHTML = html;
    document.getElementById('receivingBreadcrumb').innerHTML = `
        <div class="pos-breadcrumb-item" onclick="loadReceivingCategories()">📦 Все категории</div>
        <div class="pos-breadcrumb-item">${categoryName}</div>
    `;
}

// Load receiving products
function loadReceivingProducts(subcategoryId, subcategoryName) {
    const products = allProducts.filter(p => p.subcategory_id === subcategoryId);
    
    let html = '';
    products.forEach(p => {
        const alreadyAdded = receivingItems.find(item => item.product_id === p.id);
        
        html += `
            <div class="pos-item" onclick="addToReceiving(${p.id})" ${alreadyAdded ? 'style="opacity: 0.5;"' : ''}>
                <div class="pos-item-info">
                    <div class="pos-item-name">${p.name} ${alreadyAdded ? '✓' : ''}</div>
                    <div class="pos-item-stock">Текущий остаток: ${p.stock_quantity} шт</div>
                </div>
                <div style="font-size: 20px;">${alreadyAdded ? '✓' : '+'}</div>
            </div>
        `;
    });
    
    document.getElementById('receivingSearchList').innerHTML = html;
    
    const categoryName = allProducts.find(p => p.subcategory_id === subcategoryId)?.category_name || '';
    document.getElementById('receivingBreadcrumb').innerHTML = `
        <div class="pos-breadcrumb-item" onclick="loadReceivingCategories()">📦 Все категории</div>
        <div class="pos-breadcrumb-item" onclick="loadReceivingSubcategories(${receivingCurrentCategory}, '${categoryName}')">${categoryName}</div>
        <div class="pos-breadcrumb-item">${subcategoryName}</div>
    `;
}

// Search receiving products
function searchReceivingProducts() {
    const query = document.getElementById('receivingSearchInput').value.toLowerCase();
    
    if (!query) {
        loadReceivingCategories();
        return;
    }
    
    const filtered = allProducts.filter(p => 
        p.name.toLowerCase().includes(query) || 
        (p.sku && p.sku.toLowerCase().includes(query))
    );
    
    let html = '';
    filtered.forEach(p => {
        const alreadyAdded = receivingItems.find(item => item.product_id === p.id);
        
        html += `
            <div class="pos-item" onclick="addToReceiving(${p.id})" ${alreadyAdded ? 'style="opacity: 0.5;"' : ''}>
                <div class="pos-item-info">
                    <div class="pos-item-name">${p.name} ${alreadyAdded ? '✓' : ''}</div>
                    <div class="pos-item-stock">Остаток: ${p.stock_quantity} шт • ${p.category_name} › ${p.subcategory_name}</div>
                </div>
                <div style="font-size: 20px;">${alreadyAdded ? '✓' : '+'}</div>
            </div>
        `;
    });
    
    document.getElementById('receivingSearchList').innerHTML = html;
}

// Add product to receiving list
function addToReceiving(productId) {
    const product = allProducts.find(p => p.id === productId);
    const alreadyAdded = receivingItems.find(item => item.product_id === productId);
    
    if (alreadyAdded) {
        alert('Товар уже добавлен в список');
        return;
    }
    
    receivingItems.push({
        product_id: productId,
        name: product.name,
        sku: product.sku,
        current_stock: product.stock_quantity,
        purchase_price: product.purchase_price || 0,
        sale_price: product.sale_price || 0,
        quantity: 1
    });
    
    updateReceivingList();
    closeModal('receivingSearchModal');
}

// Update receiving list display
function updateReceivingList() {
    if (receivingItems.length === 0) {
        document.getElementById('receivingItemsList').innerHTML = '<p style="color: #ccc; text-align: center; padding: 40px;">Нажмите "Добавить товар" для начала оприходования</p>';
        document.getElementById('receivingSaveBtn').style.display = 'none';
        return;
    }
    
    let html = '<div style="display: flex; flex-direction: column; gap: 15px;">';
    
    receivingItems.forEach((item, index) => {
        html += `
            <div style="background: #3d3d3d; padding: 20px; border-radius: 8px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                    <strong style="font-size: 16px;">${item.name}</strong>
                    <button class="btn btn-danger" onclick="removeFromReceiving(${index})" style="padding: 5px 10px;">Удалить</button>
                </div>
                
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px;">
                    <div class="form-group" style="margin: 0;">
                        <label>Количество</label>
                        <input type="number" value="${item.quantity}" min="1" onchange="updateReceivingItem(${index}, 'quantity', this.value)">
                    </div>
                    <div class="form-group" style="margin: 0;">
                        <label>Цена закупки ($)</label>
                        <input type="number" value="${item.purchase_price}" step="0.01" onchange="updateReceivingItem(${index}, 'purchase_price', this.value)">
                    </div>
                    <div class="form-group" style="margin: 0;">
                        <label>Цена продажи ($)</label>
                        <input type="number" value="${item.sale_price}" step="0.01" onchange="updateReceivingItem(${index}, 'sale_price', this.value)">
                    </div>
                </div>
                
                <div style="margin-top: 10px; color: #ccc; font-size: 14px;">
                    Текущий остаток: ${item.current_stock} шт → После оприходования: ${item.current_stock + parseInt(item.quantity)} шт
                </div>
            </div>
        `;
    });
    
    html += '</div>';
    
    document.getElementById('receivingItemsList').innerHTML = html;
    document.getElementById('receivingSaveBtn').style.display = 'block';
}

// Update receiving item
function updateReceivingItem(index, field, value) {
    receivingItems[index][field] = field === 'quantity' ? parseInt(value) : parseFloat(value);
    updateReceivingList();
}

// Remove from receiving
function removeFromReceiving(index) {
    receivingItems.splice(index, 1);
    updateReceivingList();
}

// Save receiving
async function saveReceiving() {
    if (receivingItems.length === 0) return;
    
    if (!confirm(`Оприходовать ${receivingItems.length} товар(ов)?`)) return;
    
    try {
        const response = await apiCall('/api/warehouse/inventory/receive-batch', {
            method: 'POST',
            body: JSON.stringify({ items: receivingItems })
        });
        
        if (response && response.ok) {
            alert('✅ Товары успешно оприходованы!');
            receivingItems = [];
            closeModal('receivingModal');
            
            // Reload warehouse if on that section
            if (currentWarehouseTab === 'stock') {
                loadCategories();
            }
        } else {
            const error = await response.json();
            alert('Ошибка: ' + (error.error || 'Не удалось оприходовать товары'));
        }
    } catch (error) {
        console.error('Save receiving error:', error);
        alert('Ошибка при сохранении');
    }
}

// ==================== EDIT PRODUCT PRICES ====================

let currentEditProductId = null;

// Show edit product modal
async function showEditProductModal(productId) {
    currentEditProductId = productId;
    
    const product = products.find(p => p.id === productId);
    if (!product) return;
    
    document.getElementById('editProductName').value = product.name;
    document.getElementById('editProductSKU').value = product.sku || '';
    document.getElementById('editProductPurchasePrice').value = product.purchase_price || '';
    document.getElementById('editProductSalePrice').value = product.sale_price || '';
    document.getElementById('editProductMinStock').value = product.min_stock_level || 0;
    
    document.getElementById('editProductModal').style.display = 'block';
}

// Save product edit
async function saveProductEdit() {
    if (!currentEditProductId) return;
    
    const data = {
        sku: document.getElementById('editProductSKU').value,
        purchase_price: parseFloat(document.getElementById('editProductPurchasePrice').value) || null,
        sale_price: parseFloat(document.getElementById('editProductSalePrice').value) || null,
        min_stock_level: parseInt(document.getElementById('editProductMinStock').value) || 0
    };
    
    try {
        const response = await apiCall(`/api/warehouse/products/${currentEditProductId}`, {
            method: 'PUT',
            body: JSON.stringify(data)
        });
        
        if (response && response.ok) {
            alert('✅ Товар обновлен!');
            closeModal('editProductModal');
            
            // Reload products
            loadProducts(currentSubcategoryId);
        } else {
            alert('Ошибка при обновлении товара');
        }
    } catch (error) {
        console.error('Update product error:', error);
        alert('Ошибка при обновлении');
    }
        }
