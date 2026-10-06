const STORAGE_KEY = "corner-shop-data-v1";
const IMAGE_DB_NAME = "corner-shop-product-images";
const IMAGE_STORE_NAME = "images";
const money = amount => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(amount);
const categoryIcons = { Electronics: "⌁", Clothing: "✿", Books: "▤", Home: "⌂", Accessories: "✧" };
const colorSwatches = ["#edf0e8", "#f3e9e1", "#e8ebf2", "#f2efdf", "#e9e6ef"];
const demoProducts = [
  { id: "p1", name: "Everyday Ceramic Mug", category: "Home", price: 449, stock: 18, description: "A handmade-feel ceramic mug for slow mornings and long coffee breaks. Finished with a soft, speckled glaze.", emoji: "☕", tag: "Bestseller" },
  { id: "p2", name: "Soft Knit Cardigan", category: "Clothing", price: 1899, stock: 12, description: "An easy, relaxed layer in a soft knit. Thoughtfully made for cool mornings and comfortable evenings.", emoji: "🧥", tag: "New" },
  { id: "p3", name: "The Sunday Reading List", category: "Books", price: 599, stock: 24, description: "A thoughtful collection of stories to help you slow down, settle in, and enjoy a little time to yourself.", emoji: "📚", tag: "Staff pick" },
  { id: "p4", name: "Wireless Headphones", category: "Electronics", price: 2499, stock: 9, description: "Comfortable wireless listening with clear sound and all-day battery life. Your everyday soundtrack, sorted.", emoji: "🎧", tag: "Popular" },
  { id: "p5", name: "Botanical Desk Vase", category: "Home", price: 799, stock: 15, description: "A petite sculptural vase that brings a little nature to your desk, bedside table, or favourite shelf.", emoji: "🏺", tag: "" },
  { id: "p6", name: "Canvas Everyday Tote", category: "Accessories", price: 699, stock: 21, description: "A sturdy, roomy canvas tote for market mornings, library trips, and everything you pick up along the way.", emoji: "👜", tag: "Everyday essential" },
  { id: "p7", name: "Classic Cotton Shirt", category: "Clothing", price: 1299, stock: 14, description: "An easy-fitting cotton shirt with a clean silhouette. A wardrobe staple that feels as good as it looks.", emoji: "👕", tag: "" },
  { id: "p8", name: "Pocket Bluetooth Speaker", category: "Electronics", price: 1599, stock: 7, description: "Big, balanced sound in a compact, portable speaker. Take your favourite playlists wherever you go.", emoji: "🔊", tag: "Limited stock" }
];

function freshData() {
  return {
    categories: ["Electronics", "Clothing", "Books", "Home", "Accessories"],
    products: structuredClone(demoProducts),
    users: [{ id: "admin-1", name: "Shop Admin", email: "admin@shop.local", password: "admin123", role: "admin" }],
    carts: {},
    wishlists: {},
    addresses: {},
    orders: []
  };
}

function loadData() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return freshData();
    const parsed = JSON.parse(saved);
    const defaults = freshData();
    return {
      ...defaults,
      ...parsed,
      categories: Array.isArray(parsed.categories) ? parsed.categories : defaults.categories,
      products: Array.isArray(parsed.products) ? parsed.products : defaults.products,
      users: Array.isArray(parsed.users) ? parsed.users : defaults.users,
      carts: parsed.carts && typeof parsed.carts === "object" ? parsed.carts : {},
      wishlists: parsed.wishlists && typeof parsed.wishlists === "object" ? parsed.wishlists : {},
      addresses: parsed.addresses && typeof parsed.addresses === "object" ? parsed.addresses : {},
      orders: Array.isArray(parsed.orders) ? parsed.orders : []
    };
  } catch (error) {
    console.error("Could not read saved shop data:", error);
    return freshData();
  }
}

let data = loadData();
let currentUser = null;
let view = "home";
let adminTab = "overview";
let searchQuery = "";
let selectedCategory = "All";
let sortOrder = "featured";
let editingProductId = null;
let selectedProductImage = null;
let imageProcessing = false;
let toastTimer;

function openImageDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(IMAGE_DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(IMAGE_STORE_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Could not open image storage."));
  });
}

async function storeProductImage(key, imageData) {
  const response = await fetch(imageData);
  const blob = await response.blob();
  const database = await openImageDatabase();
  try {
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(IMAGE_STORE_NAME, "readwrite");
      transaction.objectStore(IMAGE_STORE_NAME).put(blob, key);
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error || new Error("Could not save product photo."));
      transaction.onabort = () => reject(transaction.error || new Error("Could not save product photo."));
    });
  } finally {
    database.close();
  }
  return URL.createObjectURL(blob);
}

async function readProductImage(key) {
  const database = await openImageDatabase();
  try {
    const blob = await new Promise((resolve, reject) => {
      const transaction = database.transaction(IMAGE_STORE_NAME, "readonly");
      const request = transaction.objectStore(IMAGE_STORE_NAME).get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Could not load product photo."));
    });
    return blob ? URL.createObjectURL(blob) : "";
  } finally {
    database.close();
  }
}

async function restoreProductImages() {
  for (const product of data.products) {
    if (product.image?.startsWith("data:image/")) {
      try {
        product.imageKey ||= product.id;
        product.image = await storeProductImage(product.imageKey, product.image);
      } catch (error) {
        console.error(`Could not migrate photo for ${product.name}:`, error);
        showToast(`Could not move the photo for ${product.name} into persistent storage.`);
      }
    } else if (product.imageKey) {
      try {
        product.image = await readProductImage(product.imageKey);
        if (!product.image) showToast(`Saved photo for ${product.name} is missing from browser storage.`);
      } catch (error) {
        console.error(`Could not restore photo for ${product.name}:`, error);
        showToast(`Could not load the photo for ${product.name}.`);
      }
    }
  }
  saveData();
  render();
}

