const express = require('express');
const router = express.Router();
const { pool } = require('../database');
const { authenticateToken } = require('../middleware');

// Categories
router.get('/categories', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.role === 'ADMIN' ? null : req.user.id;
        const query = userId ? 
            'SELECT * FROM categories WHERE user_id = $1 ORDER BY name' :
            'SELECT * FROM categories ORDER BY name';
        const params = userId ? [userId] : [];
        
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (error) {
        console.error('Get categories error:', error);
        res.status(500).json({ error: 'Failed to fetch categories' });
    }
});

router.post('/categories', authenticateToken, async (req, res) => {
    try {
        const { name, description, icon } = req.body;
        
        if (!name) {
            return res.status(400).json({ error: 'Name is required' });
        }
        
        const result = await pool.query(
            'INSERT INTO categories (name, description, icon, user_id) VALUES ($1, $2, $3, $4) RETURNING *',
            [name, description || '', icon || '📦', req.user.id]
        );
        
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Create category error:', error);
        res.status(500).json({ error: 'Failed to create category' });
    }
});

// Subcategories
router.get('/subcategories/:categoryId', authenticateToken, async (req, res) => {
    try {
        const categoryId = req.params.categoryId;
        const result = await pool.query(
            'SELECT * FROM subcategories WHERE category_id = $1 ORDER BY name',
            [categoryId]
        );
        res.json(result.rows);
    } catch (error) {
        console.error('Get subcategories error:', error);
        res.status(500).json({ error: 'Failed to fetch subcategories' });
    }
});

router.post('/subcategories', authenticateToken, async (req, res) => {
    try {
        const { category_id, name, description } = req.body;
        
        if (!category_id || !name) {
            return res.status(400).json({ error: 'Category ID and name are required' });
        }
        
        const result = await pool.query(
            'INSERT INTO subcategories (category_id, name, description, user_id) VALUES ($1, $2, $3, $4) RETURNING *',
            [category_id, name, description || '', req.user.id]
        );
        
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Create subcategory error:', error);
        res.status(500).json({ error: 'Failed to create subcategory' });
    }
});

// Products
router.get('/products/:subcategoryId', authenticateToken, async (req, res) => {
    try {
        const subcategoryId = req.params.subcategoryId;
        
        const result = await pool.query(`
            SELECT 
                p.*,
                COALESCE(SUM(i.quantity), 0) as total_quantity,
                MIN(i.received_date) as first_received
            FROM products p
            LEFT JOIN inventory i ON p.id = i.product_id
            WHERE p.subcategory_id = $1
            GROUP BY p.id
            ORDER BY p.name
        `, [subcategoryId]);
        
        res.json(result.rows);
    } catch (error) {
        console.error('Get products error:', error);
        res.status(500).json({ error: 'Failed to fetch products' });
    }
});

router.post('/products', authenticateToken, async (req, res) => {
    try {
        const { subcategory_id, name, description, sku, min_stock_level } = req.body;
        
        if (!subcategory_id || !name) {
            return res.status(400).json({ error: 'Subcategory ID and name are required' });
        }
        
        const result = await pool.query(
            'INSERT INTO products (subcategory_id, name, description, sku, min_stock_level, user_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
            [subcategory_id, name, description || '', sku || null, min_stock_level || 0, req.user.id]
        );
        
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Create product error:', error);
        res.status(500).json({ error: 'Failed to create product' });
    }
});

// Inventory
router.get('/inventory/:productId', authenticateToken, async (req, res) => {
    try {
        const productId = req.params.productId;
        
        const result = await pool.query(`
            SELECT 
                i.*,
                CASE 
                    WHEN i.source_type = 'dismantled' THEN c.brand || ' ' || c.model || ' ' || COALESCE(c.year::text, '')
                    ELSE 'Закупка'
                END as source_name,
                CURRENT_DATE - i.received_date as days_in_storage
            FROM inventory i
            LEFT JOIN cars c ON i.source_type = 'dismantled' AND i.source_id = c.id
            WHERE i.product_id = $1 AND i.quantity > 0
            ORDER BY i.received_date
        `, [productId]);
        
        res.json(result.rows);
    } catch (error) {
        console.error('Get inventory error:', error);
        res.status(500).json({ error: 'Failed to fetch inventory' });
    }
});

