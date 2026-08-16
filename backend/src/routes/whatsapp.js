const express = require('express');
const whatsappController = require('../controllers/whatsappController');

const router = express.Router();

// ── OAuth & Shop Connection (Embedded Signup) ─────────────────
router.get('/status', whatsappController.getWhatsAppStatus);
router.get('/available-numbers', whatsappController.getAvailableNumbers);
router.post('/oauth/callback', whatsappController.connectWhatsAppOAuth);
router.post('/oauth/disconnect', whatsappController.disconnectWhatsApp);

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

// Mode B: Meta WhatsApp Cloud API (Multi-tenant or .env fallback)
router.post('/send-cloud', whatsappController.sendViaCloud);

// ── Message History & Live Delivery Status ────────────────────
router.get('/history', whatsappController.getMessageHistory);
router.get('/history/stats', whatsappController.getHistoryStats);

// ── 2-Way Live Chat & Customer Messenger ─────────────────────
router.get('/chats', whatsappController.getConversations);
router.get('/chats/unread-count', whatsappController.getUnreadCount);
router.get('/chats/:phone', whatsappController.getThreadMessages);
router.post('/chats/send', whatsappController.sendReply);
router.post('/chats/:phone/read', whatsappController.markChatRead);

// ── Webhook: Meta Inbound Messages & Live Status Callbacks ────
router.get('/webhook', whatsappController.verifyWebhook);
router.post('/webhook', whatsappController.handleWebhook);

module.exports = router;
