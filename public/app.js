// WGauto CRM - Складская система
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

// Initialize app
document.addEventListener('DOMContentLoaded', function() {
    checkAuthStatus();
});

// Notification system
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <span>${message}</span>
        <button onclick="this.parentElement.remove()">&times;</button>
    `;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.classList.add('fade-out');
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Loader functions
function showLoader(text = 'Loading...') {
    let loader = document.getElementById('globalLoader');
    if (!loader) {
        loader = document.createElement('div');
        loader.id = 'globalLoader';
        loader.className = 'global-loader';
        loader.innerHTML = `
            <div class="loader-content">
                <div class="spinner"></div>
                <div class="loader-text">${text}</div>
            </div>
        `;
        document.body.appendChild(loader);
    }
    loader.style.display = 'flex';
}

function hideLoader() {
    const loader = document.getElementById('globalLoader');
    if (loader) {
        loader.style.display = 'none';
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
        showNotification('Please enter email and password', 'error');
        return;
    }

    showLoader('Logging in...');
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
            showNotification('Login successful!', 'success');
            showApp();
        } else {
            const error = await response.json();
            showNotification('Login failed: ' + (error.error || 'Unknown error'), 'error');
        }
    } catch (error) {
        console.error('Login error:', error);
        showNotification('Login error: Cannot connect to server', 'error');
    } finally {
        hideLoader();
    }
}

async function attemptRegister() {
    const email = document.getElementById('registerEmail').value;
    const password = document.getElementById('registerPassword').value;

    if (!email || !password) {
        showNotification('Please enter email and password', 'error');
        return;
    }

    showLoader('Registering...');
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
            showNotification('Registration successful!', 'success');
            showApp();
        } else {
            const error = await response.json();
            showNotification('Registration failed: ' + error.error, 'error');
        }
    } catch (error) {
        console.error('Registration error:', error);
        showNotification('Registration error: Cannot connect to server', 'error');
    } finally {
        hideLoader();
    }
}

function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('userEmail');
    localStorage.removeItem('userRole');
    currentUser = null;
    showNotification('Logged out successfully', 'info');
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
            showNotification('Session expired. Please login again.', 'error');
            logout();
            return null;
        }

        return response;
    } catch (error) {
        console.error('API call error:', error);
        showNotification('Network error. Please check your connection.', 'error');
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
        case 'admin':
            loadUsers();
            break;
    }
}

// Dashboard
async function loadDashboard() {
    showLoader('Loading dashboard...');
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
        showNotification('Failed to load dashboard', 'error');
    } finally {
        hideLoader();
    }
}

// Cars functions
async function loadCars() {
    showLoader('Loading cars...');
    try {
        const response = await apiCall('/api/cars');
        if (!response) return;

        allCars = await response.json();
        filteredCars = [...allCars];
        displayCars();
    } catch (error) {
        console.error('Cars load error:', error);
        document.getElementById('carsGrid').innerHTML = '<div class="loading">Error loading cars</div>';
        showNotification('Failed to load cars', 'error');
    } finally {
        hideLoader();
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
        showNotification('Brand and model are required', 'error');
        return;
    }

    showLoader('Adding car...');
    try {
        const response = await apiCall('/api/cars', {
            method: 'POST',
            body: JSON.stringify(carData)
        });

        if (response && response.ok) {
            closeModal('addCarModal');
            showNotification('Car added successfully!', 'success');
            loadCars();
            document.getElementById('carBrand').value = '';
            document.getElementById('carModel').value = '';
            document.getElementById('carYear').value = '';
            document.getElementById('carVin').value = '';
            document.getElementById('carPrice').value = '';
        } else {
            const error = await response.json();
            showNotification('Failed to add car: ' + (error.error || 'Unknown error'), 'error');
        }
    } catch (error) {
        showNotification('Error adding car: ' + error.message, 'error');
    } finally {
        hideLoader();
    }
}

// Continue in Part 2...
// Continuation of app.js (Part 2/2)
// Car details and other functions...

async function showCarDetails(carId) {
    currentCarId = carId;
    showLoader('Loading car details...');
    
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
        showNotification('Error loading car details', 'error');
    } finally {
        hideLoader();
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
        showNotification('Amount, currency, and category are required', 'error');
        return;
    }

    showLoader('Adding expense...');
    try {
        const response = await apiCall(`/api/cars/${currentCarId}/expense`, {
            method: 'POST',
            body: JSON.stringify(expenseData)
        });

        if (response && response.ok) {
            document.getElementById('expenseAmount').value = '';
            document.getElementById('expenseDescription').value = '';
            showNotification('Expense added successfully!', 'success');
            showCarDetails(currentCarId);
        } else {
            const error = await response.json();
            showNotification('Failed to add expense: ' + (error.error || 'Unknown error'), 'error');
        }
    } catch (error) {
        showNotification('Error adding expense: ' + error.message, 'error');
    } finally {
        hideLoader();
    }
}

async function dismantleCar() {
    if (!confirm('Are you sure you want to dismantle this car?')) {
        return;
    }

    showLoader('Dismantling car...');
    try {
        const response = await apiCall(`/api/cars/${currentCarId}/dismantle`, {
            method: 'POST'
        });

        if (response && response.ok) {
            showNotification('Car dismantled successfully', 'success');
            closeModal('carDetailsModal');
            loadCars();
        } else {
            showNotification('Failed to dismantle car', 'error');
        }
    } catch (error) {
        showNotification('Error dismantling car: ' + error.message, 'error');
    } finally {
        hideLoader();
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

// Rentals
async function loadRentals() {
    showLoader('Loading rentals...');
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
        showNotification('Failed to load rentals', 'error');
    } finally {
        hideLoader();
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
        showNotification('Please fill in all required fields', 'error');
        return;
    }

    showLoader('Creating rental...');
    try {
        const response = await apiCall('/api/rentals', {
            method: 'POST',
            body: JSON.stringify(rentalData)
        });

        if (response && response.ok) {
            closeModal('addRentalModal');
            showNotification('Rental created successfully!', 'success');
            loadRentals();
            document.getElementById('rentalCar').value = '';
            document.getElementById('rentalClient').value = '';
            document.getElementById('rentalPhone').value = '';
            document.getElementById('rentalStart').value = '';
            document.getElementById('rentalEnd').value = '';
            document.getElementById('rentalPrice').value = '';
        } else {
            const error = await response.json();
            showNotification('Failed to create rental: ' + (error.error || 'Unknown error'), 'error');
        }
    } catch (error) {
        showNotification('Error creating rental: ' + error.message, 'error');
    } finally {
        hideLoader();
    }
}

async function completeRental(rentalId) {
    if (!confirm('Complete this rental?')) {
        return;
    }

    showLoader('Completing rental...');
    try {
        const response = await apiCall(`/api/rentals/${rentalId}/complete`, {
            method: 'POST'
        });

        if (response && response.ok) {
            showNotification('Rental completed successfully', 'success');
            loadRentals();
            loadDashboard();
        } else {
            showNotification('Failed to complete rental', 'error');
        }
    } catch (error) {
        showNotification('Error completing rental: ' + error.message, 'error');
    } finally {
        hideLoader();
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

// Continue with warehouse functions in next response...
// ==================== WAREHOUSE FUNCTIONS ====================

async function loadWarehouse() {
    document.getElementById('warehouseActionBar').style.display = 'flex';
    await loadCategories();
}

function hideWarehouseActionBar() {
    document.getElementById('warehouseActionBar').style.display = 'none';
}

async function loadCategories() {
    showLoader('Loading categories...');
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
        showNotification('Failed to load categories', 'error');
    } finally {
        hideLoader();
    }
}

async function loadSubcategories(categoryId) {
    currentCategoryId = categoryId;
    currentSubcategoryId = null;
    currentProductId = null;
    
    showLoader('Loading subcategories...');
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
        showNotification('Failed to load subcategories', 'error');
    } finally {
        hideLoader();
    }
}

async function loadProducts(subcategoryId) {
    currentSubcategoryId = subcategoryId;
    currentProductId = null;
    
    showLoader('Loading products...');
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
        showNotification('Failed to load products', 'error');
    } finally {
        hideLoader();
    }
}

async function showProductDetails(productId) {
    currentProductId = productId;
    
    showLoader('Loading product details...');
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
        showNotification('Failed to load product details', 'error');
    } finally {
        hideLoader();
    }
}

function showWarehouseAction(action) {
    switch(action) {
        case 'receive':
            showReceiveInventoryModal();
            break;
        case 'sell':
            showSellInventoryModal();
            break;
        case 'procurement':
            showProcurementModal();
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
        showNotification('Название обязательно', 'error');
        return;
    }
    
    showLoader('Adding category...');
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
            showNotification('Category added successfully!', 'success');
            loadCategories();
        } else {
            const error = await response.json();
            showNotification('Failed to add category: ' + (error.error || 'Unknown error'), 'error');
        }
    } catch (error) {
        showNotification('Error: ' + error.message, 'error');
    } finally {
        hideLoader();
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
        showNotification('Название обязательно', 'error');
        return;
    }
    
    showLoader('Adding subcategory...');
    try {
        const response = await apiCall('/api/warehouse/subcategories', {
            method: 'POST',
            body: JSON.stringify(data)
        });
        
        if (response && response.ok) {
            closeModal('addSubcategoryModal');
            document.getElementById('subcategoryName').value = '';
            document.getElementById('subcategoryDescription').value = '';
            showNotification('Subcategory added successfully!', 'success');
            loadSubcategories(currentCategoryId);
        } else {
            const error = await response.json();
            showNotification('Failed to add subcategory: ' + (error.error || 'Unknown error'), 'error');
        }
    } catch (error) {
        showNotification('Error: ' + error.message, 'error');
    } finally {
        hideLoader();
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
        showNotification('Название обязательно', 'error');
        return;
    }
    
    showLoader('Adding product...');
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
            showNotification('Product added successfully!', 'success');
            loadProducts(currentSubcategoryId);
        } else {
            const error = await response.json();
            showNotification('Failed to add product: ' + (error.error || 'Unknown error'), 'error');
        }
    } catch (error) {
        showNotification('Error: ' + error.message, 'error');
    } finally {
        hideLoader();
    }
}

// ========== НОВЫЕ РЕАЛИЗОВАННЫЕ ФУНКЦИИ ==========

async function showReceiveInventoryModal() {
    showLoader('Loading products...');
    try {
        // Загружаем все товары для выбора
        const categoriesResponse = await apiCall('/api/warehouse/categories');
        if (!categoriesResponse) return;
        
        const allCategories = await categoriesResponse.json();
        
        // Загружаем все товары из всех категорий
        let allProducts = [];
        for (const category of allCategories) {
            const subsResponse = await apiCall(`/api/warehouse/subcategories/${category.id}`);
            if (subsResponse) {
                const subs = await subsResponse.json();
                for (const sub of subs) {
                    const prodsResponse = await apiCall(`/api/warehouse/products/${sub.id}`);
                    if (prodsResponse) {
                        const prods = await prodsResponse.json();
                        allProducts = [...allProducts, ...prods.map(p => ({...p, categoryName: category.name, subName: sub.name}))];
                    }
                }
            }
        }
        
        // Заполняем select с товарами
        let productsHTML = '<option value="">Выберите товар...</option>';
        allProducts.forEach(product => {
            productsHTML += `<option value="${product.id}">${product.categoryName} > ${product.subName} > ${product.name}</option>`;
        });
        
        const productSelect = document.getElementById('receiveProduct');
        if (productSelect) {
            productSelect.innerHTML = productsHTML;
        }
        
        document.getElementById('receiveInventoryModal').style.display = 'block';
    } catch (error) {
        console.error('Error loading products for receive:', error);
        showNotification('Failed to load products', 'error');
    } finally {
        hideLoader();
    }
}

async function receiveInventory() {
    const data = {
        product_id: parseInt(document.getElementById('receiveProduct').value),
        source_type: document.getElementById('receiveSourceType').value,
        quantity: parseInt(document.getElementById('receiveQuantity').value),
        purchase_price: parseFloat(document.getElementById('receivePurchasePrice').value) || null,
        currency: document.getElementById('receiveCurrency').value,
        location: document.getElementById('receiveLocation').value
    };
    
    if (!data.product_id || !data.source_type || !data.quantity || data.quantity <= 0) {
        showNotification('Заполните все обязательные поля', 'error');
        return;
    }
    
    showLoader('Receiving inventory...');
    try {
        const response = await apiCall('/api/warehouse/inventory/receive', {
            method: 'POST',
            body: JSON.stringify(data)
        });
        
        if (response && response.ok) {
            closeModal('receiveInventoryModal');
            document.getElementById('receiveProduct').value = '';
            document.getElementById('receiveQuantity').value = '';
            document.getElementById('receivePurchasePrice').value = '';
            document.getElementById('receiveLocation').value = '';
            showNotification('Товар успешно оприходован!', 'success');
            
            // Обновляем список товаров если мы на странице товаров
            if (currentSubcategoryId) {
                loadProducts(currentSubcategoryId);
            }
        } else {
            const error = await response.json();
            showNotification('Failed to receive inventory: ' + (error.error || 'Unknown error'), 'error');
        }
    } catch (error) {
        showNotification('Error: ' + error.message, 'error');
    } finally {
        hideLoader();
    }
}

async function showSellInventoryModal() {
    showLoader('Loading products...');
    try {
        // Загружаем все товары для выбора
        const categoriesResponse = await apiCall('/api/warehouse/categories');
        if (!categoriesResponse) return;
        
        const allCategories = await categoriesResponse.json();
        
        let allProducts = [];
        for (const category of allCategories) {
            const subsResponse = await apiCall(`/api/warehouse/subcategories/${category.id}`);
            if (subsResponse) {
                const subs = await subsResponse.json();
                for (const sub of subs) {
                    const prodsResponse = await apiCall(`/api/warehouse/products/${sub.id}`);
                    if (prodsResponse) {
                        const prods = await prodsResponse.json();
                        allProducts = [...allProducts, ...prods.map(p => ({...p, categoryName: category.name, subName: sub.name}))];
                    }
                }
            }
        }
        
        // Заполняем select с товарами
        let productsHTML = '<option value="">Выберите товар...</option>';
        allProducts.forEach(product => {
            productsHTML += `<option value="${product.id}">${product.categoryName} > ${product.subName} > ${product.name} (${product.total_quantity || 0} шт.)</option>`;
        });
        
        const productSelect = document.getElementById('sellProduct');
        if (productSelect) {
            productSelect.innerHTML = productsHTML;
        }
        
        document.getElementById('sellInventoryModal').style.display = 'block';
    } catch (error) {
        console.error('Error loading products for sell:', error);
        showNotification('Failed to load products', 'error');
    } finally {
        hideLoader();
    }
}

async function sellInventory() {
    const data = {
        product_id: parseInt(document.getElementById('sellProduct').value),
        quantity: parseInt(document.getElementById('sellQuantity').value),
        sale_price: parseFloat(document.getElementById('sellSalePrice').value),
        currency: document.getElementById('sellCurrency').value,
        buyer_name: document.getElementById('sellBuyerName').value,
        buyer_phone: document.getElementById('sellBuyerPhone').value,
        notes: document.getElementById('sellNotes').value
    };
    
    if (!data.product_id || !data.quantity || !data.sale_price || data.quantity <= 0) {
        showNotification('Заполните все обязательные поля', 'error');
        return;
    }
    
    showLoader('Selling inventory...');
    try {
        const response = await apiCall('/api/warehouse/sales', {
            method: 'POST',
            body: JSON.stringify(data)
        });
        
        if (response && response.ok) {
            closeModal('sellInventoryModal');
            document.getElementById('sellProduct').value = '';
            document.getElementById('sellQuantity').value = '';
            document.getElementById('sellSalePrice').value = '';
            document.getElementById('sellBuyerName').value = '';
            document.getElementById('sellBuyerPhone').value = '';
            document.getElementById('sellNotes').value = '';
            showNotification('Товар успешно продан!', 'success');
            
            // Обновляем список товаров если мы на странице товаров
            if (currentSubcategoryId) {
                loadProducts(currentSubcategoryId);
            }
        } else {
            const error = await response.json();
            showNotification('Failed to sell inventory: ' + (error.error || 'Unknown error'), 'error');
        }
    } catch (error) {
        showNotification('Error: ' + error.message, 'error');
    } finally {
        hideLoader();
    }
}

function showProcurementModal() {
    document.getElementById('procurementModal').style.display = 'block';
}

async function createProcurement() {
    const data = {
        supplier_name: document.getElementById('procurementSupplier').value,
        invoice_number: document.getElementById('procurementInvoice').value,
        procurement_date: document.getElementById('procurementDate').value,
        currency: document.getElementById('procurementCurrency').value,
        notes: document.getElementById('procurementNotes').value
    };
    
    showNotification('Функция закупки создана. Используйте "Оприходование" для добавления товаров.', 'info');
    closeModal('procurementModal');
    
    // Очищаем поля
    document.getElementById('procurementSupplier').value = '';
    document.getElementById('procurementInvoice').value = '';
    document.getElementById('procurementDate').value = '';
    document.getElementById('procurementNotes').value = '';
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
    
    showLoader('Loading analytics...');
    try {
        const response = await apiCall(url);
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
                        <td>${getCurrencySymbol(item.currency)}${parseFloat(item.total_revenue || 0).toFixed(2)}</td>
                        <td>${getCurrencySymbol(item.currency)}${parseFloat(item.total_cost || 0).toFixed(2)}</td>
                        <td class="${parseFloat(item.net_profit) >= 0 ? 'positive' : 'negative'}">
                            ${getCurrencySymbol(item.currency)}${parseFloat(item.net_profit || 0).toFixed(2)}
                        </td>
                        <td>${profitMargin}%</td>
                    </tr>
                `;
            }).join('');
        }
        
        document.querySelector('#analyticsTable tbody').innerHTML = itemsHTML;
        
        // Display totals
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
                        <div class="amount positive">${getCurrencySymbol(total.currency)}${parseFloat(total.total_revenue).toFixed(2)}</div>
                    </div>
                    <div class="profit-card">
                        <div class="currency-label">${total.currency} Себестоимость</div>
                        <div class="amount">${getCurrencySymbol(total.currency)}${parseFloat(total.total_cost).toFixed(2)}</div>
                    </div>
                    <div class="profit-card">
                        <div class="currency-label">${total.currency} Чистая прибыль</div>
                        <div class="amount ${parseFloat(total.net_profit) >= 0 ? 'positive' : 'negative'}">
                            ${getCurrencySymbol(total.currency)}${parseFloat(total.net_profit).toFixed(2)}
                        </div>
                    </div>
                    <div class="profit-card">
                        <div class="currency-label">${total.currency} Рентабельность</div>
                        <div class="amount">${total.profit_margin_percent}%</div>
                    </div>
                `;
            });
        }
        
        document.getElementById('analyticsTotals').innerHTML = totalsHTML;
        
    } catch (error) {
        console.error('Analytics error:', error);
        showNotification('Failed to load analytics', 'error');
    } finally {
        hideLoader();
    }
}

// Admin
async function loadUsers() {
    if (currentUser.role !== 'ADMIN') {
        document.querySelector('#usersTable tbody').innerHTML = '<tr><td colspan="5">Access denied</td></tr>';
        return;
    }

    showLoader('Loading users...');
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
        showNotification('Failed to load users', 'error');
    } finally {
        hideLoader();
    }
}

async function toggleUserStatus(userId) {
    if (!confirm('Toggle user status?')) {
        return;
    }

    showLoader('Updating user status...');
    try {
        const response = await apiCall(`/api/admin/users/${userId}/toggle`, {
            method: 'PUT'
        });

        if (response && response.ok) {
            showNotification('User status updated successfully', 'success');
            loadUsers();
        } else {
            showNotification('Failed to toggle user status', 'error');
        }
    } catch (error) {
        showNotification('Error toggling user status: ' + error.message, 'error');
    } finally {
        hideLoader();
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
