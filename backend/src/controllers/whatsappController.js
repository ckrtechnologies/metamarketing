const whatsappService = require('../services/whatsappService');
const customerRepo = require('../repositories/customerRepository');
const shopRepo = require('../repositories/shopRepository');

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

// ── POST /api/v2/whatsapp/oauth/callback ───────────────────────
// Embedded Signup Callback: Exchanges code for token & registers shop's WABA
exports.connectWhatsAppOAuth = async (req, res) => {
  try {
    const shopId = getShopId(req);
    const { code, wabaId, phoneNumberId, accessToken: providedToken } = req.body;

    if (!shopId) return res.status(400).json({ success: false, error: 'Shop ID is required.', code: 'MISSING_SHOP_ID' });
    if (!code && !providedToken && !phoneNumberId) {
      return res.status(400).json({ success: false, error: 'Phone Number ID or Auth Code is required.', code: 'MISSING_PARAMS' });
    }

    const shop = shopRepo.findShopById(shopId);
    if (!shop) return res.status(404).json({ success: false, error: 'Shop not found.', code: 'SHOP_NOT_FOUND' });

    let accessToken = providedToken || process.env.WHATSAPP_ACCESS_TOKEN;
    if (code) {
      const tokenData = await whatsappService.exchangeCodeForWhatsAppToken(code);
      accessToken = tokenData.access_token;
    }

    // Fetch live Phone Number metadata from Meta
    let phoneMeta = {};
    const targetPhoneId = phoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID;
    if (targetPhoneId && accessToken) {
      try {
        phoneMeta = await whatsappService.fetchWhatsAppPhoneDetails(targetPhoneId, accessToken);
      } catch (phoneErr) {
        console.warn('[whatsapp:oauth] Could not fetch phone details:', phoneErr.response?.data?.error?.message || phoneErr.message);
      }
    }

    // 3. Subscribe our app to the shop's WABA webhooks
    if (wabaId) {
      await whatsappService.subscribeWABAApp(wabaId, accessToken);
    }

    // 4. Save credentials to shop repository (shops.json)
    const updatedShop = shopRepo.upsertShop({
      ...shop,
      whatsapp: {
        connected: true,
        wabaId: wabaId || null,
        phoneNumberId: phoneNumberId || null,
        displayPhoneNumber: phoneMeta.display_phone_number || null,
        verifiedName: phoneMeta.verified_name || shop.shopName,
        qualityRating: phoneMeta.quality_rating || 'UNKNOWN',
        accessToken,
        connectedAt: new Date().toISOString(),
      },
    });

    console.log(`[whatsapp:oauth] ✅ WhatsApp connected for shop "${shop.shopName}" -> Phone: ${phoneMeta.display_phone_number || phoneNumberId}`);
    res.json({
      success: true,
      message: `WhatsApp Business connected successfully for ${shop.shopName}!`,
      shop: updatedShop,
    });
  } catch (err) {
    const f = formatError(err);
    console.error(`[whatsapp:oauth] Error connecting WhatsApp:`, f.raw);
    res.status(500).json({ success: false, error: f.message, code: f.code });
  }
};

// ── POST /api/v2/whatsapp/oauth/disconnect ─────────────────────
// Disconnects WhatsApp Business account for this shop
exports.disconnectWhatsApp = (req, res) => {
  try {
    const shopId = getShopId(req);
    if (!shopId) return res.status(400).json({ success: false, error: 'Shop ID is required.', code: 'MISSING_SHOP_ID' });

    const shop = shopRepo.findShopById(shopId);
    if (!shop) return res.status(404).json({ success: false, error: 'Shop not found.', code: 'SHOP_NOT_FOUND' });

    const updatedShop = shopRepo.upsertShop({
      ...shop,
      whatsapp: {
        connected: false,
        wabaId: null,
        phoneNumberId: null,
        displayPhoneNumber: null,
        verifiedName: null,
        accessToken: null,
        disconnectedAt: new Date().toISOString(),
      },
    });

    console.log(`[whatsapp:oauth] WhatsApp disconnected for shop "${shop.shopName}"`);
    res.json({ success: true, message: 'WhatsApp disconnected successfully.', shop: updatedShop });
  } catch (err) {
    const f = formatError(err);
    res.status(500).json({ success: false, error: f.message, code: f.code });
  }
};

// ── GET /api/v2/whatsapp/status ───────────────────────────────
// Returns the active WhatsApp connection status for this shop
exports.getWhatsAppStatus = (req, res) => {
  try {
    const shopId = getShopId(req);
    const config = whatsappService.getWhatsAppConfig(shopId);
    const shop = shopId ? shopRepo.findShopById(shopId) : null;

    res.json({
      success: true,
      data: {
        connected: Boolean(config.phoneNumberId && config.accessToken),
        isShopSpecific: config.isShopSpecific,
        displayPhoneNumber: config.displayPhoneNumber || (config.phoneNumberId ? `ID: ${config.phoneNumberId}` : null),
        verifiedName: config.verifiedName || shop?.shopName || null,
        wabaId: config.wabaId || null,
        phoneNumberId: config.phoneNumberId || null,
      },
    });
  } catch (err) {
    const f = formatError(err);
    res.status(500).json({ success: false, error: f.message, code: f.code });
  }
};

