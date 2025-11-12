const express = require('express');
const router = express.Router();
const { pool } = require('../database');
const { authenticateToken } = require('../middleware');

// Get all cars
router.get('/', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.role === 'ADMIN' ? null : req.user.id;
        const { search, status } = req.query;
        
        let query = userId ? 
            'SELECT * FROM cars WHERE user_id = $1' :
            'SELECT * FROM cars WHERE 1=1';
        let params = userId ? [userId] : [];
        let paramCount = params.length;

        if (search) {
            paramCount++;
            query += ` AND (LOWER(brand) LIKE $${paramCount} OR LOWER(model) LIKE $${paramCount} OR LOWER(vin) LIKE $${paramCount} OR CAST(year AS TEXT) LIKE $${paramCount})`;
            params.push(`%${search.toLowerCase()}%`);
        }

        if (status) {
            paramCount++;
            query += ` AND status = $${paramCount}`;
            params.push(status);
        }

        query += ' ORDER BY created_at DESC';

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (error) {
        console.error('Get cars error:', error);
        res.status(500).json({ error: 'Failed to fetch cars' });
    }
});

// Create car
router.post('/', authenticateToken, async (req, res) => {
    try {
        const { brand, model, year, vin, price, currency } = req.body;
        
        const result = await pool.query(
            'INSERT INTO cars (brand, model, year, vin, price, currency, user_id) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
            [brand, model, year, vin, price, currency, req.user.id]
        );

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Create car error:', error);
        res.status(500).json({ error: 'Failed to create car' });
    }
});

// Get car details
router.get('/:id/details', authenticateToken, async (req, res) => {
    try {
        const carId = req.params.id;
        const userId = req.user.role === 'ADMIN' ? null : req.user.id;
        
        const carQuery = userId ? 
            'SELECT * FROM cars WHERE id = $1 AND user_id = $2' :
            'SELECT * FROM cars WHERE id = $1';
        const carParams = userId ? [carId, userId] : [carId];
        const car = await pool.query(carQuery, carParams);

        if (car.rows.length === 0) {
            return res.status(404).json({ error: 'Car not found' });
        }

        const transactionsQuery = `SELECT * FROM transactions WHERE car_id = $1 ORDER BY date DESC`;
        const transactions = await pool.query(transactionsQuery, [carId]);

        const rentalsQuery = `SELECT * FROM rentals WHERE car_id = $1 ORDER BY created_at DESC`;
        const rentals = await pool.query(rentalsQuery, [carId]);

        const partsQuery = `SELECT * FROM parts WHERE car_id = $1 ORDER BY created_at DESC`;
        const parts = await pool.query(partsQuery, [carId]);

        const profitQuery = `
            SELECT 
                currency,
                SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) as total_income,
                SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) as total_expenses
            FROM transactions 
            WHERE car_id = $1 
            GROUP BY currency
        `;
        const profit = await pool.query(profitQuery, [carId]);

        res.json({
            car: car.rows[0],
            transactions: transactions.rows,
            rentals: rentals.rows,
            parts: parts.rows,
            profitability: profit.rows
        });
    } catch (error) {
        console.error('Get car details error:', error);
        res.status(500).json({ error: 'Failed to fetch car details' });
    }
});

// Add expense
router.post('/:id/expense', authenticateToken, async (req, res) => {
    try {
        const { amount, currency, description, category } = req.body;
        const carId = req.params.id;

        if (!amount || !currency || !category) {
            return res.status(400).json({ error: 'Amount, currency, and category are required' });
        }

        await pool.query(
            'INSERT INTO transactions (car_id, user_id, type, amount, currency, description, category) VALUES ($1, $2, $3, $4, $5, $6, $7)',
            [carId, req.user.id, 'expense', amount, currency, description || '', category]
        );

        res.json({ success: true });
    } catch (error) {
        console.error('Add expense error:', error);
        res.status(500).json({ error: 'Failed to add expense' });
    }
});

// Dismantle car
router.post('/:id/dismantle', authenticateToken, async (req, res) => {
    try {
        const carId = req.params.id;
        await pool.query('UPDATE cars SET status = $1 WHERE id = $2', ['dismantled', carId]);
        res.json({ success: true });
    } catch (error) {
        console.error('Dismantle car error:', error);
        res.status(500).json({ error: 'Failed to dismantle car' });
    }
});

module.exports = router;

