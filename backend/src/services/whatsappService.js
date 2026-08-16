const fs = require('fs');
const path = require('path');
const axios = require('axios');

const TEMPLATES_PATH = path.resolve(__dirname, '../../data/wa_templates.json');

// ── Load templates from JSON ──────────────────────────────────
function getAllTemplates() {
  try {
    const raw = fs.readFileSync(TEMPLATES_PATH, 'utf8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function getTemplate(templateId) {
  const templates = getAllTemplates();
  const tpl = templates.find(t => t.id === templateId);
  if (!tpl) throw new Error(`Template "${templateId}" not found.`);
  return tpl;
}

// ── Template Rendering ────────────────────────────────────────
// Replaces {{variableName}} placeholders with actual values
function renderTemplate(template, vars = {}) {
  let body = template.body;

  // Auto-inject shopName and customerName from context if not provided in vars
  for (const [key, value] of Object.entries(vars)) {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    body = body.replace(regex, value || '');
  }

  // Warn about any un-filled placeholders
  const unfilled = (body.match(/\{\{[^}]+\}\}/g) || []);
  if (unfilled.length > 0) {
    console.warn(`[whatsappService] Un-filled template variables: ${unfilled.join(', ')}`);
  }

  return body;
}

// ── Mode A: wa.me Deep Link Builder ─────────────────────────
function buildWAMeLink(phone, messageBody) {
  if (!phone) throw new Error('Customer phone number is required to build WhatsApp link.');

  // Normalize phone: ensure it starts with country code (default +91 India if 10 digits)
  let normalizedPhone = String(phone).replace(/\D/g, '');
  if (normalizedPhone.length === 10) {
    normalizedPhone = '91' + normalizedPhone; // auto-prepend India code
  }

  const encoded = encodeURIComponent(messageBody);
  return `https://wa.me/${normalizedPhone}?text=${encoded}`;
}

// ── Mode B: Meta WhatsApp Cloud API ──────────────────────────
// Sends a FREE-FORM text message via the official WhatsApp Business Cloud API.
// Requires WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN in .env
// NOTE: Only works within 24h customer-initiated conversation window (session window).
// For outbound cold notifications, Meta requires pre-approved Template Messages.
async function sendViaCloudAPI(phone, messageBody) {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

  if (!phoneNumberId || !accessToken) {
    throw new Error(
      'WhatsApp Cloud API not configured. Please set WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN in backend/.env'
    );
  }

  let normalizedPhone = String(phone).replace(/\D/g, '');
  if (normalizedPhone.length === 10) normalizedPhone = '91' + normalizedPhone;

  const url = `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`;

  const { data } = await axios.post(url, {
    messaging_product: 'whatsapp',
    to: normalizedPhone,
    type: 'text',
    text: { body: messageBody, preview_url: false },
  }, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  return data;
}

// ── Generate wa.me link for single customer + template ────────
function generateSingleWALink(customer, template, extraVars = {}) {
  const vars = {
    customerName: customer.name,
    ...extraVars,
  };

  const renderedBody = renderTemplate(template, vars);
  const waLink = buildWAMeLink(customer.phone, renderedBody);

  return { waLink, renderedBody, customer };
}

// ── Generate wa.me links for multiple customers (bulk) ────────
function generateBulkWALinks(customers, template, extraVars = {}) {
  return customers.map(customer => generateSingleWALink(customer, template, extraVars));
}

module.exports = {
  getAllTemplates,
  getTemplate,
  renderTemplate,
  buildWAMeLink,
  sendViaCloudAPI,
  generateSingleWALink,
  generateBulkWALinks,
};
