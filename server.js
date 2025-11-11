const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const crypto = require('crypto');

const app = express();
const port = process.env.PORT || 3000;

// JWT SECRET
let JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  JWT_SECRET = crypto.randomBytes(64).toString('hex');
  console.warn('⚠️  WARNING: JWT_SECRET not set in .env! Using random key.');
}

// DATABASE CONNECTION
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/wgauto',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Test database connection
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('❌ Database connection FAILED:', err.message);
  } else {
    console.log('✅ Database connected successfully at', res.rows[0].now);
  }
});

// ==================== MIDDLEWARE ====================
// 1. CORS (MUST BE FIRST!)
app.use(cors({
  origin: 'http://localhost:5173', // Change if your frontend uses different port
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// 2. Body parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// 3. Request logging
app.use((req, res, next) => {
  console.log(`📨 ${req.method} ${req.path}`);
  next();
});

// ==================== DATABASE INITIALIZATION ====================
async function initDB() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    console.log('🗑️  Dropping old tables...');
    
    // Drop all tables in correct order (reverse of foreign key dependencies)
    await client.query('DROP TABLE IF EXISTS inventory_sales CASCADE');
    await client.query('DROP TABLE IF EXISTS inventory CASCADE');
    await client.query('DROP TABLE IF EXISTS products CASCADE');
    await client.query('DROP TABLE IF EXISTS subcategories CASCADE');
    await client.query('DROP TABLE IF EXISTS categories CASCADE');
    await client.query('DROP TABLE IF EXISTS rentals CASCADE');
    await client.query('DROP TABLE IF EXISTS transactions CASCADE');
    await client.query('DROP TABLE IF EXISTS cars CASCADE');
    await client.query('DROP TABLE IF EXISTS users CASCADE');
    
    console.log('✅ Old tables dropped');
    console.log('🔨 Creating new tables...');

    // Users table
    await client.query(`
      CREATE TABLE users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(20) DEFAULT 'USER',
        active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('  ✓ users');

    // Cars table
    await client.query(`
      CREATE TABLE cars (
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
    console.log('  ✓ cars');

    // Transactions table
    await client.query(`
      CREATE TABLE transactions (
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
    console.log('  ✓ transactions');

    // Rentals table
    await client.query(`
      CREATE TABLE rentals (
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
    console.log('  ✓ rentals');

    // Categories table
    await client.query(`
      CREATE TABLE categories (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        icon VARCHAR(50),
        user_id INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('  ✓ categories');

    // Subcategories table
    await client.query(`
      CREATE TABLE subcategories (
        id SERIAL PRIMARY KEY,
        category_id INTEGER REFERENCES categories(id) ON DELETE CASCADE,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        user_id INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('  ✓ subcategories');

    // Products table
    await client.query(`
      CREATE TABLE products (
        id SERIAL PRIMARY KEY,
        subcategory_id INTEGER REFERENCES subcategories(id) ON DELETE CASCADE,
        name VARCHAR(200) NOT NULL,
        sku VARCHAR(100) UNIQUE,
        description TEXT,
        min_stock_level INTEGER DEFAULT 0,
        purchase_price DECIMAL(10,2),
        sale_price DECIMAL(10,2),
        currency VARCHAR(3) DEFAULT 'GEL',
        user_id INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('  ✓ products');

    // Inventory table
    await client.query(`
      CREATE TABLE inventory (
        id SERIAL PRIMARY KEY,
        product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
        source_type VARCHAR(20) NOT NULL CHECK (source_type IN ('dismantled', 'purchased')),
        source_id INTEGER,
        quantity INTEGER NOT NULL DEFAULT 0,
        purchase_price DECIMAL(10,2),
        currency VARCHAR(3),
        location VARCHAR(100),
        received_date DATE DEFAULT CURRENT_DATE,
        user_id INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT check_quantity_positive CHECK (quantity >= 0)
      )
    `);
    console.log('  ✓ inventory');

    // Inventory sales table
    await client.query(`
      CREATE TABLE inventory_sales (
        id SERIAL PRIMARY KEY,
        inventory_id INTEGER REFERENCES inventory(id),
        product_id INTEGER REFERENCES products(id),
        quantity INTEGER NOT NULL,
        sale_price DECIMAL(10,2) NOT NULL,
        cost_price DECIMAL(10,2),
        currency VARCHAR(3),
        buyer_name VARCHAR(200),
        buyer_phone VARCHAR(50),
        notes TEXT,
        sale_date DATE DEFAULT CURRENT_DATE,
        user_id INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('  ✓ inventory_sales');

    // Create default admin
    const adminExists = await client.query('SELECT id FROM users WHERE email = $1', ['admin@wgauto.com']);
    if (adminExists.rows.length === 0) {
      const adminPassword = 'admin123'; // Change this!
      const hashedPassword = await bcrypt.hash(adminPassword, 10);
      await client.query(
        'INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3)',
        ['admin@wgauto.com', hashedPassword, 'ADMIN']
      );
      console.log('='.repeat(60));
      console.log('👤 DEFAULT ADMIN CREATED:');
      console.log('📧 Email: admin@wgauto.com');
      console.log('🔑 Password: admin123');
      console.log('⚠️  CHANGE PASSWORD AFTER FIRST LOGIN!');
      console.log('='.repeat(60));
    }

    await client.query('COMMIT');
    console.log('✅ Database initialized successfully!');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Database initialization error:', error);
    throw error;
  } finally {
    client.release();
  }
}

// ==================== AUTH MIDDLEWARE ====================
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    console.log('❌ No token provided');
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      console.log('❌ Invalid token:', err.message);
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
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

// ==================== AUTH ROUTES ====================
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password } = req.body;
    console.log('📝 Registration attempt:', email);
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    
    const existingUser = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'User already exists' });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (email, password_hash, role, active) VALUES ($1, $2, $3, $4) RETURNING id, email, role, active',
      [email, hashedPassword, 'USER', true]
    );
    
    const user = result.rows[0];
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role }, 
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    console.log('✅ Registration successful:', email);
    res.json({ 
      token, 
      user: {
        id: user.id,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('❌ Registration error:', error);
    res.status(500).json({ error: 'Registration failed: ' + error.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    console.log('🔐 Login attempt:', email);
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    const result = await pool.query(
      'SELECT id, email, password_hash, role, active FROM users WHERE email = $1',
      [email]
    );
    
    if (result.rows.length === 0) {
      console.log('❌ User not found:', email);
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    const user = result.rows[0];
    
    if (!user.active) {
      console.log('❌ User inactive:', email);
      return res.status(401).json({ error: 'Account is deactivated' });
    }
    
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    
    if (!isValidPassword) {
      console.log('❌ Invalid password for:', email);
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    console.log('✅ Login successful:', email);
    res.json({ 
      token, 
      user: { 
        id: user.id, 
        email: user.email, 
        role: user.role 
      } 
    });
  } catch (error) {
    console.error('❌ Login error:', error);
    res.status(500).json({ error: 'Login failed: ' + error.message });
  }
});

// ==================== DASHBOARD ====================
app.get('/api/stats/dashboard', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.role === 'ADMIN' ? null : req.user.id;
    const userFilter = userId ? 'AND user_id = $1' : '';
    const params = userId ? [userId] : [];
    
    const income = await pool.query(
      `SELECT currency, COALESCE(SUM(amount), 0) as total 
       FROM transactions 
       WHERE type = 'income' ${userFilter} 
       GROUP BY currency`, 
      params
    );
    
    const expenses = await pool.query(
      `SELECT currency, COALESCE(SUM(amount), 0) as total 
       FROM transactions 
       WHERE type = 'expense' ${userFilter} 
       GROUP BY currency`, 
      params
    );
    
    const cars = await pool.query(
      `SELECT status, COUNT(*) as count 
       FROM cars 
       WHERE 1=1 ${userFilter} 
       GROUP BY status`, 
      params
    );
    
    const activeRentals = await pool.query(
      `SELECT COUNT(*) as count 
       FROM rentals 
       WHERE status = 'active' ${userFilter}`, 
      params
    );
    
    res.json({ 
      income: income.rows, 
      expenses: expenses.rows, 
      cars: cars.rows, 
      activeRentals: parseInt(activeRentals.rows[0]?.count || 0)
    });
  } catch (error) {
    console.error('❌ Dashboard error:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
});

// ==================== CARS ====================
app.get('/api/cars', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.role === 'ADMIN' ? null : req.user.id;
    const { search, status } = req.query;
    
    let query = 'SELECT * FROM cars WHERE 1=1';
    let params = [];
    let paramCount = 0;
    
    if (userId) {
      paramCount++;
      query += ` AND user_id = $${paramCount}`;
      params.push(userId);
    }
    
    if (search) {
      paramCount++;
      query += ` AND (LOWER(brand) LIKE $${paramCount} OR LOWER(model) LIKE $${paramCount} OR LOWER(vin) LIKE $${paramCount})`;
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
    console.error('❌ Get cars error:', error);
    res.status(500).json({ error: 'Failed to fetch cars' });
  }
});

app.post('/api/cars', authenticateToken, async (req, res) => {
  try {
    const { brand, model, year, vin, price, currency } = req.body;
    
    if (!brand || !model) {
      return res.status(400).json({ error: 'Brand and model are required' });
    }
    
    const result = await pool.query(
      'INSERT INTO cars (brand, model, year, vin, price, currency, user_id, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
      [brand, model, year || null, vin || null, price || null, currency || 'GEL', req.user.id, 'active']
    );
    
    console.log('✅ Car created:', brand, model);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('❌ Create car error:', error);
    res.status(500).json({ error: 'Failed to create car' });
  }
});

app.get('/api/cars/:id/details', authenticateToken, async (req, res) => {
  try {
    const carId = req.params.id;
    const userId = req.user.role === 'ADMIN' ? null : req.user.id;
    
    let carQuery = 'SELECT * FROM cars WHERE id = $1';
    let carParams = [carId];
    
    if (userId) {
      carQuery += ' AND user_id = $2';
      carParams.push(userId);
    }
    
    const car = await pool.query(carQuery, carParams);
    
    if (car.rows.length === 0) {
      return res.status(404).json({ error: 'Car not found' });
    }
    
    const transactions = await pool.query(
      'SELECT * FROM transactions WHERE car_id = $1 ORDER BY date DESC',
      [carId]
    );
    
    const rentals = await pool.query(
      'SELECT * FROM rentals WHERE car_id = $1 ORDER BY created_at DESC',
      [carId]
    );
    
    const profit = await pool.query(
      `SELECT currency, 
        COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) as total_income,
        COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) as total_expenses
       FROM transactions 
       WHERE car_id = $1 
       GROUP BY currency`,
      [carId]
    );
    
    res.json({ 
      car: car.rows[0], 
      transactions: transactions.rows, 
      rentals: rentals.rows, 
      parts: [], 
      profitability: profit.rows 
    });
  } catch (error) {
    console.error('❌ Get car details error:', error);
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
      'INSERT INTO transactions (car_id, user_id, type, amount, currency, description, category, date) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)',
      [carId, req.user.id, 'expense', amount, currency, description || '', category]
    );
    
    console.log('✅ Expense added to car:', carId);
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Add expense error:', error);
    res.status(500).json({ error: 'Failed to add expense' });
  }
});

app.post('/api/cars/:id/dismantle', authenticateToken, async (req, res) => {
  try {
    const carId = req.params.id;
    await pool.query('UPDATE cars SET status = $1 WHERE id = $2', ['dismantled', carId]);
    console.log('✅ Car dismantled:', carId);
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Dismantle car error:', error);
    res.status(500).json({ error: 'Failed to dismantle car' });
  }
});

// ==================== RENTALS ====================
app.get('/api/rentals', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.role === 'ADMIN' ? null : req.user.id;
    
    let query = `
      SELECT r.*, c.brand, c.model, c.year 
      FROM rentals r 
      JOIN cars c ON r.car_id = c.id
    `;
    let params = [];
    
    if (userId) {
      query += ' WHERE r.user_id = $1';
      params.push(userId);
    }
    
    query += ' ORDER BY r.created_at DESC';
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('❌ Get rentals error:', error);
    res.status(500).json({ error: 'Failed to fetch rentals' });
  }
});

app.post('/api/rentals', authenticateToken, async (req, res) => {
  try {
    const { car_id, client_name, client_phone, start_date, end_date, daily_price, currency } = req.body;
    
    if (!car_id || !client_name || !start_date || !end_date || !daily_price || !currency) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    
    const startDate = new Date(start_date);
    const endDate = new Date(end_date);
    
    if (endDate <= startDate) {
      return res.status(400).json({ error: 'End date must be after start date' });
    }
    
    const days = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
    const total_amount = days * parseFloat(daily_price);
    
    const result = await pool.query(
      `INSERT INTO rentals (car_id, user_id, client_name, client_phone, start_date, end_date, daily_price, currency, total_amount, status) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [car_id, req.user.id, client_name, client_phone || '', start_date, end_date, daily_price, currency, total_amount, 'active']
    );
    
    await pool.query('UPDATE cars SET status = $1 WHERE id = $2', ['rented', car_id]);
    
    console.log('✅ Rental created:', result.rows[0].id);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('❌ Create rental error:', error);
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
      `INSERT INTO transactions (car_id, user_id, type, amount, currency, category, description, rental_id, date) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)`,
      [
        rentalData.car_id, 
        req.user.id, 
        'income', 
        rentalData.total_amount, 
        rentalData.currency, 
        'rental', 
        `Rental from ${rentalData.client_name}`, 
        rentalId
      ]
    );
    
    await pool.query('UPDATE cars SET status = $1 WHERE id = $2', ['active', rentalData.car_id]);
    
    console.log('✅ Rental completed:', rentalId);
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Complete rental error:', error);
    res.status(500).json({ error: 'Failed to complete rental' });
  }
});

app.get('/api/rentals/calendar/:year/:month', authenticateToken, async (req, res) => {
  try {
    const { year, month } = req.params;
    const userId = req.user.role === 'ADMIN' ? null : req.user.id;
    
    let query = `
      SELECT r.*, c.brand, c.model 
      FROM rentals r 
      JOIN cars c ON r.car_id = c.id 
      WHERE (
        (EXTRACT(YEAR FROM start_date) = $1 AND EXTRACT(MONTH FROM start_date) = $2)
        OR (EXTRACT(YEAR FROM end_date) = $1 AND EXTRACT(MONTH FROM end_date) = $2)
        OR (start_date <= make_date($1::int, $2::int, 31) AND end_date >= make_date($1::int, $2::int, 1))
      )
    `;
    
    let params = [parseInt(year), parseInt(month)];
    
    if (userId) {
      query += ' AND r.user_id = $3';
      params.push(userId);
    }
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('❌ Get calendar error:', error);
    res.status(500).json({ error: 'Failed to fetch calendar' });
  }
});

// ==================== WAREHOUSE ====================
app.get('/api/warehouse/categories', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.role === 'ADMIN' ? null : req.user.id;
    
    let query = 'SELECT * FROM categories';
    let params = [];
    
    if (userId) {
      query += ' WHERE user_id = $1';
      params.push(userId);
    }
    
    query += ' ORDER BY name';
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('❌ Get categories error:', error);
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
    
    console.log('✅ Category created:', name);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('❌ Create category error:', error);
    res.status(500).json({ error: 'Failed to create category' });
  }
});

app.get('/api/warehouse/subcategories/:categoryId', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM subcategories WHERE category_id = $1 ORDER BY name',
      [req.params.categoryId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('❌ Get subcategories error:', error);
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
    
    console.log('✅ Subcategory created:', name);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('❌ Create subcategory error:', error);
    res.status(500).json({ error: 'Failed to create subcategory' });
  }
});

app.get('/api/warehouse/products/:subcategoryId', authenticateToken, async (req, res) => {
  try {
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
    `, [req.params.subcategoryId]);
    
    res.json(result.rows);
  } catch (error) {
    console.error('❌ Get products error:', error);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

app.post('/api/warehouse/products', authenticateToken, async (req, res) => {
  try {
    const { subcategory_id, name, description, sku, min_stock_level } = req.body;
    
    if (!subcategory_id || !name) {
      return res.status(400).json({ error: 'Subcategory ID and name are required' });
    }
    
    const result = await pool.query(
      'INSERT INTO products (subcategory_id, name, description, sku, min_stock_level, user_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [subcategory_id, name, description || '', sku || null, min_stock_level || 0, req.user.id]
    );
    
    console.log('✅ Product created:', name);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('❌ Create product error:', error);
    res.status(500).json({ error: 'Failed to create product' });
  }
});

app.put('/api/warehouse/products/:id/prices', authenticateToken, async (req, res) => {
  try {
    const { purchase_price, sale_price, currency } = req.body;
    
    const result = await pool.query(
      'UPDATE products SET purchase_price = $1, sale_price = $2, currency = $3 WHERE id = $4 RETURNING *',
      [purchase_price || null, sale_price || null, currency || 'GEL', req.params.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    console.log('✅ Product prices updated:', req.params.id);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('❌ Update prices error:', error);
    res.status(500).json({ error: 'Failed to update prices' });
  }
});

app.get('/api/warehouse/inventory/:productId', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        i.*, 
        'Purchase' as source_name, 
        CURRENT_DATE - i.received_date as days_in_storage
      FROM inventory i 
      WHERE i.product_id = $1 AND i.quantity > 0 
      ORDER BY i.received_date
    `, [req.params.productId]);
    
    res.json(result.rows);
  } catch (error) {
    console.error('❌ Get inventory error:', error);
    res.status(500).json({ error: 'Failed to fetch inventory' });
  }
});

app.post('/api/warehouse/inventory/receive', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const { product_id, source_type, quantity, purchase_price, sale_price, currency, location } = req.body;
    
    if (!product_id || !source_type || !quantity || quantity <= 0) {
      return res.status(400).json({ error: 'Product, source type, and positive quantity are required' });
    }
    
    await client.query('BEGIN');
    
    // Update product prices if provided
    if (purchase_price !== undefined || sale_price !== undefined) {
      const updates = [];
      const values = [];
      let paramCount = 0;
      
      if (purchase_price !== undefined && purchase_price !== null) {
        paramCount++;
        updates.push(`purchase_price = $${paramCount}`);
        values.push(purchase_price);
      }
      
      if (sale_price !== undefined && sale_price !== null) {
        paramCount++;
        updates.push(`sale_price = $${paramCount}`);
        values.push(sale_price);
      }
      
      if (currency) {
        paramCount++;
        updates.push(`currency = $${paramCount}`);
        values.push(currency);
      }
      
      if (updates.length > 0) {
        paramCount++;
        values.push(product_id);
        await client.query(
          `UPDATE products SET ${updates.join(', ')} WHERE id = $${paramCount}`,
          values
        );
      }
    }
    
    // Add inventory
    const result = await client.query(
      `INSERT INTO inventory (product_id, source_type, source_id, quantity, purchase_price, currency, location, user_id, received_date) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_DATE) RETURNING *`,
      [
        product_id, 
        source_type, 
        null, 
        quantity, 
        purchase_price || null, 
        currency || 'GEL', 
        location || '', 
        req.user.id
      ]
    );
    
    await client.query('COMMIT');
    
    console.log('✅ Inventory received:', result.rows[0].id);
    res.json(result.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Receive inventory error:', error);
    res.status(500).json({ error: 'Failed to receive inventory: ' + error.message });
  } finally {
    client.release();
  }
});

app.post('/api/warehouse/sales', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const { product_id, quantity, sale_price, currency, buyer_name, buyer_phone, notes } = req.body;
    
    if (!product_id || !quantity || !sale_price || quantity <= 0) {
      return res.status(400).json({ error: 'Product, quantity, and sale price are required' });
    }
    
    await client.query('BEGIN');
    
    // Get inventory (FIFO)
    const inv = await client.query(
      'SELECT id, quantity, purchase_price FROM inventory WHERE product_id = $1 AND quantity > 0 ORDER BY received_date LIMIT 1',
      [product_id]
    );
    
    if (inv.rows.length === 0 || inv.rows[0].quantity < quantity) {
      throw new Error('Insufficient inventory');
    }
    
    // Reduce inventory
    await client.query(
      'UPDATE inventory SET quantity = quantity - $1 WHERE id = $2',
      [quantity, inv.rows[0].id]
    );
    
    // Record sale
    const sale = await client.query(
      `INSERT INTO inventory_sales (inventory_id, product_id, quantity, sale_price, cost_price, currency, buyer_name, buyer_phone, notes, user_id, sale_date) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_DATE) RETURNING *`,
      [
        inv.rows[0].id, 
        product_id, 
        quantity, 
        sale_price, 
        inv.rows[0].purchase_price, 
        currency || 'GEL', 
        buyer_name || '', 
        buyer_phone || '', 
        notes || '', 
        req.user.id
      ]
    );
    
    // Record transaction
    await client.query(
      'INSERT INTO transactions (user_id, type, amount, currency, category, description, date) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)',
      [
        req.user.id, 
        'income', 
        sale_price * quantity, 
        currency || 'GEL', 
        'parts', 
        `Sale of ${quantity} units`
      ]
    );
    
    await client.query('COMMIT');
    
    console.log('✅ Sale recorded:', sale.rows[0].id);
    res.json(sale.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Sale error:', error);
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

// ==================== ADMIN ====================
app.get('/api/admin/users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, email, role, active, created_at FROM users ORDER BY created_at DESC'
    );
    res.json(result.rows);
  } catch (error) {
    console.error('❌ Get users error:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

app.put('/api/admin/users/:id/toggle', authenticateToken, requireAdmin, async (req, res) => {
  try {
    await pool.query('UPDATE users SET active = NOT active WHERE id = $1', [req.params.id]);
    console.log('✅ User toggled:', req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Toggle user error:', error);
    res.status(500).json({ error: 'Failed to toggle user' });
  }
});

// ==================== ROOT ====================
app.get('/', (req, res) => {
  res.send(`
    <h1>🚀 WGauto CRM Server</h1>
    <p>Status: <strong style="color:green">Running</strong></p>
    <p>Database: <strong>Connected</strong></p>
    <p>Port: <strong>${port}</strong></p>
  `);
});

// ==================== ERROR HANDLER ====================
app.use((err, req, res, next) => {
  console.error('💥 Unhandled error:', err);
  res.status(500).json({ 
    error: 'Internal server error', 
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

// ==================== 404 HANDLER ====================
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// ==================== START SERVER ====================
initDB()
  .then(() => {
    app.listen(port, () => {
      console.log('='.repeat(70));
      console.log('🚀 WGauto CRM Server started successfully!');
      console.log(`📡 Server URL: http://localhost:${port}`);
      console.log(`🔗 Frontend CORS: http://localhost:5173`);
      console.log(`🗄️  Database: Connected`);
      console.log(`🔐 JWT: ${JWT_SECRET ? 'Configured' : 'Using random key'}`);
      console.log('='.repeat(70));
    });
  })
  .catch(err => {
    console.error('💥 Failed to start server:', err);
    process.exit(1);
  });

module.exports = app;