// ==================== ОПРИХОДОВАНИЕ ====================
router.post('/procurements', authenticateToken, async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        const { supplier_name, invoice_number, procurement_date, items, notes } = req.body;
        
        if (!items || items.length === 0) {
            throw new Error('Необходимо указать хотя бы один товар');
        }

        // Вычисляем общую сумму
        let total_amount = 0;
        let currency = items[0].currency || 'GEL';
        
        items.forEach(item => {
            total_amount += parseFloat(item.quantity) * parseFloat(item.unit_price);
        });

        // Создаем оприходование
        const procurementResult = await client.query(
            `INSERT INTO procurements (supplier_name, invoice_number, total_amount, currency, notes, procurement_date, user_id) 
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
            [supplier_name || '', invoice_number || '', total_amount, currency, notes || '', procurement_date || new Date(), req.user.id]
        );
        
        const procurementId = procurementResult.rows[0].id;

        // Добавляем позиции оприходования и обновляем инвентарь
        for (const item of items) {
            // Добавляем в procurement_items
            await client.query(
                `INSERT INTO procurement_items (procurement_id, product_id, quantity, unit_price, currency) 
                 VALUES ($1, $2, $3, $4, $5)`,
                [procurementId, item.product_id, item.quantity, item.unit_price, item.currency || 'GEL']
            );
            
            // Добавляем в inventory
            await client.query(
                `INSERT INTO inventory (product_id, source_type, source_id, quantity, purchase_price, sale_price, currency, location, user_id) 
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                [
                    item.product_id, 
                    'purchased', 
                    procurementId, 
                    item.quantity, 
                    item.unit_price,
                    item.sale_price || null,
                    item.currency || 'GEL', 
                    item.location || '', 
                    req.user.id
                ]
            );
        }
        
        await client.query('COMMIT');
        res.json(procurementResult.rows[0]);
        
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Procurement error:', error);
        res.status(500).json({ error: error.message || 'Failed to process procurement' });
    } finally {
        client.release();
    }
});

// Получить все оприходования
router.get('/procurements', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.role === 'ADMIN' ? null : req.user.id;
        const query = userId ? 
            'SELECT * FROM procurements WHERE user_id = $1 ORDER BY procurement_date DESC' :
            'SELECT * FROM procurements ORDER BY procurement_date DESC';
        const params = userId ? [userId] : [];
        
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (error) {
        console.error('Get procurements error:', error);
        res.status(500).json({ error: 'Failed to fetch procurements' });
    }
});

// Получить детали оприходования
router.get('/procurements/:id', authenticateToken, async (req, res) => {
    try {
        const procurementId = req.params.id;
        
        const procurement = await pool.query(
            'SELECT * FROM procurements WHERE id = $1',
            [procurementId]
        );
        
        if (procurement.rows.length === 0) {
            return res.status(404).json({ error: 'Procurement not found' });
        }
        
        const items = await pool.query(`
            SELECT pi.*, p.name as product_name, p.sku
            FROM procurement_items pi
            JOIN products p ON pi.product_id = p.id
            WHERE pi.procurement_id = $1
        `, [procurementId]);
        
        res.json({
            ...procurement.rows[0],
            items: items.rows
        });
    } catch (error) {
        console.error('Get procurement details error:', error);
        res.status(500).json({ error: 'Failed to fetch procurement details' });
    }
});

// ==================== POS SHIFTS ====================
// Открыть смену
router.post('/shifts/open', authenticateToken, async (req, res) => {
    try {
        // Проверяем, нет ли уже открытой смены
        const activeShift = await pool.query(
            'SELECT * FROM pos_shifts WHERE user_id = $1 AND end_time IS NULL',
            [req.user.id]
        );
        
        if (activeShift.rows.length > 0) {
            return res.status(400).json({ error: 'У вас уже есть открытая смена' });
        }
        
        const result = await pool.query(
            'INSERT INTO pos_shifts (user_id) VALUES ($1) RETURNING *',
            [req.user.id]
        );
        
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Open shift error:', error);
        res.status(500).json({ error: 'Failed to open shift' });
    }
});

// Закрыть смену
router.post('/shifts/close', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(
            'UPDATE pos_shifts SET end_time = CURRENT_TIMESTAMP WHERE user_id = $1 AND end_time IS NULL RETURNING *',
            [req.user.id]
        );
        
        if (result.rows.length === 0) {
            return res.status(400).json({ error: 'Нет открытой смены' });
        }
        
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Close shift error:', error);
        res.status(500).json({ error: 'Failed to close shift' });
    }
});

// Получить активную смену
router.get('/shifts/active', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM active_shifts_with_stats WHERE user_id = $1',
            [req.user.id]
        );
        
        res.json(result.rows[0] || null);
    } catch (error) {
        console.error('Get active shift error:', error);
        res.status(500).json({ error: 'Failed to fetch active shift' });
    }
});

