const fs = require('fs');
const path = require('path');
const axios = require('axios');
const shopRepo = require('../repositories/shopRepository');

const TEMPLATES_PATH = path.resolve(__dirname, '../../data/wa_templates.json');

// ── Multi-Tenant Credentials Resolver ─────────────────────────
// Resolves shop-specific WhatsApp credentials first, falling back to .env system defaults
function getWhatsAppConfig(shopId = null) {
  if (shopId) {
    const shop = shopRepo.findShopById(shopId);
    if (shop?.whatsapp?.connected && shop.whatsapp.phoneNumberId && shop.whatsapp.accessToken) {
      return {
        wabaId: shop.whatsapp.wabaId,
        phoneNumberId: shop.whatsapp.phoneNumberId,
        accessToken: shop.whatsapp.accessToken,
        displayPhoneNumber: shop.whatsapp.displayPhoneNumber,
        verifiedName: shop.whatsapp.verifiedName,
        isShopSpecific: true,
      };
    }
  }

  return {
    wabaId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID,
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN,
    displayPhoneNumber: null,
    verifiedName: null,
    isShopSpecific: false,
  };
}

// ── OAuth: Exchange code for long-lived system/user token ──────
async function exchangeCodeForWhatsAppToken(code) {
  const appId = process.env.FACEBOOK_APP_ID;
  const appSecret = process.env.FACEBOOK_APP_SECRET;

  if (!appId || !appSecret) {
    throw new Error('FACEBOOK_APP_ID and FACEBOOK_APP_SECRET must be configured in backend/.env');
  }

  const { data } = await axios.get('https://graph.facebook.com/v19.0/oauth/access_token', {
    params: {
      client_id: appId,
      client_secret: appSecret,
      code,
    },
  });

  return data; // { access_token, token_type, expires_in }
}

// ── OAuth: Fetch Live Phone Number Details ────────────────────
async function fetchWhatsAppPhoneDetails(phoneNumberId, accessToken) {
  const { data } = await axios.get(`https://graph.facebook.com/v19.0/${phoneNumberId}`, {
    params: {
      fields: 'display_phone_number,verified_name,quality_rating,name_status,status',
    },
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  return data;
}

// ── OAuth: Subscribe app to shop's WABA webhooks ──────────────
async function subscribeWABAApp(wabaId, accessToken) {
  try {
    const { data } = await axios.post(
      `https://graph.facebook.com/v19.0/${wabaId}/subscribed_apps`,
      {},
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );
    return data;
  } catch (err) {
    console.warn(`[whatsappService:subscribeWABAApp] Subscription notice:`, err.response?.data?.error?.message || err.message);
    return null;
  }
}

// ── Fetch official templates from Meta WhatsApp Cloud API ────
async function getMetaCloudTemplates(shopId = null) {
  const { wabaId, accessToken: token } = getWhatsAppConfig(shopId);

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
async function submitTemplateToMeta({ name, category, body, language = 'en' }, shopId = null) {
  const { wabaId, accessToken: token } = getWhatsAppConfig(shopId);

  if (!wabaId || !token) {
    throw new Error('WhatsApp Business Account ID and Access Token must be configured in shop or .env');
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

  // Map user category to Meta's strict category enum
  const categoryMap = {
    payment: 'UTILITY',
    order: 'UTILITY',
    reminder: 'UTILITY',
    utility: 'UTILITY',
    promotion: 'MARKETING',
    festival: 'MARKETING',
    general: 'MARKETING',
    marketing: 'MARKETING',
    auth: 'AUTHENTICATION',
    authentication: 'AUTHENTICATION',
  };
  const metaCategory = categoryMap[String(category || '').toLowerCase()] || 'MARKETING';

  const payload = {
    name: formattedName,
    category: metaCategory,
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

// ── Load only official Meta Cloud templates ───────────────────
async function getAllTemplates(shopId = null) {
  return await getMetaCloudTemplates(shopId);
}

async function getTemplate(templateId, shopId = null) {
  const templates = await getAllTemplates(shopId);
  const clean = String(templateId || '').toLowerCase().replace(/^meta_/, '');
  const tpl = templates.find(t =>
    t.id === templateId ||
    t.metaName === templateId ||
    t.metaName === clean ||
    t.id === `meta_${clean}` ||
    t.id.toLowerCase().includes(`_${clean}`) ||
    t.name.toLowerCase().includes(clean)
  );
  if (!tpl) throw new Error(`Template "${templateId}" not found in Meta Cloud API.`);
  return tpl;
}

// ── Create a new template directly on Meta Cloud API ───────────
async function createTemplate({ name, category, body, language = 'en' }, shopId = null) {
  if (!name || !name.trim()) throw new Error('Template name is required.');
  if (!body || !body.trim()) throw new Error('Template message body is required.');

  // Submit directly to Meta WABA
  const metaResponse = await submitTemplateToMeta({ name, category, body, language }, shopId);
  console.log(`[whatsappService] Template "${name}" submitted to Meta WABA:`, metaResponse);

  return {
    id: `meta_${name.toLowerCase().replace(/[^a-z0-9_]/g, '_')}`,
    metaName: name.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
    name: `☁️ ${name}`,
    category: (category || 'MARKETING').toUpperCase(),
    description: `Official Meta Cloud Template (${metaResponse.status || 'PENDING'})`,
    body: body.trim(),
    isMetaOfficial: true,
    metaStatus: metaResponse.status || 'PENDING',
    language,
  };
}

// ── Delete a template from Meta Cloud API ──────────────────────
async function deleteTemplate(templateName, shopId = null) {
  const { wabaId, accessToken: token } = getWhatsAppConfig(shopId);
  const cleanName = String(templateName || '').replace(/^meta_/, '').replace(/^☁️\s*/, '');

  if (!wabaId || !token) {
    throw new Error('WhatsApp Business Account ID and Access Token must be configured in shop or .env');
  }

  const { data } = await axios.delete(`https://graph.facebook.com/v19.0/${wabaId}/message_templates`, {
    headers: { Authorization: `Bearer ${token}` },
    params: { name: cleanName },
  });

  return data;
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
async function sendViaCloudAPI(phone, messageBody, templateConfig = null, shopId = null) {
  const { phoneNumberId, accessToken } = getWhatsAppConfig(shopId);

  if (!phoneNumberId || !accessToken) {
    throw new Error(
      'WhatsApp Cloud API not configured. Please connect WhatsApp Business in Dashboard or set WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN in backend/.env'
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
  getWhatsAppConfig,
  exchangeCodeForWhatsAppToken,
  fetchWhatsAppPhoneDetails,
  subscribeWABAApp,
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
