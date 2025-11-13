const express = require('express');
const router = express.Router();
const { pool } = require('../database');
const { authenticateToken } = require('../middleware');

// ==================== SHIFT MANAGEMENT ====================

// Get active shift for current user
router.get('/shift/active', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM active_shifts_with_stats WHERE user_id = $1',
            [req.user.id]
        );
        
        res.json(result.rows[0] || null);
    } catch (error) {
        console.error('Get active shift error:', error);
        res.status(500).json({ error: 'Failed to get active shift' });
    }
});

// Start new shift
router.post('/shift/start', authenticateToken, async (req, res) => {
    try {
        // Check if user already has an active shift
        const activeShift = await pool.query(
            'SELECT id FROM pos_shifts WHERE user_id = $1 AND end_time IS NULL',
            [req.user.id]
        );
        
        if (activeShift.rows.length > 0) {
            return res.status(400).json({ error: 'You already have an active shift' });
        }
        
        const result = await pool.query(
            'INSERT INTO pos_shifts (user_id) VALUES ($1) RETURNING *',
            [req.user.id]
        );
        
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Start shift error:', error);
        res.status(500).json({ error: 'Failed to start shift' });
    }
});

// End shift
router.post('/shift/end', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(
            'UPDATE pos_shifts SET end_time = CURRENT_TIMESTAMP WHERE user_id = $1 AND end_time IS NULL RETURNING *',
            [req.user.id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'No active shift found' });
        }
        
        res.json(result.rows[0]);
    } catch (error) {
        console.error('End shift error:', error);
        res.status(500).json({ error: 'Failed to end shift' });
    }
});

// ==================== SALES ====================

