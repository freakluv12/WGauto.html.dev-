// ==================== RENTALS MODULE ====================
const Rentals = {
    allRentals: [],
    currentDate: new Date(),

    init() {
        this.createModals();
        this.loadRentals();
        this.renderContent();
    },

    renderContent() {
        document.getElementById('rentalsContent').innerHTML = `
            <div class="tabs">
                <button class="tab active" onclick="Rentals.showTab('active')">Active Rentals</button>
                <button class="tab" onclick="Rentals.showTab('calendar')">Calendar</button>
                <button class="tab" onclick="Rentals.showTab('history')">History</button>
            </div>

            <div id="activeRentals" class="tab-content active">
                <table class="table" id="activeRentalsTable">
                    <thead>
                        <tr>
                            <th>Car</th>
                            <th>Client</th>
                            <th>Start Date</th>
                            <th>End Date</th>
                            <th>Daily Price</th>
                            <th>Total</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody></tbody>
                </table>
            </div>

            <div id="rentalCalendar" class="tab-content">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                    <button class="btn" onclick="Rentals.changeMonth(-1)">‹ Previous</button>
                    <h3 id="calendarTitle"></h3>
                    <button class="btn" onclick="Rentals.changeMonth(1)">Next ›</button>
                </div>
                <div id="calendar" class="calendar"></div>
            </div>

            <div id="rentalHistory" class="tab-content">
                <table class="table" id="historyTable">
                    <thead>
                        <tr>
                            <th>Car</th>
                            <th>Client</th>
                            <th>Period</th>
                            <th>Total</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody></tbody>
                </table>
            </div>
        `;
    },

    createModals() {
        const modalsContainer = document.getElementById('modalsContainer');
        
        modalsContainer.innerHTML += Utils.createModal('addRentalModal', 'New Rental', `
            <div class="form-group">
                <label>Car</label>
                <select id="rentalCar" required>
                    <option value="">Select a car...</option>
                </select>
            </div>
            <div class="form-group">
                <label>Client Name</label>
                <input type="text" id="rentalClient" required>
            </div>
            <div class="form-group">
                <label>Client Phone</label>
                <input type="tel" id="rentalPhone">
            </div>
            <div class="form-group">
                <label>Start Date</label>
                <input type="date" id="rentalStart" required>
            </div>
            <div class="form-group">
                <label>End Date</label>
                <input type="date" id="rentalEnd" required>
            </div>
            <div class="form-group">
                <label>Daily Price</label>
                <input type="number" id="rentalPrice" step="0.01" required>
            </div>
            <div class="form-group">
                <label>Currency</label>
                <select id="rentalCurrency" required>
                    <option value="USD">USD ($)</option>
                    <option value="EUR">EUR (€)</option>
                    <option value="GEL">GEL (₾)</option>
                    <option value="RUB">RUB (₽)</option>
                </select>
            </div>
            <button class="btn" onclick="Rentals.addRental()">Create Rental</button>
        `);
    },

    async loadRentals() {
        try {
            const response = await API.call('/api/rentals');
            if (!response) return;

            this.allRentals = await response.json();
            this.displayActiveRentals();
            this.displayRentalHistory();
            await this.loadAvailableCarsForRental();
        } catch (error) {
            console.error('Rentals load error:', error);
        }
    },

    displayActiveRentals() {
        const activeRentals = this.allRentals.filter(r => r.status === 'active');
        let rentalsHTML = '';
        
        if (activeRentals.length === 0) {
            rentalsHTML = '<tr><td colspan="7">No active rentals</td></tr>';
        } else {
            activeRentals.forEach(rental => {
                rentalsHTML += `
                    <tr>
                        <td>${rental.brand} ${rental.model} ${rental.year || ''}</td>
                        <td>${rental.client_name}<br><small>${rental.client_phone || ''}</small></td>
                        <td>${Utils.formatDate(rental.start_date)}</td>
                        <td>${Utils.formatDate(rental.end_date)}</td>
                        <td>${Utils.getCurrencySymbol(rental.currency)}${rental.daily_price}/day</td>
                        <td>${Utils.getCurrencySymbol(rental.currency)}${rental.total_amount}</td>
                        <td>
                            <button class="btn" onclick="Rentals.completeRental(${rental.id})">Complete</button>
                        </td>
                    </tr>
                `;
            });
        }
        
        document.querySelector('#activeRentalsTable tbody').innerHTML = rentalsHTML;
    },

    displayRentalHistory() {
        const completedRentals = this.allRentals.filter(r => r.status === 'completed');
        let historyHTML = '';
        
        if (completedRentals.length === 0) {
            historyHTML = '<tr><td colspan="5">No rental history</td></tr>';
        } else {
            completedRentals.forEach(rental => {
                const startDate = Utils.formatDate(rental.start_date);
                const endDate = Utils.formatDate(rental.end_date);
                
                historyHTML += `
                    <tr>
                        <td>${rental.brand} ${rental.model} ${rental.year || ''}</td>
                        <td>${rental.client_name}</td>
                        <td>${startDate} - ${endDate}</td>
                        <td>${Utils.getCurrencySymbol(rental.currency)}${rental.total_amount}</td>
                        <td>${rental.status.toUpperCase()}</td>
                    </tr>
                `;
            });
        }
        
        document.querySelector('#historyTable tbody').innerHTML = historyHTML;
    },

    async loadAvailableCarsForRental() {
        const response = await API.call('/api/cars?status=active');
        if (!response) return;

        const availableCars = await response.json();
        let optionsHTML = '<option value="">Select a car...</option>';
        
        availableCars.forEach(car => {
            optionsHTML += `<option value="${car.id}">${car.brand} ${car.model} ${car.year || ''}</option>`;
        });
        
        document.getElementById('rentalCar').innerHTML = optionsHTML;
    },

    showTab(tabName) {
        const tabContents = document.querySelectorAll('#rentalsContent .tab-content');
        tabContents.forEach(content => content.classList.remove('active'));
        
        const tabButtons = document.querySelectorAll('#rentalsContent .tab');
        tabButtons.forEach(button => button.classList.remove('active'));
        
        if (tabName === 'active') {
            document.getElementById('activeRentals').classList.add('active');
            document.querySelector('#rentalsContent .tab').classList.add('active');
        } else if (tabName === 'calendar') {
            document.getElementById('rentalCalendar').classList.add('active');
            document.querySelectorAll('#rentalsContent .tab')[1].classList.add('active');
            this.loadRentalCalendar();
        } else if (tabName === 'history') {
            document.getElementById('rentalHistory').classList.add('active');
            document.querySelectorAll('#rentalsContent .tab')[2].classList.add('active');
        }
    },

    showAddModal() {
        this.loadAvailableCarsForRental();
        Utils.showModal('addRentalModal');
    },

    async addRental() {
        const rentalData = {
            car_id: parseInt(document.getElementById('rentalCar').value),
            client_name: document.getElementById('rentalClient').value,
            client_phone: document.getElementById('rentalPhone').value,
            start_date: document.getElementById('rentalStart').value,
            end_date: document.getElementById('rentalEnd').value,
            daily_price: parseFloat(document.getElementById('rentalPrice').value),
            currency: document.getElementById('rentalCurrency').value
        };

        if (!rentalData.car_id || !rentalData.client_name || !rentalData.start_date || 
            !rentalData.end_date || !rentalData.daily_price) {
            alert('Please fill in all required fields');
            return;
        }

        try {
            const response = await API.call('/api/rentals', {
                method: 'POST',
                body: JSON.stringify(rentalData)
            });

            if (response && response.ok) {
                Utils.closeModal('addRentalModal');
                Utils.clearForm('addRentalModal');
                this.loadRentals();
            } else {
                const error = await response.json();
                alert('Failed to create rental: ' + (error.error || 'Unknown error'));
            }
        } catch (error) {
            alert('Error creating rental: ' + error.message);
        }
    },

    async completeRental(rentalId) {
        if (!confirm('Complete this rental?')) {
            return;
        }

        try {
            const response = await API.call(`/api/rentals/${rentalId}/complete`, {
                method: 'POST'
            });

            if (response && response.ok) {
                alert('Rental completed successfully');
                this.loadRentals();
                Dashboard.load(); // Refresh dashboard
            } else {
                alert('Failed to complete rental');
            }
        } catch (error) {
            alert('Error completing rental: ' + error.message);
        }
    },

    async loadRentalCalendar() {
        const year = this.currentDate.getFullYear();
        const month = this.currentDate.getMonth() + 1;
        
        try {
            const response = await API.call(`/api/rentals/calendar/${year}/${month}`);
            if (!response) return;

            const calendarRentals = await response.json();
            this.displayCalendar(year, month, calendarRentals);
        } catch (error) {
            console.error('Calendar load error:', error);
        }
    },

    displayCalendar(year, month, rentals) {
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
    },

    changeMonth(direction) {
        this.currentDate.setMonth(this.currentDate.getMonth() + direction);
        this.loadRentalCalendar();
    }
};
