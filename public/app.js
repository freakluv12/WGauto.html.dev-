// WGauto CRM - Updated version with Sales & Inventory Management
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

// Cart for POS
let cart = [];

// Initialize app
document.addEventListener('DOMContentLoaded', function() {
    checkAuthStatus();
});

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
        analytics: 'Analytics',
        cars: 'Cars',
        rentals: 'Rentals',
        sales: 'Sales',
        products: 'Products',
        pos: 'Point of Sale',
        admin: 'Admin Panel'
    };
    document.getElementById('pageTitle').textContent = titles[sectionName];

    switch(sectionName) {
        case 'analytics':
            loadAnalytics();
            break;
        case 'cars':
            loadCars();
            break;
        case 'rentals':
            loadRentals();
            break;
        case 'sales':
            loadSalesSection();
            break;
        case 'products':
            loadProductsSection();
            break;
        case 'pos':
            loadPOS();
            break;
        case 'admin':
            loadUsers();
            break;
    }
}

// ==================== ANALYTICS ====================
async function loadAnalytics() {
    const startDate = document.getElementById('analyticsStartDate').value;
    const endDate = document.getElementById('analyticsEndDate').value;
    
    try {
        let url = '/api/stats/dashboard';
        const params = new URLSearchParams();
        if (startDate) params.append('start_date', startDate);
        if (endDate) params.append('end_date', endDate);
        if (params.toString()) url += '?' + params.toString();
        
        const response = await apiCall(url);
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
        console.error('Analytics load error:', error);
        document.getElementById('statsGrid').innerHTML = '<div class="loading">Error loading analytics data</div>';
    }
}

// ==================== CARS (unchanged) ====================
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

// ==================== RENTALS (unchanged) ====================
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
            loadAnalytics();
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

// ==================== SALES SECTION ====================
function loadSalesSection() {
    showSalesTab('profitability');
}

function showSalesTab(tabName) {
    const tabContents = document.querySelectorAll('#sales .tab-content');
    tabContents.forEach(content => content.classList.remove('active'));
    
    const tabButtons = document.querySelectorAll('#sales .tab');
    tabButtons.forEach(button => button.classList.remove('active'));
    
    if (tabName === 'profitability') {
        document.getElementById('salesProfitability').classList.add('active');
        document.querySelector('#sales .tab').classList.add('active');
        loadSalesProfitability();
    } else if (tabName === 'consignment') {
        document.getElementById('salesConsignment').classList.add('active');
        document.querySelectorAll('#sales .tab')[1].classList.add('active');
    }
}

let profitabilityData = [];
let profitabilitySortColumn = 'net_profit';
let profitabilitySortDirection = 'desc';

async function loadSalesProfitability() {
    const startDate = document.getElementById('profitStartDate').value;
    const endDate = document.getElementById('profitEndDate').value;
    
    try {
        let url = '/api/warehouse/analytics?';
        if (startDate) url += `start_date=${startDate}&`;
        if (endDate) url += `end_date=${endDate}`;
        
        const response = await apiCall(url);
        if (!response) return;
        
        const data = await response.json();
        profitabilityData = data.items;
        
        displayProfitability();
        displayProfitabilityTotals(data.totals);
        
    } catch (error) {
        console.error('Profitability error:', error);
    }
}

function sortProfitability(column) {
    if (profitabilitySortColumn === column) {
        profitabilitySortDirection = profitabilitySortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        profitabilitySortColumn = column;
        profitabilitySortDirection = 'desc';
    }
    
    displayProfitability();
}

function displayProfitability() {
    const sorted = [...profitabilityData].sort((a, b) => {
        let aVal = parseFloat(a[profitabilitySortColumn]) || 0;
        let bVal = parseFloat(b[profitabilitySortColumn]) || 0;
        
        return profitabilitySortDirection === 'asc' ? aVal - bVal : bVal - aVal;
    });
    
    let html = '';
    if (sorted.length === 0) {
        html = '<tr><td colspan="8">No sales data</td></tr>';
    } else {
        sorted.forEach(item => {
            const profitMargin = parseFloat(item.profit_margin_percent || 0).toFixed(2);
            const markup = parseFloat(item.markup_percent || 0).toFixed(2);
            
            html += `
                <tr>
                    <td>${item.product_name}</td>
                    <td>${item.category_name} > ${item.subcategory_name}</td>
                    <td>${item.total_sold}</td>
                    <td>${getCurrencySymbol(item.currency)}${parseFloat(item.total_revenue || 0).toFixed(2)}</td>
                    <td>${getCurrencySymbol(item.currency)}${parseFloat(item.total_cost || 0).toFixed(2)}</td>
                    <td class="${parseFloat(item.net_profit) >= 0 ? 'positive' : 'negative'}">
                        ${getCurrencySymbol(item.currency)}${parseFloat(item.net_profit || 0).toFixed(2)}
                    </td>
                    <td>${profitMargin}%</td>
                    <td>${markup}%</td>
                </tr>
            `;
        });
    }
    
    document.querySelector('#profitabilityTable tbody').innerHTML = html;
}

