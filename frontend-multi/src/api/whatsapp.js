import api from './client';

// ── Template Catalogue ────────────────────────────────────────
export const getTemplates = () =>
  api.get('/v2/whatsapp/templates').then(r => r.data.data);

// ── Customer Ledger CRUD ──────────────────────────────────────
export const getCustomers = (shopId) =>
  api.get('/v2/whatsapp/customers', {
    headers: { 'x-shop-id': shopId },
  }).then(r => r.data.data);

export const addCustomer = (shopId, data) =>
  api.post('/v2/whatsapp/customers', data, {
    headers: { 'x-shop-id': shopId },
  }).then(r => r.data.data);

export const updateCustomer = (shopId, customerId, data) =>
  api.put(`/v2/whatsapp/customers/${customerId}`, data, {
    headers: { 'x-shop-id': shopId },
  }).then(r => r.data.data);

export const deleteCustomer = (shopId, customerId) =>
  api.delete(`/v2/whatsapp/customers/${customerId}`, {
    headers: { 'x-shop-id': shopId },
  }).then(r => r.data);

// ── Notification Delivery ─────────────────────────────────────
// Mode A: wa.me deep link for 1 customer
export const generateWALink = (shopId, templateId, customerId, extraVars, shopName) =>
  api.post('/v2/whatsapp/send-link', { templateId, customerId, extraVars, shopName }, {
    headers: { 'x-shop-id': shopId },
  }).then(r => r.data.data);

// Mode A: bulk wa.me links for multiple customers
export const generateBulkLinks = (shopId, templateId, customerIds, extraVars, shopName) =>
  api.post('/v2/whatsapp/bulk-links', { templateId, customerIds, extraVars, shopName }, {
    headers: { 'x-shop-id': shopId },
  }).then(r => r.data.data);

// Mode B: send via Meta WhatsApp Cloud API (requires backend .env config)
export const sendViaCloud = (shopId, templateId, customerId, extraVars, shopName) =>
  api.post('/v2/whatsapp/send-cloud', { templateId, customerId, extraVars, shopName }, {
    headers: { 'x-shop-id': shopId },
  }).then(r => r.data);
