const fs = require('fs');
const path = require('path');

const HISTORY_PATH = path.resolve(__dirname, '../../data/wa_history.json');

function ensureFile() {
  if (!fs.existsSync(HISTORY_PATH)) {
    fs.writeFileSync(HISTORY_PATH, JSON.stringify({ messages: [] }, null, 2), 'utf8');
  }
}

function readData() {
  ensureFile();
  try {
    const raw = fs.readFileSync(HISTORY_PATH, 'utf8');
    return JSON.parse(raw);
  } catch {
    return { messages: [] };
  }
}

function writeData(data) {
  fs.writeFileSync(HISTORY_PATH, JSON.stringify(data, null, 2), 'utf8');
}

/**
 * Record a new dispatched message
 */
function recordMessage(shopId, messageData) {
  const data = readData();
  const id = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  const record = {
    id,
    wamid: messageData.wamid || null,
    shopId,
    recipientName: messageData.recipientName || 'Customer',
    recipientPhone: messageData.recipientPhone || '',
    templateId: messageData.templateId || null,
    templateName: messageData.templateName || 'Direct Message',
    renderedBody: messageData.renderedBody || '',
    deliveryMode: messageData.deliveryMode || 'cloud', // 'cloud' | 'wame'
    status: messageData.status || 'sent', // 'sent' | 'delivered' | 'read' | 'failed'
    errorMessage: messageData.errorMessage || null,
    sentAt: new Date().toISOString(),
    deliveredAt: null,
    readAt: null,
    updatedAt: new Date().toISOString(),
  };

  data.messages.unshift(record);
  writeData(data);
  return record;
}

/**
 * Update message status by Meta WAMID (webhook callback) or ID
 */
function updateMessageStatus(wamidOrId, newStatus, timestamp = null) {
  const data = readData();
  const msg = data.messages.find(m => m.wamid === wamidOrId || m.id === wamidOrId);
  if (!msg) return null;

  msg.status = newStatus;
  msg.updatedAt = new Date().toISOString();

  if (newStatus === 'delivered' && !msg.deliveredAt) {
    msg.deliveredAt = timestamp || new Date().toISOString();
  } else if (newStatus === 'read' && !msg.readAt) {
    msg.readAt = timestamp || new Date().toISOString();
    if (!msg.deliveredAt) msg.deliveredAt = msg.readAt;
  }

  writeData(data);
  return msg;
}

/**
 * Get filtered message history for a shop
 */
function getHistoryForShop(shopId, { status, search, limit = 100, offset = 0 } = {}) {
  const data = readData();
  let list = data.messages.filter(m => m.shopId === shopId);

  if (status && status !== 'all') {
    list = list.filter(m => m.status === status);
  }

  if (search && search.trim()) {
    const q = search.toLowerCase().trim();
    list = list.filter(m =>
      (m.recipientName || '').toLowerCase().includes(q) ||
      (m.recipientPhone || '').includes(q) ||
      (m.templateName || '').toLowerCase().includes(q) ||
      (m.renderedBody || '').toLowerCase().includes(q)
    );
  }

  const total = list.length;
  const items = list.slice(offset, offset + limit);

  return {
    items,
    total,
    limit,
    offset,
  };
}

/**
 * Get aggregate statistics for a shop's message deliveries
 */
function getStatsForShop(shopId) {
  const data = readData();
  const list = data.messages.filter(m => m.shopId === shopId);

  const total = list.length;
  const sent = list.filter(m => m.status === 'sent').length;
  const delivered = list.filter(m => m.status === 'delivered').length;
  const read = list.filter(m => m.status === 'read').length;
  const failed = list.filter(m => m.status === 'failed').length;

  const deliveredCount = delivered + read;
  const deliveryRate = total > 0 ? Math.round((deliveredCount / total) * 100) : 0;
  const readRate = total > 0 ? Math.round((read / total) * 100) : 0;

  return {
    total,
    sent,
    delivered,
    read,
    failed,
    deliveryRate,
    readRate,
  };
}

module.exports = {
  recordMessage,
  updateMessageStatus,
  getHistoryForShop,
  getStatsForShop,
};