function displayProfitabilityTotals(totals) {
    let html = '';
    if (totals && totals.length > 0) {
        totals.forEach(total => {
            html += `
                <div class="profit-card">
                    <div class="currency-label">${total.currency} Items Sold</div>
                    <div class="amount">${total.total_sold} pcs</div>
                </div>
                <div class="profit-card">
                    <div class="currency-label">${total.currency} Revenue</div>
                    <div class="amount positive">${getCurrencySymbol(total.currency)}${parseFloat(total.total_revenue).toFixed(2)}</div>
                </div>
                <div class="profit-card">
                    <div class="currency-label">${total.currency} Cost</div>
                    <div class="amount">${getCurrencySymbol(total.currency)}${parseFloat(total.total_cost).toFixed(2)}</div>
                </div>
                <div class="profit-card">
                    <div class="currency-label">${total.currency} Net Profit</div>
                    <div class="amount ${parseFloat(total.net_profit) >= 0 ? 'positive' : 'negative'}">
                        ${getCurrencySymbol(total.currency)}${parseFloat(total.net_profit).toFixed(2)}
                    </div>
                </div>
                <div class="profit-card">
                    <div class="currency-label">${total.currency} Margin</div>
                    <div class="amount">${total.profit_margin_percent}%</div>
                </div>
            `;
        });
    }
    
    document.getElementById('profitabilityTotals').innerHTML = html;
}

// ==================== PRODUCTS SECTION ====================
function loadProductsSection() {
    showProductsTab('products');
}

function showProductsTab(tabName) {
    const tabContents = document.querySelectorAll('#products .tab-content');
    tabContents.forEach(content => content.classList.remove('active'));
    
    const tabButtons = document.querySelectorAll('#products .tab');
    tabButtons.forEach(button => button.classList.remove('active'));
    
    if (tabName === 'products') {
        document.getElementById('productsManagement').classList.add('active');
        document.querySelector('#products .tab').classList.add('active');
        loadProductsCategories();
    } else if (tabName === 'writeoffs') {
        document.getElementById('productsWriteoffs').classList.add('active');
        document.querySelectorAll('#products .tab')[1].classList.add('active');
        loadWriteoffs();
    }
}

// Show receiving modal
function showReceivingModal() {
    receivingList = [];
    document.getElementById('receivingModal').style.display = 'block';
    document.getElementById('receivingSearchInput').value = '';
    document.getElementById('receivingSearchResults').innerHTML = '';
    updateReceivingListDisplay();
}

async function loadProductsCategories() {
    currentCategoryId = null;
    currentSubcategoryId = null;
    
    try {
        const response = await apiCall('/api/warehouse/categories');
        if (!response) return;

        categories = await response.json();
        
        let html = '';
        if (categories.length === 0) {
            html = `
                <div class="loading">
                    <p>No categories yet. Create your first category.</p>
                    <button class="btn" onclick="showAddCategoryModal()">+ Add Category</button>
                </div>
            `;
        } else {
            html = `
                <div style="display: flex; justify-content: space-between; margin-bottom: 20px;">
                    <input type="text" id="productsGlobalSearch" placeholder="🔍 Search all products..." 
                           style="flex: 1; max-width: 400px; padding: 10px; border: 1px solid #555; border-radius: 4px; background: #3d3d3d; color: #fff;"
                           oninput="searchAllProducts()">
                    <button class="btn" onclick="showAddCategoryModal()">+ Add Category</button>
                </div>
                <div class="categories-grid">
            `;
            
            categories.forEach(cat => {
                html += `
                    <div class="category-card" onclick="loadProductsSubcategories(${cat.id})">
                        <div class="category-icon">${cat.icon || '📦'}</div>
                        <div class="category-name">${cat.name}</div>
                        <div class="category-desc">${cat.description || ''}</div>
                        <div class="category-count">${cat.product_count || 0} products</div>
                    </div>
                `;
            });
            
            html += '</div>';
        }
        
        document.getElementById('productsContent').innerHTML = html;
    } catch (error) {
        console.error('Load categories error:', error);
    }
}

async function loadProductsSubcategories(categoryId) {
    currentCategoryId = categoryId;
    currentSubcategoryId = null;
    
    try {
        const response = await apiCall(`/api/warehouse/subcategories/${categoryId}`);
        if (!response) return;

        subcategories = await response.json();
        const category = categories.find(c => c.id === categoryId);
        
        let html = `
            <div style="margin-bottom: 20px;">
                <button class="btn" onclick="loadProductsCategories()">← Back to Categories</button>
                <button class="btn" onclick="loadProductsCategories()" style="margin-left: 10px;">All Categories</button>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 20px;">
                <h3>${category.name} - Subcategories</h3>
                <button class="btn" onclick="showAddSubcategoryModal()">+ Add Subcategory</button>
            </div>
        `;
        
        if (subcategories.length === 0) {
            html += `
                <div class="loading">
                    <p>No subcategories in ${category.name}</p>
                </div>
            `;
        } else {
            html += '<div class="categories-grid">';
            
            subcategories.forEach(sub => {
                html += `
                    <div class="category-card" onclick="loadProductsList(${sub.id})">
                        <div class="category-icon">📋</div>
                        <div class="category-name">${sub.name}</div>
                        <div class="category-desc">${sub.description || ''}</div>
                        <div class="category-count">${sub.product_count || 0} products</div>
                    </div>
                `;
            });
            
            html += '</div>';
        }
        
        document.getElementById('productsContent').innerHTML = html;
    } catch (error) {
        console.error('Load subcategories error:', error);
    }
}

