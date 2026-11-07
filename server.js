require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const db = require('./db');

const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: process.env.SESSION_SECRET || 'indu-shopping-development-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, maxAge: 1000 * 60 * 60 * 4 }
}));

app.use((req, res, next) => {
  res.locals.currentUser = req.session.user || null;
  res.locals.notice = req.session.notice || null;
  delete req.session.notice;
  next();
});
const message = (req, text) => { req.session.notice = text; };
const requireLogin = (req, res, next) => req.session.user ? next() : (message(req, 'Please login first.'), res.redirect('/login'));
const requireAdmin = (req, res, next) => {
  if (req.session.user && req.session.user.role === 'admin') return next();
  message(req, 'Admin access only.');
  return res.redirect('/');
};

app.get('/', async (req, res) => {
  try {
    const [products] = await db.query('SELECT * FROM products ORDER BY products_id DESC');
    res.render('home', { products });
  } catch (err) { console.error(err); res.status(500).send('Database error. Check .env settings and import schema.sql.'); }
});

app.get('/register', (req, res) => res.render('register'));
app.post('/register', async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;
    if (!name || !email || !password) { message(req, 'Name, email and password are required.'); return res.redirect('/register'); }
    const hash = await bcrypt.hash(password, 10);
    await db.query('INSERT INTO users (name,email,password,phone,role) VALUES (?,?,?,?,?)', [name.trim(), email.trim().toLowerCase(), hash, phone || '', 'customer']);
    message(req, 'Registration successful. Please login.');
    res.redirect('/login');
  } catch (err) {
    console.error(err);
    message(req, err.code === 'ER_DUP_ENTRY' ? 'Email already registered.' : 'Could not register. Please check details.');
    res.redirect('/register');
  }
});

app.get('/login', (req, res) => res.render('login'));
app.post('/login', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM users WHERE email=?', [String(req.body.email || '').trim().toLowerCase()]);
    if (!rows.length || !(await bcrypt.compare(req.body.password || '', rows[0].password))) {
      message(req, 'Invalid email or password.');
      return res.redirect('/login');
    }
    req.session.user = { user_id: rows[0].user_id, name: rows[0].name, email: rows[0].email, role: rows[0].role };
    res.redirect(rows[0].role === 'admin' ? '/admin' : '/');
  } catch (err) { console.error(err); message(req, 'Login failed. Check database connection.'); res.redirect('/login'); }
});
app.post('/logout', requireLogin, (req, res) => req.session.destroy(() => res.redirect('/')));

app.post('/cart/add/:id', requireLogin, async (req, res) => {
  try {
    const id = Number(req.params.id), qty = Math.max(1, parseInt(req.body.quantity || '1', 10));
    const [rows] = await db.query('SELECT * FROM products WHERE products_id=?', [id]);
    if (!rows.length || rows[0].stock < qty) { message(req, 'Product unavailable or requested quantity exceeds stock.'); return res.redirect('/'); }
    await db.query(
      `INSERT INTO cart (user_id, product_id, quantity) VALUES (?,?,?)
       ON DUPLICATE KEY UPDATE quantity = quantity + VALUES(quantity)`,
      [req.session.user.user_id, id, qty]
    );
    message(req, 'Product added to cart.');
    res.redirect('/cart');
  } catch (err) { console.error(err); message(req, 'Could not add product to cart.'); res.redirect('/'); }
});

app.get('/cart', requireLogin, async (req, res) => {
  try {
    const [items] = await db.query(
      `SELECT c.cart_id,c.quantity,p.products_id,p.product_name,p.price,p.stock,
       (c.quantity*p.price) AS subtotal
       FROM cart c JOIN products p ON c.product_id=p.products_id WHERE c.user_id=? ORDER BY c.added_date DESC`,
      [req.session.user.user_id]
    );
    const total = items.reduce((sum, item) => sum + Number(item.subtotal), 0);
    res.render('cart', { items, total });
  } catch (err) { console.error(err); res.status(500).send('Unable to load cart.'); }
});
app.post('/cart/update/:id', requireLogin, async (req, res) => {
  try {
    const qty = parseInt(req.body.quantity, 10);
    const [rows] = await db.query(
      `SELECT c.cart_id,p.stock FROM cart c JOIN products p ON c.product_id=p.products_id
       WHERE c.cart_id=? AND c.user_id=?`, [req.params.id, req.session.user.user_id]
    );
    if (!rows.length) { message(req, 'Cart item not found.'); return res.redirect('/cart'); }
    if (!Number.isInteger(qty) || qty < 1 || qty > rows[0].stock) { message(req, 'Enter a quantity between 1 and available stock.'); return res.redirect('/cart'); }
    await db.query('UPDATE cart SET quantity=? WHERE cart_id=? AND user_id=?', [qty, req.params.id, req.session.user.user_id]);
    message(req, 'Cart quantity updated.');
    res.redirect('/cart');
  } catch (err) { console.error(err); message(req, 'Could not update quantity.'); res.redirect('/cart'); }
});
app.post('/cart/remove/:id', requireLogin, async (req, res) => {
  await db.query('DELETE FROM cart WHERE cart_id=? AND user_id=?', [req.params.id, req.session.user.user_id]);
  message(req, 'Product removed from cart.');
  res.redirect('/cart');
});

