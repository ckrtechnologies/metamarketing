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

// ── Known / Registered WhatsApp Business Accounts ─────────────
const PRESET_ACCOUNTS = [
  {
    phoneNumberId: '443930708804530',
    wabaId: '469743566216329',
    displayPhoneNumber: '+91 78140 51127',
    verifiedName: 'Dr Vineet Chadha',
    qualityRating: 'GREEN',
    status: 'CONNECTED',
  },
  {
    phoneNumberId: '1076671092207220',
    wabaId: '1844231982837700',
    displayPhoneNumber: '+91 89209 32354',
    verifiedName: 'CKR Technologies (Stenna)',
    qualityRating: 'GREEN',
    status: 'CONNECTED',
  },
];

// ── List all available WhatsApp phone numbers from Meta ────────
async function getAvailableWhatsAppNumbers(shopId = null) {
  const { wabaId, accessToken: token } = getWhatsAppConfig(shopId);
  const candidateWabas = Array.from(new Set([wabaId, '469743566216329', '1844231982837700'].filter(Boolean)));
  const numbers = [...PRESET_ACCOUNTS];

  for (const wid of candidateWabas) {
    try {
      const { data } = await axios.get(`https://graph.facebook.com/v19.0/${wid}/phone_numbers`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { fields: 'id,display_phone_number,verified_name,quality_rating,name_status,status' },
      });
      (data.data || []).forEach(p => {
        const existingIdx = numbers.findIndex(n => n.phoneNumberId === p.id);
        const item = {
          phoneNumberId: p.id,
          wabaId: wid,
          displayPhoneNumber: p.display_phone_number,
          verifiedName: p.verified_name || (p.id === '443930708804530' ? 'Dr Vineet Chadha' : 'CKR Technologies'),
          qualityRating: p.quality_rating || 'GREEN',
          nameStatus: p.name_status,
          status: p.status || 'CONNECTED',
        };
        if (existingIdx !== -1) {
          numbers[existingIdx] = { ...numbers[existingIdx], ...item };
        } else {
          numbers.push(item);
        }
      });
    } catch (e) {
      // Ignore individual WABA query errors
    }
  }

  return numbers;
}

// ── Lookup a phone by plain user-entered number (e.g. 7814051127) ──
async function findPhoneByNumber(inputPhone, shopId = null) {
  const cleanInput = String(inputPhone || '').replace(/[^0-9]/g, '').slice(-10);
  if (!cleanInput) throw new Error('Please enter a valid phone number.');

  const available = await getAvailableWhatsAppNumbers(shopId);
  const match = available.find(p => (p.displayPhoneNumber || '').replace(/[^0-9]/g, '').slice(-10) === cleanInput);

  if (!match) {
    // If exact match not in list, check if user passed phone ID directly
    if (inputPhone.length > 12 && /^\d+$/.test(inputPhone)) {
      const { accessToken: token } = getWhatsAppConfig(shopId);
      const direct = await fetchWhatsAppPhoneDetails(inputPhone, token);
      return {
        phoneNumberId: inputPhone,
        wabaId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID,
        displayPhoneNumber: direct.display_phone_number,
        verifiedName: direct.verified_name,
        qualityRating: direct.quality_rating,
      };
    }
    throw new Error(`Phone number ending in ${cleanInput} was not found on your WhatsApp Business Account.`);
  }

  return match;
}

