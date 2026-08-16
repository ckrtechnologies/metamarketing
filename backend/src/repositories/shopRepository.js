const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, '../../data/shops.json');

// Ensure data directory and file exist
function initDb() {
  const dir = path.dirname(DB_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ shops: [] }, null, 2), 'utf8');
  }
}

initDb();

function readData() {
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    return JSON.parse(raw);
  } catch {
    return { shops: [] };
  }
}

function writeData(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// ── Shop Repository Methods ───────────────────────────────────

/**
 * Get all connected shops
 */
function getAllShops() {
  const db = readData();
  return db.shops.map(s => sanitizeShop(s));
}

/**
 * Find shop by ID (Internal with tokens)
 */
function findShopById(shopId) {
  const db = readData();
  return db.shops.find(s => s.id === shopId) || null;
}

/**
 * Find shop by Facebook Page ID
 */
function findShopByPageId(pageId) {
  const db = readData();
  return db.shops.find(s => s.facebook?.pageId === pageId) || null;
}

/**
 * Create or update a shopkeeper record
 */
function upsertShop(shopData) {
  const db = readData();
  const index = db.shops.findIndex(s => s.id === shopData.id || (s.facebook?.pageId && s.facebook.pageId === shopData.facebook?.pageId));

  const now = new Date().toISOString();

  if (index >= 0) {
    db.shops[index] = {
      ...db.shops[index],
      ...shopData,
      updatedAt: now,
    };
    writeData(db);
    return sanitizeShop(db.shops[index]);
  } else {
    const newShop = {
      id: shopData.id || `shop_${Date.now()}`,
      createdAt: now,
      updatedAt: now,
      ...shopData,
    };
    db.shops.push(newShop);
    writeData(db);
    return sanitizeShop(newShop);
  }
}

/**
 * Delete a shop
 */
function deleteShop(shopId) {
  const db = readData();
  const filtered = db.shops.filter(s => s.id !== shopId);
  writeData({ shops: filtered });
  return true;
}

/**
 * Sanitize shop data before sending to client (strip raw access token for security)
 */
function sanitizeShop(shop) {
  if (!shop) return null;
  const copy = JSON.parse(JSON.stringify(shop));
  if (copy.facebook) {
    copy.facebook.hasToken = Boolean(copy.facebook.pageAccessToken);
    delete copy.facebook.pageAccessToken;
  }
  if (copy.whatsapp) {
    copy.whatsapp.hasToken = Boolean(copy.whatsapp.accessToken);
    delete copy.whatsapp.accessToken;
  }
  return copy;
}

module.exports = {
  getAllShops,
  findShopById,
  findShopByPageId,
  upsertShop,
  deleteShop,
  sanitizeShop,
};
