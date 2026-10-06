# Corner Shop

A simple, responsive online shopping mini-project built with HTML, CSS, and vanilla JavaScript. It runs directly in a browser with no server, framework, or package installation.

## Run it

Open `index.html` in a browser. For local development, you can also serve this folder with any static-file server.

## Demo features

- Customer registration and login, product browsing, categories, search, sorting, product details, wishlist, and shopping cart.
- Checkout with a saved delivery address, simulated payment selection, order confirmation, and order history.
- Stock checks during cart updates and checkout; placing an order reduces product stock.
- Admin dashboard for managing products, categories, customers, orders, and order status.
- Admins can upload an optional JPG, PNG, or WebP product photo; it is resized and shown in product listings, details, and the shopping bag.
- Responsive layout for mobile and desktop.

## Admin demo account

- Email: `admin@shop.local`
- Password: `admin123`

Register a customer account from the sign-in screen to try the shopping and checkout flows. The payment choices are demonstrations only; no payment is collected.

## Storage and limitations

The project stores demo accounts, product data, cart contents, and orders in the browser's `localStorage`; product photos are stored separately in `IndexedDB` so they don't use up the smaller local-storage quota. Data stays in the same browser on the same device. To start over, clear this site's local storage and IndexedDB in your browser's developer tools. This is a front-end learning demo, not a production commerce system: authentication is not secure, data is not shared between users/devices, and payments are not processed.
# shopping
