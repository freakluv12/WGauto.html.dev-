// ==================== API HELPER ====================
const API = {
    async call(endpoint, options = {}) {
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
                Auth.logout();
                return null;
            }

            return response;
        } catch (error) {
            console.error('API call error:', error);
            return null;
        }
    }
};

// ==================== AUTH ====================
const Auth = {
    currentUser: null,

    showLoginForm() {
        document.getElementById('loginForm').style.display = 'block';
        document.getElementById('registerForm').style.display = 'none';
    },

    showRegisterForm() {
        document.getElementById('loginForm').style.display = 'none';
        document.getElementById('registerForm').style.display = 'block';
    },

    async login() {
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
                this.currentUser = data.user;
                this.showApp();
            } else {
                const error = await response.json();
                alert('Login failed: ' + (error.error || 'Unknown error'));
            }
        } catch (error) {
            console.error('Login error:', error);
            alert('Login error: Cannot connect to server');
        }
    },

    async register() {
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
                this.currentUser = data.user;
                this.showApp();
            } else {
                const error = await response.json();
                alert('Registration failed: ' + error.error);
            }
        } catch (error) {
            console.error('Registration error:', error);
            alert('Registration error: Cannot connect to server');
        }
    },

    logout() {
        localStorage.removeItem('token');
        localStorage.removeItem('userEmail');
        localStorage.removeItem('userRole');
        this.currentUser = null;
        document.getElementById('authScreen').style.display = 'flex';
        document.getElementById('appScreen').style.display = 'none';
    },

    showApp() {
        document.getElementById('authScreen').style.display = 'none';
        document.getElementById('appScreen').style.display = 'flex';
        document.getElementById('userEmail').textContent = this.currentUser.email;
        
        if (this.currentUser.role === 'ADMIN') {
            document.getElementById('adminNav').style.display = 'block';
        }
        
        // Load dashboard by default
        window.showSection('dashboard');
    },

    async checkStatus() {
        const token = localStorage.getItem('token');
        if (token) {
            const response = await API.call('/api/stats/dashboard');
            if (response) {
                const userEmail = localStorage.getItem('userEmail');
                const userRole = localStorage.getItem('userRole');
                if (userEmail && userRole) {
                    this.currentUser = { email: userEmail, role: userRole };
                    this.showApp();
                } else {
                    this.logout();
                }
            } else {
                this.logout();
            }
        } else {
            document.getElementById('authScreen').style.display = 'flex';
            document.getElementById('appScreen').style.display = 'none';
        }
    }
};

// ==================== UTILITIES ====================
const Utils = {
    // Currency helper
    getCurrencySymbol(currency) {
        const symbols = { 
            USD: '$', 
            EUR: '€', 
            GEL: '₾',
            RUB: '₽'
        };
        return symbols[currency] || currency;
    },

    // Format date
    formatDate(dateString) {
        return new Date(dateString).toLocaleDateString();
    },

    // Format datetime
    formatDateTime(dateString) {
        return new Date(dateString).toLocaleString();
    },

    // Modal helper
    closeModal(modalId) {
        document.getElementById(modalId).style.display = 'none';
    },

    showModal(modalId) {
        document.getElementById(modalId).style.display = 'block';
    },

    // Create modal HTML
    createModal(id, title, content, width = '600px') {
        return `
            <div id="${id}" class="modal">
                <div class="modal-content" style="max-width: ${width};">
                    <span class="close" onclick="Utils.closeModal('${id}')">&times;</span>
                    <h2>${title}</h2>
                    ${content}
                </div>
            </div>
        `;
    },

    // Clear form
    clearForm(formId) {
        const form = document.getElementById(formId);
        if (form) {
            const inputs = form.querySelectorAll('input, select, textarea');
            inputs.forEach(input => {
                if (input.type === 'checkbox' || input.type === 'radio') {
                    input.checked = false;
                } else {
                    input.value = '';
                }
            });
        }
    }
};

// ==================== GLOBAL CLICK HANDLER ====================
window.onclick = function(event) {
    const modals = document.querySelectorAll('.modal');
    modals.forEach(modal => {
        if (event.target === modal) {
            modal.style.display = 'none';
        }
    });
};

// ==================== ENTER KEY HANDLER ====================
document.addEventListener('keydown', function(event) {
    if (event.key === 'Enter') {
        const activeElement = document.activeElement;
        
        if (activeElement.id === 'loginEmail' || activeElement.id === 'loginPassword') {
            Auth.login();
        }
        
        if (activeElement.id === 'registerEmail' || activeElement.id === 'registerPassword') {
            Auth.register();
        }
    }
});

// Initialize auth check on load
document.addEventListener('DOMContentLoaded', function() {
    Auth.checkStatus();
});
