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

function saveTemplates(templates) {
  fs.writeFileSync(TEMPLATES_PATH, JSON.stringify(templates, null, 2), 'utf8');
}

function getTemplate(templateId) {
  const templates = getAllTemplates();
  const tpl = templates.find(t => t.id === templateId);
  if (!tpl) throw new Error(`Template "${templateId}" not found.`);
  return tpl;
}

// ── Create a new custom template ──────────────────────────────
function createTemplate({ name, category, description, body, icon = '📝' }) {
  if (!name || !name.trim()) throw new Error('Template name is required.');
  if (!body || !body.trim()) throw new Error('Template message body is required.');

  const templates = getAllTemplates();

  // Extract variables inside {{variableName}}
  const matches = body.match(/\{\{([a-zA-Z0-9_]+)\}\}/g) || [];
  const variables = Array.from(new Set(matches.map(m => m.replace(/[\{\}]/g, ''))));

  const id = `custom_${Date.now()}_${name.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 15)}`;
  const displayName = `${icon} ${name.trim()}`;

  const newTemplate = {
    id,
    name: displayName,
    category: category || 'general',
    description: description || 'Custom template created by user',
    variables,
    body: body.trim(),
    isCustom: true,
    createdAt: new Date().toISOString(),
  };

  templates.push(newTemplate);
  saveTemplates(templates);
  return newTemplate;
}

// ── Delete a custom template ──────────────────────────────────
function deleteTemplate(templateId) {
  const templates = getAllTemplates();
  const idx = templates.findIndex(t => t.id === templateId);
  if (idx === -1) throw new Error(`Template "${templateId}" not found.`);

  const [removed] = templates.splice(idx, 1);
  saveTemplates(templates);
  return removed;
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
// Sends an official WhatsApp Template Message (delivered cold 24/7 without customer messaging first)
// or free-form text if templateName is not provided.
async function sendViaCloudAPI(phone, messageBody, templateConfig = null) {
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

  let payload;

  if (templateConfig && templateConfig.templateName) {
    // Official Meta Approved Template payload (delivers 24/7 cold)
    payload = {
      messaging_product: 'whatsapp',
      to: normalizedPhone,
      type: 'template',
      template: {
        name: templateConfig.templateName,
        language: { code: templateConfig.languageCode || 'en_US' },
        ...(templateConfig.parameters && templateConfig.parameters.length > 0 ? {
          components: [
            {
              type: 'body',
              parameters: templateConfig.parameters.map(text => ({ type: 'text', text: String(text) })),
            },
          ],
        } : {}),
      },
    };
  } else {
    // Freeform text message (for open 24h conversation windows or test sandbox)
    payload = {
      messaging_product: 'whatsapp',
      to: normalizedPhone,
      type: 'text',
      text: { body: messageBody, preview_url: false },
    };
  }

  const { data } = await axios.post(url, payload, {
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
  createTemplate,
  deleteTemplate,
  renderTemplate,
  buildWAMeLink,
  sendViaCloudAPI,
  generateSingleWALink,
  generateBulkWALinks,
};
