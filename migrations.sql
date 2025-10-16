-- Миграция для складской системы WGauto CRM

-- 1. Создать таблицу категорий
CREATE TABLE IF NOT EXISTS categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  icon VARCHAR(50),
  user_id INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Создать таблицу подкатегорий
CREATE TABLE IF NOT EXISTS subcategories (
  id SERIAL PRIMARY KEY,
  category_id INTEGER REFERENCES categories(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  user_id INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Создать таблицу товаров (products)
CREATE TABLE IF NOT EXISTS products (
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
);

-- 4. Добавить поля цен в products если не существуют
ALTER TABLE products ADD COLUMN IF NOT EXISTS purchase_price DECIMAL(10,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS sale_price DECIMAL(10,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS currency VARCHAR(3) DEFAULT 'GEL';

-- 5. Создать таблицу складских остатков (inventory)
CREATE TABLE IF NOT EXISTS inventory (
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
);

-- 6. Создать таблицу закупок (procurement)
CREATE TABLE IF NOT EXISTS procurements (
  id SERIAL PRIMARY KEY,
  supplier_name VARCHAR(200),
  invoice_number VARCHAR(100),
  total_amount DECIMAL(10,2),
  currency VARCHAR(3),
  status VARCHAR(20) DEFAULT 'pending',
  notes TEXT,
  procurement_date DATE DEFAULT CURRENT_DATE,
  user_id INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 7. Создать таблицу позиций закупки
CREATE TABLE IF NOT EXISTS procurement_items (
  id SERIAL PRIMARY KEY,
  procurement_id INTEGER REFERENCES procurements(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id),
  quantity INTEGER NOT NULL,
  unit_price DECIMAL(10,2) NOT NULL,
  currency VARCHAR(3),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 8. Создать таблицу продаж запчастей (sales)
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
);

-- 9. Обновить таблицу parts - добавить связь с products
ALTER TABLE parts ADD COLUMN IF NOT EXISTS product_id INTEGER REFERENCES products(id);
ALTER TABLE parts ADD COLUMN IF NOT EXISTS converted_to_inventory BOOLEAN DEFAULT false;

-- 10. Создать индексы для производительности
CREATE INDEX IF NOT EXISTS idx_products_subcategory ON products(subcategory_id);
CREATE INDEX IF NOT EXISTS idx_inventory_product ON inventory(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_source ON inventory(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_sales_product ON inventory_sales(product_id);
CREATE INDEX IF NOT EXISTS idx_sales_date ON inventory_sales(sale_date);
CREATE INDEX IF NOT EXISTS idx_procurement_date ON procurements(procurement_date);

-- 11. Создать представление для аналитики
CREATE OR REPLACE VIEW inventory_analytics AS
SELECT 
  p.id as product_id,
  p.name as product_name,
  c.name as category_name,
  sc.name as subcategory_name,
  SUM(i.quantity) as total_quantity,
  AVG(i.purchase_price) as avg_purchase_price,
  i.currency,
  MIN(i.received_date) as first_received,
  MAX(i.received_date) as last_received,
  COALESCE(SUM(s.quantity), 0) as total_sold,
  COALESCE(SUM(s.sale_price * s.quantity), 0) as total_revenue,
  COALESCE(SUM(s.cost_price * s.quantity), 0) as total_cost,
  COALESCE(SUM(s.sale_price * s.quantity) - SUM(s.cost_price * s.quantity), 0) as net_profit
FROM products p
JOIN subcategories sc ON p.subcategory_id = sc.id
JOIN categories c ON sc.category_id = c.id
LEFT JOIN inventory i ON p.id = i.product_id
LEFT JOIN inventory_sales s ON p.id = s.product_id
GROUP BY p.id, p.name, c.name, sc.name, i.currency;

-- 12. Добавить начальные категории (примеры)
INSERT INTO categories (name, description, icon, user_id)
SELECT 'Toyota', 'Запчасти для автомобилей Toyota', '🚗', id
FROM users WHERE email = 'admin@wgauto.com'
ON CONFLICT DO NOTHING;

INSERT INTO categories (name, description, icon, user_id)
SELECT 'Mazda', 'Запчасти для автомобилей Mazda', '🚙', id
FROM users WHERE email = 'admin@wgauto.com'
ON CONFLICT DO NOTHING;

INSERT INTO categories (name, description, icon, user_id)
SELECT 'Honda', 'Запчасти для автомобилей Honda', '🚕', id
FROM users WHERE email = 'admin@wgauto.com'
ON CONFLICT DO NOTHING;

-- Готово! База данных обновлена для новой складской системы