async function loadProductsList(subcategoryId) {
    currentSubcategoryId = subcategoryId;
    
    try {
        const response = await apiCall(`/api/warehouse/products/${subcategoryId}`);
        if (!response) return;

        products = await response.json();
        const subcategory = subcategories.find(s => s.id === subcategoryId);
        const category = categories.find(c => c.id === currentCategoryId);
        
        let html = `
            <div style="margin-bottom: 20px;">
                <button class="btn" onclick="loadProductsSubcategories(${currentCategoryId})">← Back to ${category.name}</button>
                <button class="btn" onclick="loadProductsCategories()" style="margin-left: 10px;">All Categories</button>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                <h3>${category.name} > ${subcategory.name}</h3>
                <button class="btn" onclick="showAddProductModal()">+ Add Product</button>
            </div>
        `;
        
        if (products.length === 0) {
            html += '<div class="loading"><p>No products yet</p></div>';
        } else {
            html += `
                <div class="products-list">
            `;
            
            products.forEach(p => {
                const lowStock = parseInt(p.total_quantity || 0) <= parseInt(p.min_stock_level);
                html += `
                    <div class="product-card">
                        <div class="product-header">
                            <div class="product-name">${p.name}</div>
                            <div class="product-stock ${lowStock ? 'low-stock' : ''}">${p.total_quantity || 0} pcs</div>
                        </div>
                        <div class="product-details">
                            <div>SKU: ${p.sku || 'N/A'}</div>
                            <div>Min: ${p.min_stock_level} pcs</div>
                        </div>
                        <div class="product-actions">
                            <button class="btn" onclick="showProductDetails(${p.id})">Details</button>
                            <button class="btn" onclick="quickReceiveProduct(${p.id})">Receive</button>
                            <button class="btn btn-danger" onclick="quickWriteoffProduct(${p.id})">Write-off</button>
                        </div>
                    </div>
                `;
            });
            
            html += '</div>';
        }
        
        document.getElementById('productsContent').innerHTML = html;
    } catch (error) {
        console.error('Load products error:', error);
    }
}

async function searchAllProducts() {
    const searchTerm = document.getElementById('productsGlobalSearch').value.toLowerCase();
    
    if (searchTerm.length < 2) {
        loadProductsCategories();
        return;
    }
    
    try {
        const response = await apiCall(`/api/warehouse/products/search?q=${encodeURIComponent(searchTerm)}`);
        if (!response) return;
        
        const results = await response.json();
        
        let html = `
            <div style="margin-bottom: 20px;">
                <button class="btn" onclick="loadProductsCategories()">← Back to Categories</button>
            </div>
            <h3>Search Results for "${searchTerm}"</h3>
        `;
        
        if (results.length === 0) {
            html += '<div class="loading"><p>No products found</p></div>';
        } else {
            html += '<div class="products-list">';
            
            results.forEach(p => {
                const lowStock = parseInt(p.total_quantity || 0) <= parseInt(p.min_stock_level);
                html += `
                    <div class="product-card">
                        <div class="product-header">
                            <div class="product-name">${p.name}</div>
                            <div class="product-stock ${lowStock ? 'low-stock' : ''}">${p.total_quantity || 0} pcs</div>
                        </div>
                        <div class="product-details">
                            <div>${p.category_name} > ${p.subcategory_name}</div>
                            <div>SKU: ${p.sku || 'N/A'}</div>
                        </div>
                        <div class="product-actions">
                            <button class="btn" onclick="showProductDetails(${p.id})">Details</button>
                        </div>
                    </div>
                `;
            });
            
            html += '</div>';
        }
        
        document.getElementById('productsContent').innerHTML = html;
    } catch (error) {
        console.error('Search error:', error);
    }
}

async function showProductDetails(productId) {
    currentProductId = productId;
    
    try {
        const response = await apiCall(`/api/warehouse/inventory/${productId}`);
        if (!response) return;

        inventory = await response.json();
        const product = products.find(p => p.id === productId) || inventory[0];
        
        document.getElementById('productDetailsName').textContent = product.name || 'Product Details';
        document.getElementById('productDetailsSKU').textContent = product.sku || 'N/A';
        document.getElementById('productDetailsTotal').textContent = product.total_quantity || 0;
        
        let inventoryHTML = '';
        if (inventory.length === 0) {
            inventoryHTML = '<tr><td colspan="6">No inventory</td></tr>';
        } else {
            inventoryHTML = inventory.map(inv => `
                <tr>
                    <td>${inv.source_name || 'N/A'}</td>
                    <td>${inv.quantity}</td>
                    <td>${inv.purchase_price ? getCurrencySymbol(inv.currency) + inv.purchase_price : 'N/A'}</td>
                    <td>${inv.location || 'N/A'}</td>
                    <td>${new Date(inv.received_date).toLocaleDateString()}</td>
                    <td>${inv.days_in_storage} days</td>
                </tr>
            `).join('');
        }
        
        document.querySelector('#productInventoryTable tbody').innerHTML = inventoryHTML;
        document.getElementById('productDetailsModal').style.display = 'block';
    } catch (error) {
        console.error('Show product details error:', error);
    }
}

function quickReceiveProduct(productId) {
    currentProductId = productId;
    showQuickReceiveModal();
}

function quickWriteoffProduct(productId) {
    currentProductId = productId;
    showQuickWriteoffModal();
}

// Receiving Interface
let receivingList = [];

