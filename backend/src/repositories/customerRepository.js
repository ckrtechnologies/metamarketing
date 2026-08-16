const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const DB_PATH = path.resolve(__dirname, '../../data/customers.json');

function readDB() {
  try {
    const raw = fs.readFileSync(DB_PATH, 'utf8');
    return JSON.parse(raw);
  } catch {
    return { customers: [] };
  }
}

function writeDB(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf8');
}

// ── Get all customers for a specific shop ─────────────────────
function getCustomersForShop(shopId) {
  const db = readDB();
  return db.customers.filter(c => c.shopId === shopId);
}

// ── Add a new customer to a shop ─────────────────────────────
function addCustomer(shopId, customerData) {
  const db = readDB();

  const customer = {
    id: `cust_${uuidv4().replace(/-/g, '').slice(0, 16)}`,
    shopId,
    name: customerData.name,
    phone: (customerData.phone || '').replace(/\D/g, ''), // digits only
    balanceDue: Number(customerData.balanceDue) || 0,
    notes: customerData.notes || '',
    tags: customerData.tags || [],
    lastReminder: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  db.customers.push(customer);
  writeDB(db);
  return customer;
}

// ── Update an existing customer ───────────────────────────────
function updateCustomer(shopId, customerId, updates) {
  const db = readDB();
  const idx = db.customers.findIndex(c => c.id === customerId && c.shopId === shopId);

  if (idx === -1) {
    throw new Error(`Customer ${customerId} not found for shop ${shopId}`);
  }

  db.customers[idx] = {
    ...db.customers[idx],
    ...updates,
    phone: updates.phone ? String(updates.phone).replace(/\D/g, '') : db.customers[idx].phone,
    balanceDue: updates.balanceDue !== undefined ? Number(updates.balanceDue) : db.customers[idx].balanceDue,
    updatedAt: new Date().toISOString(),
    // Never overwrite immutable fields
    id: db.customers[idx].id,
    shopId: db.customers[idx].shopId,
    createdAt: db.customers[idx].createdAt,
  };

  writeDB(db);
  return db.customers[idx];
}

// ── Delete a customer ─────────────────────────────────────────
function deleteCustomer(shopId, customerId) {
  const db = readDB();
  const idx = db.customers.findIndex(c => c.id === customerId && c.shopId === shopId);

  if (idx === -1) {
    throw new Error(`Customer ${customerId} not found for shop ${shopId}`);
  }

  const [removed] = db.customers.splice(idx, 1);
  writeDB(db);
  return removed;
}

// ── Record that a reminder was sent to a customer ─────────────
function recordReminderSent(shopId, customerId) {
  const db = readDB();
  const idx = db.customers.findIndex(c => c.id === customerId && c.shopId === shopId);
  if (idx !== -1) {
    db.customers[idx].lastReminder = new Date().toISOString();
    db.customers[idx].updatedAt = new Date().toISOString();
    writeDB(db);
  }
}

module.exports = {
  getCustomersForShop,
  addCustomer,
  updateCustomer,
  deleteCustomer,
  recordReminderSent,
};
