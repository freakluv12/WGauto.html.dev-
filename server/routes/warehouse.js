const express = require('express');
const router = express.Router();
const { pool } = require('../database');
const { authenticateToken } = require('../middleware');

// ==================== CATEGORIES ====================

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

// ==================== SUBCATEGORIES ====================

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

// ==================== PRODUCTS ====================

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

// Search products for receiving
router.get('/products/search', authenticateToken, async (req, res) => {
    try {
        const query = req.query.q;
        
        if (!query || query.length < 2) {
            return res.json([]);
        }
        
        const searchPattern = `%${query}%`;
        const result = await pool.query(`
            SELECT 
                p.*,
                COALESCE(SUM(i.quantity), 0) as total_quantity
            FROM products p
            LEFT JOIN inventory i ON p.id = i.product_id
            WHERE (LOWER(p.name) LIKE LOWER($1) OR LOWER(p.sku) LIKE LOWER($1))
            AND p.user_id = $2
            GROUP BY p.id
            ORDER BY p.name
            LIMIT 20
        `, [searchPattern, req.user.id]);
        
        res.json(result.rows);
    } catch (error) {
        console.error('Search products error:', error);
        res.status(500).json({ error: 'Failed to search products' });
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

// ==================== INVENTORY ====================

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

router.post('/inventory/receive', authenticateToken, async (req, res) => {
    try {
        const { product_id, source_type, source_id, quantity, purchase_price, sale_price, currency, location } = req.body;
        
        if (!product_id || !source_type || !quantity || quantity <= 0) {
            return res.status(400).json({ error: 'Product, source type, and positive quantity are required' });
        }
        
        const result = await pool.query(
            `INSERT INTO inventory (product_id, source_type, source_id, quantity, purchase_price, sale_price, currency, location, user_id) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
            [product_id, source_type, source_id || null, quantity, purchase_price || null, sale_price || null, currency || 'GEL', location || '', req.user.id]
        );
        
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Receive inventory error:', error);
        res.status(500).json({ error: 'Failed to receive inventory' });
    }
});

// Bulk receive inventory
router.post('/inventory/receive-bulk', authenticateToken, async (req, res) => {
    const client = await pool.connect();
    
    try {
        const { items } = req.body;
        
        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: 'Items array is required' });
        }
        
        await client.query('BEGIN');
        
        const results = [];
        for (const item of items) {
            if (!item.product_id || !item.quantity || item.quantity <= 0) {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: 'Invalid item data' });
            }
            
            const result = await client.query(
                `INSERT INTO inventory (product_id, source_type, quantity, purchase_price, sale_price, currency, location, user_id) 
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
                [
                    item.product_id, 
                    'purchased', 
                    item.quantity, 
                    item.purchase_price || null, 
                    item.sale_price || null,
                    item.currency || 'GEL', 
                    item.location || '', 
                    req.user.id
                ]
            );
            
            results.push(result.rows[0]);
        }
        
        await client.query('COMMIT');
        res.json({ success: true, items: results });
        
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Bulk receive error:', error);
        res.status(500).json({ error: 'Failed to receive inventory' });
    } finally {
        client.release();
    }
});

// ==================== ANALYTICS ====================

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
                COALESCE(SUM(si.sale_price * si.quantity) - SUM(si.cost_price * si.quantity), 0) as net_profit,
                CASE 
                    WHEN SUM(si.cost_price * si.quantity) > 0 
                    THEN ((SUM(si.sale_price * si.quantity) - SUM(si.cost_price * si.quantity)) / SUM(si.cost_price * si.quantity) * 100)
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
        
        query += ' GROUP BY p.id, p.name, c.name, sc.name, si.currency HAVING SUM(si.quantity) > 0 ORDER BY total_revenue DESC';
        
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