function saveData() {
  try {
    const storedData = {
      ...data,
      products: data.products.map(product => product.image?.startsWith("data:image/")
        ? product
        : Object.fromEntries(Object.entries(product).filter(([key]) => key !== "image")))
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(storedData));
  } catch (error) {
    console.error("Could not save shop data:", error);
    showToast("Couldn't save your changes. Check browser storage.");
  }
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

function getCart() {
  return currentUser ? (data.carts[currentUser.id] || []) : [];
}

function getWishlist() {
  return currentUser ? (data.wishlists[currentUser.id] || []) : [];
}

function cartQuantity() {
  return getCart().reduce((sum, item) => sum + item.quantity, 0);
}

function updateHeader() {
  document.getElementById("cart-count").textContent = cartQuantity();
  const account = document.getElementById("account-link");
  account.textContent = currentUser ? currentUser.name.split(" ")[0] : "Sign in";
  account.dataset.view = currentUser ? "account" : "login";
  account.title = currentUser ? `Signed in as ${currentUser.email}` : "Sign in";
}

function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2500);
}

function go(nextView) {
  view = nextView;
  if (nextView === "admin" && currentUser?.role !== "admin") view = "login";
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function imageBackground(product) {
  return colorSwatches[Math.max(0, data.products.findIndex(item => item.id === product.id)) % colorSwatches.length];
}

function productVisual(product, className = "emoji") {
  return product.image
    ? `<img class="${className} product-photo" src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}">`
    : `<span class="${className}" aria-hidden="true">${escapeHtml(product.emoji || "📦")}</span>`;
}

async function prepareProductImage(file) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw new Error("Choose a JPG, PNG, or WebP image.");
  }
  if (file.size > 8 * 1024 * 1024) {
    throw new Error("Choose an image smaller than 8 MB.");
  }
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 900 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Your browser could not process this image.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.78);
  } finally {
    bitmap.close();
  }
}

function productCard(product) {
  const wished = getWishlist().includes(product.id);
  const soldOut = product.stock <= 0;
  return `<article class="product-card">
    <div class="product-image" style="--image-bg:${imageBackground(product)}">
      ${product.tag ? `<span class="product-tag">${escapeHtml(product.tag)}</span>` : ""}
      ${productVisual(product)}
      <button class="heart-button ${wished ? "active" : ""}" data-action="toggle-wishlist" data-id="${escapeHtml(product.id)}" aria-label="${wished ? "Remove from" : "Add to"} wishlist" title="${wished ? "Remove from" : "Add to"} wishlist">${wished ? "♥" : "♡"}</button>
    </div>
    <div class="product-info">
      <span class="product-category">${escapeHtml(product.category)}</span>
      <button class="product-name text-button" data-action="product-detail" data-id="${escapeHtml(product.id)}">${escapeHtml(product.name)}</button>
      <div class="product-bottom"><span class="product-price">${money(product.price)}</span><button class="add-button" data-action="add-cart" data-id="${escapeHtml(product.id)}" ${soldOut ? "disabled" : ""}>${soldOut ? "Sold out" : "Add to bag"}</button></div>
    </div>
  </article>`;
}

function renderHome() {
  const categories = data.categories.slice(0, 8);
  const featured = data.products.slice(0, 4);
  return `<div class="page-width">
    <section class="hero">
      <div class="hero-copy"><span class="eyebrow">GOOD THINGS, GENTLY GATHERED</span><h1 class="serif">Make room for the little things.</h1><p>Everyday favourites, thoughtful finds, and a few lovely surprises. All in one happy little corner.</p><button class="primary-button" data-view="products">Find your something&nbsp; →</button></div>
      <div class="hero-art" aria-label="Illustration of a handmade ceramic vase"><div class="hero-circle"></div><div class="hero-product" aria-hidden="true">🏺</div><div class="hero-note"><strong>A little more lovely</strong><span class="muted">Small finds, big smiles</span></div></div>
    </section>
    <section class="home-section">
      <div class="section-heading"><div><span class="eyebrow">TAKE A LITTLE LOOK</span><h2 class="serif">Browse by category</h2></div></div>
      <div class="category-grid">${categories.map(category => { const count = data.products.filter(product => product.category === category).length; return `<button class="category-tile" data-action="category" data-category="${escapeHtml(category)}"><span class="category-icon">${categoryIcons[category] || "✧"}</span><span><strong>${escapeHtml(category)}</strong><small>${count} ${count === 1 ? "lovely find" : "lovely finds"}</small></span></button>`; }).join("")}</div>
    </section>
    <section class="home-section" style="padding-bottom:50px">
      <div class="section-heading"><div><span class="eyebrow">A FEW GOOD FINDS</span><h2 class="serif">Little things you'll love</h2></div><button class="text-button" data-view="products">See everything&nbsp; →</button></div>
      <div class="product-grid">${featured.length ? featured.map(productCard).join("") : `<p class="muted">No products yet. Check back soon.</p>`}</div>
    </section>
  </div>`;
}

