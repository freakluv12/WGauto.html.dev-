-- Миграция для складской системы и PoS WGauto CRM
-- Запустить эти команды в PostgreSQL перед запуском обновленного приложения

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
  user_id INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. Создать таблицу складских остатков (inventory)
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

-- 5. Создать таблицу закупок (procurement)
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

-- 6. Создать таблицу позиций закупки
CREATE TABLE IF NOT EXISTS procurement_items (
  id SERIAL PRIMARY KEY,
  procurement_id INTEGER REFERENCES procurements(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id),
  quantity INTEGER NOT NULL,
  unit_price DECIMAL(10,2) NOT NULL,
  currency VARCHAR(3),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 7. Обновить таблицу parts - добавить связь с products
ALTER TABLE parts ADD COLUMN IF NOT EXISTS product_id INTEGER REFERENCES products(id);
ALTER TABLE parts ADD COLUMN IF NOT EXISTS converted_to_inventory BOOLEAN DEFAULT false;

-- ==================== POS SYSTEM TABLES ====================

-- 8. Создать таблицу смен кассы
CREATE TABLE IF NOT EXISTS pos_shifts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) NOT NULL,
  currency VARCHAR(3) DEFAULT 'USD',
  status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  opened_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  closed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 9. Создать таблицу продаж PoS
