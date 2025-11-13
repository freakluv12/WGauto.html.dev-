const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const crypto = require('crypto');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function initDB() {
    try {
        //==================== POS SHIFTS TABLE ====================
CREATE TABLE IF NOT EXISTS pos_shifts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    start_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    end_time TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_pos_shifts_user ON pos_shifts(user_id);
CREATE INDEX idx_pos_shifts_active ON pos_shifts(user_id, end_time) WHERE end_time IS NULL;

//=================== RECEIPTS TABLE ====================
CREATE TABLE IF NOT EXISTS receipts (
    id SERIAL PRIMARY KEY,
    shift_id INTEGER NOT NULL REFERENCES pos_shifts(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    sale_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    total_amount DECIMAL(10, 2) NOT NULL,
    currency VARCHAR(10) DEFAULT 'GEL',
    is_cancelled BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_receipts_shift ON receipts(shift_id);
CREATE INDEX idx_receipts_user ON receipts(user_id);
CREATE INDEX idx_receipts_time ON receipts(sale_time);
CREATE INDEX idx_receipts_cancelled ON receipts(is_cancelled);

//==================== SALE ITEMS TABLE ====================
CREATE TABLE IF NOT EXISTS sale_items (
    id SERIAL PRIMARY KEY,
    receipt_id INTEGER NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL,
    sale_price DECIMAL(10, 2) NOT NULL,
    cost_price DECIMAL(10, 2),
    currency VARCHAR(10) DEFAULT 'GEL',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_sale_items_receipt ON sale_items(receipt_id);
CREATE INDEX idx_sale_items_product ON sale_items(product_id);

//=================== UPDATE INVENTORY TABLE ====================
-- Add sale_price column to inventory if not exists
ALTER TABLE inventory 
ADD COLUMN IF NOT EXISTS sale_price DECIMAL(10, 2);

-- Update source_type to allow 'returned' for cancelled receipts
ALTER TABLE inventory 
DROP CONSTRAINT IF EXISTS inventory_source_type_check;

ALTER TABLE inventory 
ADD CONSTRAINT inventory_source_type_check 
CHECK (source_type IN ('purchased', 'dismantled', 'returned'));

//=================== INVENTORY SALES VIEW (for analytics) ====================
-- This view combines data from sale_items and receipts for analytics
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

// ==================== USEFUL QUERIES ====================

-- Get products with total inventory quantity
CREATE OR REPLACE VIEW products_with_stock AS
SELECT 
    p.*,
    COALESCE(SUM(i.quantity), 0) as total_quantity,
    MIN(i.received_date) as first_received,
    MAX(i.received_date) as last_received
FROM products p
LEFT JOIN inventory i ON p.id = i.product_id
GROUP BY p.id;

-- Get active shift with statistics
CREATE OR REPLACE VIEW active_shifts_with_stats AS
SELECT 
    ps.*,
    COUNT(r.id) as receipts_count,
    COALESCE(SUM(CASE WHEN r.is_cancelled = false THEN r.total_amount ELSE 0 END), 0) as total_sales
FROM pos_shifts ps
LEFT JOIN receipts r ON ps.id = r.shift_id
WHERE ps.end_time IS NULL
GROUP BY ps.id;

//==================== SAMPLE DATA (optional) ====================

-- Insert sample category if not exists
INSERT INTO categories (name, description, icon, user_id)
SELECT 'Автозапчасти', 'Запчасти для автомобилей', '🔧', 1
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name = 'Автозапчасти');

-- Insert sample subcategory
INSERT INTO subcategories (category_id, name, description, user_id)
SELECT 
    (SELECT id FROM categories WHERE name = 'Автозапчасти' LIMIT 1),
    'Двигатель',
    'Детали двигателя',
    1
WHERE NOT EXISTS (SELECT 1 FROM subcategories WHERE name = 'Двигатель');

//==================== MIGRATION NOTES ====================

/*
To apply this schema to your existing database:

1. Backup your database first:
   pg_dump your_database > backup.sql

2. Apply the schema:
   psql your_database < schema.sql

3. Verify tables were created:
   \dt

4. Check if data migration is needed from old inventory_sales table (if it exists)
   
5. Test POS functionality with a test shift
*/

// ==================== PERFORMANCE INDEXES ====================

-- Additional indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_inventory_product_quantity ON inventory(product_id, quantity) WHERE quantity > 0;
CREATE INDEX IF NOT EXISTS idx_inventory_received_date ON inventory(received_date);
CREATE INDEX IF NOT EXISTS idx_sale_items_analytics ON sale_items(product_id, quantity, sale_price, cost_price);

// ==================== CONSTRAINTS ====================

-- Ensure quantities are positive
ALTER TABLE inventory 
ADD CONSTRAINT inventory_quantity_positive 
CHECK (quantity >= 0);

ALTER TABLE sale_items 
ADD CONSTRAINT sale_items_quantity_positive 
CHECK (quantity > 0);

-- Ensure prices are non-negative
ALTER TABLE sale_items 
ADD CONSTRAINT sale_items_prices_nonnegative 
CHECK (sale_price >= 0 AND (cost_price IS NULL OR cost_price >= 0));

//==================== TRIGGERS ====================

-- Optional: Trigger to prevent closing shift with active (non-paid) transactions
CREATE OR REPLACE FUNCTION prevent_close_shift_with_pending()
RETURNS TRIGGER AS $$
BEGIN
    -- Add custom logic if needed
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Optional: Trigger to update shift statistics when receipt is added
CREATE OR REPLACE FUNCTION update_shift_stats()
RETURNS TRIGGER AS $$
BEGIN
    -- Shift stats are calculated via views, but you can add caching here if needed
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
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
                source_type VARCHAR(20) NOT NULL,
                source_id INTEGER,
                quantity INTEGER NOT NULL DEFAULT 0,
                purchase_price DECIMAL(10,2),
                currency VARCHAR(3),
                location VARCHAR(100),
                received_date DATE DEFAULT CURRENT_DATE,
                user_id INTEGER REFERENCES users(id),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
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

        // Warehouse: Inventory Sales
        await pool.query(`
            CREATE TABLE IF NOT EXISTS inventory_sales (
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

        console.log('✅ Database initialized successfully');
    } catch (error) {
        console.error('❌ Database initialization error:', error);
        throw error;
    }
}

module.exports = { pool, initDB };
