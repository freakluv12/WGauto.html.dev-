const express = require('express');
const router = express.Router();
const { pool } = require('../database');
const { authenticateToken } = require('../middleware');

// ==================== SHIFTS ====================

// Get active shift
router.get('/active-shift', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM pos_shifts WHERE user_id = $1 AND end_time IS NULL ORDER BY start_time DESC LIMIT 1',
            [req.user.id]
        );
        
        if (result.rows.length > 0) {
            res.json({ shift: result.rows[0] });
        } else {
            res.json({ shift: null });
        }
    } catch (error) {
        console.error('Get active shift error:', error);
        res.status(500).json({ error: 'Failed to fetch active shift' });
    }
});

// Open new shift
router.post('/shifts/open', authenticateToken, async (req, res) => {
    try {
        const { start_time } = req.body;
        
        if (!start_time) {
            return res.status(400).json({ error: 'Start time is required' });
        }
        
        // Check if there's already an active shift
        const activeShift = await pool.query(
            'SELECT * FROM pos_shifts WHERE user_id = $1 AND end_time IS NULL',
            [req.user.id]
        );
        
        if (activeShift.rows.length > 0) {
            return res.status(400).json({ error: 'There is already an active shift' });
        }
        
        const result = await pool.query(
            'INSERT INTO pos_shifts (user_id, start_time) VALUES ($1, $2) RETURNING *',
            [req.user.id, start_time]
        );
        
        res.json({ shift: result.rows[0] });
    } catch (error) {
        console.error('Open shift error:', error);
        res.status(500).json({ error: 'Failed to open shift' });
    }
});

// Close shift
router.post('/shifts/:shiftId/close', authenticateToken, async (req, res) => {
    try {
        const shiftId = req.params.shiftId;
        
        // Verify shift belongs to user
        const shiftCheck = await pool.query(
            'SELECT * FROM pos_shifts WHERE id = $1 AND user_id = $2',
            [shiftId, req.user.id]
        );
        
        if (shiftCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Shift not found' });
        }
        
        const result = await pool.query(
            'UPDATE pos_shifts SET end_time = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *',
            [shiftId]
        );
        
        res.json({ shift: result.rows[0] });
    } catch (error) {
        console.error('Close shift error:', error);
        res.status(500).json({ error: 'Failed to close shift' });
    }
});

