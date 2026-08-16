const express = require('express');
const whatsappController = require('../controllers/whatsappController');

const router = express.Router();

// ── Template Catalogue ────────────────────────────────────────
router.get('/templates', whatsappController.getTemplates);
router.post('/templates', whatsappController.createTemplate);
router.delete('/templates/:id', whatsappController.deleteTemplate);

// ── Customer Ledger CRUD ──────────────────────────────────────
router.get('/customers', whatsappController.getCustomers);
router.post('/customers', whatsappController.addCustomer);
router.put('/customers/:id', whatsappController.updateCustomer);
router.delete('/customers/:id', whatsappController.deleteCustomer);

// ── Notification Delivery ─────────────────────────────────────
// Mode A: wa.me deep link (free, no API key required)
router.post('/send-link', whatsappController.generateWALink);
router.post('/bulk-links', whatsappController.generateBulkLinks);

// Mode B: Meta WhatsApp Cloud API (requires WHATSAPP_PHONE_NUMBER_ID + WHATSAPP_ACCESS_TOKEN in .env)
router.post('/send-cloud', whatsappController.sendViaCloud);

module.exports = router;