async function searchProductsForReceiving() {
    const searchTerm = document.getElementById('receivingSearchInput').value.toLowerCase();
    
    if (searchTerm.length < 2) {
        document.getElementById('receivingSearchResults').innerHTML = '';
        return;
    }
    
    try {
        const response = await apiCall(`/api/warehouse/products/search?q=${encodeURIComponent(searchTerm)}`);
        if (!response) return;
        
        const results = await response.json();
        
        let html = '<div class="products-list">';
        
        if (results.length === 0) {
            html += '<div class="loading">No products found</div>';
        } else {
            results.forEach(p => {
                html += `
                    <div class="product-card">
                        <div class="product-header">
                            <div class="product-name">${p.name}</div>
                            <div class="product-stock">${p.total_quantity || 0} pcs</div>
                        </div>
                        <div class="product-details">
                            <div>${p.category_name} > ${p.subcategory_name}</div>
                            <div>SKU: ${p.sku || 'N/A'}</div>
                        </div>
                        <div class="product-actions">
                            <button class="btn" onclick="addToReceivingList(${p.id}, '${p.name.replace(/'/g, "\\'")}')">Add to List</button>
                        </div>
                    </div>
                `;
            });
        }
        
        html += '</div>';
        
        document.getElementById('receivingSearchResults').innerHTML = html;
    } catch (error) {
        console.error('Search error:', error);
    }
}

function showReceivingAddProductModal() {
    // Open modal to add new product from receiving
    currentCategoryId = null;
    currentSubcategoryId = null;
    loadReceivingProductCategories();
    document.getElementById('receivingAddProductModal').style.display = 'block';
}

async function loadReceivingProductCategories() {
    try {
        const response = await apiCall('/api/warehouse/categories');
        if (!response) return;

        const cats = await response.json();
        
        let html = '<h3>Select Category</h3><div class="categories-grid">';
        
        cats.forEach(cat => {
            html += `
                <div class="category-card" onclick="loadReceivingProductSubcategories(${cat.id})">
                    <div class="category-icon">${cat.icon || '📦'}</div>
                    <div class="category-name">${cat.name}</div>
                </div>
            `;
        });
        
        html += '</div>';
        document.getElementById('receivingProductModalContent').innerHTML = html;
    } catch (error) {
        console.error('Error loading categories:', error);
    }
}

async function loadReceivingProductSubcategories(categoryId) {
    currentCategoryId = categoryId;
    
    try {
        const response = await apiCall(`/api/warehouse/subcategories/${categoryId}`);
        if (!response) return;

        const subs = await response.json();
        
        let html = `
            <button class="btn" onclick="loadReceivingProductCategories()">← Back</button>
            <h3 style="margin-top: 15px;">Select Subcategory</h3>
            <div class="categories-grid">
        `;
        
        subs.forEach(sub => {
            html += `
                <div class="category-card" onclick="showReceivingProductForm(${sub.id})">
                    <div class="category-icon">📋</div>
                    <div class="category-name">${sub.name}</div>
                </div>
            `;
        });
        
        html += '</div>';
        document.getElementById('receivingProductModalContent').innerHTML = html;
    } catch (error) {
        console.error('Error loading subcategories:', error);
    }
}

function showReceivingProductForm(subcategoryId) {
    currentSubcategoryId = subcategoryId;
    
    let html = `
        <button class="btn" onclick="loadReceivingProductSubcategories(${currentCategoryId})">← Back</button>
        <h3 style="margin-top: 15px;">Add New Product</h3>
        <div class="form-group">
            <label>Name</label>
            <input type="text" id="receivingNewProductName">
        </div>
        <div class="form-group">
            <label>Description</label>
            <textarea id="receivingNewProductDesc" rows="2"></textarea>
        </div>
        <div class="form-group">
            <label>SKU</label>
            <input type="text" id="receivingNewProductSKU">
        </div>
        <div class="form-group">
            <label>Minimum Stock Level</label>
            <input type="number" id="receivingNewProductMinStock" value="0" min="0">
        </div>
        <button class="btn" onclick="createReceivingProduct()">Create & Add to Receiving List</button>
    `;
    
    document.getElementById('receivingProductModalContent').innerHTML = html;
}

async function createReceivingProduct() {
    const data = {
        subcategory_id: currentSubcategoryId,
        name: document.getElementById('receivingNewProductName').value,
        description: document.getElementById('receivingNewProductDesc').value,
        sku: document.getElementById('receivingNewProductSKU').value,
        min_stock_level: parseInt(document.getElementById('receivingNewProductMinStock').value) || 0
    };
    
    if (!data.name) {
        alert('Name is required');
        return;
    }
    
    try {
        const response = await apiCall('/api/warehouse/products', {
            method: 'POST',
            body: JSON.stringify(data)
        });
        
        if (response && response.ok) {
            const product = await response.json();
            
            // Add to receiving list
            addToReceivingList(product.id, product.name);
            
            closeModal('receivingAddProductModal');
            alert('Product created and added to receiving list');
        } else {
            alert('Failed to create product');
        }
    } catch (error) {
        alert('Error: ' + error.message);
    }
}

function addToReceivingList(productId, productName) {
    if (receivingList.find(item => item.productId === productId)) {
        alert('Product already in receiving list');
        return;
    }
    
    receivingList.push({
        productId: productId,
        productName: productName,
        quantity: 1,
        price: 0,
        currency: 'USD',
        location: ''
    });
    
    updateReceivingListDisplay();
}

