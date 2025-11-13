// server/server.js
const express = require('express');
const path = require('path');
const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Database initialization
const { initDB } = require('./database');
const { authenticateToken } = require('./middleware');

// Initialize database
initDB().then(() => {
    console.log('✅ Database ready');
}).catch(err => {
    console.error('❌ Database initialization failed:', err);
    process.exit(1);
});

// Import routes
const authRoutes = require('./routes/auth');
const carsRoutes = require('./routes/cars');
const rentalsRoutes = require('./routes/rentals');
const warehouseRoutes = require('./routes/warehouse');
const adminRoutes = require('./routes/admin');
const posRoutes = require('./routes/pos'); // НОВЫЙ ИМПОРТ

// Use routes
app.use('/api/auth', authRoutes);
app.use('/api/cars', carsRoutes);
app.use('/api/rentals', rentalsRoutes);
app.use('/api/warehouse', warehouseRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/pos', posRoutes); // НОВЫЙ РОУТ

// Dashboard stats endpoint
app.get('/api/stats/dashboard', authenticateToken, async (req, res) => {
    const { pool } = require('./database');
    
    try {
        const userId = req.user.role === 'ADMIN' ? null : req.user.id;
        const userFilter = userId ? 'AND user_id = $1' : '';
        const params = userId ? [userId] : [];

        const incomeQuery = `
            SELECT currency, SUM(amount) as total 
            FROM transactions 
            WHERE type = 'income' ${userFilter}
            GROUP BY currency
        `;
        const income = await pool.query(incomeQuery, params);

        const expenseQuery = `
            SELECT currency, SUM(amount) as total 
            FROM transactions 
            WHERE type = 'expense' ${userFilter}
            GROUP BY currency
        `;
        const expenses = await pool.query(expenseQuery, params);

        const carsQuery = `
            SELECT status, COUNT(*) as count 
            FROM cars 
            WHERE 1=1 ${userFilter}
            GROUP BY status
        `;
        const cars = await pool.query(carsQuery, params);

        const activeRentalsQuery = `
            SELECT COUNT(*) as count 
            FROM rentals 
            WHERE status = 'active' ${userFilter}
        `;
        const activeRentals = await pool.query(activeRentalsQuery, params);

        res.json({
            income: income.rows,
            expenses: expenses.rows,
            cars: cars.rows,
            activeRentals: activeRentals.rows[0]?.count || 0
        });
    } catch (error) {
        console.error('Dashboard error:', error);
        res.status(500).json({ error: 'Failed to fetch dashboard data' });
    }
});

// Health check
app.get('/health', (req, res) => {
    res.send('WGauto CRM Server is running');
});

// Главная страница - отдаем index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Fallback для SPA (если используете клиентский роутинг)
app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
        res.sendFile(path.join(__dirname, '../public/index.html'));
    } else {
        res.status(404).json({ error: 'API endpoint not found' });
    }
});

// Start server
app.listen(port, '0.0.0.0', () => {
    console.log('='.repeat(60));
    console.log(`🚀 WGauto CRM Server running on port ${port}`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`📡 Server: http://localhost:${port}`);
    console.log(`📁 Static files: ${path.join(__dirname, '../public')}`);
    console.log('='.repeat(60));
});

module.exports = app;
