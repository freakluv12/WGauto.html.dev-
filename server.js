const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const crypto = require('crypto');

const app = express();
const port = process.env.PORT || 3000;

// JWT_SECRET - генерируем если не установлен, но предупреждаем
let JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  JWT_SECRET = crypto.randomBytes(64).toString('hex');
  console.warn('⚠️  WARNING: JWT_SECRET not set! Generated random secret for this session.');
  console.warn('⚠️  Set JWT_SECRET in environment variables for production!');
  console.warn('⚠️  Add this to Render Environment: JWT_SECRET=' + JWT_SECRET);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

app.use(express.json());
app.use(express.static('public'));

// Initialize database
async function initDB() {
  try {
    // Создание базовых таблиц (users, cars, transactions, rentals)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(20) DEFAULT 'USER',
        active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS cars (
        id SERIAL PRIMARY KEY,
        brand VARCHAR(100) NOT NULL,
        model VARCHAR(100) NOT NULL,
        year INTEGER,
        vin VARCHAR(50),
        price DECIMAL(10,2),
        currency VARCHAR(3),
        status VARCHAR(20) DEFAULT 'active',
        user_id INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id SERIAL PRIMARY KEY,
        car_id INTEGER REFERENCES cars(id),
        user_id INTEGER REFERENCES users(id),
        type VARCHAR(10) NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        currency VARCHAR(3) NOT NULL,
        category VARCHAR(50),
        description TEXT,
        rental_id INTEGER,
        part_id INTEGER,
        date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS rentals (
        id SERIAL PRIMARY KEY,
        car_id INTEGER REFERENCES cars(id),
        user_id INTEGER REFERENCES users(id),
        client_name VARCHAR(200) NOT NULL,
        client_phone VARCHAR(50),
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        daily_price DECIMAL(10,2) NOT NULL,
        currency VARCHAR(3) NOT NULL,
        total_amount DECIMAL(10,2),
        status VARCHAR(20) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS parts (
        id SERIAL PRIMARY KEY,
        car_id INTEGER REFERENCES cars(id),
        user_id INTEGER REFERENCES users(id),
        name VARCHAR(200) NOT NULL,
        estimated_price DECIMAL(10,2),
        currency VARCHAR(3),
        cost_basis DECIMAL(10,2),
        car_currency VARCHAR(3),
        sale_price DECIMAL(10,2),
        sale_currency VARCHAR(3),
        buyer VARCHAR(200),
        sale_notes TEXT,
        status VARCHAR(20) DEFAULT 'available',
        storage_location VARCHAR(100),
        product_id INTEGER,
        converted_to_inventory BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        sold_at TIMESTAMP
      )
    `);

    // NEW: Create POS tables
    await pool.query(`
      CREATE TABLE IF NOT EXISTS pos_sales (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        discount_type VARCHAR(10),
        discount_value DECIMAL(10,2) DEFAULT 0,
        total_amount DECIMAL(10,2) NOT NULL,
        final_amount DECIMAL(10,2) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS pos_sale_items (
        id SERIAL PRIMARY KEY,
        sale_id INTEGER REFERENCES pos_sales(id) ON DELETE CASCADE,
        product_id INTEGER REFERENCES products(id),
        quantity INTEGER NOT NULL,
        unit_price DECIMAL(10,2) NOT NULL,
        total_price DECIMAL(10,2) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Создать admin если не существует
    const adminExists = await pool.query('SELECT id FROM users WHERE email = $1', ['admin@wgauto.com']);
    if (adminExists.rows.length === 0) {
      const randomPassword = crypto.randomBytes(8).toString('hex');
      const hashedPassword = await bcrypt.hash(randomPassword, 10);
      await pool.query(
        'INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3)',
        ['admin@wgauto.com', hashedPassword, 'ADMIN']
      );
      console.log('='.repeat(60));
      console.log('✅ Admin user created!');
      console.log('📧 Email: admin@wgauto.com');
      console.log('🔑 Password:', randomPassword);
      console.log('⚠️  SAVE THIS PASSWORD! It will not be shown again.');
      console.log('='.repeat(60));
    }

    console.log('✅ Database initialized successfully');
  } catch (error) {
    console.error('❌ Database initialization error:', error);
  }
}

// Middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.sendStatus(401);
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

// AUTH ROUTES
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const existingUser = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'User already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email, role',
      [email, hashedPassword]
    );

    const user = result.rows[0];
    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET);

    res.json({ token, user });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const result = await pool.query('SELECT * FROM users WHERE email = $1 AND active = true', [email]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];
    const isValidPassword = await bcrypt.compare(password, user.password_hash);

    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET);
    res.json({ token, user: { id: user.id, email: user.email, role: user.role } });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// DASHBOARD STATS
app.get('/api/stats/dashboard', authenticateToken, async (req, res) => {
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

// CARS ROUTES
app.get('/api/cars', authenticateToken, async (req, res) => {
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

app.post('/api/cars', authenticateToken, async (req, res) => {
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

app.get('/api/cars/:id/details', authenticateToken, async (req, res) => {
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

app.post('/api/cars/:id/expense', authenticateToken, async (req, res) => {
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

app.post('/api/cars/:id/dismantle', authenticateToken, async (req, res) => {
  try {
    const carId = req.params.id;
    await pool.query('UPDATE cars SET status = $1 WHERE id = $2', ['dismantled', carId]);
    res.json({ success: true });
  } catch (error) {
    console.error('Dismantle car error:', error);
    res.status(500).json({ error: 'Failed to dismantle car' });
  }
});

// RENTAL ROUTES
app.get('/api/rentals', authenticateToken, async (req, res) => {
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

app.post('/api/rentals', authenticateToken, async (req, res) => {
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

app.post('/api/rentals/:id/complete', authenticateToken, async (req, res) => {
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

app.get('/api/rentals/calendar/:year/:month', authenticateToken, async (req, res) => {
  try {
    const { year, month } = req.params;
    const userId = req.user.role === 'ADMIN' ? null : req.user.id;
    
    const query = userId ? 
      `SELECT r.*, c.brand, c.model 
       FROM rentals r 
       JOIN cars c ON r.car_id = c.id 
       WHERE r.user_id = $1 AND 
       (EXTRACT(YEAR FROM start_date) = $2 AND EXTRACT(MONTH FROM start_date) = $3)
       OR (EXTRACT(YEAR FROM end_date) = $2 AND EXTRACT(MONTH FROM end_date) = $3)
       OR (start_date <= $4 AND end_date >= $5)` :
      `SELECT r.*, c.brand, c.model 
       FROM rentals r 
       JOIN cars c ON r.car_id = c.id 
       WHERE (EXTRACT(YEAR FROM start_date) = $1 AND EXTRACT(MONTH FROM start_date) = $2)
       OR (EXTRACT(YEAR FROM end_date) = $1 AND EXTRACT(MONTH FROM end_date) = $2)
       OR (start_date <= $3 AND end_date >= $4)`;

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

// WAREHOUSE ROUTES
app.get('/api/warehouse/categories', authenticateToken, async (req, res) => {
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

app.post('/api/warehouse/categories', authenticateToken, async (req, res) => {
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

app.get('/api/warehouse/subcategories/:categoryId', authenticateToken, async (req, res) => {
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

app.post('/api/warehouse/subcategories', authenticateToken, async (req, res) => {
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

app.get('/api/warehouse/products/:subcategoryId', authenticateToken, async (req, res) => {
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

app.post('/api/warehouse/products', authenticateToken, async (req, res) => {
  try {
    const { subcategory_id, name, description, sku, min_stock_level, purchase_price, sale_price } = req.body;
    
    if (!subcategory_id || !name) {
      return res.status(400).json({ error: 'Subcategory ID and name are required' });
    }
    
    const result = await pool.query(
      'INSERT INTO products (subcategory_id, name, description, sku, min_stock_level, purchase_price, sale_price, user_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
      [subcategory_id, name, description || '', sku || null, min_stock_level || 0, purchase_price || null, sale_price || null, req.user.id]
    );
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Create product error:', error);
    res.status(500).json({ error: 'Failed to create product' });
  }
});

// NEW: Update product prices
app.put('/api/warehouse/products/:id', authenticateToken, async (req, res) => {
  try {
    const productId = req.params.id;
    const { name, description, sku, min_stock_level, purchase_price, sale_price } = req.body;
    
    const result = await pool.query(
      `UPDATE products 
       SET name = COALESCE($1, name),
           description = COALESCE($2, description),
           sku = COALESCE($3, sku),
           min_stock_level = COALESCE($4, min_stock_level),
           purchase_price = COALESCE($5, purchase_price),
           sale_price = COALESCE($6, sale_price)
       WHERE id = $7
       RETURNING *`,
      [name, description, sku, min_stock_level, purchase_price, sale_price, productId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update product error:', error);
    res.status(500).json({ error: 'Failed to update product' });
  }
});

// NEW: Get all products with inventory for POS
app.get('/api/warehouse/products-all', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.role === 'ADMIN' ? null : req.user.id;
    const userFilter = userId ? 'AND p.user_id = $1' : '';
    const params = userId ? [userId] : [];
    
    const result = await pool.query(`
      SELECT 
        p.id,
        p.name,
        p.sku,
        p.purchase_price,
        p.sale_price,
        p.subcategory_id,
        sc.name as subcategory_name,
        sc.category_id,
        c.name as category_name,
        c.icon as category_icon,
        COALESCE(SUM(i.quantity), 0) as stock_quantity
      FROM products p
      JOIN subcategories sc ON p.subcategory_id = sc.id
      JOIN categories c ON sc.category_id = c.id
      LEFT JOIN inventory i ON p.id = i.product_id
      WHERE 1=1 ${userFilter}
      GROUP BY p.id, p.name, p.sku, p.purchase_price, p.sale_price, p.subcategory_id, 
               sc.name, sc.category_id, c.name, c.icon
      ORDER BY c.name, sc.name, p.name
    `, params);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Get all products error:', error);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// NEW: POS Sale endpoint
app.post('/api/pos/sale', authenticateToken, async (req, res) => {
  try {
    const { items, discount_type, discount_value, total_amount, final_amount } = req.body;
    
    if (!items || items.length === 0) {
      return res.status(400).json({ error: 'No items in sale' });
    }
    
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Create sale record
      const saleResult = await client.query(
        `INSERT INTO pos_sales (user_id, discount_type, discount_value, total_amount, final_amount) 
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [req.user.id, discount_type || null, discount_value || 0, total_amount, final_amount]
      );
      
      const sale = saleResult.rows[0];
      
      // Process each item
      for (const item of items) {
        // Add sale item
        await client.query(
          `INSERT INTO pos_sale_items (sale_id, product_id, quantity, unit_price, total_price) 
           VALUES ($1, $2, $3, $4, $5)`,
          [sale.id, item.product_id, item.quantity, item.unit_price, item.total_price]
        );
        
        // Deduct from inventory (FIFO - first in, first out)
        let remainingQty = item.quantity;
        
        const inventoryItems = await client.query(
          `SELECT id, quantity, purchase_price, currency 
           FROM inventory 
           WHERE product_id = $1 AND quantity > 0 
           ORDER BY received_date ASC`,
          [item.product_id]
        );
        
        if (inventoryItems.rows.length === 0) {
          throw new Error(`Insufficient stock for product ${item.product_id}`);
        }
        
        let totalCost = 0;
        let costCurrency = 'USD';
        
        for (const invItem of inventoryItems.rows) {
          if (remainingQty <= 0) break;
          
          const deductQty = Math.min(remainingQty, invItem.quantity);
          
          // Update inventory quantity
          await client.query(
            'UPDATE inventory SET quantity = quantity - $1 WHERE id = $2',
            [deductQty, invItem.id]
          );
          
          totalCost += deductQty * (invItem.purchase_price || 0);
          costCurrency = invItem.currency || 'USD';
          remainingQty -= deductQty;
        }
        
        if (remainingQty > 0) {
          throw new Error(`Insufficient stock for product ${item.product_id}`);
        }
        
        // Create inventory sale record
        await client.query(
          `INSERT INTO inventory_sales (product_id, quantity, sale_price, cost_price, currency, user_id, notes) 
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [item.product_id, item.quantity, item.unit_price, totalCost / item.quantity, costCurrency, req.user.id, `POS Sale #${sale.id}`]
        );
      }
      
      // Create transaction
      await client.query(
        `INSERT INTO transactions (user_id, type, amount, currency, category, description) 
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [req.user.id, 'income', final_amount, 'USD', 'pos_sale', `POS Sale #${sale.id}`]
      );
      
      await client.query('COMMIT');
      res.json({ success: true, sale_id: sale.id });
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    
  } catch (error) {
    console.error('POS sale error:', error);
    res.status(500).json({ error: error.message || 'Failed to process sale' });
  }
});

// NEW: Batch receive inventory (for receiving interface)
app.post('/api/warehouse/inventory/receive-batch', authenticateToken, async (req, res) => {
  try {
    const { items } = req.body;
    
    if (!items || items.length === 0) {
      return res.status(400).json({ error: 'No items to receive' });
    }
    
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      for (const item of items) {
        const { product_id, quantity, purchase_price, sale_price, source_type, location } = item;
        
        if (!product_id || !quantity || quantity <= 0) {
          throw new Error('Invalid item data');
        }
        
        // Update product prices if provided
        if (purchase_price !== undefined || sale_price !== undefined) {
          await client.query(
            `UPDATE products 
             SET purchase_price = COALESCE($1, purchase_price),
                 sale_price = COALESCE($2, sale_price)
             WHERE id = $3`,
            [purchase_price, sale_price, product_id]
          );
        }
        
        // Add to inventory
        await client.query(
          `INSERT INTO inventory (product_id, source_type, quantity, purchase_price, currency, location, user_id) 
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [product_id, source_type || 'purchased', quantity, purchase_price || 0, 'USD', location || '', req.user.id]
        );
      }
      
      await client.query('COMMIT');
      res.json({ success: true });
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    
  } catch (error) {
    console.error('Batch receive error:', error);
    res.status(500).json({ error: error.message || 'Failed to receive items' });
  }
});
  try {
    const productId = req.params.productId;
    
    (async () => {
  const result = await pool.query(`
    SELECT * FROM users;
  `);
  console.log(result);
})();
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

app.post('/api/warehouse/inventory/receive', authenticateToken, async (req, res) => {
  try {
    const { product_id, source_type, source_id, quantity, purchase_price, currency, location } = req.body;
    
    if (!product_id || !source_type || !quantity || quantity <= 0) {
      return res.status(400).json({ error: 'Product, source type, and positive quantity are required' });
    }
    
    const result = await pool.query(
      `INSERT INTO inventory (product_id, source_type, source_id, quantity, purchase_price, currency, location, user_id) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [product_id, source_type, source_id || null, quantity, purchase_price || null, currency || 'USD', location || '', req.user.id]
    );
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Receive inventory error:', error);
    res.status(500).json({ error: 'Failed to receive inventory' });
  }
});

app.get('/api/warehouse/procurements', authenticateToken, async (req, res) => {
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

app.post('/api/warehouse/procurements', authenticateToken, async (req, res) => {
  try {
    const { supplier_name, invoice_number, total_amount, currency, notes, procurement_date, items } = req.body;
    
    if (!items || items.length === 0) {
      return res.status(400).json({ error: 'At least one item is required' });
    }
    
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      const procurementResult = await client.query(
        `INSERT INTO procurements (supplier_name, invoice_number, total_amount, currency, notes, procurement_date, user_id, status) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [supplier_name || '', invoice_number || '', total_amount, currency, notes || '', procurement_date || new Date(), req.user.id, 'completed']
      );
      
      const procurement = procurementResult.rows[0];
      
      for (const item of items) {
        await client.query(
          'INSERT INTO procurement_items (procurement_id, product_id, quantity, unit_price, currency) VALUES ($1, $2, $3, $4, $5)',
          [procurement.id, item.product_id, item.quantity, item.unit_price, currency]
        );
        
        await client.query(
          `INSERT INTO inventory (product_id, source_type, source_id, quantity, purchase_price, currency, user_id) 
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [item.product_id, 'purchased', procurement.id, item.quantity, item.unit_price, currency, req.user.id]
        );
      }
      
      await client.query('COMMIT');
      res.json(procurement);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Create procurement error:', error);
    res.status(500).json({ error: 'Failed to create procurement' });
  }
});

app.post('/api/warehouse/sales', authenticateToken, async (req, res) => {
  try {
    const { inventory_id, product_id, quantity, sale_price, cost_price, currency, buyer_name, buyer_phone, notes } = req.body;
    
    if (!product_id || !quantity || !sale_price || quantity <= 0) {
      return res.status(400).json({ error: 'Product, positive quantity, and sale price are required' });
    }
    
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      if (inventory_id) {
        const inventoryCheck = await client.query(
          'SELECT quantity FROM inventory WHERE id = $1',
          [inventory_id]
        );
        
        if (inventoryCheck.rows.length === 0 || inventoryCheck.rows[0].quantity < quantity) {
          throw new Error('Insufficient inventory quantity');
        }
      }
      
      const saleResult = await client.query(
        `INSERT INTO inventory_sales (inventory_id, product_id, quantity, sale_price, cost_price, currency, buyer_name, buyer_phone, notes, user_id) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
        [inventory_id || null, product_id, quantity, sale_price, cost_price || null, currency, buyer_name || '', buyer_phone || '', notes || '', req.user.id]
      );
      
      await client.query(
        'INSERT INTO transactions (user_id, type, amount, currency, category, description) VALUES ($1, $2, $3, $4, $5, $6)',
        [req.user.id, 'income', sale_price * quantity, currency, 'parts', `Sale of ${quantity} units`]
      );
      
      await client.query('COMMIT');
      res.json(saleResult.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Create sale error:', error);
    res.status(500).json({ error: error.message || 'Failed to create sale' });
  }
});

// NEW: Enhanced Analytics with Filters
app.get('/api/warehouse/analytics-detailed', authenticateToken, async (req, res) => {
  try {
    const { 
      start_date, 
      end_date, 
      category_id, 
      subcategory_id,
      sales_compare,
      sales_value,
      revenue_compare,
      revenue_value,
      profit_compare,
      profit_value,
      margin_compare,
      margin_value
    } = req.query;
    
    const userId = req.user.role === 'ADMIN' ? null : req.user.id;
    
    // Default to last 30 days if no dates specified
    const defaultEndDate = new Date().toISOString().split('T')[0];
    const defaultStartDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    const finalStartDate = start_date || defaultStartDate;
    const finalEndDate = end_date || defaultEndDate;
    
    let query = `
      SELECT 
        p.id as product_id,
        p.name as product_name,
        p.sku,
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
    
    // Date range filter
    paramCount++;
    conditions.push(`(s.sale_date >= $${paramCount} OR s.sale_date IS NULL)`);
    params.push(finalStartDate);
    
    paramCount++;
    conditions.push(`(s.sale_date <= $${paramCount} OR s.sale_date IS NULL)`);
    params.push(finalEndDate);
    
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
    
    query += ' GROUP BY p.id, p.name, p.sku, c.name, sc.name, s.currency';
    
    // Apply HAVING clauses for comparison filters
    let havingConditions = [];
    
    if (sales_compare && sales_value) {
      const operator = sales_compare === 'more' ? '>' : '<';
      havingConditions.push(`COALESCE(SUM(s.quantity), 0) ${operator} ${parseInt(sales_value)}`);
    }
    
    if (revenue_compare && revenue_value) {
      const operator = revenue_compare === 'more' ? '>' : '<';
      havingConditions.push(`COALESCE(SUM(s.sale_price * s.quantity), 0) ${operator} ${parseFloat(revenue_value)}`);
    }
    
    if (profit_compare && profit_value) {
      const operator = profit_compare === 'more' ? '>' : '<';
      havingConditions.push(`COALESCE(SUM(s.sale_price * s.quantity) - SUM(s.cost_price * s.quantity), 0) ${operator} ${parseFloat(profit_value)}`);
    }
    
    if (margin_compare && margin_value) {
      const operator = margin_compare === 'more' ? '>' : '<';
      havingConditions.push(`
        CASE 
          WHEN SUM(s.cost_price * s.quantity) > 0 
          THEN ((SUM(s.sale_price * s.quantity) - SUM(s.cost_price * s.quantity)) / SUM(s.cost_price * s.quantity) * 100)
          ELSE 0 
        END ${operator} ${parseFloat(margin_value)}
      `);
    }
    
    if (havingConditions.length > 0) {
      query += ' HAVING ' + havingConditions.join(' AND ');
    }
    
    query += ' ORDER BY total_revenue DESC';
    
    const result = await pool.query(query, params);
    
    // Calculate totals by currency
    const totals = result.rows.reduce((acc, row) => {
      const curr = row.currency || 'USD';
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
      totals: Object.values(totals),
      period: {
        start: finalStartDate,
        end: finalEndDate
      }
    });
  } catch (error) {
    console.error('Analytics detailed error:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

// Keep old analytics endpoint for backwards compatibility
app.get('/api/warehouse/analytics', authenticateToken, async (req, res) => {
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
    
    const totals = result.rows.reduce((acc, row) => {
      const curr = row.currency || 'USD';
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

// ADMIN ROUTES
app.get('/api/admin/users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, email, role, active, created_at FROM users ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

app.put('/api/admin/users/:id/toggle', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const userId = req.params.id;
    await pool.query('UPDATE users SET active = NOT active WHERE id = $1', [userId]);
    res.json({ success: true });
  } catch (error) {
    console.error('Toggle user error:', error);
    res.status(500).json({ error: 'Failed to toggle user status' });
  }
});

// Health check
app.get('/', (req, res) => {
  res.send('WGauto CRM Server is running');
});

// Start server
initDB().then(() => {
  app.listen(port, () => {
    console.log(`🚀 WGauto CRM Server running on port ${port}`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    if (!process.env.JWT_SECRET) {
      console.log('⚠️  Remember to set JWT_SECRET in production!');
    }
  });
});

module.exports = app;