function updateReceivingListDisplay() {
    if (receivingList.length === 0) {
        document.getElementById('receivingListContent').innerHTML = '<div class="loading">Add products to start receiving</div>';
        return;
    }
    
    let html = '<div class="receiving-list">';
    
    receivingList.forEach((item, index) => {
        html += `
            <div class="receiving-item">
                <div style="font-weight: bold;">${item.productName}</div>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin-top: 10px;">
                    <div>
                        <label>Quantity:</label>
                        <input type="number" value="${item.quantity}" min="1" 
                               onchange="updateReceivingItem(${index}, 'quantity', this.value)"
                               style="width: 100%; padding: 5px; background: #3d3d3d; border: 1px solid #555; color: #fff; border-radius: 4px;">
                    </div>
                    <div>
                        <label>Price:</label>
                        <input type="number" step="0.01" value="${item.price}" min="0"
                               onchange="updateReceivingItem(${index}, 'price', this.value)"
                               style="width: 100%; padding: 5px; background: #3d3d3d; border: 1px solid #555; color: #fff; border-radius: 4px;">
                    </div>
                    <div>
                        <label>Currency:</label>
                        <select onchange="updateReceivingItem(${index}, 'currency', this.value)"
                                style="width: 100%; padding: 5px; background: #3d3d3d; border: 1px solid #555; color: #fff; border-radius: 4px;">
                            <option value="USD" ${item.currency === 'USD' ? 'selected' : ''}>USD ($)</option>
                            <option value="EUR" ${item.currency === 'EUR' ? 'selected' : ''}>EUR (€)</option>
                            <option value="GEL" ${item.currency === 'GEL' ? 'selected' : ''}>GEL (₾)</option>
                            <option value="RUB" ${item.currency === 'RUB' ? 'selected' : ''}>RUB (₽)</option>
                        </select>
                    </div>
                    <div>
                        <label>Location:</label>
                        <input type="text" value="${item.location}" placeholder="A-5"
                               onchange="updateReceivingItem(${index}, 'location', this.value)"
                               style="width: 100%; padding: 5px; background: #3d3d3d; border: 1px solid #555; color: #fff; border-radius: 4px;">
                    </div>
                </div>
                <div style="margin-top: 10px;">
                    <strong>Total: ${getCurrencySymbol(item.currency)}${(item.quantity * item.price).toFixed(2)}</strong>
                    <button class="btn btn-danger" style="float: right;" onclick="removeFromReceivingList(${index})">Remove</button>
                </div>
            </div>
        `;
    });
    
    html += '</div>';
    
    document.getElementById('receivingListContent').innerHTML = html;
}

function updateReceivingItem(index, field, value) {
    receivingList[index][field] = field === 'quantity' || field === 'price' ? parseFloat(value) : value;
    updateReceivingListDisplay();
}

function removeFromReceivingList(index) {
    receivingList.splice(index, 1);
    updateReceivingListDisplay();
}

function clearReceivingList() {
    if (confirm('Clear all items from receiving list?')) {
        receivingList = [];
        updateReceivingListDisplay();
    }
}

async function completeReceiving() {
    if (receivingList.length === 0) {
        alert('Add products to receiving list first');
        return;
    }
    
    try {
        const response = await apiCall('/api/warehouse/inventory/receive/batch', {
            method: 'POST',
            body: JSON.stringify({ items: receivingList })
        });
        
        if (response && response.ok) {
            alert('Receiving completed successfully');
            closeModal('receivingModal');
            // Refresh products list if we're in products section
            if (currentSubcategoryId) {
                loadProductsList(currentSubcategoryId);
            }
        } else {
            alert('Failed to complete receiving');
        }
    } catch (error) {
        alert('Error: ' + error.message);
    }
}

// Write-offs
async function loadWriteoffs() {
    try {
        const response = await apiCall('/api/warehouse/writeoffs');
        if (!response) return;
        
        const writeoffs = await response.json();
        
        let html = `
            <div style="margin-bottom: 20px;">
                <button class="btn" onclick="showAddWriteoffModal()">+ Write-off Product</button>
            </div>
            <table class="table">
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Product</th>
                        <th>Quantity</th>
                        <th>Value</th>
                        <th>Reason</th>
                    </tr>
                </thead>
                <tbody>
        `;
        
        if (writeoffs.length === 0) {
            html += '<tr><td colspan="5">No write-offs</td></tr>';
        } else {
            writeoffs.forEach(w => {
                html += `
                    <tr>
                        <td>${new Date(w.writeoff_date).toLocaleDateString()}</td>
                        <td>${w.product_name}</td>
                        <td>${w.quantity} pcs</td>
                        <td>${getCurrencySymbol(w.currency)}${parseFloat(w.total_value || 0).toFixed(2)}</td>
                        <td>${w.reason || 'N/A'}</td>
                    </tr>
                `;
            });
        }
        
        html += '</tbody></table>';
        
        document.getElementById('writeoffsContent').innerHTML = html;
    } catch (error) {
        console.error('Load writeoffs error:', error);
    }
}

// Quick modals
function showQuickReceiveModal() {
    document.getElementById('quickReceiveModal').style.display = 'block';
}