// ==================== POS SALES ====================
router.post('/sales', authenticateToken, async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        const { items, currency } = req.body;
        
        if (!items || items.length === 0) {
            throw new Error('Нет товаров для продажи');
        }

        // Проверяем активную смену
        let shiftResult = await client.query(
            'SELECT id FROM pos_shifts WHERE user_id = $1 AND end_time IS NULL',
            [req.user.id]
        );
        
        let shiftId;
        if (shiftResult.rows.length === 0) {
            // Автоматически открываем смену
            const newShift = await client.query(
                'INSERT INTO pos_shifts (user_id) VALUES ($1) RETURNING id',
                [req.user.id]
            );
            shiftId = newShift.rows[0].id;
        } else {
            shiftId = shiftResult.rows[0].id;
        }

        // Вычисляем общую сумму
        let totalAmount = 0;
        items.forEach(item => {
            totalAmount += parseFloat(item.quantity) * parseFloat(item.sale_price);
        });

        // Создаем чек
        const receiptResult = await client.query(
            `INSERT INTO receipts (shift_id, user_id, total_amount, currency) 
             VALUES ($1, $2, $3, $4) RETURNING *`,
            [shiftId, req.user.id, totalAmount, currency || 'GEL']
        );
        
        const receiptId = receiptResult.rows[0].id;

        // Обрабатываем каждый товар
        for (const item of items) {
            // Проверяем наличие товара
            const inventoryCheck = await client.query(
                'SELECT SUM(quantity) as total FROM inventory WHERE product_id = $1',
                [item.product_id]
            );
            
            const availableQty = parseInt(inventoryCheck.rows[0].total || 0);
            if (availableQty < item.quantity) {
                throw new Error(`Недостаточно товара на складе: ${item.product_name}`);
            }

            // Получаем средневзвешенную себестоимость
            const costResult = await client.query(`
                SELECT 
                    SUM(purchase_price * quantity) / NULLIF(SUM(quantity), 0) as avg_cost
                FROM inventory 
                WHERE product_id = $1 AND quantity > 0
            `, [item.product_id]);
            
            const costPrice = costResult.rows[0].avg_cost || 0;

            // Добавляем в sale_items
            await client.query(
                `INSERT INTO sale_items (receipt_id, product_id, quantity, sale_price, cost_price, currency) 
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [receiptId, item.product_id, item.quantity, item.sale_price, costPrice, currency || 'GEL']
            );

            // Списываем со склада (FIFO - первый пришел, первый ушел)
            let remainingQty = item.quantity;
            
            const inventoryBatches = await client.query(
                'SELECT id, quantity FROM inventory WHERE product_id = $1 AND quantity > 0 ORDER BY received_date, id',
                [item.product_id]
            );
            
            for (const batch of inventoryBatches.rows) {
                if (remainingQty <= 0) break;
                
                const qtyToDeduct = Math.min(remainingQty, batch.quantity);
                
                await client.query(
                    'UPDATE inventory SET quantity = quantity - $1 WHERE id = $2',
                    [qtyToDeduct, batch.id]
                );
                
                remainingQty -= qtyToDeduct;
            }
        }
        
        await client.query('COMMIT');
        res.json(receiptResult.rows[0]);
        
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Sale error:', error);
        res.status(500).json({ error: error.message || 'Failed to complete sale' });
    } finally {
        client.release();
    }
});

// Получить чеки
router.get('/receipts', authenticateToken, async (req, res) => {
    try {
        const { shift_id, start_date, end_date } = req.query;
        
        let query = `
            SELECT r.*, 
                   ps.start_time as shift_start,
                   COUNT(si.id) as items_count
            FROM receipts r
            LEFT JOIN pos_shifts ps ON r.shift_id = ps.id
            LEFT JOIN sale_items si ON r.id = si.receipt_id
            WHERE r.user_id = $1
        `;
        let params = [req.user.id];
        let paramCount = 1;
        
        if (shift_id) {
            paramCount++;
            query += ` AND r.shift_id = $${paramCount}`;
            params.push(shift_id);
        }
        
        if (start_date) {
            paramCount++;
            query += ` AND r.sale_time >= $${paramCount}`;
            params.push(start_date);
        }
        
        if (end_date) {
            paramCount++;
            query += ` AND r.sale_time <= $${paramCount}`;
            params.push(end_date);
        }
        
        query += ' GROUP BY r.id, ps.start_time ORDER BY r.sale_time DESC';
        
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (error) {
        console.error('Get receipts error:', error);
        res.status(500).json({ error: 'Failed to fetch receipts' });
    }
});

// Получить детали чека
router.get('/receipts/:id', authenticateToken, async (req, res) => {
    try {
        const receiptId = req.params.id;
        
        const receipt = await pool.query(
            'SELECT * FROM receipts WHERE id = $1',
            [receiptId]
        );
        
        if (receipt.rows.length === 0) {
            return res.status(404).json({ error: 'Receipt not found' });
        }
        
        const items = await pool.query(`
            SELECT si.*, p.name as product_name, p.sku
            FROM sale_items si
            JOIN products p ON si.product_id = p.id
            WHERE si.receipt_id = $1
        `, [receiptId]);
        
        res.json({
            ...receipt.rows[0],
            items: items.rows
        });
    } catch (error) {
        console.error('Get receipt details error:', error);
        res.status(500).json({ error: 'Failed to fetch receipt details' });
    }
});

// Analytics
router.get('/analytics', authenticateToken, async (req, res) => {
    try {
        const { start_date, end_date, category_id, subcategory_id } = req.query;
        const userId = req.user.role === 'ADMIN' ? null : req.user.id;
        
        let query = `
            SELECT 
                p.id,
                p.name as product_name,
                c.name as category_name,
                sc.name as subcategory_name,
                COALESCE(SUM(si.quantity), 0) as total_sold,
                COALESCE(SUM(si.sale_price * si.quantity), 0) as total_revenue,
                COALESCE(SUM(si.cost_price * si.quantity), 0) as total_cost,
                COALESCE(SUM((si.sale_price - si.cost_price) * si.quantity), 0) as net_profit,
                CASE 
                    WHEN SUM(si.cost_price * si.quantity) > 0 
                    THEN ((SUM((si.sale_price - si.cost_price) * si.quantity) / SUM(si.cost_price * si.quantity)) * 100)
                    ELSE 0 
                END as profit_margin_percent,
                si.currency
            FROM products p
            JOIN subcategories sc ON p.subcategory_id = sc.id
            JOIN categories c ON sc.category_id = c.id
            LEFT JOIN sale_items si ON p.id = si.product_id
            LEFT JOIN receipts r ON si.receipt_id = r.id AND r.is_cancelled = false
        `;
        
        let conditions = [];
        let params = [];
        let paramCount = 0;
        
        if (userId) {
            paramCount++;
            conditions.push(`p.user_id = $${paramCount}`);
            params.push(userId);
        }
        
        if (start_date) {
            paramCount++;
            conditions.push(`r.sale_time >= $${paramCount}`);
            params.push(start_date);
        }
        
        if (end_date) {
            paramCount++;
            conditions.push(`r.sale_time <= $${paramCount}`);
            params.push(end_date);
        }
        
        if (category_id) {
            paramCount++;
            conditions.push(`c.id = $${paramCount}`);
            params.push(category_id);
        }
        
        if (subcategory_id) {
            paramCount++;
            conditions.push(`sc.id = $${paramCount}`);
            params.push(subcategory_id);
        }
        
        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }
        
        query += ' GROUP BY p.id, p.name, c.name, sc.name, si.currency ORDER BY total_revenue DESC';
        
        const result = await pool.query(query, params);
        
        const totals = result.rows.reduce((acc, row) => {
            const curr = row.currency || 'GEL';
            if (!acc[curr]) {
                acc[curr] = {
                    currency: curr,
                    total_sold: 0,
                    total_revenue: 0,
                    total_cost: 0,
                    net_profit: 0
                };
            }
            acc[curr].total_sold += parseInt(row.total_sold || 0);
            acc[curr].total_revenue += parseFloat(row.total_revenue || 0);
            acc[curr].total_cost += parseFloat(row.total_cost || 0);
            acc[curr].net_profit += parseFloat(row.net_profit || 0);
            return acc;
        }, {});
        
        Object.keys(totals).forEach(curr => {
            if (totals[curr].total_cost > 0) {
                totals[curr].profit_margin_percent = (totals[curr].net_profit / totals[curr].total_cost * 100).toFixed(2);
            } else {
                totals[curr].profit_margin_percent = 0;
            }
        });
        
        res.json({
            items: result.rows,
            totals: Object.values(totals)
        });
    } catch (error) {
        console.error('Analytics error:', error);
        res.status(500).json({ error: 'Failed to fetch analytics' });
    }
});

module.exports = router;
