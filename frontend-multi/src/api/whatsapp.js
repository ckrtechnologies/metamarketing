import api from './client';

// ── WhatsApp OAuth & Connection Status ────────────────────────
export const getWhatsAppStatus = (shopId) =>
  api.get('/v2/whatsapp/status', {
    headers: { 'x-shop-id': shopId },
  }).then(r => r.data.data);

export const getAvailableWhatsAppNumbers = (shopId) =>
  api.get('/v2/whatsapp/available-numbers', {
    headers: { 'x-shop-id': shopId },
  }).then(r => r.data.data);

export const connectWhatsAppOAuth = (shopId, payload) =>
  api.post('/v2/whatsapp/oauth/callback', payload, {
    headers: { 'x-shop-id': shopId },
  }).then(r => r.data);

export const disconnectWhatsApp = (shopId) =>
  api.post('/v2/whatsapp/oauth/disconnect', {}, {
    headers: { 'x-shop-id': shopId },
  }).then(r => r.data);

// ── Template Catalogue ────────────────────────────────────────
export const getTemplates = (shopId) =>
  api.get('/v2/whatsapp/templates', {
    headers: { 'x-shop-id': shopId },
  }).then(r => r.data.data);

export const createTemplate = (data, shopId) =>
  api.post('/v2/whatsapp/templates', data, {
    headers: { 'x-shop-id': shopId },
  }).then(r => r.data.data);

export const deleteTemplate = (templateId) =>
  api.delete(`/v2/whatsapp/templates/${templateId}`).then(r => r.data);

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
