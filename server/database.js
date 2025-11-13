const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const crypto = require('crypto');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function initDB() {
    try {
        // Users table
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

        // Cars table
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

        // Transactions table
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

        // Rentals table
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

        // Parts table
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

        // Warehouse: Categories
        await pool.query(`
            CREATE TABLE IF NOT EXISTS categories (
                id SERIAL PRIMARY KEY,
                name VARCHAR(200) NOT NULL,
                description TEXT,
                icon VARCHAR(10),
                user_id INTEGER REFERENCES users(id),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Warehouse: Subcategories
        await pool.query(`
            CREATE TABLE IF NOT EXISTS subcategories (
                id SERIAL PRIMARY KEY,
                category_id INTEGER REFERENCES categories(id) ON DELETE CASCADE,
                name VARCHAR(200) NOT NULL,
                description TEXT,
                user_id INTEGER REFERENCES users(id),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Warehouse: Products
        await pool.query(`
            CREATE TABLE IF NOT EXISTS products (
                id SERIAL PRIMARY KEY,
                subcategory_id INTEGER REFERENCES subcategories(id) ON DELETE CASCADE,
                name VARCHAR(200) NOT NULL,
                description TEXT,
                sku VARCHAR(100),
                min_stock_level INTEGER DEFAULT 0,
                user_id INTEGER REFERENCES users(id),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Warehouse: Inventory
        await pool.query(`
            CREATE TABLE IF NOT EXISTS inventory (
                id SERIAL PRIMARY KEY,
                product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
                source_type VARCHAR(20) NOT NULL CHECK (source_type IN ('purchased', 'dismantled', 'returned')),
                source_id INTEGER,
                quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
                purchase_price DECIMAL(10,2),
                sale_price DECIMAL(10,2),
                currency VARCHAR(3),
                location VARCHAR(100),
                received_date DATE DEFAULT CURRENT_DATE,
                user_id INTEGER REFERENCES users(id),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Create indexes for inventory
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_inventory_product_quantity ON inventory(product_id, quantity) WHERE quantity > 0;
            CREATE INDEX IF NOT EXISTS idx_inventory_received_date ON inventory(received_date);
        `);

        // Warehouse: Procurements
        await pool.query(`
            CREATE TABLE IF NOT EXISTS procurements (
                id SERIAL PRIMARY KEY,
                supplier_name VARCHAR(200),
                invoice_number VARCHAR(100),
                total_amount DECIMAL(10,2),
                currency VARCHAR(3),
                notes TEXT,
                procurement_date DATE DEFAULT CURRENT_DATE,
                status VARCHAR(20) DEFAULT 'completed',
                user_id INTEGER REFERENCES users(id),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Warehouse: Procurement Items
        await pool.query(`
            CREATE TABLE IF NOT EXISTS procurement_items (
                id SERIAL PRIMARY KEY,
                procurement_id INTEGER REFERENCES procurements(id) ON DELETE CASCADE,
                product_id INTEGER REFERENCES products(id),
                quantity INTEGER NOT NULL,
                unit_price DECIMAL(10,2) NOT NULL,
                currency VARCHAR(3),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // ==================== NEW POS SYSTEM ====================
        
        // POS Shifts table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS pos_shifts (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                start_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                end_time TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_pos_shifts_user ON pos_shifts(user_id);
            CREATE INDEX IF NOT EXISTS idx_pos_shifts_active ON pos_shifts(user_id, end_time) WHERE end_time IS NULL;
        `);

        // Receipts table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS receipts (
                id SERIAL PRIMARY KEY,
                shift_id INTEGER NOT NULL REFERENCES pos_shifts(id) ON DELETE CASCADE,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                sale_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                total_amount DECIMAL(10, 2) NOT NULL,
                currency VARCHAR(10) DEFAULT 'GEL',
                is_cancelled BOOLEAN DEFAULT false,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_receipts_shift ON receipts(shift_id);
            CREATE INDEX IF NOT EXISTS idx_receipts_user ON receipts(user_id);
            CREATE INDEX IF NOT EXISTS idx_receipts_time ON receipts(sale_time);
            CREATE INDEX IF NOT EXISTS idx_receipts_cancelled ON receipts(is_cancelled);
        `);

        // Sale Items table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS sale_items (
                id SERIAL PRIMARY KEY,
                receipt_id INTEGER NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
                product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
                quantity INTEGER NOT NULL CHECK (quantity > 0),
                sale_price DECIMAL(10, 2) NOT NULL CHECK (sale_price >= 0),
                cost_price DECIMAL(10, 2) CHECK (cost_price IS NULL OR cost_price >= 0),
                currency VARCHAR(10) DEFAULT 'GEL',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_sale_items_receipt ON sale_items(receipt_id);
            CREATE INDEX IF NOT EXISTS idx_sale_items_product ON sale_items(product_id);
            CREATE INDEX IF NOT EXISTS idx_sale_items_analytics ON sale_items(product_id, quantity, sale_price, cost_price);
        `);

        // Create view for inventory sales (replaces old table)
        await pool.query(`
            CREATE OR REPLACE VIEW inventory_sales AS
            SELECT 
                si.id,
                si.product_id,
                si.quantity,
                si.sale_price,
                si.cost_price,
                si.currency,
                r.sale_time as sale_date,
                r.shift_id,
                r.user_id,
                r.is_cancelled
            FROM sale_items si
            JOIN receipts r ON si.receipt_id = r.id
            WHERE r.is_cancelled = false;
        `);

        // Drop old inventory_sales table if exists
        await pool.query(`DROP TABLE IF EXISTS inventory_sales CASCADE;`);

        // View for products with stock
        await pool.query(`
            CREATE OR REPLACE VIEW products_with_stock AS
            SELECT 
                p.*,
                COALESCE(SUM(i.quantity), 0) as total_quantity,
                MIN(i.received_date) as first_received,
                MAX(i.received_date) as last_received,
                AVG(i.sale_price) as avg_sale_price
            FROM products p
            LEFT JOIN inventory i ON p.id = i.product_id
            GROUP BY p.id;
        `);

        // View for active shifts with stats
        await pool.query(`
            CREATE OR REPLACE VIEW active_shifts_with_stats AS
            SELECT 
                ps.*,
                COUNT(r.id) as receipts_count,
                COALESCE(SUM(CASE WHEN r.is_cancelled = false THEN r.total_amount ELSE 0 END), 0) as total_sales
            FROM pos_shifts ps
            LEFT JOIN receipts r ON ps.id = r.shift_id
            WHERE ps.end_time IS NULL
            GROUP BY ps.id;
        `);

        // Create default admin user if doesn't exist
        const adminExists = await pool.query(
            'SELECT id FROM users WHERE email = $1', 
            ['admin@wgauto.com']
        );
        
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

        console.log('✅ Database initialized successfully with POS system');
    } catch (error) {
        console.error('❌ Database initialization error:', error);
        throw error;
    }
}

module.exports = { pool, initDB };
