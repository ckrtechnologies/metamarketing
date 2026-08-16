const whatsappService = require('../services/whatsappService');
const customerRepo = require('../repositories/customerRepository');
const shopRepo = require('../repositories/shopRepository');
const historyRepo = require('../repositories/historyRepository');
const chatRepo = require('../repositories/chatRepository');

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
// ── GET /api/v2/whatsapp/available-numbers ───────────────────
exports.getAvailableNumbers = async (req, res) => {
  try {
    const shopId = getShopId(req);
    const numbers = await whatsappService.getAvailableWhatsAppNumbers(shopId);
    res.json({ success: true, data: numbers });
  } catch (err) {
    const f = formatError(err);
    res.status(500).json({ success: false, error: f.message, code: f.code });
  }
};

// ── Connect WhatsApp Number by selecting or typing plain phone number ──
exports.connectWhatsAppOAuth = async (req, res) => {
  try {
    const shopId = getShopId(req);
    const { code, wabaId, phoneNumberId, phoneNumber, phone, accessToken: providedToken } = req.body;

    if (!shopId) return res.status(400).json({ success: false, error: 'Shop ID is required.', code: 'MISSING_SHOP_ID' });

    const shop = shopRepo.findShopById(shopId);
    if (!shop) return res.status(404).json({ success: false, error: 'Shop not found.', code: 'SHOP_NOT_FOUND' });

    let accessToken = providedToken || process.env.WHATSAPP_ACCESS_TOKEN;
    if (code) {
      const tokenData = await whatsappService.exchangeCodeForWhatsAppToken(code);
      accessToken = tokenData.access_token;
    }

    let resolvedPhoneId = phoneNumberId;
    let resolvedWabaId = wabaId;
    let phoneMeta = {};

    const inputNumber = phoneNumber || phone;
    if (inputNumber) {
      // Automatically resolve Phone Number ID and WABA ID from plain phone number!
      const matched = await whatsappService.findPhoneByNumber(inputNumber, shopId);
      resolvedPhoneId = matched.phoneNumberId;
      resolvedWabaId = matched.wabaId || wabaId;
      phoneMeta = {
        display_phone_number: matched.displayPhoneNumber,
        verified_name: matched.verifiedName,
        quality_rating: matched.qualityRating,
      };
    } else if (resolvedPhoneId) {
      try {
        const available = await whatsappService.getAvailableWhatsAppNumbers(shopId);
        const match = available.find(p => p.phoneNumberId === resolvedPhoneId);
        if (match) {
          resolvedWabaId = match.wabaId || resolvedWabaId;
          phoneMeta = {
            display_phone_number: match.displayPhoneNumber,
            verified_name: match.verifiedName,
            quality_rating: match.qualityRating,
          };
        }
      } catch (e) {
        // Fallback
      }
    }

    // Save to shop repository (shops.json)
    const updatedShop = shopRepo.upsertShop({
      ...shop,
      whatsapp: {
        connected: true,
        wabaId: resolvedWabaId || null,
        phoneNumberId: resolvedPhoneId || null,
        displayPhoneNumber: phoneMeta.display_phone_number || null,
        verifiedName: phoneMeta.verified_name || shop.shopName,
        qualityRating: phoneMeta.quality_rating || 'UNKNOWN',
        accessToken,
        connectedAt: new Date().toISOString(),
      },
    });

    console.log(`[whatsapp:oauth] ✅ WhatsApp connected for shop "${shop.shopName}" -> Phone: ${phoneMeta.display_phone_number || resolvedPhoneId}`);
    res.json({
      success: true,
      message: `WhatsApp Business connected successfully for ${shop.shopName}!`,
      shop: updatedShop,
      data: {
        connected: true,
        displayPhoneNumber: phoneMeta.display_phone_number,
        verifiedName: phoneMeta.verified_name,
        phoneNumberId: resolvedPhoneId,
        wabaId: resolvedWabaId,
      },
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

// ── Helper: Validate customer phone format ───────────────────
function validateCustomerPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) throw new Error('Phone number is required.');
  if (digits.length === 10) {
    if (!/^[6-9]\d{9}$/.test(digits)) {
      throw new Error(`Invalid mobile number "${phone}". Indian 10-digit numbers must start with 6, 7, 8, or 9.`);
    }
    return digits;
  }
  if (digits.length === 12 && digits.startsWith('91')) {
    const local10 = digits.slice(2);
    if (!/^[6-9]\d{9}$/.test(local10)) {
      throw new Error(`Invalid mobile number "${phone}". Local 10 digits must start with 6, 7, 8, or 9.`);
    }
    return local10;
  }
  if (digits.length >= 10 && digits.length <= 15) {
    return digits;
  }
  throw new Error(`Invalid phone number "${phone}". Please enter a valid 10-digit mobile number.`);
}

// ── POST /api/v2/whatsapp/customers ───────────────────────────
exports.addCustomer = (req, res) => {
  try {
    const shopId = getShopId(req);
    if (!shopId) return res.status(400).json({ success: false, error: 'Shop ID is required.', code: 'MISSING_SHOP_ID' });

    const { name, phone, balanceDue, notes, tags } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ success: false, error: 'Customer name is required.', code: 'MISSING_NAME' });
    if (!phone) return res.status(400).json({ success: false, error: 'Customer phone number is required.', code: 'MISSING_PHONE' });

    const cleanPhone = validateCustomerPhone(phone);
    const customer = customerRepo.addCustomer(shopId, { name: name.trim(), phone: cleanPhone, balanceDue, notes, tags });
    res.status(201).json({ success: true, data: customer, message: 'Customer added to ledger.' });
  } catch (err) {
    const f = formatError(err);
    res.status(400).json({ success: false, error: f.message, code: f.code });
  }
};

