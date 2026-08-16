const whatsappService = require('../services/whatsappService');
const customerRepo = require('../repositories/customerRepository');

// ── Extract shopId from header ─────────────────────────────────
function getShopId(req) {
  return req.headers['x-shop-id'] || req.body?.shopId || req.query?.shopId;
}

// ── Format errors consistently ─────────────────────────────────
function formatError(err) {
  const metaErr = err.response?.data?.error;
  if (metaErr) {
    return { message: metaErr.message, code: metaErr.code || 'META_ERROR', raw: metaErr };
  }
  return { message: err.message || 'Unknown error.', code: 'INTERNAL_ERROR', raw: err.message };
}

// ── GET /api/v2/whatsapp/templates ────────────────────────────
exports.getTemplates = (req, res) => {
  try {
    const templates = whatsappService.getAllTemplates();
    res.json({ success: true, data: templates });
  } catch (err) {
    const f = formatError(err);
    res.status(500).json({ success: false, error: f.message, code: f.code });
  }
};

// ── POST /api/v2/whatsapp/templates ───────────────────────────
exports.createTemplate = (req, res) => {
  try {
    const { name, category, description, body, icon } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ success: false, error: 'Template name is required.' });
    if (!body || !body.trim()) return res.status(400).json({ success: false, error: 'Template message body is required.' });

    const newTemplate = whatsappService.createTemplate({ name, category, description, body, icon });
    res.status(201).json({ success: true, data: newTemplate, message: `Template "${newTemplate.name}" created.` });
  } catch (err) {
    const f = formatError(err);
    res.status(500).json({ success: false, error: f.message, code: f.code });
  }
};

// ── DELETE /api/v2/whatsapp/templates/:id ─────────────────────
exports.deleteTemplate = (req, res) => {
  try {
    const { id } = req.params;
    const removed = whatsappService.deleteTemplate(id);
    res.json({ success: true, message: `Template "${removed.name}" deleted.`, data: removed });
  } catch (err) {
    const f = formatError(err);
    const status = f.message.includes('not found') ? 404 : 500;
    res.status(status).json({ success: false, error: f.message, code: f.code });
  }
};

// ── GET /api/v2/whatsapp/customers ────────────────────────────
exports.getCustomers = (req, res) => {
  try {
    const shopId = getShopId(req);
    if (!shopId) return res.status(400).json({ success: false, error: 'Shop ID is required.', code: 'MISSING_SHOP_ID' });

    const customers = customerRepo.getCustomersForShop(shopId);
    res.json({ success: true, data: customers, total: customers.length });
  } catch (err) {
    const f = formatError(err);
    res.status(500).json({ success: false, error: f.message, code: f.code });
  }
};

// ── POST /api/v2/whatsapp/customers ───────────────────────────
exports.addCustomer = (req, res) => {
  try {
    const shopId = getShopId(req);
    if (!shopId) return res.status(400).json({ success: false, error: 'Shop ID is required.', code: 'MISSING_SHOP_ID' });

    const { name, phone, balanceDue, notes, tags } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ success: false, error: 'Customer name is required.', code: 'MISSING_NAME' });
    if (!phone) return res.status(400).json({ success: false, error: 'Customer phone number is required.', code: 'MISSING_PHONE' });

    const customer = customerRepo.addCustomer(shopId, { name: name.trim(), phone, balanceDue, notes, tags });
    res.status(201).json({ success: true, data: customer, message: 'Customer added to ledger.' });
  } catch (err) {
    const f = formatError(err);
    res.status(500).json({ success: false, error: f.message, code: f.code });
  }
};

// ── PUT /api/v2/whatsapp/customers/:id ────────────────────────
exports.updateCustomer = (req, res) => {
  try {
    const shopId = getShopId(req);
    const customerId = req.params.id;
    if (!shopId) return res.status(400).json({ success: false, error: 'Shop ID is required.', code: 'MISSING_SHOP_ID' });

    const updated = customerRepo.updateCustomer(shopId, customerId, req.body);
    res.json({ success: true, data: updated, message: 'Customer updated.' });
  } catch (err) {
    const f = formatError(err);
    const status = f.message.includes('not found') ? 404 : 500;
    res.status(status).json({ success: false, error: f.message, code: f.code });
  }
};

// ── DELETE /api/v2/whatsapp/customers/:id ────────────────────
exports.deleteCustomer = (req, res) => {
  try {
    const shopId = getShopId(req);
    const customerId = req.params.id;
    if (!shopId) return res.status(400).json({ success: false, error: 'Shop ID is required.', code: 'MISSING_SHOP_ID' });

    const removed = customerRepo.deleteCustomer(shopId, customerId);
    res.json({ success: true, message: `Customer "${removed.name}" removed from ledger.` });
  } catch (err) {
    const f = formatError(err);
    const status = f.message.includes('not found') ? 404 : 500;
    res.status(status).json({ success: false, error: f.message, code: f.code });
  }
};