// ── Fetch official templates from Meta WhatsApp Cloud API ────
// ── Fetch official templates from Meta WhatsApp Cloud API ────
async function getMetaCloudTemplates(shopId = null) {
  const { wabaId, accessToken: token } = getWhatsAppConfig(shopId);
  if (!token) return [];

  const activeWaba = wabaId || '469743566216329';
  const allTemplates = [];

  try {
    const { data } = await axios.get(`https://graph.facebook.com/v19.0/${activeWaba}/message_templates`, {
      headers: { Authorization: `Bearer ${token}` },
      params: { limit: 50 },
    });

    (data.data || []).forEach(metaTpl => {
      const bodyComp = metaTpl.components?.find(c => c.type === 'BODY');
      const bodyText = bodyComp?.text || metaTpl.name;
      const matches = bodyText.match(/\{\{([0-9]+)\}\}/g) || [];
      const variables = matches.map((_, i) => `param_${i + 1}`);

      allTemplates.push({
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
        wabaId: activeWaba,
      });
    });
  } catch (err) {
    console.warn(`[whatsappService:getMetaCloudTemplates] Failed for WABA ${activeWaba}:`, err.response?.data?.error?.message || err.message);
  }

  return allTemplates;
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
  let tpl = templates.find(t =>
    t.id === templateId ||
    t.metaName === templateId ||
    t.metaName === clean ||
    t.id === `meta_${clean}` ||
    t.id.toLowerCase().includes(`_${clean}`) ||
    t.name.toLowerCase().includes(clean)
  );

  // If not found in active WABA catalog, search other linked WABA catalogs as fallback
  if (!tpl) {
    const candidateWabas = ['1844231982837700', '469743566216329'];
    const { accessToken: token } = getWhatsAppConfig(shopId);
    for (const wid of candidateWabas) {
      try {
        const { data } = await axios.get(`https://graph.facebook.com/v19.0/${wid}/message_templates`, {
          headers: { Authorization: `Bearer ${token}` },
          params: { limit: 50 },
        });
        const found = (data.data || []).find(m => m.name.toLowerCase() === clean || m.name.toLowerCase() === templateId.toLowerCase());
        if (found) {
          const bodyComp = found.components?.find(c => c.type === 'BODY');
          const bodyText = bodyComp?.text || found.name;
          const matches = bodyText.match(/\{\{([0-9]+)\}\}/g) || [];
          tpl = {
            id: `meta_${found.name}`,
            metaName: found.name,
            name: `☁️ ${found.name}`,
            category: found.category?.toLowerCase() || 'general',
            body: bodyText,
            isMetaOfficial: true,
            metaStatus: found.status,
            language: found.language,
            wabaId: wid,
          };
          break;
        }
      } catch {}
    }
  }

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
// ── Helper: Strict Phone Number Validation ────────────────────
function validateAndNormalizePhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) {
    throw new Error('Phone number is required.');
  }
  if (digits.length === 10) {
    if (!/^[6-9]\d{9}$/.test(digits)) {
      throw new Error(`Invalid Indian mobile number "${phone}". Mobile numbers must start with 6, 7, 8, or 9.`);
    }
    return '91' + digits;
  }
  if (digits.length === 12 && digits.startsWith('91')) {
    const local10 = digits.slice(2);
    if (!/^[6-9]\d{9}$/.test(local10)) {
      throw new Error(`Invalid Indian mobile number "${phone}". Local 10 digits must start with 6, 7, 8, or 9.`);
    }
    return digits;
  }
  if (digits.length >= 11 && digits.length <= 15) {
    return digits;
  }
  throw new Error(`Invalid phone number "${phone}". Must be a valid 10-digit mobile number.`);
}

// ── Send a WhatsApp message via Meta Cloud API ────────────────
// Accepts either an official Meta template (templateConfig)
// or free-form text if templateName is not provided.
async function sendViaCloudAPI(phone, messageBody, templateConfig = null, shopId = null) {
  const { phoneNumberId, accessToken } = getWhatsAppConfig(shopId);

  if (!phoneNumberId || !accessToken) {
    throw new Error(
      'WhatsApp Cloud API not configured. Please connect WhatsApp Business in Dashboard or set WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN in backend/.env'
    );
  }

  const normalizedPhone = validateAndNormalizePhone(phone);

  let activePhoneId = phoneNumberId;
  if (templateConfig?.wabaId === '1844231982837700') {
    activePhoneId = '1076671092207220';
  } else if (templateConfig?.wabaId === '469743566216329') {
    activePhoneId = '443930708804530';
  }

  const url = `https://graph.facebook.com/v19.0/${activePhoneId}/messages`;

  let payload;

  if (templateConfig && templateConfig.templateName) {
    // Official Meta Approved Template payload (delivers 24/7 cold)
    payload = {
      messaging_product: 'whatsapp',
      to: normalizedPhone,
      type: 'template',
      template: {
        name: templateConfig.templateName,
        language: { code: templateConfig.languageCode || 'en' },
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
  getAvailableWhatsAppNumbers,
  findPhoneByNumber,
  exchangeCodeForWhatsAppToken,
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