app.post('/orders/place', requireLogin, async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const userId = req.session.user.user_id;
    const [items] = await conn.query(
      `SELECT c.cart_id,c.quantity,p.products_id,p.price,p.stock,p.product_name
       FROM cart c JOIN products p ON c.product_id=p.products_id WHERE c.user_id=? FOR UPDATE`, [userId]
    );
    if (!items.length) { await conn.rollback(); message(req, 'Your cart is empty.'); return res.redirect('/cart'); }
    for (const item of items) {
      if (item.quantity > item.stock) throw new Error(`${item.product_name} does not have enough stock.`);
    }
    const total = items.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0);
    await conn.query('INSERT INTO orders (user_id,total_amount,order_date,status) VALUES (?,?,CURDATE(),?)', [userId, total.toFixed(2), 'Placed']);
    for (const item of items) {
      await conn.query('UPDATE products SET stock=stock-? WHERE products_id=?', [item.quantity, item.products_id]);
    }
    await conn.query('DELETE FROM cart WHERE user_id=?', [userId]);
    await conn.commit();
    message(req, 'Order placed successfully!');
    res.redirect('/orders');
  } catch (err) {
    await conn.rollback();
    console.error(err);
    message(req, err.message || 'Could not place order.');
    res.redirect('/cart');
  } finally { conn.release(); }
});
app.get('/orders', requireLogin, async (req, res) => {
  const [orders] = await db.query('SELECT * FROM orders WHERE user_id=? ORDER BY order_id DESC', [req.session.user.user_id]);
  res.render('orders', { orders });
});

app.get('/admin', requireAdmin, async (req, res) => {
  const [products] = await db.query('SELECT * FROM products ORDER BY products_id DESC');
  const [[stats]] = await db.query('SELECT (SELECT COUNT(*) FROM users) AS users,(SELECT COUNT(*) FROM products) AS products,(SELECT COUNT(*) FROM orders) AS orders');
  res.render('admin', { products, stats });
});
app.post('/admin/products/add', requireAdmin, async (req, res) => {
  const { product_name, category, price, stock, description } = req.body;
  if (!product_name || Number(price) < 0 || !Number.isInteger(Number(stock)) || Number(stock) < 0) {
    message(req, 'Enter valid product details.'); return res.redirect('/admin');
  }
  await db.query('INSERT INTO products (product_name,category,price,stock,description) VALUES (?,?,?,?,?)',
    [product_name.trim(), category || '', Number(price), Number(stock), description || '']);
  message(req, 'Product added successfully.');
  res.redirect('/admin');
});
app.post('/admin/products/update/:id', requireAdmin, async (req, res) => {
  const { product_name, category, price, stock, description } = req.body;
  if (!product_name || Number(price) < 0 || !Number.isInteger(Number(stock)) || Number(stock) < 0) {
    message(req, 'Enter valid product details.'); return res.redirect('/admin');
  }
  await db.query('UPDATE products SET product_name=?,category=?,price=?,stock=?,description=? WHERE products_id=?',
    [product_name.trim(), category || '', Number(price), Number(stock), description || '', req.params.id]);
  message(req, 'Product details updated.');
  res.redirect('/admin');
});
app.post('/admin/products/delete/:id', requireAdmin, async (req, res) => {
  await db.query('DELETE FROM products WHERE products_id=?', [req.params.id]);
  message(req, 'Product deleted.');
  res.redirect('/admin');
});

app.use((req, res) => res.status(404).send('Page not found. <a href="/">Go home</a>'));
const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log(`INDU ONLINE SHOPPING running at http://localhost:${port}`));
