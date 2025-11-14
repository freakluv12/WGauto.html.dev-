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

// Products - УЛУЧШЕННЫЙ: возвращает цену из inventory
router.get('/products/:subcategoryId', authenticateToken, async (req, res) => {
    try {
        const subcategoryId = req.params.subcategoryId;
        
        const result = await pool.query(`
            SELECT 
                p.*,
                COALESCE(SUM(i.quantity), 0) as total_quantity,
                MIN(i.received_date) as first_received,
                (SELECT sale_price FROM inventory WHERE product_id = p.id AND sale_price > 0 LIMIT 1) as default_sale_price
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

// Inventory - возвращает с sale_price
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

// НОВЫЙ роут: получить inventory по query параметру (для POS)
router.get('/inventory', authenticateToken, async (req, res) => {
    try {
        const { product_id } = req.query;
        
        if (!product_id) {
            return res.status(400).json({ error: 'product_id is required' });
        }
        
        const result = await pool.query(`
            SELECT 
                i.*,
                CASE 
                    WHEN i.source_type = 'dismantled' THEN c.brand || ' ' || c.model || ' ' || COALESCE(c.year::text, '')
                    ELSE 'Закупка'
                END as source_name
            FROM inventory i
            LEFT JOIN cars c ON i.source_type = 'dismantled' AND i.source_id = c.id
            WHERE i.product_id = $1 AND i.quantity > 0
            ORDER BY i.received_date
        `, [product_id]);
        
        res.json(result.rows);
    } catch (error) {
        console.error('Get inventory error:', error);
        res.status(500).json({ error: 'Failed to fetch inventory' });
    }
});

router.post('/inventory/receive', authenticateToken, async (req, res) => {
    try {
        const { product_id, source_type, source_id, quantity, purchase_price, currency, location } = req.body;
        
        if (!product_id || !source_type || !quantity || quantity <= 0) {
            return res.status(400).json({ error: 'Product, source type, and positive quantity are required' });
        }
        
        const result = await pool.query(
            `INSERT INTO inventory (product_id, source_type, source_id, quantity, purchase_price, currency, location, user_id) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
            [product_id, source_type, source_id || null, quantity, purchase_price || null, currency || 'GEL', location || '', req.user.id]
        );
        
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Receive inventory error:', error);
        res.status(500).json({ error: 'Failed to receive inventory' });
    }
});