// ── POST /api/v2/whatsapp/send-link ──────────────────────────
// Mode A: Returns a pre-built wa.me link (free, no API required)
exports.generateWALink = (req, res) => {
  try {
    const shopId = getShopId(req);
    const { templateId, customerId, extraVars = {}, shopName } = req.body;

    if (!shopId) return res.status(400).json({ success: false, error: 'Shop ID is required.', code: 'MISSING_SHOP_ID' });
    if (!templateId) return res.status(400).json({ success: false, error: 'Template ID is required.', code: 'MISSING_TEMPLATE' });
    if (!customerId) return res.status(400).json({ success: false, error: 'Customer ID is required.', code: 'MISSING_CUSTOMER' });

    const customers = customerRepo.getCustomersForShop(shopId);
    const customer = customers.find(c => c.id === customerId);
    if (!customer) return res.status(404).json({ success: false, error: 'Customer not found in this shop ledger.', code: 'CUSTOMER_NOT_FOUND' });

    const template = whatsappService.getTemplate(templateId);
    const result = whatsappService.generateSingleWALink(customer, template, { shopName, ...extraVars });

    // Record that reminder was sent
    customerRepo.recordReminderSent(shopId, customerId);

    console.log(`[whatsapp] wa.me link generated for customer "${customer.name}" (${customer.phone}) - shop ${shopId} - template ${templateId}`);
    res.json({ success: true, data: result });
  } catch (err) {
    const f = formatError(err);
    const status = f.message.includes('not found') ? 404 : 500;
    res.status(status).json({ success: false, error: f.message, code: f.code });
  }
};

// ── POST /api/v2/whatsapp/bulk-links ─────────────────────────
// Mode A Bulk: Returns array of wa.me links for multiple customers
exports.generateBulkLinks = (req, res) => {
  try {
    const shopId = getShopId(req);
    const { templateId, customerIds, extraVars = {}, shopName } = req.body;

    if (!shopId) return res.status(400).json({ success: false, error: 'Shop ID is required.', code: 'MISSING_SHOP_ID' });
    if (!templateId) return res.status(400).json({ success: false, error: 'Template ID is required.', code: 'MISSING_TEMPLATE' });
    if (!Array.isArray(customerIds) || customerIds.length === 0) {
      return res.status(400).json({ success: false, error: 'At least one customer ID is required.', code: 'MISSING_CUSTOMERS' });
    }

    const allCustomers = customerRepo.getCustomersForShop(shopId);
    const selected = allCustomers.filter(c => customerIds.includes(c.id));
    if (selected.length === 0) {
      return res.status(404).json({ success: false, error: 'None of the specified customers were found for this shop.', code: 'CUSTOMERS_NOT_FOUND' });
    }

    const template = whatsappService.getTemplate(templateId);
    const results = whatsappService.generateBulkWALinks(selected, template, { shopName, ...extraVars });

    // Record reminder sent for all
    selected.forEach(c => customerRepo.recordReminderSent(shopId, c.id));

    console.log(`[whatsapp] Bulk wa.me links generated: ${results.length} customers - shop ${shopId} - template ${templateId}`);
    res.json({ success: true, data: results, total: results.length });
  } catch (err) {
    const f = formatError(err);
    res.status(500).json({ success: false, error: f.message, code: f.code });
  }
};

// ── POST /api/v2/whatsapp/send-cloud ─────────────────────────
// Mode B: Sends via Meta WhatsApp Cloud API (requires .env config)
exports.sendViaCloud = async (req, res) => {
  try {
    const shopId = getShopId(req);
    const { templateId, customerId, extraVars = {}, shopName } = req.body;

    if (!shopId) return res.status(400).json({ success: false, error: 'Shop ID is required.', code: 'MISSING_SHOP_ID' });
    if (!templateId) return res.status(400).json({ success: false, error: 'Template ID is required.', code: 'MISSING_TEMPLATE' });
    if (!customerId) return res.status(400).json({ success: false, error: 'Customer ID is required.', code: 'MISSING_CUSTOMER' });

    const customers = customerRepo.getCustomersForShop(shopId);
    const customer = customers.find(c => c.id === customerId);
    if (!customer) return res.status(404).json({ success: false, error: 'Customer not found.', code: 'CUSTOMER_NOT_FOUND' });

    const template = whatsappService.getTemplate(templateId);
    const renderedBody = whatsappService.renderTemplate(template, {
      customerName: customer.name,
      shopName,
      ...extraVars,
    });

    // Send the actual rendered message text directly to the customer
    const result = await whatsappService.sendViaCloudAPI(customer.phone, renderedBody, null);

    customerRepo.recordReminderSent(shopId, customerId);
    console.log(`[whatsapp:cloud] Message sent to "${customer.name}" (${customer.phone}) - shop ${shopId}`);
    res.json({ success: true, message: `WhatsApp message sent to ${customer.name} via Cloud API.`, data: result });
  } catch (err) {
    const f = formatError(err);
    console.error(`[whatsappController:sendViaCloud] ${f.code}:`, f.raw);
    res.status(500).json({ success: false, error: f.message, code: f.code });
  }
};
