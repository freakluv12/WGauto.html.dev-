const express = require('express');
const router = express.Router();
const { pool } = require('../database');
const { authenticateToken } = require('../middleware');

// Get all rentals
router.get('/', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.role === 'ADMIN' ? null : req.user.id;
        const query = userId ? 
            `SELECT r.*, c.brand, c.model, c.year 
             FROM rentals r 
             JOIN cars c ON r.car_id = c.id 
             WHERE r.user_id = $1 
             ORDER BY r.created_at DESC` :
            `SELECT r.*, c.brand, c.model, c.year 
             FROM rentals r 
             JOIN cars c ON r.car_id = c.id 
             ORDER BY r.created_at DESC`;
        const params = userId ? [userId] : [];

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (error) {
        console.error('Get rentals error:', error);
        res.status(500).json({ error: 'Failed to fetch rentals' });
    }
});

// Create rental
router.post('/', authenticateToken, async (req, res) => {
    try {
        const { car_id, client_name, client_phone, start_date, end_date, daily_price, currency } = req.body;
        
        const startDate = new Date(start_date);
        const endDate = new Date(end_date);
        
        if (endDate <= startDate) {
            return res.status(400).json({ error: 'End date must be after start date' });
        }
        
        const days = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
        const total_amount = days * daily_price;

        const result = await pool.query(
            `INSERT INTO rentals (car_id, user_id, client_name, client_phone, start_date, end_date, daily_price, currency, total_amount) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
            [car_id, req.user.id, client_name, client_phone, start_date, end_date, daily_price, currency, total_amount]
        );

        await pool.query('UPDATE cars SET status = $1 WHERE id = $2', ['rented', car_id]);

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Create rental error:', error);
        res.status(500).json({ error: 'Failed to create rental' });
    }
});

// Complete rental
router.post('/:id/complete', authenticateToken, async (req, res) => {
    try {
        const rentalId = req.params.id;

        const rental = await pool.query('SELECT * FROM rentals WHERE id = $1', [rentalId]);
        if (rental.rows.length === 0) {
            return res.status(404).json({ error: 'Rental not found' });
        }

        const rentalData = rental.rows[0];

        await pool.query(
            'UPDATE rentals SET status = $1, completed_at = CURRENT_TIMESTAMP WHERE id = $2',
            ['completed', rentalId]
        );

        await pool.query(
            `INSERT INTO transactions (car_id, user_id, type, amount, currency, category, description, rental_id) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
                rentalData.car_id,
                req.user.id,
                'income',
                rentalData.total_amount,
                rentalData.currency,
                'rental',
                `Rental income from ${rentalData.client_name}`,
                rentalId
            ]
        );

        await pool.query('UPDATE cars SET status = $1 WHERE id = $2', ['active', rentalData.car_id]);

        res.json({ success: true });
    } catch (error) {
        console.error('Complete rental error:', error);
        res.status(500).json({ error: 'Failed to complete rental' });
    }
});

// Get calendar data
router.get('/calendar/:year/:month', authenticateToken, async (req, res) => {
    try {
        const { year, month } = req.params;
        const userId = req.user.role === 'ADMIN' ? null : req.user.id;
        
        const query = userId ? 
            `SELECT r.*, c.brand, c.model 
             FROM rentals r 
             JOIN cars c ON r.car_id = c.id 
             WHERE r.user_id = $1 AND 
             ((EXTRACT(YEAR FROM start_date) = $2 AND EXTRACT(MONTH FROM start_date) = $3)
             OR (EXTRACT(YEAR FROM end_date) = $2 AND EXTRACT(MONTH FROM end_date) = $3)
             OR (start_date <= $4 AND end_date >= $5))` :
            `SELECT r.*, c.brand, c.model 
             FROM rentals r 
             JOIN cars c ON r.car_id = c.id 
             WHERE ((EXTRACT(YEAR FROM start_date) = $1 AND EXTRACT(MONTH FROM start_date) = $2)
             OR (EXTRACT(YEAR FROM end_date) = $1 AND EXTRACT(MONTH FROM end_date) = $2)
             OR (start_date <= $3 AND end_date >= $4))`;

        const firstDay = `${year}-${month.padStart(2, '0')}-01`;
        const lastDay = `${year}-${month.padStart(2, '0')}-31`;
        
        const params = userId ? 
            [userId, year, month, lastDay, firstDay] :
            [year, month, lastDay, firstDay];

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (error) {
        console.error('Get calendar error:', error);
        res.status(500).json({ error: 'Failed to fetch calendar data' });
    }
});

module.exports = router;
