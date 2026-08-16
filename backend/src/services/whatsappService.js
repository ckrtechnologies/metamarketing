const fs = require('fs');
const path = require('path');
const axios = require('axios');

const TEMPLATES_PATH = path.resolve(__dirname, '../../data/wa_templates.json');

// ── Fetch official templates from Meta WhatsApp Cloud API ────
async function getMetaCloudTemplates() {
  const wabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
  const token = process.env.WHATSAPP_ACCESS_TOKEN;

  if (!wabaId || !token) return [];

  try {
    const { data } = await axios.get(`https://graph.facebook.com/v19.0/${wabaId}/message_templates`, {
      headers: { Authorization: `Bearer ${token}` },
      params: { limit: 50 },
    });

    return (data.data || []).map(metaTpl => {
      // Extract body text from components
      const bodyComp = metaTpl.components?.find(c => c.type === 'BODY');
      const bodyText = bodyComp?.text || metaTpl.name;

      // Extract variables e.g. {{1}}, {{2}}
      const matches = bodyText.match(/\{\{([0-9]+)\}\}/g) || [];
      const variables = matches.map((_, i) => `param_${i + 1}`);

      return {
        id: `meta_${metaTpl.name}`,
        metaName: metaTpl.name,
        name: `☁️ ${metaTpl.name}`,
        category: metaTpl.category?.toLowerCase() || 'general',
        description: `Official Meta Cloud Template (${metaTpl.status})`,
        variables: variables.length > 0 ? ['customerName', ...variables.slice(1)] : [],
        paramCount: matches.length,
        body: bodyText,
        isMetaOfficial: true,
        metaStatus: metaTpl.status,
        language: metaTpl.language,
      };
    });
  } catch (err) {
    console.warn('[whatsappService:getMetaCloudTemplates] Failed to fetch Meta templates:', err.response?.data?.error?.message || err.message);
    return [];
  }
}

// ── Submit a new template to Meta WhatsApp Cloud API ─────────
async function submitTemplateToMeta({ name, category, body, language = 'en' }) {
  const wabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
  const token = process.env.WHATSAPP_ACCESS_TOKEN;

  if (!wabaId || !token) {
    throw new Error('WHATSAPP_BUSINESS_ACCOUNT_ID and WHATSAPP_ACCESS_TOKEN must be configured in .env');
  }

  // Meta template name must be lowercase alphanumeric and underscore only
  const formattedName = name.toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 512);

  // Convert {{variableName}} into Meta's {{1}}, {{2}} format
  let paramIndex = 1;
  const sampleValues = [];
  const metaBody = body.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_, varName) => {
    const idx = paramIndex++;
    if (varName.toLowerCase().includes('name') || varName.toLowerCase().includes('customer')) {
      sampleValues.push('John Doe');
    } else if (varName.toLowerCase().includes('amount') || varName.toLowerCase().includes('price') || varName.toLowerCase().includes('bill')) {
      sampleValues.push('1500');
    } else if (varName.toLowerCase().includes('date') || varName.toLowerCase().includes('till')) {
      sampleValues.push('25-Aug-2026');
    } else if (varName.toLowerCase().includes('shop')) {
      sampleValues.push('CKR Technologies');
    } else {
      sampleValues.push(`Sample Value ${idx}`);
    }
    return `{{${idx}}}`;
  });

  const bodyComponent = {
    type: 'BODY',
    text: metaBody,
  };

  // Meta REQUIRES an example object if there are variables
  if (sampleValues.length > 0) {
    bodyComponent.example = {
      body_text: [sampleValues],
    };
  }

  const payload = {
    name: formattedName,
    category: (category || 'MARKETING').toUpperCase(),
    language,
    components: [bodyComponent],
  };

  const { data } = await axios.post(`https://graph.facebook.com/v19.0/${wabaId}/message_templates`, payload, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  return data;
}