CREATE TABLE IF NOT EXISTS pos_sales (
  id SERIAL PRIMARY KEY,
  shift_id INTEGER REFERENCES pos_shifts(id) NOT NULL,
  user_id INTEGER REFERENCES users(id) NOT NULL,
  total_amount DECIMAL(10,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'USD',
  payment_method VARCHAR(20) CHECK (payment_method IN ('cash', 'card', 'transfer')),
  buyer_name VARCHAR(200),
  buyer_phone VARCHAR(50),
  notes TEXT,
  sale_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 10. Создать таблицу позиций продаж PoS
CREATE TABLE IF NOT EXISTS pos_sale_items (
  id SERIAL PRIMARY KEY,
  sale_id INTEGER REFERENCES pos_sales(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id),
  quantity INTEGER NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  total DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 11. Создать индексы для производительности
CREATE INDEX IF NOT EXISTS idx_products_subcategory ON products(subcategory_id);
CREATE INDEX IF NOT EXISTS idx_inventory_product ON inventory(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_source ON inventory(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_procurement_date ON procurements(procurement_date);
CREATE INDEX IF NOT EXISTS idx_pos_shifts_user ON pos_shifts(user_id, status);
CREATE INDEX IF NOT EXISTS idx_pos_sales_shift ON pos_sales(shift_id);
CREATE INDEX IF NOT EXISTS idx_pos_sales_date ON pos_sales(sale_date);
CREATE INDEX IF NOT EXISTS idx_pos_sale_items_product ON pos_sale_items(product_id);

-- 12. Создать представление для аналитики склада
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
  MAX(i.received_date) as last_received
FROM products p
JOIN subcategories sc ON p.subcategory_id = sc.id
JOIN categories c ON sc.category_id = c.id
LEFT JOIN inventory i ON p.id = i.product_id
GROUP BY p.id, p.name, c.name, sc.name, i.currency;

-- 13. Создать представление для аналитики PoS
CREATE OR REPLACE VIEW pos_sales_analytics AS
SELECT 
  ps.id as sale_id,
  ps.sale_date,
  ps.total_amount,
  ps.currency,
  ps.payment_method,
  ps.buyer_name,
  u.email as cashier_email,
  s.opened_at as shift_opened,
  COUNT(psi.id) as items_count
FROM pos_sales ps
JOIN users u ON ps.user_id = u.id
JOIN pos_shifts s ON ps.shift_id = s.id
LEFT JOIN pos_sale_items psi ON ps.id = psi.sale_id
GROUP BY ps.id, ps.sale_date, ps.total_amount, ps.currency, ps.payment_method, ps.buyer_name, u.email, s.opened_at;

-- 14. Функция для автоматического обновления остатков при продаже через PoS
CREATE OR REPLACE FUNCTION update_inventory_on_pos_sale()
RETURNS TRIGGER AS $$
DECLARE
  remaining_qty INTEGER;
  inv_record RECORD;
BEGIN
  remaining_qty := NEW.quantity;
  
  -- FIFO: Списываем товар с самых старых партий
  FOR inv_record IN 
    SELECT id, quantity FROM inventory 
    WHERE product_id = NEW.product_id AND quantity > 0 
    ORDER BY received_date ASC
  LOOP
    IF remaining_qty <= 0 THEN
      EXIT;
    END IF;
    
    IF inv_record.quantity >= remaining_qty THEN
      UPDATE inventory 
      SET quantity = quantity - remaining_qty
      WHERE id = inv_record.id;
      remaining_qty := 0;
    ELSE
      UPDATE inventory 
      SET quantity = 0
      WHERE id = inv_record.id;
      remaining_qty := remaining_qty - inv_record.quantity;
    END IF;
  END LOOP;
  
  IF remaining_qty > 0 THEN
    RAISE EXCEPTION 'Insufficient inventory for product %', NEW.product_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Создать триггер для автоматического списания остатков
DROP TRIGGER IF EXISTS trigger_update_inventory_on_pos_sale ON pos_sale_items;
CREATE TRIGGER trigger_update_inventory_on_pos_sale
  AFTER INSERT ON pos_sale_items
  FOR EACH ROW
  EXECUTE FUNCTION update_inventory_on_pos_sale();

-- 15. Функция для расчета прибыли смены
CREATE OR REPLACE FUNCTION calculate_shift_profit(shift_id_param INTEGER)
RETURNS TABLE (
  total_revenue DECIMAL,
  total_cost DECIMAL,
  net_profit DECIMAL,
  profit_margin DECIMAL,
  currency VARCHAR
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    SUM(ps.total_amount) as total_revenue,
    SUM(psi.quantity * COALESCE(i.purchase_price, 0)) as total_cost,
    SUM(ps.total_amount) - SUM(psi.quantity * COALESCE(i.purchase_price, 0)) as net_profit,
    CASE 
      WHEN SUM(psi.quantity * COALESCE(i.purchase_price, 0)) > 0 
      THEN ((SUM(ps.total_amount) - SUM(psi.quantity * COALESCE(i.purchase_price, 0))) / SUM(psi.quantity * COALESCE(i.purchase_price, 0)) * 100)
      ELSE 0 
    END as profit_margin,
    ps.currency
  FROM pos_sales ps
  JOIN pos_sale_items psi ON ps.id = psi.sale_id
  LEFT JOIN inventory i ON psi.product_id = i.product_id
  WHERE ps.shift_id = shift_id_param
  GROUP BY ps.currency;
END;
$$ LANGUAGE plpgsql;

-- 16. Добавить начальные категории (примеры) - только если их еще нет
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM categories LIMIT 1) THEN
    INSERT INTO categories (name, description, icon, user_id)
    SELECT 'Toyota', 'Запчасти для автомобилей Toyota', '🚗', id
    FROM users WHERE email = 'admin@wgauto.com'
    LIMIT 1;

    INSERT INTO categories (name, description, icon, user_id)
    SELECT 'Mazda', 'Запчасти для автомобилей Mazda', '🚙', id
    FROM users WHERE email = 'admin@wgauto.com'
    LIMIT 1;

    INSERT INTO categories (name, description, icon, user_id)
    SELECT 'Honda', 'Запчасти для автомобилей Honda', '🚕', id
    FROM users WHERE email = 'admin@wgauto.com'
    LIMIT 1;
    
    RAISE NOTICE 'Initial categories created';
  END IF;
END $$;

-- 17. Создать функцию для отчета по дневным продажам
CREATE OR REPLACE FUNCTION daily_sales_report(report_date DATE)
RETURNS TABLE (
  shift_count INTEGER,
  total_sales DECIMAL,
  total_transactions INTEGER,
  avg_transaction DECIMAL,
  payment_method_breakdown JSON,
  currency VARCHAR
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(DISTINCT ps.shift_id)::INTEGER as shift_count,
    SUM(ps.total_amount) as total_sales,
    COUNT(ps.id)::INTEGER as total_transactions,
    AVG(ps.total_amount) as avg_transaction,
    json_object_agg(ps.payment_method, COUNT(ps.id)) as payment_method_breakdown,
    ps.currency
  FROM pos_sales ps
  WHERE DATE(ps.sale_date) = report_date
  GROUP BY ps.currency;
END;
$$ LANGUAGE plpgsql;

-- 18. Создать функцию для топ продаваемых товаров
CREATE OR REPLACE FUNCTION top_selling_products(days_back INTEGER DEFAULT 30, limit_count INTEGER DEFAULT 10)
RETURNS TABLE (
  product_id INTEGER,
  product_name VARCHAR,
  category_name VARCHAR,
  total_sold INTEGER,
  total_revenue DECIMAL,
  currency VARCHAR
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id as product_id,
    p.name as product_name,
    c.name as category_name,
    SUM(psi.quantity)::INTEGER as total_sold,
    SUM(psi.total) as total_revenue,
    ps.currency
  FROM pos_sale_items psi
  JOIN products p ON psi.product_id = p.id
  JOIN subcategories sc ON p.subcategory_id = sc.id
  JOIN categories c ON sc.category_id = c.id
  JOIN pos_sales ps ON psi.sale_id = ps.id
  WHERE ps.sale_date >= CURRENT_DATE - days_back
  GROUP BY p.id, p.name, c.name, ps.currency
  ORDER BY total_sold DESC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;

-- 19. Создать ограничения для целостности данных
ALTER TABLE pos_shifts ADD CONSTRAINT check_shift_dates 
  CHECK (closed_at IS NULL OR closed_at >= opened_at);

ALTER TABLE pos_sales ADD CONSTRAINT check_positive_amount 
  CHECK (total_amount > 0);

ALTER TABLE pos_sale_items ADD CONSTRAINT check_positive_quantity 
  CHECK (quantity > 0);

ALTER TABLE pos_sale_items ADD CONSTRAINT check_positive_price 
  CHECK (price >= 0);

-- 20. Создать политики безопасности на уровне строк (RLS) - опционально
-- ALTER TABLE pos_shifts ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE pos_sales ENABLE ROW LEVEL SECURITY;

-- Готово! База данных обновлена для складской системы и PoS
SELECT 'Migration completed successfully! ✅' as status;