function renderProducts() {
  let products = data.products.filter(product => {
    const query = searchQuery.trim().toLowerCase();
    const matchesSearch = !query || `${product.name} ${product.category} ${product.description}`.toLowerCase().includes(query);
    const matchesCategory = selectedCategory === "All" || product.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });
  if (sortOrder === "price-low") products.sort((a, b) => a.price - b.price);
  if (sortOrder === "price-high") products.sort((a, b) => b.price - a.price);
  if (sortOrder === "name") products.sort((a, b) => a.name.localeCompare(b.name));
  return `<section class="page-width product-listing">
    <div class="listing-header"><div><span class="eyebrow">THE GOOD STUFF</span><h1 class="serif">${searchQuery ? `Search results` : selectedCategory === "All" ? "All the lovely things" : escapeHtml(selectedCategory)}</h1></div>
      <div class="filters"><label class="sr-only" for="category-filter">Filter by category</label><select id="category-filter">${["All", ...data.categories].map(category => `<option value="${escapeHtml(category)}" ${selectedCategory === category ? "selected" : ""}>${category === "All" ? "All categories" : escapeHtml(category)}</option>`).join("")}</select><label class="sr-only" for="sort-filter">Sort products</label><select id="sort-filter"><option value="featured" ${sortOrder === "featured" ? "selected" : ""}>Featured</option><option value="price-low" ${sortOrder === "price-low" ? "selected" : ""}>Price: low to high</option><option value="price-high" ${sortOrder === "price-high" ? "selected" : ""}>Price: high to low</option><option value="name" ${sortOrder === "name" ? "selected" : ""}>Name: A to Z</option></select></div>
    </div>
    <p class="result-count">${products.length} ${products.length === 1 ? "find" : "finds"}${searchQuery ? ` for “${escapeHtml(searchQuery)}”` : ""}</p>
    ${products.length ? `<div class="product-grid">${products.map(productCard).join("")}</div>` : `<div class="empty-state"><div class="empty-icon">⌕</div><h2>Nothing here just yet</h2><p>Try another search or browse all the lovely things.</p><button class="secondary-button" data-action="clear-filters">Show everything</button></div>`}
  </section>`;
}

function renderDetail() {
  const product = data.products.find(item => item.id === view.split(":")[1]);
  if (!product) return `<div class="page-width"><div class="empty-state" style="margin:38px 0"><h2>We couldn't find that item</h2><button class="secondary-button" data-view="products">Browse products</button></div></div>`;
  return `<div class="page-width"><button class="back-link" data-view="products">← Back to all finds</button><section class="detail-layout">
    <div class="detail-art" style="--image-bg:${imageBackground(product)}">${productVisual(product)}</div><div class="detail-copy"><span class="eyebrow">${escapeHtml(product.category)}</span><h1 class="serif">${escapeHtml(product.name)}</h1><div class="product-price" style="font-size:20px">${money(product.price)}</div><p>${escapeHtml(product.description)}</p><div class="detail-stock">${product.stock > 0 ? `<strong style="color:var(--green)">${product.stock} in stock</strong> <span class="muted">· Ready to find a new home</span>` : `<strong style="color:#a54747">Currently out of stock</strong>`}</div><div class="detail-buy"><input class="quantity" id="detail-quantity" type="number" min="1" max="${product.stock}" value="1" aria-label="Quantity" ${product.stock <= 0 ? "disabled" : ""}><button class="primary-button" data-action="add-cart" data-id="${escapeHtml(product.id)}" ${product.stock <= 0 ? "disabled" : ""}>Add to bag&nbsp; →</button><button class="secondary-button" data-action="toggle-wishlist" data-id="${escapeHtml(product.id)}">♡</button></div><span class="muted" style="font-size:11px">Thoughtfully packed. Delivered with care.</span></div>
  </section></div>`;
}

function renderCart() {
  const cart = getCart();
  const items = cart.map(item => ({ ...item, product: data.products.find(product => product.id === item.productId) })).filter(item => item.product);
  if (!currentUser) return `<div class="page-width"><div class="page-title"><span class="eyebrow">YOUR LITTLE CORNER</span><h1 class="serif">Your bag</h1></div>${emptyState("Sign in to see your bag", "Your bag is ready when you are.", "Sign in", "login")}</div>`;
  if (!items.length) return `<div class="page-width"><div class="page-title"><span class="eyebrow">YOUR LITTLE CORNER</span><h1 class="serif">Your bag</h1></div>${emptyState("Your bag is looking a little empty", "Let's find something lovely to put in it.", "Explore the shop", "products")}</div>`;
  const subtotal = items.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  return `<div class="page-width"><div class="page-title"><span class="eyebrow">YOUR LITTLE CORNER</span><h1 class="serif">Your bag <span class="muted" style="font-size:16px;font-family:'DM Sans',sans-serif">(${cartQuantity()} items)</span></h1></div>
    <div class="two-column"><section class="panel"><h2 class="serif">The things you picked</h2>${items.map(item => `<div class="cart-row"><div class="cart-thumb" style="--image-bg:${imageBackground(item.product)}">${productVisual(item.product)}</div><div><div class="cart-name">${escapeHtml(item.product.name)}</div><div class="cart-meta">${money(item.product.price)} each · ${item.product.stock} in stock</div></div><input class="cart-quantity" type="number" min="1" max="${item.product.stock}" value="${item.quantity}" aria-label="Quantity for ${escapeHtml(item.product.name)}" data-action="cart-quantity" data-id="${escapeHtml(item.product.id)}"><button class="remove-button" data-action="remove-cart" data-id="${escapeHtml(item.product.id)}">Remove</button></div>`).join("")}</section>
    <aside class="panel"><h2 class="serif">A little summary</h2><div class="summary-line"><span>Subtotal</span><span>${money(subtotal)}</span></div><div class="summary-line"><span>Delivery</span><span>${subtotal >= 1500 ? "On us" : money(79)}</span></div><div class="summary-line summary-total"><span>Total</span><span>${money(subtotal + (subtotal >= 1500 ? 0 : 79))}</span></div><p class="summary-note">${subtotal >= 1500 ? "Lovely! Your delivery is on us." : `Spend ${money(1500 - subtotal)} more for free delivery.`}</p><button class="primary-button full-width" data-view="checkout">On to checkout&nbsp; →</button><button class="text-button full-width" data-view="products">Keep browsing</button></aside></div>
  </div>`;
}