// ── Load all templates (Local + Meta Cloud) ───────────────────
function getLocalTemplates() {
  try {
    const raw = fs.readFileSync(TEMPLATES_PATH, 'utf8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function getAllTemplates() {
  const local = getLocalTemplates();
  const metaCloud = await getMetaCloudTemplates();

  // Clean name helper e.g. "📢 templet2" -> "templet2"
  const cleanName = (str) => String(str || '').replace(/^[\uD800-\uDBFF\uDC00-\uDFFF\u2600-\u27BF\s]+/, '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');

  const combined = [];

  // Add local templates, upgrading them if they exist in Meta Cloud
  local.forEach(loc => {
    const locClean = cleanName(loc.name);
    const matchingMeta = metaCloud.find(mt => cleanName(mt.metaName || mt.name) === locClean);

    if (matchingMeta) {
      // Upgrade local template with Meta official credentials & params
      combined.push({
        ...loc,
        ...matchingMeta,
        id: loc.id,
        name: `☁️ ${locClean}`,
        isMetaOfficial: true,
        metaName: matchingMeta.metaName,
        paramCount: matchingMeta.paramCount,
        language: matchingMeta.language,
      });
    } else {
      combined.push(loc);
    }
  });

  // Add remaining Meta Cloud templates not already merged
  metaCloud.forEach(mt => {
    const mtClean = cleanName(mt.metaName || mt.name);
    if (!combined.some(c => cleanName(c.metaName || c.name) === mtClean)) {
      combined.push(mt);
    }
  });

  return combined;
}

function saveTemplates(templates) {
  // Only save non-meta templates locally
  const localOnly = templates.filter(t => !t.isMetaOfficial);
  fs.writeFileSync(TEMPLATES_PATH, JSON.stringify(localOnly, null, 2), 'utf8');
}

async function getTemplate(templateId) {
  const templates = await getAllTemplates();
  const clean = String(templateId || '').toLowerCase().replace(/^meta_/, '');
  const tpl = templates.find(t =>
    t.id === templateId ||
    t.metaName === templateId ||
    t.metaName === clean ||
    t.id === `meta_${clean}` ||
    t.id.toLowerCase().includes(`_${clean}`) ||
    t.name.toLowerCase().includes(clean)
  );
  if (!tpl) throw new Error(`Template "${templateId}" not found.`);
  return tpl;
}

// ── Create a new custom template ──────────────────────────────
async function createTemplate({ name, category, description, body, icon = '📝', submitToMeta = false }) {
  if (!name || !name.trim()) throw new Error('Template name is required.');
  if (!body || !body.trim()) throw new Error('Template message body is required.');

  const templates = getLocalTemplates();

  // Extract variables inside {{variableName}}
  const matches = body.match(/\{\{([a-zA-Z0-9_]+)\}\}/g) || [];
  const variables = Array.from(new Set(matches.map(m => m.replace(/[\{\}]/g, ''))));

  const id = `custom_${Date.now()}_${name.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 15)}`;
  const displayName = `${icon} ${name.trim()}`;

  let metaResponse = null;
  if (submitToMeta) {
    try {
      metaResponse = await submitTemplateToMeta({ name, category, body });
      console.log(`[whatsappService] Template "${name}" submitted to Meta WABA:`, metaResponse);
    } catch (metaErr) {
      console.warn('[whatsappService] Could not submit to Meta:', metaErr.response?.data?.error?.message || metaErr.message);
    }
  }

  const newTemplate = {
    id,
    name: displayName,
    category: category || 'general',
    description: description || 'Custom template created by user',
    variables,
    body: body.trim(),
    isCustom: true,
    submittedToMeta: Boolean(metaResponse),
    createdAt: new Date().toISOString(),
  };

  templates.push(newTemplate);
  saveTemplates(templates);
  return newTemplate;
}

// ── Delete a custom template ──────────────────────────────────
function deleteTemplate(templateId) {
  const templates = getLocalTemplates();
  const idx = templates.findIndex(t => t.id === templateId);
  if (idx === -1) throw new Error(`Template "${templateId}" not found.`);

  const [removed] = templates.splice(idx, 1);
  saveTemplates(templates);
  return removed;
}

// ── Template Rendering ────────────────────────────────────────
// Replaces {{variableName}} and {{1}}, {{2}} placeholders with actual values
function renderTemplate(template, vars = {}) {
  let body = template.body;

  // Build combined lookup for both named and positional parameters
  const lookup = {
    '1': vars.customerName || vars.param_1 || 'Customer',
    '2': vars.param_2 || vars.offerDetails || vars.amount || vars.shopName || '',
    '3': vars.param_3 || vars.dueDate || vars.amount || vars.shopName || '',
    '4': vars.param_4 || vars.dueDate || vars.validTill || '',
    ...vars,
  };

  for (const [key, value] of Object.entries(lookup)) {
    if (value !== undefined && value !== null) {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'gi');
      body = body.replace(regex, String(value));
    }
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