// Get shift history
router.get('/shifts/history', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                ps.*,
                COUNT(r.id) as receipts_count,
                COALESCE(SUM(r.total_amount), 0) as total_sales
            FROM pos_shifts ps
            LEFT JOIN receipts r ON ps.id = r.shift_id AND r.is_cancelled = false
            WHERE ps.user_id = $1
            GROUP BY ps.id
            ORDER BY ps.start_time DESC
            LIMIT 50
        `, [req.user.id]);
        
        res.json(result.rows);
    } catch (error) {
        console.error('Get shift history error:', error);
        res.status(500).json({ error: 'Failed to fetch shift history' });
    }
});

// Get shift receipts
router.get('/shifts/:shiftId/receipts', authenticateToken, async (req, res) => {
    try {
        const shiftId = req.params.shiftId;
        
        // Get receipts with items
        const receipts = await pool.query(`
            SELECT 
                r.*,
                json_agg(
                    json_build_object(
                        'product_id', si.product_id,
                        'product_name', p.name,
                        'quantity', si.quantity,
                        'sale_price', si.sale_price,
                        'cost_price', si.cost_price
                    )
                ) as items
            FROM receipts r
            LEFT JOIN sale_items si ON r.id = si.receipt_id
            LEFT JOIN products p ON si.product_id = p.id
            WHERE r.shift_id = $1 AND r.user_id = $2
            GROUP BY r.id
            ORDER BY r.sale_time DESC
        `, [shiftId, req.user.id]);
        
        res.json(receipts.rows);
    } catch (error) {
        console.error('Get receipts error:', error);
        res.status(500).json({ error: 'Failed to fetch receipts' });
    }
});

// ==================== SALES ====================

// Complete sale (create receipt)
router.post('/sales/complete', authenticateToken, async (req, res) => {
    const client = await pool.connect();
    
    try {
        const { shift_id, items } = req.body;
        
        if (!shift_id || !items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: 'Shift ID and items are required' });
        }
        
        await client.query('BEGIN');
        
        // Verify shift is active
        const shiftCheck = await client.query(
            'SELECT * FROM pos_shifts WHERE id = $1 AND user_id = $2 AND end_time IS NULL',
            [shift_id, req.user.id]
        );
        
        if (shiftCheck.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Invalid or closed shift' });
        }
        
        // Calculate total and determine currency (use currency from first item's inventory)
        let totalAmount = 0;
        let currency = 'GEL';
        
        // Get inventory data for cost calculation and currency
        const firstItem = items[0];
        const inventoryCheck = await client.query(
            'SELECT currency FROM inventory WHERE product_id = $1 AND quantity > 0 LIMIT 1',
            [firstItem.product_id]
        );
        
        if (inventoryCheck.rows.length > 0) {
            currency = inventoryCheck.rows[0].currency;
        }
        
        for (const item of items) {
            totalAmount += item.sale_price * item.quantity;
        }
        
        // Create receipt
        const receiptResult = await client.query(
            'INSERT INTO receipts (shift_id, user_id, total_amount, currency) VALUES ($1, $2, $3, $4) RETURNING *',
            [shift_id, req.user.id, totalAmount, currency]
        );
        
        const receipt = receiptResult.rows[0];
        
        // Process each item
        for (const item of items) {
            // Get inventory items (FIFO - first in, first out)
            const inventoryItems = await client.query(
                `SELECT * FROM inventory 
                 WHERE product_id = $1 AND quantity > 0 
                 ORDER BY received_date ASC`,
                [item.product_id]
            );
            
            if (inventoryItems.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: `Product ${item.product_id} not in stock` });
            }
            
            let remainingQuantity = item.quantity;
            let weightedCostPrice = 0;
            let totalDeducted = 0;
            
            // Deduct from inventory (FIFO)
            for (const invItem of inventoryItems.rows) {
                if (remainingQuantity <= 0) break;
                
                const deductAmount = Math.min(remainingQuantity, invItem.quantity);
                
                // Update inventory
                await client.query(
                    'UPDATE inventory SET quantity = quantity - $1 WHERE id = $2',
                    [deductAmount, invItem.id]
                );
                
                // Calculate weighted cost
                if (invItem.purchase_price) {
                    weightedCostPrice += invItem.purchase_price * deductAmount;
                    totalDeducted += deductAmount;
                }
                
                remainingQuantity -= deductAmount;
            }
            
            // Calculate average cost price
            const avgCostPrice = totalDeducted > 0 ? weightedCostPrice / totalDeducted : 0;
            
            if (remainingQuantity > 0) {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: `Insufficient stock for product ${item.product_id}` });
            }
            
            // Create sale item record
            await client.query(
                `INSERT INTO sale_items (receipt_id, product_id, quantity, sale_price, cost_price, currency)
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [receipt.id, item.product_id, item.quantity, item.sale_price, avgCostPrice, currency]
            );
        }
        
        await client.query('COMMIT');
        res.json({ success: true, receipt });
        
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Complete sale error:', error);
        res.status(500).json({ error: 'Failed to complete sale' });
    } finally {
        client.release();
    }
});

// Cancel receipt (refund)
router.post('/receipts/:receiptId/cancel', authenticateToken, async (req, res) => {
    const client = await pool.connect();
    
    try {
        const receiptId = req.params.receiptId;
        
        await client.query('BEGIN');
        
        // Get receipt
        const receiptResult = await client.query(
            'SELECT * FROM receipts WHERE id = $1 AND user_id = $2',
            [receiptId, req.user.id]
        );
        
        if (receiptResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Receipt not found' });
        }
        
        const receipt = receiptResult.rows[0];
        
        if (receipt.is_cancelled) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Receipt already cancelled' });
        }
        
        // Get sale items
        const saleItems = await client.query(
            'SELECT * FROM sale_items WHERE receipt_id = $1',
            [receiptId]
        );
        
        // Return items to inventory
        for (const item of saleItems.rows) {
            // Create new inventory entry for returned items
            await client.query(
                `INSERT INTO inventory (product_id, source_type, quantity, purchase_price, sale_price, currency, location, user_id)
                 VALUES ($1, 'returned', $2, $3, $4, $5, 'ВОЗВРАТ', $6)`,
                [item.product_id, item.quantity, item.cost_price, item.sale_price, item.currency, req.user.id]
            );
        }
        
        // Mark receipt as cancelled
        await client.query(
            'UPDATE receipts SET is_cancelled = true WHERE id = $1',
            [receiptId]
        );
        
        await client.query('COMMIT');
        res.json({ success: true });
        
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Cancel receipt error:', error);
        res.status(500).json({ error: 'Failed to cancel receipt' });
    } finally {
        client.release();
    }
});

module.exports = router;