function emptyState(title, body, button, target) {
  return `<div class="empty-state"><div class="empty-icon">♡</div><h2>${escapeHtml(title)}</h2><p>${escapeHtml(body)}</p><button class="primary-button" data-view="${target}">${escapeHtml(button)}</button></div>`;
}

function renderWishlist() {
  if (!currentUser) return `<div class="page-width"><div class="page-title"><span class="eyebrow">SAVED FOR LATER</span><h1 class="serif">Your wishlist</h1></div>${emptyState("Sign in to save your favourites", "Keep all your lovely finds in one place.", "Sign in", "login")}</div>`;
  const products = data.products.filter(product => getWishlist().includes(product.id));
  return `<section class="page-width product-listing"><div class="listing-header"><div><span class="eyebrow">SAVED FOR LATER</span><h1 class="serif">Your wishlist</h1></div></div>${products.length ? `<div class="product-grid">${products.map(productCard).join("")}</div>` : emptyState("Nothing saved just yet", "Tap the little heart on something you love.", "Explore the shop", "products")}</section>`;
}

function renderCheckout() {
  if (!currentUser) return `<div class="page-width"><div class="page-title"><h1 class="serif">Checkout</h1></div>${emptyState("Sign in to checkout", "Your lovely finds will be waiting in your bag.", "Sign in", "login")}</div>`;
  const cart = getCart();
  if (!cart.length) return `<div class="page-width"><div class="page-title"><h1 class="serif">Checkout</h1></div>${emptyState("Your bag is empty", "Add something lovely before checkout.", "Explore the shop", "products")}</div>`;
  const saved = data.addresses[currentUser.id] || {};
  const subtotal = cart.reduce((sum, item) => sum + (data.products.find(product => product.id === item.productId)?.price || 0) * item.quantity, 0);
  const total = subtotal + (subtotal >= 1500 ? 0 : 79);
  const unavailable = cart.some(item => {
    const product = data.products.find(entry => entry.id === item.productId);
    return !product || product.stock < item.quantity;
  });
  return `<div class="page-width"><div class="page-title"><span class="eyebrow">JUST A FEW MORE DETAILS</span><h1 class="serif">Make it yours</h1></div>
    <form id="checkout-form" class="checkout-grid"><div><section class="panel"><h2 class="serif">Where should we send it?</h2><div class="form-grid">
      <div class="field"><label for="address-name">Full name</label><input id="address-name" name="name" required value="${escapeHtml(saved.name || currentUser.name)}" autocomplete="name"></div>
      <div class="field"><label for="address-phone">Phone number</label><input id="address-phone" name="phone" required value="${escapeHtml(saved.phone || "")}" autocomplete="tel" inputmode="tel"></div>
      <div class="field span-2"><label for="address-line">Street address</label><textarea id="address-line" name="line" required autocomplete="street-address">${escapeHtml(saved.line || "")}</textarea></div>
      <div class="field"><label for="address-city">City</label><input id="address-city" name="city" required value="${escapeHtml(saved.city || "")}" autocomplete="address-level2"></div>
      <div class="field"><label for="address-state">State</label><input id="address-state" name="state" required value="${escapeHtml(saved.state || "")}" autocomplete="address-level1"></div>
      <div class="field"><label for="address-postal">Postal code</label><input id="address-postal" name="postal" required value="${escapeHtml(saved.postal || "")}" autocomplete="postal-code" inputmode="numeric"></div>
    </div></section><section class="panel"><h2 class="serif">How would you like to pay?</h2>
      <label class="radio-option"><input type="radio" name="payment" value="Cash on delivery" checked> Cash on delivery</label>
      <label class="radio-option"><input type="radio" name="payment" value="UPI (demo)"> UPI <span class="muted">(demo — no money is charged)</span></label>
      <p class="summary-note">This is a college project demo. Payments are simulated and no real payment is collected.</p>
    </section></div><aside class="panel"><h2 class="serif">Your order</h2>${cart.map(item => { const product = data.products.find(entry => entry.id === item.productId); return product ? `<div class="summary-line"><span>${escapeHtml(product.name)} × ${item.quantity}</span><span>${money(product.price * item.quantity)}</span></div>` : ""; }).join("")}<div class="summary-line"><span>Delivery</span><span>${subtotal >= 1500 ? "On us" : money(79)}</span></div><div class="summary-line summary-total"><span>Total</span><span>${money(total)}</span></div>${unavailable ? `<p class="summary-note" style="color:#a54747">One or more items are no longer available in the requested quantity. Update your bag to continue.</p>` : ""}<button class="primary-button full-width" type="submit" ${unavailable ? "disabled" : ""}>Place my order&nbsp; →</button></aside></form>
  </div>`;
}