// Complete sale (create receipt)
router.post('/sale', authenticateToken, async (req, res) => {
    const client = await pool.connect();
    
    try {
        const { items, currency = 'GEL' } = req.body;
        
        if (!items || items.length === 0) {
            return res.status(400).json({ error: 'Cart is empty' });
        }
        
        // Validate all items have prices
        const invalidItems = items.filter(item => !item.salePrice || item.salePrice <= 0);
        if (invalidItems.length > 0) {
            return res.status(400).json({ error: 'All items must have a price' });
        }
        
        await client.query('BEGIN');
        
        // Get or create active shift
        let shiftResult = await client.query(
            'SELECT id FROM pos_shifts WHERE user_id = $1 AND end_time IS NULL',
            [req.user.id]
        );
        
        if (shiftResult.rows.length === 0) {
            // Auto-create shift if not exists
            shiftResult = await client.query(
                'INSERT INTO pos_shifts (user_id) VALUES ($1) RETURNING id',
                [req.user.id]
            );
        }
        
        const shiftId = shiftResult.rows[0].id;
        
        // Calculate total
        const totalAmount = items.reduce((sum, item) => sum + (item.quantity * item.salePrice), 0);
        
        // Create receipt
        const receiptResult = await client.query(
            'INSERT INTO receipts (shift_id, user_id, total_amount, currency) VALUES ($1, $2, $3, $4) RETURNING *',
            [shiftId, req.user.id, totalAmount, currency]
        );
        
        const receiptId = receiptResult.rows[0].id;
        
        // Add sale items and update inventory
        for (const item of items) {
            // Get cost price from oldest inventory (FIFO)
            const inventoryResult = await client.query(
                `SELECT id, quantity, purchase_price FROM inventory 
                 WHERE product_id = $1 AND quantity > 0 
                 ORDER BY received_date ASC LIMIT 1`,
                [item.id]
            );
            
            if (inventoryResult.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: `Product ${item.name} is out of stock` });
            }
            
            const inventory = inventoryResult.rows[0];
            
            if (inventory.quantity < item.quantity) {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: `Insufficient stock for ${item.name}` });
            }
            
            const costPrice = inventory.purchase_price || 0;
            
            // Insert sale item
            await client.query(
                `INSERT INTO sale_items (receipt_id, product_id, quantity, sale_price, cost_price, currency) 
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [receiptId, item.id, item.quantity, item.salePrice, costPrice, currency]
            );
            
            // Decrease inventory
            await client.query(
                'UPDATE inventory SET quantity = quantity - $1 WHERE id = $2',
                [item.quantity, inventory.id]
            );
        }
        
        await client.query('COMMIT');
        
        res.json({
            receipt: receiptResult.rows[0],
            message: 'Sale completed successfully'
        });
        
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Complete sale error:', error);
        res.status(500).json({ error: 'Failed to complete sale' });
    } finally {
        client.release();
    }
});

// Get receipts for current shift
router.get('/receipts', authenticateToken, async (req, res) => {
    try {
        const { shift_id } = req.query;
        
        let query = `
            SELECT r.*, 
                   COUNT(si.id) as items_count,
                   json_agg(json_build_object(
                       'id', si.id,
                       'product_id', si.product_id,
                       'product_name', p.name,
                       'quantity', si.quantity,
                       'sale_price', si.sale_price,
                       'cost_price', si.cost_price
                   )) as items
            FROM receipts r
            LEFT JOIN sale_items si ON r.id = si.receipt_id
            LEFT JOIN products p ON si.product_id = p.id
        `;
        
        const params = [];
        if (shift_id) {
            query += ' WHERE r.shift_id = $1';
            params.push(shift_id);
        } else {
            query += ' WHERE r.user_id = $1';
            params.push(req.user.id);
        }
        
        query += ' GROUP BY r.id ORDER BY r.sale_time DESC';
        
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (error) {
        console.error('Get receipts error:', error);
        res.status(500).json({ error: 'Failed to get receipts' });
    }
});

// Cancel receipt
router.post('/receipt/:id/cancel', authenticateToken, async (req, res) => {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        // Get receipt
        const receiptResult = await client.query(
            'SELECT * FROM receipts WHERE id = $1 AND user_id = $2 AND is_cancelled = false',
            [req.params.id, req.user.id]
        );
        
        if (receiptResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Receipt not found or already cancelled' });
        }
        
        // Get sale items
        const itemsResult = await client.query(
            'SELECT * FROM sale_items WHERE receipt_id = $1',
            [req.params.id]
        );
        
        // Return items to inventory
        for (const item of itemsResult.rows) {
            // Find the inventory record to return items to (FIFO - oldest first)
            const inventoryResult = await client.query(
                `SELECT id FROM inventory 
                 WHERE product_id = $1 
                 ORDER BY received_date ASC LIMIT 1`,
                [item.product_id]
            );
            
            if (inventoryResult.rows.length > 0) {
                await client.query(
                    'UPDATE inventory SET quantity = quantity + $1 WHERE id = $2',
                    [item.quantity, inventoryResult.rows[0].id]
                );
            } else {
                // Create new inventory record if none exists
                await client.query(
                    `INSERT INTO inventory (product_id, source_type, quantity, purchase_price, currency, user_id) 
                     VALUES ($1, 'returned', $2, $3, $4, $5)`,
                    [item.product_id, item.quantity, item.cost_price, item.currency, req.user.id]
                );
            }
        }
        
        // Mark receipt as cancelled
        await client.query(
            'UPDATE receipts SET is_cancelled = true WHERE id = $1',
            [req.params.id]
        );
        
        await client.query('COMMIT');
        
        res.json({ message: 'Receipt cancelled successfully' });
        
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Cancel receipt error:', error);
        res.status(500).json({ error: 'Failed to cancel receipt' });
    } finally {
        client.release();
    }
});

// ==================== STATISTICS ====================

// Get shift statistics
router.get('/stats/shift/:shiftId', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT 
                ps.id,
                ps.start_time,
                ps.end_time,
                COUNT(DISTINCT r.id) as total_receipts,
                COUNT(DISTINCT CASE WHEN r.is_cancelled = true THEN r.id END) as cancelled_receipts,
                COALESCE(SUM(CASE WHEN r.is_cancelled = false THEN r.total_amount ELSE 0 END), 0) as total_sales,
                COALESCE(SUM(CASE WHEN r.is_cancelled = false THEN si.quantity ELSE 0 END), 0) as total_items_sold,
                COALESCE(SUM(CASE WHEN r.is_cancelled = false THEN si.sale_price * si.quantity ELSE 0 END), 0) as revenue,
                COALESCE(SUM(CASE WHEN r.is_cancelled = false THEN si.cost_price * si.quantity ELSE 0 END), 0) as cost,
                COALESCE(SUM(CASE WHEN r.is_cancelled = false THEN (si.sale_price - si.cost_price) * si.quantity ELSE 0 END), 0) as profit
            FROM pos_shifts ps
            LEFT JOIN receipts r ON ps.id = r.shift_id
            LEFT JOIN sale_items si ON r.id = si.receipt_id
            WHERE ps.id = $1 AND ps.user_id = $2
            GROUP BY ps.id`,
            [req.params.shiftId, req.user.id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Shift not found' });
        }
        
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Get shift stats error:', error);
        res.status(500).json({ error: 'Failed to get shift statistics' });
    }
});

module.exports = router;

// Add this to server/server.js:
// const posRoutes = require('./routes/pos');
// app.use('/api/pos', posRoutes);
