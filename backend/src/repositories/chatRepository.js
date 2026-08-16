const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '../../data/wa_chats.json');

// Ensure data directory and file exist
function ensureFile() {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ conversations: {} }, null, 2), 'utf8');
  }
}

function readData() {
  ensureFile();
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed.conversations) parsed.conversations = {};
    return parsed;
  } catch {
    return { conversations: {} };
  }
}

function writeData(data) {
  ensureFile();
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

/**
 * Normalizes phone number to 10 digits for consistent thread indexing
 */
function normalizePhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
}

function getThreadKey(shopId, phone) {
  const p = normalizePhone(phone);
  return `${shopId}_${p}`;
}

/**
 * Save incoming message from customer (Meta Webhook)
 */
function saveInboundMessage(shopId, { from, text, wamid, timestamp = null, media = null, senderName = null }) {
  const data = readData();
  const phone = normalizePhone(from);
  const key = getThreadKey(shopId, phone);
  const now = timestamp ? new Date(parseInt(timestamp, 10) * 1000).toISOString() : new Date().toISOString();

  if (!data.conversations[key]) {
    data.conversations[key] = {
      id: key,
      shopId,
      customerPhone: phone,
      customerName: senderName || 'Customer',
      unreadCount: 0,
      lastMessage: text || (media ? '[Media message]' : ''),
      lastMessageAt: now,
      lastInboundAt: now,
      messages: [],
      createdAt: now,
      updatedAt: now,
    };
  }

  const thread = data.conversations[key];
  if (senderName && senderName !== 'Customer') {
    thread.customerName = senderName;
  }

  // Prevent duplicate message IDs
  if (wamid && thread.messages.some(m => m.wamid === wamid)) {
    return thread;
  }

  const msgId = `msg_in_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const messageObj = {
    id: msgId,
    wamid: wamid || null,
    direction: 'inbound', // customer -> shop
    text: text || '',
    media: media || null,
    status: 'delivered', // inbound is always received
    timestamp: now,
  };

  thread.messages.push(messageObj);
  thread.lastMessage = text || (media ? '[Media message]' : '');
  thread.lastMessageAt = now;
  thread.lastInboundAt = now;
  thread.unreadCount = (thread.unreadCount || 0) + 1;
  thread.updatedAt = now;

  writeData(data);
  return thread;
}

/**
 * Save outbound reply from shop
 */
function saveOutboundMessage(shopId, { to, text, wamid, templateName = null, status = 'sent', customerName = null }) {
  const data = readData();
  const phone = normalizePhone(to);
  const key = getThreadKey(shopId, phone);
  const now = new Date().toISOString();

  if (!data.conversations[key]) {
    data.conversations[key] = {
      id: key,
      shopId,
      customerPhone: phone,
      customerName: customerName || 'Customer',
      unreadCount: 0,
      lastMessage: text || (templateName ? `[Template: ${templateName}]` : ''),
      lastMessageAt: now,
      lastInboundAt: null,
      messages: [],
      createdAt: now,
      updatedAt: now,
    };
  }

  const thread = data.conversations[key];
  if (customerName && (!thread.customerName || thread.customerName === 'Customer')) {
    thread.customerName = customerName;
  }

  const msgId = `msg_out_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const messageObj = {
    id: msgId,
    wamid: wamid || null,
    direction: 'outbound', // shop -> customer
    text: text || '',
    templateName: templateName || null,
    status: status || 'sent', // 'sent' | 'delivered' | 'read' | 'failed'
    timestamp: now,
  };

  thread.messages.push(messageObj);
  thread.lastMessage = text || (templateName ? `[Template: ${templateName}]` : '');
  thread.lastMessageAt = now;
  thread.updatedAt = now;

  writeData(data);
  return { thread, message: messageObj };
}

/**
 * Update message status in chat by WAMID (webhook callback)
 */