function userOrders() {
  return data.orders.filter(order => order.userId === currentUser?.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function orderCard(order, admin = false) {
  const status = order.status.toLowerCase();
  const names = order.items.map(item => `${escapeHtml(item.name)} × ${item.quantity}`).join(", ");
  return `<article class="order-card"><div class="order-card-top"><div><div class="order-number">Order ${escapeHtml(order.id)}</div><div class="order-date">${new Date(order.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}${admin ? ` · ${escapeHtml(order.customerName)}` : ""}</div></div>${admin ? `<select aria-label="Update order status" data-action="order-status" data-id="${escapeHtml(order.id)}">${["Pending", "Confirmed", "Shipped", "Delivered"].map(value => `<option ${order.status === value ? "selected" : ""}>${value}</option>`).join("")}</select>` : `<span class="status-pill status-${status}">${escapeHtml(order.status)}</span>`}</div><div class="order-items">${names}<br><span>Ship to: ${escapeHtml(order.address.city)}, ${escapeHtml(order.address.state)} · ${escapeHtml(order.payment)}</span></div><div class="order-footer"><span>${order.items.reduce((sum, item) => sum + item.quantity, 0)} item(s)</span><span>${money(order.total)}</span></div></article>`;
}

function renderOrders() {
  const orders = userOrders();
  return `<div class="page-width"><div class="page-title"><span class="eyebrow">A LOOK BACK</span><h1 class="serif">Your orders</h1></div>${orders.length ? orders.map(order => orderCard(order)).join("") : emptyState("No orders just yet", "When you find something lovely, your orders will show up here.", "Explore the shop", "products")}</div>`;
}

function renderAccount() {
  if (!currentUser) return renderAuth("login");
  if (currentUser.role === "admin") return `<div class="page-width"><div class="page-title"><span class="eyebrow">YOUR ACCOUNT</span><h1 class="serif">Hello, ${escapeHtml(currentUser.name.split(" ")[0])}</h1></div><div class="panel" style="max-width:560px"><p><strong>${escapeHtml(currentUser.name)}</strong><br><span class="muted">${escapeHtml(currentUser.email)}</span></p><p class="muted" style="font-size:12px">You’re signed in as the shop administrator.</p><button class="primary-button" data-view="admin">Open shop dashboard</button> <button class="secondary-button" data-action="logout">Sign out</button></div></div>`;
  const address = data.addresses[currentUser.id];
  return `<div class="page-width"><div class="page-title"><span class="eyebrow">YOUR ACCOUNT</span><h1 class="serif">Hello, ${escapeHtml(currentUser.name.split(" ")[0])}</h1></div><div class="panel" style="max-width:560px"><p><strong>${escapeHtml(currentUser.name)}</strong><br><span class="muted">${escapeHtml(currentUser.email)}</span></p><h3 class="serif" style="margin:24px 0 8px">Saved delivery address</h3>${address ? `<p class="muted" style="font-size:12px;line-height:1.8">${escapeHtml(address.name)} · ${escapeHtml(address.phone)}<br>${escapeHtml(address.line)}<br>${escapeHtml(address.city)}, ${escapeHtml(address.state)} ${escapeHtml(address.postal)}</p>` : `<p class="muted" style="font-size:12px">Your address will be saved securely in this browser when you place an order.</p>`}<button class="secondary-button" data-view="orders">View order history</button> <button class="secondary-button" data-action="logout">Sign out</button></div></div>`;
}

function renderAuth(mode = "login") {
  const registering = mode === "register";
  return `<section class="account-box"><span class="eyebrow">WELCOME TO YOUR CORNER</span><h1 class="serif">${registering ? "A lovely place to start." : "Nice to see you."}</h1><p class="muted" style="font-size:13px;margin:0 0 22px">${registering ? "Create an account and keep your favourites close." : "Sign in to shop, save your favourites, and see your orders."}</p>
    <form id="${registering ? "register-form" : "login-form"}">${registering ? `<div class="field"><label for="auth-name">Your name</label><input id="auth-name" name="name" required autocomplete="name"></div>` : ""}
      <div class="field"><label for="auth-email">Email address</label><input id="auth-email" type="email" name="email" required autocomplete="email"></div>
      <div class="field"><label for="auth-password">Password</label><input id="auth-password" type="password" name="password" required minlength="${registering ? "6" : "1"}" autocomplete="${registering ? "new-password" : "current-password"}"></div>
      ${registering ? "" : `<div class="demo-note"><strong>Admin demo:</strong> admin@shop.local &nbsp;·&nbsp; password: admin123</div>`}
      <button class="primary-button full-width" type="submit">${registering ? "Create my account" : "Sign in"}</button></form>
    <p class="account-switch">${registering ? "Already have an account?" : "New around here?"} <button data-view="${registering ? "login" : "register"}">${registering ? "Sign in" : "Create an account"}</button></p>
  </section>`;
}

function renderAdmin() {
  if (currentUser?.role !== "admin") return renderAuth("login");
  const tabs = [["overview", "Overview"], ["products", "Products"], ["categories", "Categories"], ["customers", "Customers"], ["orders", "Orders"]];
  let content = "";
  if (adminTab === "overview") {
    const revenue = data.orders.reduce((sum, order) => sum + order.total, 0);
    content = `<div class="stat-grid"><div class="stat-card"><span>Products</span><strong>${data.products.length}</strong></div><div class="stat-card"><span>Customers</span><strong>${data.users.filter(user => user.role !== "admin").length}</strong></div><div class="stat-card"><span>Orders</span><strong>${data.orders.length}</strong></div><div class="stat-card"><span>Order value</span><strong>${money(revenue)}</strong></div></div><section class="panel"><h2 class="serif">Recent orders</h2>${data.orders.length ? data.orders.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5).map(order => orderCard(order, true)).join("") : `<p class="muted" style="font-size:13px">Your first orders will appear here.</p>`}</section>`;
  } else if (adminTab === "products") {
    const product = editingProductId && data.products.find(item => item.id === editingProductId);
    const previewImage = selectedProductImage === null ? (product?.image || "") : selectedProductImage;
    content = `<div class="admin-grid"><section class="panel"><h2 class="serif">${product ? "A few product details" : "Add a new find"}</h2><form id="product-form" class="admin-form"><input type="hidden" name="id" value="${escapeHtml(product?.id || "")}"><div class="field"><label for="product-name">Product name</label><input id="product-name" name="name" required value="${escapeHtml(product?.name || "")}"></div><div class="form-grid"><div class="field"><label for="product-price">Price (₹)</label><input id="product-price" name="price" type="number" min="1" required value="${escapeHtml(product?.price ?? "")}"></div><div class="field"><label for="product-stock">Stock</label><input id="product-stock" name="stock" type="number" min="0" required value="${escapeHtml(product?.stock ?? "")}"></div></div><div class="field"><label for="product-category">Category</label><select id="product-category" name="category" required>${data.categories.map(category => `<option ${product?.category === category ? "selected" : ""}>${escapeHtml(category)}</option>`).join("")}</select></div><div class="field"><label for="product-emoji">Product emoji (used if no photo)</label><input id="product-emoji" name="emoji" maxlength="8" value="${escapeHtml(product?.emoji || "📦")}"></div><div class="field"><label for="product-photo">Product photo (optional)</label><input id="product-photo" name="photo" type="file" accept="image/jpeg,image/png,image/webp"><span class="field-hint">JPG, PNG, or WebP · up to 8 MB. Photos are resized for browser storage.</span><div class="photo-preview"><img id="product-image-preview" src="${escapeHtml(previewImage)}" alt="Product photo preview" ${previewImage ? "" : "hidden"}><span id="product-image-placeholder" aria-hidden="true" ${previewImage ? "hidden" : ""}>${escapeHtml(product?.emoji || "📦")}</span></div><button class="text-button" type="button" data-action="remove-product-image">Remove photo</button></div><div class="field"><label for="product-tag">Small label (optional)</label><input id="product-tag" name="tag" value="${escapeHtml(product?.tag || "")}"></div><div class="field"><label for="product-description">Description</label><textarea id="product-description" name="description" required>${escapeHtml(product?.description || "")}</textarea></div><button class="primary-button" type="submit">${product ? "Save changes" : "Add product"}</button>${product ? ` <button class="secondary-button" type="button" data-action="cancel-edit">Cancel</button>` : ""}</form></section><section class="panel"><h2 class="serif">Your products (${data.products.length})</h2><div class="table-wrap"><table><thead><tr><th>Product</th><th>Price</th><th>Stock</th><th>Actions</th></tr></thead><tbody>${data.products.map(item => `<tr><td><div class="admin-product">${productVisual(item, "admin-emoji")}<span>${escapeHtml(item.name)}<br><span class="muted">${escapeHtml(item.category)}</span></span></div></td><td>${money(item.price)}</td><td><span style="${item.stock <= 3 ? "color:#a54747;font-weight:700" : ""}">${item.stock}</span></td><td><div class="inline-actions"><button class="secondary-button small-button" data-action="edit-product" data-id="${escapeHtml(item.id)}">Edit</button><button class="danger-button small-button" data-action="delete-product" data-id="${escapeHtml(item.id)}">Delete</button></div></td></tr>`).join("")}</tbody></table></div></section></div>`;
  } else if (adminTab === "categories") {
    content = `<div class="admin-grid"><section class="panel"><h2 class="serif">Add a category</h2><form id="category-form"><div class="field"><label for="category-name">Category name</label><input id="category-name" name="name" required maxlength="30" placeholder="e.g. Garden"></div><button class="primary-button" type="submit">Add category</button></form></section><section class="panel"><h2 class="serif">Your categories</h2><div class="table-wrap"><table><thead><tr><th>Category</th><th>Products</th><th>Action</th></tr></thead><tbody>${data.categories.map(category => `<tr><td>${escapeHtml(category)}</td><td>${data.products.filter(product => product.category === category).length}</td><td><button class="danger-button small-button" data-action="delete-category" data-category="${escapeHtml(category)}" ${data.products.some(product => product.category === category) ? "disabled title='Move or remove its products first'" : ""}>Delete</button></td></tr>`).join("")}</tbody></table></div><p class="summary-note">A category can only be deleted when it has no products.</p></section></div>`;
  } else if (adminTab === "customers") {
    const customers = data.users.filter(user => user.role !== "admin");
    content = `<section class="panel"><h2 class="serif">Customers (${customers.length})</h2>${customers.length ? `<div class="table-wrap"><table><thead><tr><th>Name</th><th>Email</th><th>Orders</th><th>Joined</th></tr></thead><tbody>${customers.map(user => `<tr><td>${escapeHtml(user.name)}</td><td>${escapeHtml(user.email)}</td><td>${data.orders.filter(order => order.userId === user.id).length}</td><td>Shop customer</td></tr>`).join("")}</tbody></table></div>` : `<p class="muted" style="font-size:13px">Customer accounts will appear here when they register.</p>`}</section>`;
  } else {
    content = `<section class="panel"><h2 class="serif">All orders (${data.orders.length})</h2>${data.orders.length ? data.orders.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(order => orderCard(order, true)).join("") : `<p class="muted" style="font-size:13px">There are no orders to show yet.</p>`}</section>`;
  }
  return `<div class="page-width admin-wrap"><div class="admin-head"><div><span class="eyebrow">THE SHOP, BEHIND THE SCENES</span><h1 class="serif">A little dashboard</h1></div><button class="secondary-button" data-action="logout">Sign out</button></div><div class="admin-tabs">${tabs.map(([key, label]) => `<button class="admin-tab ${adminTab === key ? "active" : ""}" data-action="admin-tab" data-tab="${key}">${label}</button>`).join("")}</div>${content}</div>`;
}

function render() {
  updateHeader();
  let content;
  if (view.startsWith("detail:")) content = renderDetail();
  else if (view === "home") content = renderHome();
  else if (view === "products") content = renderProducts();
  else if (view === "cart") content = renderCart();
  else if (view === "wishlist") content = renderWishlist();
  else if (view === "checkout") content = renderCheckout();
  else if (view === "orders") content = currentUser ? renderOrders() : renderAuth("login");
  else if (view === "account") content = renderAccount();
  else if (view === "register" || view === "login") content = renderAuth(view);
  else if (view === "admin") content = renderAdmin();
  else content = renderHome();
  document.getElementById("app").innerHTML = content;
  const search = document.getElementById("site-search");
  if (search) search.value = searchQuery;
}

function addToCart(productId, requestedQuantity = 1) {
  if (!currentUser || currentUser.role === "admin") {
    showToast(currentUser ? "Admin accounts can't place orders." : "Sign in to add items to your bag.");
    if (!currentUser) go("login");
    return;
  }
  const product = data.products.find(item => item.id === productId);
  const quantity = Number(requestedQuantity);
  if (!product || !Number.isInteger(quantity) || quantity < 1) return showToast("Choose a valid quantity.");
  const cart = data.carts[currentUser.id] || [];
  const entry = cart.find(item => item.productId === productId);
  const newQuantity = (entry?.quantity || 0) + quantity;
  if (newQuantity > product.stock) return showToast(`Only ${product.stock} available right now.`);
  if (entry) entry.quantity = newQuantity;
  else cart.push({ productId, quantity });
  data.carts[currentUser.id] = cart;
  saveData();
  render();
  showToast(`${product.name} added to your bag.`);
}

function toggleWishlist(productId) {
  if (!currentUser || currentUser.role === "admin") {
    showToast("Sign in to keep a wishlist.");
    if (!currentUser) go("login");
    return;
  }
  const list = data.wishlists[currentUser.id] || [];
  const index = list.indexOf(productId);
  if (index >= 0) list.splice(index, 1);
  else list.push(productId);
  data.wishlists[currentUser.id] = list;
  saveData();
  render();
  showToast(index >= 0 ? "Removed from your wishlist." : "Saved to your wishlist.");
}

document.addEventListener("click", event => {
  const button = event.target.closest("[data-view]");
  if (button) {
    event.preventDefault();
    if (button.dataset.view === "products") { selectedCategory = "All"; searchQuery = ""; }
    go(button.dataset.view);
    return;
  }
  const action = event.target.closest("[data-action]");
  if (!action) return;
  const { action: name, id } = action.dataset;
  if (name === "product-detail") go(`detail:${id}`);
  if (name === "add-cart") {
    const quantityInput = document.getElementById("detail-quantity");
    addToCart(id, quantityInput ? Number(quantityInput.value) : 1);
  }
  if (name === "toggle-wishlist") toggleWishlist(id);
  if (name === "category") { selectedCategory = action.dataset.category; searchQuery = ""; go("products"); }
  if (name === "clear-filters") { selectedCategory = "All"; searchQuery = ""; go("products"); }
  if (name === "remove-cart") {
    data.carts[currentUser.id] = getCart().filter(item => item.productId !== id);
    saveData(); render(); showToast("Removed from your bag.");
  }
  if (name === "logout") { currentUser = null; editingProductId = null; go("home"); showToast("You’ve been signed out."); }
  if (name === "admin-tab") { adminTab = action.dataset.tab; editingProductId = null; selectedProductImage = null; render(); }
  if (name === "edit-product") { editingProductId = id; selectedProductImage = null; adminTab = "products"; render(); window.scrollTo({ top: 0, behavior: "smooth" }); }
  if (name === "cancel-edit") { editingProductId = null; selectedProductImage = null; render(); }
  if (name === "remove-product-image") {
    selectedProductImage = "";
    const preview = document.getElementById("product-image-preview");
    const placeholder = document.getElementById("product-image-placeholder");
    if (preview) preview.hidden = true;
    if (placeholder) placeholder.hidden = false;
    const fileInput = document.getElementById("product-photo");
    if (fileInput) fileInput.value = "";
  }
  if (name === "delete-product") {
    const product = data.products.find(item => item.id === id);
    if (product && window.confirm(`Delete “${product.name}”? This also removes it from customer bags and wishlists.`)) {
      data.products = data.products.filter(item => item.id !== id);
      Object.keys(data.carts).forEach(key => { data.carts[key] = data.carts[key].filter(item => item.productId !== id); });
      Object.keys(data.wishlists).forEach(key => { data.wishlists[key] = data.wishlists[key].filter(item => item !== id); });
      saveData(); render(); showToast("Product deleted.");
    }
  }
  if (name === "delete-category") {
    const category = action.dataset.category;
    if (data.products.some(product => product.category === category)) return showToast("Move or remove its products before deleting this category.");
    data.categories = data.categories.filter(item => item !== category);
    saveData(); render(); showToast("Category deleted.");
  }
});

document.addEventListener("change", async event => {
  if (event.target.id === "category-filter") { selectedCategory = event.target.value; render(); }
  if (event.target.id === "sort-filter") { sortOrder = event.target.value; render(); }
  if (event.target.id === "product-photo") {
    const file = event.target.files[0];
    if (!file) return;
    imageProcessing = true;
    event.target.disabled = true;
    try {
      selectedProductImage = await prepareProductImage(file);
      const preview = document.getElementById("product-image-preview");
      const placeholder = document.getElementById("product-image-placeholder");
      if (preview) {
        preview.src = selectedProductImage;
        preview.hidden = false;
      }
      if (placeholder) placeholder.hidden = true;
    } catch (error) {
      console.error("Could not process product photo:", error);
      showToast(error.message || "Could not process this photo.");
      event.target.value = "";
    } finally {
      imageProcessing = false;
      event.target.disabled = false;
    }
  }
  if (event.target.matches("[data-action='cart-quantity']")) {
    const product = data.products.find(item => item.id === event.target.dataset.id);
    const quantity = Number(event.target.value);
    if (!product || !Number.isInteger(quantity) || quantity < 1 || quantity > product.stock) {
      showToast(`Enter a quantity from 1 to ${product?.stock ?? 0}.`);
      render();
      return;
    }
    const item = getCart().find(entry => entry.productId === product.id);
    if (item) item.quantity = quantity;
    saveData(); render();
  }
  if (event.target.matches("[data-action='order-status']")) {
    const order = data.orders.find(item => item.id === event.target.dataset.id);
    if (order) { order.status = event.target.value; saveData(); showToast(`Order status updated to ${order.status}.`); }
  }
});

document.getElementById("search-form").addEventListener("submit", event => {
  event.preventDefault();
  searchQuery = new FormData(event.currentTarget).get("query").trim();
  selectedCategory = "All";
  go("products");
});

document.addEventListener("submit", async event => {
  const form = event.target;
  const formId = form.getAttribute("id");
  const values = new FormData(form);
  if (formId === "register-form") {
    event.preventDefault();
    const name = values.get("name").trim();
    const email = values.get("email").trim().toLowerCase();
    const password = values.get("password");
    if (data.users.some(user => user.email.toLowerCase() === email)) return showToast("An account with that email already exists.");
    const user = { id: `user-${Date.now()}`, name, email, password, role: "customer" };
    data.users.push(user);
    saveData(); currentUser = user; go("home"); showToast("Welcome to your corner!");
  }
  if (formId === "login-form") {
    event.preventDefault();
    const email = values.get("email").trim().toLowerCase();
    const user = data.users.find(entry => entry.email.toLowerCase() === email && entry.password === values.get("password"));
    if (!user) return showToast("That email and password don't match. Try again.");
    currentUser = user;
    if (user.role === "admin") { adminTab = "overview"; go("admin"); }
    else go("home");
    showToast(`Welcome back, ${user.name.split(" ")[0]}!`);
  }
  if (formId === "checkout-form") {
    event.preventDefault();
    const cart = getCart();
    const cartItems = cart.map(item => ({ item, product: data.products.find(product => product.id === item.productId) }));
    const unavailable = cartItems.find(({ item, product }) => !product || product.stock < item.quantity);
    if (unavailable) return showToast("Stock changed. Please review your bag.");
    const address = Object.fromEntries(["name", "phone", "line", "city", "state", "postal"].map(key => [key, values.get(key).trim()]));
    const subtotal = cartItems.reduce((sum, { item, product }) => sum + product.price * item.quantity, 0);
    const order = {
      id: `CS-${Date.now().toString().slice(-8)}`,
      userId: currentUser.id,
      customerName: currentUser.name,
      createdAt: new Date().toISOString(),
      items: cartItems.map(({ item, product }) => ({ productId: product.id, name: product.name, quantity: item.quantity, price: product.price })),
      address,
      payment: values.get("payment"),
      total: subtotal + (subtotal >= 1500 ? 0 : 79),
      status: "Pending"
    };
    data.addresses[currentUser.id] = address;
    data.orders.push(order);
    cartItems.forEach(({ item, product }) => { product.stock -= item.quantity; });
    data.carts[currentUser.id] = [];
    saveData(); go("orders"); showToast(`Order ${order.id} placed. Thank you!`);
  }
  if (formId === "product-form") {
    event.preventDefault();
    if (imageProcessing) return showToast("Please wait for the product photo to finish processing.");
    const id = values.get("id");
    const existingProduct = id && data.products.find(product => product.id === id);
    const productId = id || `p-${Date.now()}`;
    let image = existingProduct?.image || "";
    let imageKey = existingProduct?.imageKey || "";
    if (selectedProductImage === "") {
      image = "";
      imageKey = "";
    } else if (selectedProductImage) {
      try {
        image = await storeProductImage(productId, selectedProductImage);
        imageKey = productId;
      } catch (error) {
        console.error("Could not persist product photo:", error);
        return showToast("Couldn't save the photo in this browser. Check available storage and try again.");
      }
    }
    const productData = {
      name: values.get("name").trim(),
      category: values.get("category"),
      price: Number(values.get("price")),
      stock: Number(values.get("stock")),
      emoji: values.get("emoji").trim() || "📦",
      image,
      imageKey,
      tag: values.get("tag").trim(),
      description: values.get("description").trim()
    };
    if (!Number.isFinite(productData.price) || productData.price <= 0 || !Number.isInteger(productData.stock) || productData.stock < 0) return showToast("Enter a valid price and stock quantity.");
    if (!data.categories.includes(productData.category)) return showToast("Choose an existing category.");
    if (id) {
      const index = data.products.findIndex(product => product.id === id);
      if (index < 0) return showToast("That product no longer exists.");
      data.products[index] = { ...data.products[index], ...productData };
      showToast("Product updated.");
    } else {
      data.products.unshift({ id: productId, ...productData });
      showToast("Product added.");
    }
    editingProductId = null; selectedProductImage = null; saveData(); render();
  }
  if (formId === "category-form") {
    event.preventDefault();
    const category = values.get("name").trim();
    if (data.categories.some(item => item.toLowerCase() === category.toLowerCase())) return showToast("That category already exists.");
    data.categories.push(category); saveData(); render(); showToast("Category added.");
  }
});

render();
restoreProductImages();
