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