function updateChatMessageStatus(wamid, newStatus) {
  const data = readData();
  for (const thread of Object.values(data.conversations)) {
    const msg = thread.messages.find(m => m.wamid === wamid);
    if (msg) {
      msg.status = newStatus;
      thread.updatedAt = new Date().toISOString();
      writeData(data);
      return msg;
    }
  }
  return null;
}

/**
 * Get all conversations for a shop
 */
function getConversationsForShop(shopId, { search } = {}) {
  const data = readData();
  let list = Object.values(data.conversations).filter(c => c.shopId === shopId);

  if (search && search.trim()) {
    const q = search.toLowerCase().trim();
    list = list.filter(c =>
      (c.customerName && c.customerName.toLowerCase().includes(q)) ||
      (c.customerPhone && c.customerPhone.includes(q)) ||
      (c.lastMessage && c.lastMessage.toLowerCase().includes(q))
    );
  }

  // Sort by latest message descending
  list.sort((a, b) => new Date(b.lastMessageAt || 0) - new Date(a.lastMessageAt || 0));

  // Compute 24-hour session window for each conversation
  const nowMs = Date.now();
  const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

  return list.map(c => {
    let isWindowOpen = false;
    let windowExpiresAt = null;
    let windowRemainingMinutes = 0;

    if (c.lastInboundAt) {
      const inboundMs = new Date(c.lastInboundAt).getTime();
      const diff = nowMs - inboundMs;
      if (diff < TWENTY_FOUR_HOURS_MS) {
        isWindowOpen = true;
        windowExpiresAt = new Date(inboundMs + TWENTY_FOUR_HOURS_MS).toISOString();
        windowRemainingMinutes = Math.max(0, Math.round((TWENTY_FOUR_HOURS_MS - diff) / 60000));
      }
    }

    return {
      ...c,
      isWindowOpen,
      windowExpiresAt,
      windowRemainingMinutes,
      messageCount: c.messages?.length || 0,
    };
  });
}

/**
 * Get full message thread for a customer
 */
function getThread(shopId, customerPhone) {
  const data = readData();
  const phone = normalizePhone(customerPhone);
  const key = getThreadKey(shopId, phone);
  const thread = data.conversations[key] || {
    id: key,
    shopId,
    customerPhone: phone,
    customerName: 'Customer',
    unreadCount: 0,
    messages: [],
  };

  const nowMs = Date.now();
  const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
  let isWindowOpen = false;
  let windowExpiresAt = null;
  let windowRemainingMinutes = 0;

  if (thread.lastInboundAt) {
    const inboundMs = new Date(thread.lastInboundAt).getTime();
    const diff = nowMs - inboundMs;
    if (diff < TWENTY_FOUR_HOURS_MS) {
      isWindowOpen = true;
      windowExpiresAt = new Date(inboundMs + TWENTY_FOUR_HOURS_MS).toISOString();
      windowRemainingMinutes = Math.max(0, Math.round((TWENTY_FOUR_HOURS_MS - diff) / 60000));
    }
  }

  return {
    ...thread,
    isWindowOpen,
    windowExpiresAt,
    windowRemainingMinutes,
  };
}

/**
 * Mark conversation as read
 */
function markAsRead(shopId, customerPhone) {
  const data = readData();
  const phone = normalizePhone(customerPhone);
  const key = getThreadKey(shopId, phone);

  if (data.conversations[key]) {
    data.conversations[key].unreadCount = 0;
    data.conversations[key].updatedAt = new Date().toISOString();
    writeData(data);
    return data.conversations[key];
  }
  return null;
}

/**
 * Get total unread count for shop
 */
function getUnreadCountForShop(shopId) {
  const data = readData();
  return Object.values(data.conversations)
    .filter(c => c.shopId === shopId)
    .reduce((acc, c) => acc + (c.unreadCount || 0), 0);
}

module.exports = {
  saveInboundMessage,
  saveOutboundMessage,
  updateChatMessageStatus,
  getConversationsForShop,
  getThread,
  markAsRead,
  getUnreadCountForShop,
};