// ── GET /api/v2/whatsapp/templates ────────────────────────────
exports.getTemplates = async (req, res) => {
  try {
    const shopId = getShopId(req);
    const templates = await whatsappService.getAllTemplates(shopId);
    res.json({ success: true, data: templates });
  } catch (err) {
    const f = formatError(err);
    res.status(500).json({ success: false, error: f.message, code: f.code });
  }
};

// ── POST /api/v2/whatsapp/templates ───────────────────────────
exports.createTemplate = async (req, res) => {
  try {
    const shopId = getShopId(req);
    const { name, category, body, language = 'en' } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ success: false, error: 'Template name is required.' });
    if (!body || !body.trim()) return res.status(400).json({ success: false, error: 'Template message body is required.' });

    const newTemplate = await whatsappService.createTemplate({ name, category, body, language }, shopId);
    res.status(201).json({ success: true, data: newTemplate, message: `Template "${newTemplate.name}" created and registered on Meta WABA.` });
  } catch (err) {
    const f = formatError(err);
    res.status(500).json({ success: false, error: f.message, code: f.code });
  }
};

// ── DELETE /api/v2/whatsapp/templates/:id ─────────────────────
exports.deleteTemplate = async (req, res) => {
  try {
    const shopId = getShopId(req);
    const { id } = req.params;
    const result = await whatsappService.deleteTemplate(id, shopId);
    res.json({ success: true, message: `Template deleted from Meta WABA.`, data: result });
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
exports.generateWALink = async (req, res) => {
  try {
    const shopId = getShopId(req);
    const { templateId, customerId, extraVars = {}, shopName } = req.body;

    if (!shopId) return res.status(400).json({ success: false, error: 'Shop ID is required.', code: 'MISSING_SHOP_ID' });
    if (!templateId) return res.status(400).json({ success: false, error: 'Template ID is required.', code: 'MISSING_TEMPLATE' });
    if (!customerId) return res.status(400).json({ success: false, error: 'Customer ID is required.', code: 'MISSING_CUSTOMER' });

    const customers = customerRepo.getCustomersForShop(shopId);
    const customer = customers.find(c => c.id === customerId);
    if (!customer) return res.status(404).json({ success: false, error: 'Customer not found in this shop ledger.', code: 'CUSTOMER_NOT_FOUND' });

    const template = await whatsappService.getTemplate(templateId, shopId);
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
exports.generateBulkLinks = async (req, res) => {
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

    const template = await whatsappService.getTemplate(templateId, shopId);
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

    const template = await whatsappService.getTemplate(templateId, shopId);
    const renderedBody = whatsappService.renderTemplate(template, {
      customerName: customer.name,
      shopName,
      ...extraVars,
    });

    let result;
    if (template.isMetaOfficial || template.metaName) {
      // Official Meta Cloud Template (delivers 100% cold 24/7 to any phone number)
      const expectedCount = template.paramCount !== undefined ? template.paramCount : 0;
      const candidateParams = [
        extraVars.param_1 || extraVars.customerName || customer.name || 'Customer',
        extraVars.param_2 || extraVars.offerDetails || extraVars.amount || shopName || 'Shop',
        extraVars.param_3 || extraVars.dueDate || extraVars.amount || extraVars.validTill || 'today',
        extraVars.param_4 || extraVars.dueDate || extraVars.validTill || '',
      ];

      // Fill in exactly expectedCount items
      const finalParams = candidateParams.slice(0, expectedCount);
      while (finalParams.length < expectedCount) {
        finalParams.push(`Value ${finalParams.length + 1}`);
      }

      const templateConfig = {
        templateName: template.metaName || template.id.replace(/^meta_/, ''),
        languageCode: template.language || 'en',
        parameters: finalParams,
      };
      result = await whatsappService.sendViaCloudAPI(customer.phone, renderedBody, templateConfig, shopId);
    } else {
      // Freeform rendered text message
      result = await whatsappService.sendViaCloudAPI(customer.phone, renderedBody, null, shopId);
    }

    customerRepo.recordReminderSent(shopId, customerId);
    console.log(`[whatsapp:cloud] Message sent to "${customer.name}" (${customer.phone}) - shop ${shopId}`);
    res.json({ success: true, message: `WhatsApp message sent to ${customer.name} via Cloud API.`, data: result });
  } catch (err) {
    const f = formatError(err);
    console.error(`[whatsappController:sendViaCloud] ${f.code}:`, f.raw);
    res.status(500).json({ success: false, error: f.message, code: f.code });
  }
};
