-- WGauto CRM v2.0 - Complete Database Migration
-- Run this on your PostgreSQL database

-- 1. Create categories table
CREATE TABLE IF NOT EXISTS categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  icon VARCHAR(50) DEFAULT '📦',
  user_id INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Create subcategories table
CREATE TABLE IF NOT EXISTS subcategories (
  id SERIAL PRIMARY KEY,
  category_id INTEGER REFERENCES categories(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  user_id INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Create products table
CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  subcategory_id INTEGER REFERENCES subcategories(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  sku VARCHAR(100) UNIQUE,
  description TEXT,
  min_stock_level INTEGER DEFAULT 0,
  user_id INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. Create inventory table
CREATE TABLE IF NOT EXISTS inventory (
  id SERIAL PRIMARY KEY,
  product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
  source_type VARCHAR(20) NOT NULL CHECK (source_type IN ('dismantled', 'purchased')),
  source_id INTEGER,
  quantity INTEGER NOT NULL DEFAULT 0,
  purchase_price DECIMAL(10,2),
  currency VARCHAR(3) DEFAULT 'USD',
  location VARCHAR(100),
  received_date DATE DEFAULT CURRENT_DATE,
  user_id INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT check_quantity_positive CHECK (quantity >= 0)
);

-- 5. Create inventory_sales table
CREATE TABLE IF NOT EXISTS inventory_sales (
  id SERIAL PRIMARY KEY,
  product_id INTEGER REFERENCES products(id),
  inventory_id INTEGER REFERENCES inventory(id),
  quantity INTEGER NOT NULL,
  sale_price DECIMAL(10,2) NOT NULL,
  cost_price DECIMAL(10,2),
  currency VARCHAR(3) DEFAULT 'USD',
  buyer_name VARCHAR(200),
  buyer_phone VARCHAR(50),
  notes TEXT,
  sale_date DATE DEFAULT CURRENT_DATE,
  user_id INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. Create writeoffs table
CREATE TABLE IF NOT EXISTS writeoffs (
  id SERIAL PRIMARY KEY,
  product_id INTEGER REFERENCES products(id),
  inventory_id INTEGER REFERENCES inventory(id),
  quantity INTEGER NOT NULL,
  reason VARCHAR(50) DEFAULT 'other',
  notes TEXT,
  writeoff_date DATE DEFAULT CURRENT_DATE,
  user_id INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 7. Create procurements table
CREATE TABLE IF NOT EXISTS procurements (
  id SERIAL PRIMARY KEY,
  supplier_name VARCHAR(200),
  invoice_number VARCHAR(100),
  total_amount DECIMAL(10,2),
  currency VARCHAR(3) DEFAULT 'USD',
  status VARCHAR(20) DEFAULT 'pending',
  notes TEXT,
  procurement_date DATE DEFAULT CURRENT_DATE,
  user_id INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 8. Create procurement_items table
CREATE TABLE IF NOT EXISTS procurement_items (
  id SERIAL PRIMARY KEY,
  procurement_id INTEGER REFERENCES procurements(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id),
  quantity INTEGER NOT NULL,
  unit_price DECIMAL(10,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'USD',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 9. Create parts table (if not exists)
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
  product_id INTEGER REFERENCES products(id),
  converted_to_inventory BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  sold_at TIMESTAMP
);

-- 10. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_categories_user ON categories(user_id);
CREATE INDEX IF NOT EXISTS idx_subcategories_category ON subcategories(category_id);
CREATE INDEX IF NOT EXISTS idx_subcategories_user ON subcategories(user_id);
CREATE INDEX IF NOT EXISTS idx_products_subcategory ON products(subcategory_id);
CREATE INDEX IF NOT EXISTS idx_products_user ON products(user_id);
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
CREATE INDEX IF NOT EXISTS idx_inventory_product ON inventory(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_source ON inventory(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_inventory_user ON inventory(user_id);
CREATE INDEX IF NOT EXISTS idx_sales_product ON inventory_sales(product_id);
CREATE INDEX IF NOT EXISTS idx_sales_date ON inventory_sales(sale_date);
CREATE INDEX IF NOT EXISTS idx_sales_user ON inventory_sales(user_id);
CREATE INDEX IF NOT EXISTS idx_writeoffs_product ON writeoffs(product_id);
CREATE INDEX IF NOT EXISTS idx_writeoffs_date ON writeoffs(writeoff_date);
CREATE INDEX IF NOT EXISTS idx_writeoffs_user ON writeoffs(user_id);
CREATE INDEX IF NOT EXISTS idx_procurement_date ON procurements(procurement_date);
CREATE INDEX IF NOT EXISTS idx_procurement_user ON procurements(user_id);

-- 11. Create view for product analytics
CREATE OR REPLACE VIEW product_analytics AS
SELECT 
  p.id as product_id,
  p.name as product_name,
  p.sku,
  c.name as category_name,
  sc.name as subcategory_name,
  COALESCE(SUM(i.quantity), 0) as total_in_stock,
  COALESCE(AVG(i.purchase_price), 0) as avg_purchase_price,
  i.currency as inventory_currency,
  MIN(i.received_date) as first_received,
  MAX(i.received_date) as last_received,
  COALESCE(SUM(s.quantity), 0) as total_sold,
  COALESCE(SUM(s.sale_price * s.quantity), 0) as total_revenue,
  COALESCE(SUM(s.cost_price * s.quantity), 0) as total_cost,
  COALESCE(SUM(s.sale_price * s.quantity) - SUM(s.cost_price * s.quantity), 0) as net_profit,
  s.currency as sales_currency
FROM products p
JOIN subcategories sc ON p.subcategory_id = sc.id
JOIN categories c ON sc.category_id = c.id
LEFT JOIN inventory i ON p.id = i.product_id
LEFT JOIN inventory_sales s ON p.id = s.product_id
GROUP BY p.id, p.name, p.sku, c.name, sc.name, i.currency, s.currency;

-- 12. Insert sample categories for admin user
INSERT INTO categories (name, description, icon, user_id)
SELECT 'Toyota', 'Parts for Toyota vehicles', '🚗', id
FROM users WHERE email = 'admin@wgauto.com'
ON CONFLICT DO NOTHING;

INSERT INTO categories (name, description, icon, user_id)
SELECT 'Mazda', 'Parts for Mazda vehicles', '🚙', id
FROM users WHERE email = 'admin@wgauto.com'
ON CONFLICT DO NOTHING;

INSERT INTO categories (name, description, icon, user_id)
SELECT 'Honda', 'Parts for Honda vehicles', '🚕', id
FROM users WHERE email = 'admin@wgauto.com'
ON CONFLICT DO NOTHING;

INSERT INTO categories (name, description, icon, user_id)
SELECT 'Universal', 'Universal parts and accessories', '🔧', id
FROM users WHERE email = 'admin@wgauto.com'
ON CONFLICT DO NOTHING;

-- 13. Insert sample subcategories
INSERT INTO subcategories (category_id, name, description, user_id)
SELECT c.id, 'Optics', 'Headlights, taillights, turn signals', u.id
FROM categories c
JOIN users u ON c.user_id = u.id
WHERE c.name IN ('Toyota', 'Mazda', 'Honda') AND u.email = 'admin@wgauto.com'
ON CONFLICT DO NOTHING;

INSERT INTO subcategories (category_id, name, description, user_id)
SELECT c.id, 'Engines', 'Engines and engine parts', u.id
FROM categories c
JOIN users u ON c.user_id = u.id
WHERE c.name IN ('Toyota', 'Mazda', 'Honda') AND u.email = 'admin@wgauto.com'
ON CONFLICT DO NOTHING;

INSERT INTO subcategories (category_id, name, description, user_id)
SELECT c.id, 'Body Parts', 'Doors, hoods, fenders, bumpers', u.id
FROM categories c
JOIN users u ON c.user_id = u.id
WHERE c.name IN ('Toyota', 'Mazda', 'Honda') AND u.email = 'admin@wgauto.com'
ON CONFLICT DO NOTHING;

INSERT INTO subcategories (category_id, name, description, user_id)
SELECT c.id, 'Electronics', 'ECU, sensors, wiring', u.id
FROM categories c
JOIN users u ON c.user_id = u.id
WHERE c.name IN ('Toyota', 'Mazda', 'Honda') AND u.email = 'admin@wgauto.com'
ON CONFLICT DO NOTHING;

INSERT INTO subcategories (category_id, name, description, user_id)
SELECT c.id, 'Suspension', 'Shocks, springs, control arms', u.id
FROM categories c
JOIN users u ON c.user_id = u.id
WHERE c.name IN ('Toyota', 'Mazda', 'Honda') AND u.email = 'admin@wgauto.com'
ON CONFLICT DO NOTHING;

INSERT INTO subcategories (category_id, name, description, user_id)
SELECT c.id, 'Interior', 'Seats, dashboard, trim', u.id
FROM categories c
JOIN users u ON c.user_id = u.id
WHERE c.name IN ('Toyota', 'Mazda', 'Honda') AND u.email = 'admin@wgauto.com'
ON CONFLICT DO NOTHING;

-- 14. Create function to automatically update inventory on sale
CREATE OR REPLACE FUNCTION update_inventory_on_sale()
RETURNS TRIGGER AS $$
BEGIN
  -- This is handled in application logic for better control
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 15. Verification queries
-- Check if all tables exist
SELECT 
  CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'categories') THEN '✅ categories'
    ELSE '❌ categories'
  END as table_status
UNION ALL
SELECT 
  CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'subcategories') THEN '✅ subcategories'
    ELSE '❌ subcategories'
  END
UNION ALL
SELECT 
  CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'products') THEN '✅ products'
    ELSE '❌ products'
  END
UNION ALL
SELECT 
  CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'inventory') THEN '✅ inventory'
    ELSE '❌ inventory'
  END
UNION ALL
SELECT 
  CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'inventory_sales') THEN '✅ inventory_sales'
    ELSE '❌ inventory_sales'
  END
UNION ALL
SELECT 
  CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'writeoffs') THEN '✅ writeoffs'
    ELSE '❌ writeoffs'
  END;

-- Show summary
SELECT 
  (SELECT COUNT(*) FROM categories) as total_categories,
  (SELECT COUNT(*) FROM subcategories) as total_subcategories,
  (SELECT COUNT(*) FROM products) as total_products,
  (SELECT COUNT(*) FROM inventory) as total_inventory_records,
  (SELECT COUNT(*) FROM inventory_sales) as total_sales,
  (SELECT COUNT(*) FROM writeoffs) as total_writeoffs;

-- ✅ Migration complete!
-- Next steps:
-- 1. Restart your server
-- 2. Login with admin@wgauto.com
-- 3. Start adding categories, subcategories, and products
-- 4. Use the Point of Sale to make sales
-- 5. Check analytics for profitability reports