function showQuickWriteoffModal() {
    document.getElementById('quickWriteoffModal').style.display = 'block';
}

async function quickReceiveSubmit() {
    const data = {
        product_id: currentProductId,
        quantity: parseInt(document.getElementById('quickReceiveQty').value),
        purchase_price: parseFloat(document.getElementById('quickReceivePrice').value) || 0,
        currency: document.getElementById('quickReceiveCurrency').value,
        location: document.getElementById('quickReceiveLocation').value,
        source_type: 'purchased'
    };
    
    if (!data.quantity || data.quantity <= 0) {
        alert('Enter valid quantity');
        return;
    }
    
    try {
        const response = await apiCall('/api/warehouse/inventory/receive', {
            method: 'POST',
            body: JSON.stringify(data)
        });
        
        if (response && response.ok) {
            closeModal('quickReceiveModal');
            document.getElementById('quickReceiveQty').value = '';
            document.getElementById('quickReceivePrice').value = '';
            document.getElementById('quickReceiveLocation').value = '';
            loadProductsList(currentSubcategoryId);
        } else {
            alert('Failed to receive inventory');
        }
    } catch (error) {
        alert('Error: ' + error.message);
    }
}

async function quickWriteoffSubmit() {
    const data = {
        product_id: currentProductId,
        quantity: parseInt(document.getElementById('quickWriteoffQty').value),
        reason: document.getElementById('quickWriteoffReason').value
    };
    
    if (!data.quantity || data.quantity <= 0) {
        alert('Enter valid quantity');
        return;
    }
    
    try {
        const response = await apiCall('/api/warehouse/writeoffs', {
            method: 'POST',
            body: JSON.stringify(data)
        });
        
        if (response && response.ok) {
            closeModal('quickWriteoffModal');
            document.getElementById('quickWriteoffQty').value = '';
            document.getElementById('quickWriteoffReason').value = '';
            loadProductsList(currentSubcategoryId);
        } else {
            alert('Failed to write-off');
        }
    } catch (error) {
        alert('Error: ' + error.message);
    }
}

// Add category/subcategory/product
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
        alert('Name is required');
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
            loadProductsCategories();
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
        alert('Name is required');
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
            loadProductsSubcategories(currentCategoryId);
        } else {
            alert('Failed to add subcategory');
        }
    } catch (error) {
        alert('Error: ' + error.message);
    }
}

function showAddProductModal() {
    if (!currentSubcategoryId) {
        alert('Please select a subcategory first');
        return;
    }
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
        alert('Name is required');
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
            loadProductsList(currentSubcategoryId);
        } else {
            alert('Failed to add product');
        }
    } catch (error) {
        alert('Error: ' + error.message);
    }
}

function showAddWriteoffModal() {
    document.getElementById('addWriteoffModal').style.display = 'block';
}

// ==================== POS (Point of Sale) ====================
async function loadPOS() {
    cart = [];
    updatePOSDisplay();
}

async function searchPOSProducts() {
    const searchTerm = document.getElementById('posSearch').value.toLowerCase();
    
    if (searchTerm.length < 2) {
        document.getElementById('posSearchResults').innerHTML = '';
        return;
    }
    
    try {
        const response = await apiCall(`/api/warehouse/products/search?q=${encodeURIComponent(searchTerm)}`);
        if (!response) return;
        
        const results = await response.json();
        
        let html = '<div class="pos-search-results">';
        
        results.forEach(p => {
            if (p.total_quantity > 0) {
                html += `
                    <div class="pos-product-item" onclick="addToCart(${p.id}, '${p.name.replace(/'/g, "\\'")}', ${p.total_quantity})">
                        <div><strong>${p.name}</strong></div>
                        <div style="color: #ccc;">${p.category_name} > ${p.subcategory_name}</div>
                        <div style="color: #4CAF50;">${p.total_quantity} pcs available</div>
                    </div>
                `;
            }
        });
        
        html += '</div>';
        
        document.getElementById('posSearchResults').innerHTML = html;
    } catch (error) {
        console.error('POS search error:', error);
    }
}

function addToCart(productId, productName, availableQty) {
    const existing = cart.find(item => item.productId === productId);
    
    if (existing) {
        if (existing.quantity < availableQty) {
            existing.quantity++;
        } else {
            alert('Not enough stock');
            return;
        }
    } else {
        cart.push({
            productId: productId,
            productName: productName,
            quantity: 1,
            availableQty: availableQty,
            salePrice: 0,
            currency: 'USD'
        });
    }
    
    updatePOSDisplay();
    document.getElementById('posSearch').value = '';
    document.getElementById('posSearchResults').innerHTML = '';
}

