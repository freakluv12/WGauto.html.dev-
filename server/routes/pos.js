const express = require('express');
const router = express.Router();
const { pool } = require('../database');
const { authenticateToken } = require('../middleware');

// Get or create active shift for user
router.get('/shift/active', authenticateToken, async (req, res) => {
    try {
        let shift = await pool.query(
            'SELECT * FROM pos_shifts WHERE user_id = $1 AND end_time IS NULL ORDER BY start_time DESC LIMIT 1',
            [req.user.id]
        );

        if (shift.rows.length === 0) {
            // Auto-create shift
            shift = await pool.query(
                'INSERT INTO pos_shifts (user_id) VALUES ($1) RETURNING *',
                [req.user.id]
            );
        }

        res.json(shift.rows[0]);
    } catch (error) {
        console.error('Get active shift error:', error);
        res.status(500).json({ error: 'Failed to get active shift' });
    }
});

// Close current shift
router.post('/shift/close', authenticateToken, async (req, res) => {
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
        console.error('Close shift error:', error);
        res.status(500).json({ error: 'Failed to close shift' });
    }
});

// Complete sale
router.post('/sale/complete', authenticateToken, async (req, res) => {
    const client = await pool.connect();
    
    try {
        const { items, currency = 'GEL' } = req.body;

        if (!items || items.length === 0) {
            return res.status(400).json({ error: 'No items in cart' });
        }

        await client.query('BEGIN');

        // Get or create active shift
        let shift = await client.query(
            'SELECT * FROM pos_shifts WHERE user_id = $1 AND end_time IS NULL ORDER BY start_time DESC LIMIT 1',
            [req.user.id]
        );

        if (shift.rows.length === 0) {
            shift = await client.query(
                'INSERT INTO pos_shifts (user_id) VALUES ($1) RETURNING *',
                [req.user.id]
            );
        }

        const shiftId = shift.rows[0].id;
        const totalAmount = items.reduce((sum, item) => sum + (item.quantity * item.salePrice), 0);

        // Create receipt
        const receipt = await client.query(
            'INSERT INTO receipts (shift_id, user_id, total_amount, currency) VALUES ($1, $2, $3, $4) RETURNING *',
            [shiftId, req.user.id, totalAmount, currency]
        );

        const receiptId = receipt.rows[0].id;

        // Process each item
        for (const item of items) {
            // Get inventory with FIFO (oldest first)
            const inventoryItems = await client.query(
                'SELECT * FROM inventory WHERE product_id = $1 AND quantity > 0 ORDER BY received_date ASC',
                [item.id]
            );

            let remainingQty = item.quantity;
            let totalCost = 0;
            let costCount = 0;

            // Deduct from inventory using FIFO
            for (const inv of inventoryItems.rows) {
                if (remainingQty <= 0) break;

                const deductQty = Math.min(remainingQty, inv.quantity);
                
                // Update inventory
                await client.query(
                    'UPDATE inventory SET quantity = quantity - $1 WHERE id = $2',
                    [deductQty, inv.id]
                );

                // Calculate weighted cost
                if (inv.purchase_price) {
                    totalCost += inv.purchase_price * deductQty;
                    costCount += deductQty;
                }

                remainingQty -= deductQty;
            }

            if (remainingQty > 0) {
                await client.query('ROLLBACK');
                return res.status(400).json({ 
                    error: `Insufficient stock for ${item.name}. Available: ${item.quantity - remainingQty}` 
                });
            }

            const avgCostPrice = costCount > 0 ? totalCost / costCount : null;

            // Create sale item
            await client.query(
                `INSERT INTO sale_items (receipt_id, product_id, quantity, sale_price, cost_price, currency) 
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [receiptId, item.id, item.quantity, item.salePrice, avgCostPrice, currency]
            );
        }

        await client.query('COMMIT');
        res.json({ 
            success: true, 
            receipt: receipt.rows[0],
            message: 'Sale completed successfully' 
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Complete sale error:', error);
        res.status(500).json({ error: 'Failed to complete sale: ' + error.message });
    } finally {
        client.release();
    }
});

// Get shift statistics
router.get('/shift/:shiftId/stats', authenticateToken, async (req, res) => {
    try {
        const { shiftId } = req.params;

        const stats = await pool.query(`
            SELECT 
                COUNT(r.id) as receipts_count,
                COALESCE(SUM(CASE WHEN r.is_cancelled = false THEN r.total_amount ELSE 0 END), 0) as total_sales,
                r.currency
            FROM receipts r
            WHERE r.shift_id = $1
            GROUP BY r.currency
        `, [shiftId]);

        res.json(stats.rows);
    } catch (error) {
        console.error('Get shift stats error:', error);
        res.status(500).json({ error: 'Failed to get shift statistics' });
    }
});

// Get receipts for shift
router.get('/shift/:shiftId/receipts', authenticateToken, async (req, res) => {
    try {
        const { shiftId } = req.params;

        const receipts = await pool.query(`
            SELECT 
                r.*,
                COUNT(si.id) as items_count
            FROM receipts r
            LEFT JOIN sale_items si ON r.id = si.receipt_id
            WHERE r.shift_id = $1
            GROUP BY r.id
            ORDER BY r.sale_time DESC
        `, [shiftId]);

        res.json(receipts.rows);
    } catch (error) {
        console.error('Get receipts error:', error);
        res.status(500).json({ error: 'Failed to get receipts' });
    }
});

// Get receipt details
router.get('/receipt/:receiptId', authenticateToken, async (req, res) => {
    try {
        const { receiptId } = req.params;

        const receipt = await pool.query('SELECT * FROM receipts WHERE id = $1', [receiptId]);
        
        if (receipt.rows.length === 0) {
            return res.status(404).json({ error: 'Receipt not found' });
        }

        const items = await pool.query(`
            SELECT 
                si.*,
                p.name as product_name,
                p.sku
            FROM sale_items si
            JOIN products p ON si.product_id = p.id
            WHERE si.receipt_id = $1
        `, [receiptId]);

        res.json({
            receipt: receipt.rows[0],
            items: items.rows
        });
    } catch (error) {
        console.error('Get receipt details error:', error);
        res.status(500).json({ error: 'Failed to get receipt details' });
    }
});

module.exports = router;
