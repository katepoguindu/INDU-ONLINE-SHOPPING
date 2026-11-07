CREATE DATABASE IF NOT EXISTS indu_shopping_cart;
USE indu_shopping_cart;

CREATE TABLE IF NOT EXISTS users (
  user_id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(100) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  phone VARCHAR(15),
  role VARCHAR(20) NOT NULL DEFAULT 'customer'
);

CREATE TABLE IF NOT EXISTS products (
  products_id INT AUTO_INCREMENT PRIMARY KEY,
  product_name VARCHAR(150) NOT NULL,
  category VARCHAR(50),
  price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  stock INT NOT NULL DEFAULT 0,
  description TEXT
);

CREATE TABLE IF NOT EXISTS cart (
  cart_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  product_id INT NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  added_date DATETIME DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_cart_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  CONSTRAINT fk_cart_product FOREIGN KEY (product_id) REFERENCES products(products_id) ON DELETE CASCADE,
  UNIQUE KEY unique_user_product (user_id, product_id)
);

CREATE TABLE IF NOT EXISTS orders (
  order_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  total_amount DECIMAL(10,2) NOT NULL,
  order_date DATE NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'Placed',
  CONSTRAINT fk_orders_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

INSERT INTO products (product_name, category, price, stock, description)
SELECT * FROM (
  SELECT 'Backpack' AS product_name, 'Accessories' AS category, 899.00 AS price, 12 AS stock, 'Everyday backpack with multiple compartments.' AS description
  UNION ALL SELECT 'Water Bottle', 'Accessories', 299.00, 30, 'Reusable water bottle for daily use.'
  UNION ALL SELECT 'Notebook Set', 'Stationery', 199.00, 40, 'Set of quality notebooks for notes and study.'
  UNION ALL SELECT 'Bluetooth Headphones', 'Electronics', 1299.00, 15, 'Wireless headphones with clear sound.'
  UNION ALL SELECT 'Wireless Mouse', 'Electronics', 499.00, 25, 'Comfortable wireless mouse for work and study.'
) AS sample
WHERE NOT EXISTS (SELECT 1 FROM products LIMIT 1);