function updatePOSDisplay() {
    let html = '';
    
    if (cart.length === 0) {
        html = '<div class="loading">Cart is empty</div>';
    } else {
        cart.forEach((item, index) => {
            html += `
                <div class="cart-item">
                    <div class="cart-item-header">
                        <strong>${item.productName}</strong>
                        <button class="btn btn-danger" onclick="removeFromCart(${index})">×</button>
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin-top: 10px;">
                        <div>
                            <label>Quantity:</label>
                            <input type="number" value="${item.quantity}" min="1" max="${item.availableQty}"
                                   onchange="updateCartItem(${index}, 'quantity', this.value)"
                                   style="width: 100%; padding: 5px; background: #3d3d3d; border: 1px solid #555; color: #fff; border-radius: 4px;">
                        </div>
                        <div>
                            <label>Price:</label>
                            <input type="number" step="0.01" value="${item.salePrice}" min="0"
                                   onchange="updateCartItem(${index}, 'salePrice', this.value)"
                                   style="width: 100%; padding: 5px; background: #3d3d3d; border: 1px solid #555; color: #fff; border-radius: 4px;">
                        </div>
                        <div>
                            <label>Currency:</label>
                            <select onchange="updateCartItem(${index}, 'currency', this.value)"
                                    style="width: 100%; padding: 5px; background: #3d3d3d; border: 1px solid #555; color: #fff; border-radius: 4px;">
                                <option value="USD" ${item.currency === 'USD' ? 'selected' : ''}>USD ($)</option>
                                <option value="EUR" ${item.currency === 'EUR' ? 'selected' : ''}>EUR (€)</option>
                                <option value="GEL" ${item.currency === 'GEL' ? 'selected' : ''}>GEL (₾)</option>
                                <option value="RUB" ${item.currency === 'RUB' ? 'selected' : ''}>RUB (₽)</option>
                            </select>
                        </div>
                    </div>
                    <div style="margin-top: 10px; text-align: right;">
                        <strong>Subtotal: ${getCurrencySymbol(item.currency)}${(item.quantity * item.salePrice).toFixed(2)}</strong>
                    </div>
                </div>
            `;
        });
    }
    
    document.getElementById('posCart').innerHTML = html;
    updatePOSTotals();
}

function updateCartItem(index, field, value) {
    if (field === 'quantity') {
        const qty = parseInt(value);
        if (qty > cart[index].availableQty) {
            alert('Not enough stock');
            return;
        }
        cart[index][field] = qty;
    } else if (field === 'salePrice') {
        cart[index][field] = parseFloat(value);
    } else {
        cart[index][field] = value;
    }
    updatePOSDisplay();
}

function removeFromCart(index) {
    cart.splice(index, 1);
    updatePOSDisplay();
}

function clearCart() {
    if (confirm('Clear entire cart?')) {
        cart = [];
        updatePOSDisplay();
    }
}

async function updatePOSTotals() {
    const totals = {};
    
    cart.forEach(item => {
        const curr = item.currency;
        if (!totals[curr]) {
            totals[curr] = { revenue: 0, cost: 0 };
        }
        totals[curr].revenue += item.quantity * item.salePrice;
    });
    
    // Get cost from inventory
    for (const item of cart) {
        try {
            const response = await apiCall(`/api/warehouse/inventory/${item.productId}`);
            if (response) {
                const inv = await response.json();
                if (inv.length > 0) {
                    const avgCost = inv.reduce((sum, i) => sum + (parseFloat(i.purchase_price) || 0), 0) / inv.length;
                    const curr = item.currency;
                    totals[curr].cost += item.quantity * avgCost;
                }
            }
        } catch (e) {}
    }
    
    let html = '';
    Object.keys(totals).forEach(curr => {
        const profit = totals[curr].revenue - totals[curr].cost;
        html += `
            <div class="pos-total-card">
                <div class="currency-label">${curr} Total</div>
                <div class="amount" style="font-size: 24px; font-weight: bold;">${getCurrencySymbol(curr)}${totals[curr].revenue.toFixed(2)}</div>
            </div>
            <div class="pos-total-card">
                <div class="currency-label">${curr} Cost</div>
                <div class="amount">${getCurrencySymbol(curr)}${totals[curr].cost.toFixed(2)}</div>
            </div>
            <div class="pos-total-card">
                <div class="currency-label">${curr} Profit</div>
                <div class="amount positive">${getCurrencySymbol(curr)}${profit.toFixed(2)}</div>
            </div>
        `;
    });
    
    document.getElementById('posTotals').innerHTML = html;
}

async function completeSale() {
    if (cart.length === 0) {
        alert('Cart is empty');
        return;
    }
    
    const hasZeroPrice = cart.some(item => item.salePrice <= 0);
    if (hasZeroPrice) {
        alert('All items must have a price greater than 0');
        return;
    }
    
    const buyerName = document.getElementById('posBuyerName').value;
    const buyerPhone = document.getElementById('posBuyerPhone').value;
    const notes = document.getElementById('posNotes').value;
    
    try {
        const response = await apiCall('/api/warehouse/sales/complete', {
            method: 'POST',
            body: JSON.stringify({
                items: cart,
                buyer_name: buyerName,
                buyer_phone: buyerPhone,
                notes: notes
            })
        });
        
        if (response && response.ok) {
            alert('Sale completed successfully!');
            cart = [];
            document.getElementById('posBuyerName').value = '';
            document.getElementById('posBuyerPhone').value = '';
            document.getElementById('posNotes').value = '';
            updatePOSDisplay();
        } else {
            const error = await response.json();
            alert('Failed to complete sale: ' + (error.error || 'Unknown error'));
        }
    } catch (error) {
        alert('Error: ' + error.message);
    }
}

function showPOSAddProductModal() {
    // Reset the modal to step 1
    currentCategoryId = null;
    currentSubcategoryId = null;
    loadPOSCategories();
    document.getElementById('posAddProductModal').style.display = 'block';
}

