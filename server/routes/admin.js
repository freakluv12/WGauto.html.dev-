const express = require('express');
const router = express.Router();
const { pool } = require('../database');
const { authenticateToken, requireAdmin } = require('../middleware');

// Get all users (admin only)
router.get('/users', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT id, email, role, active, created_at FROM users ORDER BY created_at DESC'
        );
        res.json(result.rows);
    } catch (error) {
        console.error('Get users error:', error);
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

// Toggle user status (admin only)
router.put('/users/:id/toggle', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const userId = req.params.id;
        await pool.query('UPDATE users SET active = NOT active WHERE id = $1', [userId]);
        res.json({ success: true });
    } catch (error) {
        console.error('Toggle user error:', error);
        res.status(500).json({ error: 'Failed to toggle user status' });
    }
});

module.exports = router;