// ── PUT /api/v2/whatsapp/customers/:id ────────────────────────
exports.updateCustomer = (req, res) => {
  try {
    const shopId = getShopId(req);
    const customerId = req.params.id;
    if (!shopId) return res.status(400).json({ success: false, error: 'Shop ID is required.', code: 'MISSING_SHOP_ID' });

    const data = { ...req.body };
    if (data.phone) {
      data.phone = validateCustomerPhone(data.phone);
    }

    const updated = customerRepo.updateCustomer(shopId, customerId, data);
    res.json({ success: true, data: updated, message: 'Customer updated.' });
  } catch (err) {
    const f = formatError(err);
    const status = f.message.includes('not found') ? 404 : 400;
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

    // Record in Message History
    historyRepo.recordMessage(shopId, {
      recipientName: customer.name,
      recipientPhone: customer.phone,
      templateId: template.id,
      templateName: template.name,
      renderedBody: result.renderedBody,
      deliveryMode: 'wame',
      status: 'sent',
    });

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

    // Record reminder sent and history for all
    selected.forEach((c, idx) => {
      customerRepo.recordReminderSent(shopId, c.id);
      historyRepo.recordMessage(shopId, {
        recipientName: c.name,
        recipientPhone: c.phone,
        templateId: template.id,
        templateName: template.name,
        renderedBody: results[idx]?.renderedBody || '',
        deliveryMode: 'wame',
        status: 'sent',
      });
    });

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
  let customer = null;
  let template = null;
  let renderedBody = '';
  const shopId = getShopId(req);

  try {
    const { templateId, customerId, extraVars = {}, shopName } = req.body;

    if (!shopId) return res.status(400).json({ success: false, error: 'Shop ID is required.', code: 'MISSING_SHOP_ID' });
    if (!templateId) return res.status(400).json({ success: false, error: 'Template ID is required.', code: 'MISSING_TEMPLATE' });
    if (!customerId) return res.status(400).json({ success: false, error: 'Customer ID is required.', code: 'MISSING_CUSTOMER' });

    const customers = customerRepo.getCustomersForShop(shopId);
    customer = customers.find(c => c.id === customerId);
    if (!customer) return res.status(404).json({ success: false, error: 'Customer not found.', code: 'CUSTOMER_NOT_FOUND' });

    template = await whatsappService.getTemplate(templateId, shopId);
    renderedBody = whatsappService.renderTemplate(template, {
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
        wabaId: template.wabaId,
      };
      result = await whatsappService.sendViaCloudAPI(customer.phone, renderedBody, templateConfig, shopId);
    } else {
      // Freeform rendered text message
      result = await whatsappService.sendViaCloudAPI(customer.phone, renderedBody, null, shopId);
    }

    const wamid = result?.messages?.[0]?.id || null;
    customerRepo.recordReminderSent(shopId, customerId);

    // Save successful message record to history
    const historyRecord = historyRepo.recordMessage(shopId, {
      wamid,
      recipientName: customer.name,
      recipientPhone: customer.phone,
      templateId: template?.id,
      templateName: template?.name,
      renderedBody,
      deliveryMode: 'cloud',
      status: 'sent',
    });

    console.log(`[whatsapp:cloud] Message sent to "${customer.name}" (${customer.phone}) - shop ${shopId} - WAMID: ${wamid}`);
    res.json({
      success: true,
      message: `WhatsApp message sent to ${customer.name} via Cloud API.`,
      data: result,
      historyRecord,
    });
  } catch (err) {
    const f = formatError(err);
    console.error(`[whatsappController:sendViaCloud] ${f.code}:`, f.raw);

    // Save failed message record to history
    if (shopId && customer) {
      historyRepo.recordMessage(shopId, {
        recipientName: customer.name,
        recipientPhone: customer.phone,
        templateId: template?.id,
        templateName: template?.name || 'Direct Message',
        renderedBody,
        deliveryMode: 'cloud',
        status: 'failed',
        errorMessage: f.message,
      });
    }

    res.status(500).json({ success: false, error: f.message, code: f.code });
  }
};

// ── GET /api/v2/whatsapp/history ─────────────────────────────
exports.getMessageHistory = async (req, res) => {
  try {
    const shopId = getShopId(req);
    if (!shopId) return res.status(400).json({ success: false, error: 'Shop ID is required.', code: 'MISSING_SHOP_ID' });

    const { status, search, limit, offset } = req.query;
    const history = historyRepo.getHistoryForShop(shopId, {
      status,
      search,
      limit: limit ? parseInt(limit, 10) : 100,
      offset: offset ? parseInt(offset, 10) : 0,
    });

    res.json({ success: true, data: history });
  } catch (err) {
    const f = formatError(err);
    res.status(500).json({ success: false, error: f.message, code: f.code });
  }
};

// ── GET /api/v2/whatsapp/history/stats ───────────────────────
exports.getHistoryStats = async (req, res) => {
  try {
    const shopId = getShopId(req);
    if (!shopId) return res.status(400).json({ success: false, error: 'Shop ID is required.', code: 'MISSING_SHOP_ID' });

    const stats = historyRepo.getStatsForShop(shopId);
    res.json({ success: true, data: stats });
  } catch (err) {
    const f = formatError(err);
    res.status(500).json({ success: false, error: f.message, code: f.code });
  }
};

// ── GET /api/v2/whatsapp/webhook (Meta Webhook Verification) ──
exports.verifyWebhook = (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const expectedToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || 'metamarketing_verify_token';
  if (mode === 'subscribe' && token === expectedToken) {
    console.log('[whatsapp:webhook] Verified successfully!');
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
};

// ── POST /api/v2/whatsapp/webhook (Meta Status & Inbound Messages) ──
exports.handleWebhook = (req, res) => {
  try {
    const body = req.body;
    if (body.object === 'whatsapp_business_account') {
      // Find the active shop or default to first shop
      const allShops = shopRepo.getAllShops();
      const defaultShopId = allShops[0]?.id || 'shop_461194823752748';

      (body.entry || []).forEach(entry => {
        (entry.changes || []).forEach(change => {
          const value = change.value;
          const wabaId = entry.id;

          // Find shop matching this WABA if multi-shop
          const matchingShop = allShops.find(s => s.whatsapp?.wabaId === wabaId) || allShops[0];
          const activeShopId = matchingShop?.id || defaultShopId;

          // 1. Inbound Customer Messages
          if (value?.messages) {
            const contacts = value.contacts || [];
            value.messages.forEach(msg => {
              const from = msg.from; // Customer phone (e.g. 917982296878)
              const wamid = msg.id;
              const timestamp = msg.timestamp;
              const text = msg.text?.body || msg.button?.text || msg.interactive?.button_reply?.title || (msg.type ? `[${msg.type} message]` : '');
              
              // Resolve sender name from Meta contact profile or customer ledger
              const contactProfile = contacts.find(c => c.wa_id === from);
              const senderName = contactProfile?.profile?.name || null;

              console.log(`[whatsapp:webhook] Inbound message from ${from} (${senderName || 'Customer'}): "${text}"`);
              chatRepo.saveInboundMessage(activeShopId, {
                from,
                text,
                wamid,
                timestamp,
                senderName,
              });
            });
          }

          // 2. Delivery & Read Status Callbacks
          if (value?.statuses) {
            value.statuses.forEach(st => {
              const wamid = st.id;
              const status = st.status; // 'sent' | 'delivered' | 'read' | 'failed'
              const timestamp = st.timestamp ? new Date(parseInt(st.timestamp, 10) * 1000).toISOString() : null;
              const errorMsg = st.errors && st.errors.length > 0 ? (st.errors[0].title || st.errors[0].message || `Error code ${st.errors[0].code}`) : null;
              console.log(`[whatsapp:webhook] Status update: ${wamid} -> ${status}${errorMsg ? ` (${errorMsg})` : ''}`);
              historyRepo.updateMessageStatus(wamid, status, timestamp, errorMsg);
              chatRepo.updateChatMessageStatus(wamid, status);
            });
          }
        });
      });
    }
    res.sendStatus(200);
  } catch (err) {
    console.error('[whatsapp:webhook] Error processing webhook:', err.message);
    res.sendStatus(200); // Always 200 OK for Meta
  }
};

// ── GET /api/v2/whatsapp/chats (List All Conversations) ───────
exports.getConversations = (req, res) => {
  try {
    const shopId = getShopId(req);
    if (!shopId) return res.status(400).json({ success: false, error: 'Shop ID is required.', code: 'MISSING_SHOP_ID' });

    const { search } = req.query;
    const conversations = chatRepo.getConversationsForShop(shopId, { search });
    res.json({ success: true, data: conversations });
  } catch (err) {
    const f = formatError(err);
    res.status(500).json({ success: false, error: f.message, code: f.code });
  }
};

// ── GET /api/v2/whatsapp/chats/:phone (Get Full Thread) ───────
exports.getThreadMessages = (req, res) => {
  try {
    const shopId = getShopId(req);
    const phone = req.params.phone;
    if (!shopId) return res.status(400).json({ success: false, error: 'Shop ID is required.', code: 'MISSING_SHOP_ID' });
    if (!phone) return res.status(400).json({ success: false, error: 'Phone is required.', code: 'MISSING_PHONE' });

    const thread = chatRepo.getThread(shopId, phone);
    res.json({ success: true, data: thread });
  } catch (err) {
    const f = formatError(err);
    res.status(500).json({ success: false, error: f.message, code: f.code });
  }
};

// ── POST /api/v2/whatsapp/chats/send (Send 2-Way Reply) ────────
exports.sendReply = async (req, res) => {
  try {
    const shopId = getShopId(req);
    const { customerPhone, text, templateId, extraVars = {}, customerName } = req.body;

    if (!shopId) return res.status(400).json({ success: false, error: 'Shop ID is required.', code: 'MISSING_SHOP_ID' });
    if (!customerPhone) return res.status(400).json({ success: false, error: 'Customer phone number is required.', code: 'MISSING_PHONE' });
    if (!text && !templateId) return res.status(400).json({ success: false, error: 'Message text or template ID is required.', code: 'MISSING_MESSAGE' });

    let result;
    let templateName = null;
    let renderedText = text || '';

    if (templateId) {
      // Send via official template
      const template = await whatsappService.getTemplate(templateId, shopId);
      templateName = template.name;
      renderedText = whatsappService.renderTemplate(template, {
        customerName: customerName || 'Customer',
        ...extraVars,
      });

      const rawParams = [customerName || 'Customer', ...Object.values(extraVars)];
      const matches = (template.body || '').match(/\{\{([0-9]+)\}\}/g) || [];
      const requiredParamCount = matches.length;
      const parameters = rawParams.slice(0, requiredParamCount);

      const templateConfig = {
        templateName: template.metaName || template.id.replace(/^meta_/, ''),
        languageCode: template.language || 'en',
        parameters,
        wabaId: template.wabaId,
      };

      result = await whatsappService.sendViaCloudAPI(customerPhone, renderedText, templateConfig, shopId);
    } else {
      // Freeform reply (for open 24-hour customer service window)
      result = await whatsappService.sendViaCloudAPI(customerPhone, text, null, shopId);
    }

    const wamid = result?.messages?.[0]?.id || null;

    // Save to 2-way chat repository
    const chatEntry = chatRepo.saveOutboundMessage(shopId, {
      to: customerPhone,
      text: renderedText,
      wamid,
      templateName,
      status: 'sent',
      customerName,
    });

    // Record in history log
    historyRepo.recordMessage(shopId, {
      wamid,
      recipientName: customerName || 'Customer',
      recipientPhone: customerPhone,
      templateId: templateId || null,
      templateName: templateName || 'Live Chat Reply',
      renderedBody: renderedText,
      deliveryMode: 'cloud',
      status: 'sent',
    });

    res.json({
      success: true,
      data: chatEntry.message,
      thread: chatEntry.thread,
      message: 'Reply dispatched successfully via WhatsApp Cloud API.',
    });
  } catch (err) {
    const f = formatError(err);
    res.status(500).json({ success: false, error: f.message, code: f.code });
  }
};

// ── POST /api/v2/whatsapp/chats/:phone/read (Mark Read) ──────
exports.markChatRead = (req, res) => {
  try {
    const shopId = getShopId(req);
    const phone = req.params.phone;
    if (!shopId) return res.status(400).json({ success: false, error: 'Shop ID is required.', code: 'MISSING_SHOP_ID' });

    const updated = chatRepo.markAsRead(shopId, phone);
    res.json({ success: true, data: updated });
  } catch (err) {
    const f = formatError(err);
    res.status(500).json({ success: false, error: f.message, code: f.code });
  }
};

// ── GET /api/v2/whatsapp/chats/unread-count ───────────────────
exports.getUnreadCount = (req, res) => {
  try {
    const shopId = getShopId(req);
    if (!shopId) return res.status(400).json({ success: false, error: 'Shop ID is required.', code: 'MISSING_SHOP_ID' });

    const count = chatRepo.getUnreadCountForShop(shopId);
    res.json({ success: true, data: { unreadCount: count } });
  } catch (err) {
    const f = formatError(err);
    res.status(500).json({ success: false, error: f.message, code: f.code });
  }
};
