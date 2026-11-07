# INDU ONLINE SHOPPING
## Online Shopping Cart Management System

### Features
- Customer registration and login
- Browse products by category
- Add products to cart
- Update quantity and remove cart items
- Place orders; stock is reduced after successful order
- View order history
- Admin can add, update, delete products and manage stock

### Database
Exactly four tables: `users`, `products`, `cart`, `orders`.
Run `schema.sql` in MySQL Workbench.

### Setup
1. Install Node.js and MySQL.
2. Open this folder in VS Code.
3. Run `npm install`.
4. Copy `.env.example` to a new file named `.env` in this same main folder.
5. Set `DB_PASSWORD` to your MySQL root password. If your MySQL root account has no password, use `DB_PASSWORD=`.
6. Run `npm start`.
7. Open http://localhost:3000

### Create admin account
1. Register a normal account through the website.
2. In MySQL Workbench run:
   `USE indu_shopping_cart;`
   `UPDATE users SET role='admin' WHERE email='your_registered_email@example.com';`
3. Log out and log in again. The Admin link will appear.

### Important
- Do not put `.env` inside `views` or `public`. It must be beside `server.js`.
- Never share your `.env` file or database password.
- The project intentionally uses only the four tables requested for the lab.