async function loadPOSCategories() {
    try {
        const response = await apiCall('/api/warehouse/categories');
        if (!response) {
            console.error('Failed to load categories');
            return;
        }

        const cats = await response.json();
        
        if (cats.length === 0) {
            document.getElementById('posProductModalContent').innerHTML = `
                <div class="loading">
                    <p>No categories available. Please create a category first in Products section.</p>
                    <button class="btn" onclick="closeModal('posAddProductModal')">Close</button>
                </div>
            `;
            return;
        }
        
        let html = '<h3>Select Category</h3><div class="categories-grid">';
        
        cats.forEach(cat => {
            html += `
                <div class="category-card" onclick="loadPOSSubcategories(${cat.id})">
                    <div class="category-icon">${cat.icon || '📦'}</div>
                    <div class="category-name">${cat.name}</div>
                </div>
            `;
        });
        
        html += '</div>';
        document.getElementById('posProductModalContent').innerHTML = html;
    } catch (error) {
        console.error('Error loading categories:', error);
        alert('Error loading categories: ' + error.message);
    }
}

async function loadPOSSubcategories(categoryId) {
    currentCategoryId = categoryId;
    
    try {
        const response = await apiCall(`/api/warehouse/subcategories/${categoryId}`);
        if (!response) {
            console.error('Failed to load subcategories');
            return;
        }

        const subs = await response.json();
        
        if (subs.length === 0) {
            document.getElementById('posProductModalContent').innerHTML = `
                <button class="btn" onclick="loadPOSCategories()">← Back</button>
                <div class="loading" style="margin-top: 20px;">
                    <p>No subcategories in this category. Please create a subcategory first in Products section.</p>
                </div>
            `;
            return;
        }
        
        let html = `
            <button class="btn" onclick="loadPOSCategories()">← Back</button>
            <h3 style="margin-top: 15px;">Select Subcategory</h3>
            <div class="categories-grid">
        `;
        
        subs.forEach(sub => {
            html += `
                <div class="category-card" onclick="showPOSProductForm(${sub.id})">
                    <div class="category-icon">📋</div>
                    <div class="category-name">${sub.name}</div>
                </div>
            `;
        });
        
        html += '</div>';
        document.getElementById('posProductModalContent').innerHTML = html;
    } catch (error) {
        console.error('Error loading subcategories:', error);
        alert('Error loading subcategories: ' + error.message);
    }
}

function showPOSProductForm(subcategoryId) {
    currentSubcategoryId = subcategoryId;
    
    let html = `
        <button class="btn" onclick="loadPOSSubcategories(${currentCategoryId})">← Back</button>
        <h3 style="margin-top: 15px;">Add New Product</h3>
        <div class="form-group">
            <label>Name</label>
            <input type="text" id="posNewProductName" placeholder="e.g., Left Headlight">
        </div>
        <div class="form-group">
            <label>Description (Optional)</label>
            <textarea id="posNewProductDesc" rows="2" placeholder="Additional details..."></textarea>
        </div>
        <div class="form-group">
            <label>SKU (Optional)</label>
            <input type="text" id="posNewProductSKU" placeholder="e.g., TOY-OPT-001">
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
            <div class="form-group">
                <label>Sale Price</label>
                <input type="number" step="0.01" id="posNewProductPrice" placeholder="0.00">
            </div>
            <div class="form-group">
                <label>Currency</label>
                <select id="posNewProductCurrency">
                    <option value="USD">USD ($)</option>
                    <option value="EUR">EUR (€)</option>
                    <option value="GEL">GEL (₾)</option>
                    <option value="RUB">RUB (₽)</option>
                </select>
            </div>
        </div>
        <button class="btn" onclick="createPOSProduct()" style="width: 100%;">Create & Add to Cart</button>
    `;
    
    document.getElementById('posProductModalContent').innerHTML = html;
}

async function createPOSProduct() {
    const name = document.getElementById('posNewProductName').value.trim();
    const description = document.getElementById('posNewProductDesc').value.trim();
    const sku = document.getElementById('posNewProductSKU').value.trim();
    const salePrice = parseFloat(document.getElementById('posNewProductPrice').value) || 0;
    const currency = document.getElementById('posNewProductCurrency').value;
    
    if (!name) {
        alert('Product name is required');
        return;
    }
    
    if (!currentSubcategoryId) {
        alert('Error: No subcategory selected');
        return;
    }
    
    const data = {
        subcategory_id: currentSubcategoryId,
        name: name,
        description: description || '',
        sku: sku || null,
        min_stock_level: 0
    };
    
    try {
        const response = await apiCall('/api/warehouse/products', {
            method: 'POST',
            body: JSON.stringify(data)
        });
        
        if (response && response.ok) {
            const product = await response.json();
            
            // Add to cart immediately
            cart.push({
                productId: product.id,
                productName: product.name,
                quantity: 1,
                availableQty: 999, // No stock limit for newly created products
                salePrice: salePrice,
                currency: currency
            });
            
            closeModal('posAddProductModal');
            updatePOSDisplay();
            alert('Product created and added to cart!');
        } else {
            const error = await response.json();
            alert('Failed to create product: ' + (error.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Create product error:', error);
        alert('Error creating product: ' + error.message);
    }
}

// ==================== ADMIN ====================
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

// Auto-refresh analytics
setInterval(() => {
    const analyticsSection = document.getElementById('analytics');
    if (analyticsSection && analyticsSection.classList.contains('active')) {
        loadAnalytics();
    }
}, 60000);