// Обновить цену продажи для всех inventory записей товара
router.post('/products/update-price', authenticateToken, async (req, res) => {
    try {
        const { product_id, sale_price } = req.body;
        
        if (!product_id || sale_price === undefined) {
            return res.status(400).json({ error: 'product_id and sale_price are required' });
        }
        
        // Обновляем цену для всех записей inventory этого товара
        const result = await pool.query(
            'UPDATE inventory SET sale_price = $1 WHERE product_id = $2 RETURNING *',
            [sale_price, product_id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Product not found in inventory' });
        }
        
        res.json({ success: true, updated: result.rows.length });
    } catch (error) {
        console.error('Update product price error:', error);
        res.status(500).json({ error: 'Failed to update price' });
    }
});

// POS: Завершить продажу
router.post('/pos/complete-sale', authenticateToken, async (req, res) => {
    try {
        const { items, discount, final_total } = req.body;
        
        if (!items || items.length === 0) {
            return res.status(400).json({ error: 'Items are required' });
        }

        // Начинаем транзакцию
        await pool.query('BEGIN');

        try {
            // 1. Создаем смену если нет активной
            let shiftResult = await pool.query(`
                SELECT id FROM pos_shifts 
                WHERE user_id = $1 AND end_time IS NULL 
                LIMIT 1
            `, [req.user.id]);

            let shiftId;
            if (shiftResult.rows.length === 0) {
                // Создаем новую смену
                const newShift = await pool.query(
                    'INSERT INTO pos_shifts (user_id) VALUES ($1) RETURNING id',
                    [req.user.id]
                );
                shiftId = newShift.rows[0].id;
            } else {
                shiftId = shiftResult.rows[0].id;
            }

            // 2. Создаем чек
            const receiptResult = await pool.query(`
                INSERT INTO receipts (shift_id, user_id, total_amount, currency)
                VALUES ($1, $2, $3, $4)
                RETURNING id
            `, [shiftId, req.user.id, final_total, 'GEL']);

            const receiptId = receiptResult.rows[0].id;

            // 3. Добавляем товары в чек и списываем со склада
            for (const item of items) {
                // Добавляем в sale_items
                await pool.query(`
                    INSERT INTO sale_items (receipt_id, product_id, quantity, sale_price, cost_price, currency)
                    VALUES ($1, $2, $3, $4, $5, $6)
                `, [receiptId, item.id, item.quantity, item.salePrice, item.purchase_price || 0, 'GEL']);

                // Списываем со склада (FIFO - первые пришли, первые ушли)
                let remainingQty = item.quantity;
                const inventoryItems = await pool.query(`
                    SELECT id, quantity FROM inventory 
                    WHERE product_id = $1 AND quantity > 0
                    ORDER BY received_date ASC
                `, [item.id]);

                for (const invItem of inventoryItems.rows) {
                    if (remainingQty <= 0) break;

                    if (invItem.quantity >= remainingQty) {
                        // Достаточно на этой позиции
                        await pool.query(
                            'UPDATE inventory SET quantity = quantity - $1 WHERE id = $2',
                            [remainingQty, invItem.id]
                        );
                        remainingQty = 0;
                    } else {
                        // Используем всё с этой позиции
                        await pool.query(
                            'UPDATE inventory SET quantity = 0 WHERE id = $1',
                            [invItem.id]
                        );
                        remainingQty -= invItem.quantity;
                    }
                }

                if (remainingQty > 0) {
                    throw new Error(`Недостаточно товара "${item.name}" на складе`);
                }
            }

            // Коммитим транзакцию
            await pool.query('COMMIT');

            res.json({ 
                success: true, 
                receipt_id: receiptId,
                shift_id: shiftId
            });

        } catch (error) {
            // Откатываем транзакцию при ошибке
            await pool.query('ROLLBACK');
            throw error;
        }

    } catch (error) {
        console.error('Complete sale error:', error);
        res.status(500).json({ error: error.message || 'Failed to complete sale' });
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
                COALESCE(SUM(s.quantity), 0) as total_sold,
                COALESCE(SUM(s.sale_price * s.quantity), 0) as total_revenue,
                COALESCE(SUM(s.cost_price * s.quantity), 0) as total_cost,
                COALESCE(SUM(s.sale_price * s.quantity) - SUM(s.cost_price * s.quantity), 0) as net_profit,
                CASE 
                    WHEN SUM(s.cost_price * s.quantity) > 0 
                    THEN ((SUM(s.sale_price * s.quantity) - SUM(s.cost_price * s.quantity)) / SUM(s.cost_price * s.quantity) * 100)
                    ELSE 0 
                END as profit_margin_percent,
                s.currency
            FROM products p
            JOIN subcategories sc ON p.subcategory_id = sc.id
            JOIN categories c ON sc.category_id = c.id
            LEFT JOIN inventory_sales s ON p.id = s.product_id
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
            conditions.push(`s.sale_date >= $${paramCount}`);
            params.push(start_date);
        }
        
        if (end_date) {
            paramCount++;
            conditions.push(`s.sale_date <= $${paramCount}`);
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
        
        query += ' GROUP BY p.id, p.name, c.name, sc.name, s.currency ORDER BY total_revenue DESC';
        
        const result = await pool.query(query, params);
        
        // ИСПРАВЛЕННАЯ ЧАСТЬ - строка 235 была здесь
        const totals = result.rows.reduce((acc, row) => {
            const currencyValue = row.currency || 'USD';
            if (!acc[currencyValue]) {
                acc[currencyValue] = {
                    currency: currencyValue,
                    total_sold: 0,
                    total_revenue: 0,
                    total_cost: 0,
                    net_profit: 0
                };
            }
            acc[currencyValue].total_sold += parseInt(row.total_sold || 0);
            acc[currencyValue].total_revenue += parseFloat(row.total_revenue || 0);
            acc[currencyValue].total_cost += parseFloat(row.total_cost || 0);
            acc[currencyValue].net_profit += parseFloat(row.net_profit || 0);
            return acc;
        }, {});
        
        Object.keys(totals).forEach(currencyKey => {
            if (totals[currencyKey].total_cost > 0) {
                totals[currencyKey].profit_margin_percent = (totals[currencyKey].net_profit / totals[currencyKey].total_cost * 100).toFixed(2);
            } else {
                totals[currencyKey].profit_margin_percent = 0;
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
