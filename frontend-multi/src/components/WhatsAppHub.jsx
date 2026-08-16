import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getTemplates, createTemplate, deleteTemplate,
  getCustomers, addCustomer,
  updateCustomer, deleteCustomer, generateWALink,
  generateBulkLinks, sendViaCloud,
  getWhatsAppStatus, getAvailableWhatsAppNumbers, connectWhatsAppOAuth, disconnectWhatsApp,
} from '../api/whatsapp';
import WhatsAppHistory from './WhatsAppHistory';
import './WhatsAppHub.css';

const DELIVERY_MODE_KEY = 'wa_delivery_mode';

const EMOJI_OPTIONS = ['📢', '💳', '🎉', '📦', '⏰', '🎁', '🛍️', '💰', '🔔', '🪔', '🚀', '⭐'];

const COMMON_TAGS = [
  { tag: '{{customerName}}', label: 'Customer Name' },
  { tag: '{{shopName}}', label: 'Shop Name' },
  { tag: '{{amount}}', label: '₹ Amount' },
  { tag: '{{dueDate}}', label: 'Due Date' },
  { tag: '{{offerDetails}}', label: 'Offer Details' },
  { tag: '{{validTill}}', label: 'Valid Till' },
  { tag: '{{discountPercent}}', label: 'Discount %' },
];

// Helper: Dynamically load Facebook JavaScript SDK
function loadFacebookSDK() {
  return new Promise((resolve) => {
    if (window.FB) return resolve(window.FB);
    window.fbAsyncInit = function() {
      window.FB.init({
        appId: import.meta.env.VITE_FB_APP_ID || '1636065948040030',
        cookie: true,
        xfbml: true,
        version: 'v19.0',
      });
      resolve(window.FB);
    };
    if (document.getElementById('facebook-jssdk')) return;
    const js = document.createElement('script');
    js.id = 'facebook-jssdk';
    js.src = 'https://connect.facebook.net/en_US/sdk.js';
    document.body.appendChild(js);
  });
}

export default function WhatsAppHub({ shop }) {
  const shopId = shop?.id || shop?.shopId;
  const shopName = shop?.shopName || shop?.facebook?.pageName || 'Shop';

  // ── State ────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState('composer'); // 'composer' | 'history'
  const [lastSentTime, setLastSentTime] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [selectedCustomerIds, setSelectedCustomerIds] = useState(new Set());
  const [extraVars, setExtraVars] = useState({});
  const [deliveryMode, setDeliveryMode] = useState(() => localStorage.getItem(DELIVERY_MODE_KEY) || 'wame');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState({ customers: true, sending: false, creatingTpl: false, oauth: false });
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [newCustomer, setNewCustomer] = useState({ name: '', phone: '', balanceDue: '', notes: '' });

  // WhatsApp Connection & Phone Number State
  const [waStatus, setWaStatus] = useState({ connected: false, loading: true });
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [availableNumbers, setAvailableNumbers] = useState([]);
  const [phoneInput, setPhoneInput] = useState('');
  const embeddedSessionRef = useRef({ wabaId: null, phoneNumberId: null });

  // Template creation modal state
  const [showCreateTplModal, setShowCreateTplModal] = useState(false);
  const [newTpl, setNewTpl] = useState({
    name: '',
    category: 'promotion',
    description: '',
    body: '',
    icon: '📢',
    submitToMeta: true,
  });
  const bodyTextareaRef = useRef(null);

  // ── Load Data ─────────────────────────────────────────────────
  const loadCustomers = useCallback(() => {
    if (!shopId) return;
    setLoading(l => ({ ...l, customers: true }));
    getCustomers(shopId)
      .then(setCustomers)
      .catch(e => setError(e.response?.data?.error || e.message))
      .finally(() => setLoading(l => ({ ...l, customers: false })));
  }, [shopId]);

  const loadTemplates = useCallback(() => {
    getTemplates(shopId).then(tpls => {
      setTemplates(tpls);
      if (tpls.length > 0) setSelectedTemplate(tpls[0]);
    }).catch(console.error);
  }, [shopId]);

  const loadStatus = useCallback(() => {
    if (!shopId) return;
    getWhatsAppStatus(shopId)
      .then(data => setWaStatus({ ...data, loading: false }))
      .catch(() => setWaStatus({ connected: false, loading: false }));

    getAvailableWhatsAppNumbers(shopId)
      .then(setAvailableNumbers)
      .catch(() => setAvailableNumbers([]));
  }, [shopId]);

  useEffect(() => {
    loadTemplates();
    loadCustomers();
    loadStatus();
  }, [loadTemplates, loadCustomers, loadStatus]);

  // ── Listen for Meta Embedded Signup PostMessage Events ───────
  useEffect(() => {
    function handleMetaMessage(event) {
      if (event.origin !== 'https://www.facebook.com' && event.origin !== 'https://web.facebook.com') return;
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (data?.type === 'WA_EMBEDDED_SIGNUP') {
          console.log('[WhatsAppHub:OAuth] Received Meta Embedded Signup session event:', data);
          if (data.event === 'FINISH') {
            const { phone_number_id, waba_id } = data.data || {};
            embeddedSessionRef.current = {
              phoneNumberId: phone_number_id,
              wabaId: waba_id,
            };
          }
        }
      } catch {
        // Ignore non-JSON postMessages
      }
    }

    window.addEventListener('message', handleMetaMessage);
    return () => window.removeEventListener('message', handleMetaMessage);
  }, []);

  // ── Connect / Switch WhatsApp Number by plain phone number ───
  async function handleConnectPhoneNumber(e, selectedNum = null) {
    if (e) e.preventDefault();
    const phoneToConnect = selectedNum?.displayPhoneNumber || selectedNum?.phoneNumberId || phoneInput.trim();
    if (!phoneToConnect) return alert('Please enter or select a phone number.');

    setLoading(l => ({ ...l, oauth: true }));
    setError(null);
    try {
      await connectWhatsAppOAuth(shopId, {
        phoneNumber: phoneToConnect,
        phoneNumberId: selectedNum?.phoneNumberId,
        wabaId: selectedNum?.wabaId,
      });
      showSuccess(`🎉 WhatsApp Number ${selectedNum?.displayPhoneNumber || phoneToConnect} connected for ${shopName}!`);
      setShowConnectModal(false);
      setPhoneInput('');
      loadStatus();
      loadTemplates();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(l => ({ ...l, oauth: false }));
    }
  }

  // ── Disconnect WhatsApp ───────────────────────────────────────
  async function handleDisconnectWhatsApp() {
    if (!window.confirm(`Disconnect WhatsApp Business account from ${shopName}?`)) return;
    try {
      await disconnectWhatsApp(shopId);
      showSuccess(`WhatsApp disconnected for ${shopName}.`);
      loadStatus();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
  }

  // Reset extra vars when template changes
  useEffect(() => {
    if (!selectedTemplate) return;
    const initVars = {};
    selectedTemplate.variables?.forEach(v => {
      if (v !== 'customerName' && v !== 'shopName') initVars[v] = '';
    });
    setExtraVars(initVars);
  }, [selectedTemplate]);

  // ── Customer Selection ────────────────────────────────────────
  function toggleCustomer(id) {
    setSelectedCustomerIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    const visible = filteredCustomers.map(c => c.id);
    const allSelected = visible.every(id => selectedCustomerIds.has(id));
    if (allSelected) {
      setSelectedCustomerIds(prev => {
        const next = new Set(prev);
        visible.forEach(id => next.delete(id));
        return next;
      });
    } else {
      setSelectedCustomerIds(prev => {
        const next = new Set(prev);
        visible.forEach(id => next.add(id));
        return next;
      });
    }
  }

  const filteredCustomers = customers.filter(c =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.phone.includes(searchQuery)
  );

  // ── Add Customer ──────────────────────────────────────────────
  async function handleAddCustomer(e) {
    e.preventDefault();
    if (!newCustomer.name.trim() || !newCustomer.phone.trim()) return;

    try {
      const created = await addCustomer(shopId, newCustomer);
      setCustomers(prev => [created, ...prev]);
      setNewCustomer({ name: '', phone: '', balanceDue: '', notes: '' });
      setShowAddForm(false);
      showSuccess(`✅ ${created.name} added to ledger!`);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
  }

  // ── Edit Customer ─────────────────────────────────────────────
  async function handleUpdateCustomer(e) {
    e.preventDefault();
    if (!editingCustomer) return;
    try {
      const updated = await updateCustomer(shopId, editingCustomer.id, editingCustomer);
      setCustomers(prev => prev.map(c => c.id === updated.id ? updated : c));
      setEditingCustomer(null);
      showSuccess(`✅ ${updated.name} updated!`);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
  }

  // ── Delete Customer ───────────────────────────────────────────
  async function handleDeleteCustomer(customer) {
    if (!window.confirm(`Remove ${customer.name} from the customer ledger?`)) return;
    try {
      await deleteCustomer(shopId, customer.id);
      setCustomers(prev => prev.filter(c => c.id !== customer.id));
      setSelectedCustomerIds(prev => { const n = new Set(prev); n.delete(customer.id); return n; });
      showSuccess(`${customer.name} removed from ledger.`);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
  }

  // ── Template Tag Quick Insert ─────────────────────────────────
  function handleInsertTag(tag) {
    const textarea = bodyTextareaRef.current;
    if (!textarea) {
      setNewTpl(prev => ({ ...prev, body: prev.body + tag }));
      return;
    }
    const start = textarea.selectionStart || 0;
    const end = textarea.selectionEnd || 0;
    const text = newTpl.body;
    const before = text.substring(0, start);
    const after = text.substring(end, text.length);
    const nextBody = before + tag + after;

    setNewTpl(prev => ({ ...prev, body: nextBody }));

    // Set cursor position after the inserted tag
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + tag.length, start + tag.length);
    }, 0);
  }

  // ── Create Template ───────────────────────────────────────────
  async function handleCreateTemplate(e) {
    e.preventDefault();
    if (!newTpl.name.trim()) return alert('Please enter a template name.');
    if (!newTpl.body.trim()) return alert('Please write a message body.');

    setLoading(l => ({ ...l, creatingTpl: true }));
    setError(null);
    try {
      const created = await createTemplate({
        name: newTpl.name.trim(),
        category: newTpl.category,
        description: newTpl.description.trim() || `Custom ${newTpl.category} template`,
        body: newTpl.body.trim(),
        icon: newTpl.icon,
        submitToMeta: Boolean(newTpl.submitToMeta),
      }, shopId);

      loadTemplates();
      setSelectedTemplate(created);
      setShowCreateTplModal(false);
      setNewTpl({ name: '', category: 'promotion', description: '', body: '', icon: '📢', submitToMeta: true });
      showSuccess(`✅ Template "${created.name}" registered and submitted for Meta approval!`);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(l => ({ ...l, creatingTpl: false }));
    }
  }

  // ── Sync Templates from Meta ──────────────────────────────────
  async function handleSyncTemplates() {
    setLoading(l => ({ ...l, syncingTpls: true }));
    setError(null);
    try {
      const res = await getTemplates(shopId);
      const list = res.data || [];
      setTemplates(list);
      if (!selectedTemplate && list.length > 0) {
        setSelectedTemplate(list[0]);
      }
      showSuccess(`🎉 Synced ${list.length} template${list.length === 1 ? '' : 's'} live with Meta WhatsApp Cloud!`);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(l => ({ ...l, syncingTpls: false }));
    }
  }

  // ── Delete Template ───────────────────────────────────────────
  async function handleDeleteTemplate(tpl, e) {
    e.stopPropagation();
    if (!window.confirm(`Delete template "${tpl.name}"?`)) return;
    try {
      await deleteTemplate(tpl.id);
      setTemplates(prev => prev.filter(t => t.id !== tpl.id));
      if (selectedTemplate?.id === tpl.id) {
        setSelectedTemplate(templates[0] || null);
      }
      showSuccess(`Template deleted.`);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
  }

  // ── Send Notifications ────────────────────────────────────────
  async function handleSendSingle(customer) {
    if (!selectedTemplate) return alert('Please select a notification template first.');
    setLoading(l => ({ ...l, sending: true }));
    setError(null);
    try {
      if (deliveryMode === 'wame') {
        const result = await generateWALink(shopId, selectedTemplate.id, customer.id, extraVars, shopName);
        window.open(result.waLink, '_blank');
        showSuccess(`📲 WhatsApp opened for ${customer.name}!`);
      } else {
        await sendViaCloud(shopId, selectedTemplate.id, customer.id, extraVars, shopName);
        showSuccess(`✅ WhatsApp message sent to ${customer.name} via Cloud API!`);
      }
      setLastSentTime(Date.now());
      setCustomers(prev => prev.map(c => c.id === customer.id ? { ...c, lastReminder: new Date().toISOString() } : c));
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(l => ({ ...l, sending: false }));
    }
  }

  async function handleSendBulk() {
    if (!selectedTemplate) return alert('Please select a notification template first.');
    if (selectedCustomerIds.size === 0) return alert('Please select at least one customer.');
    if (!window.confirm(`Send "${selectedTemplate.name}" to ${selectedCustomerIds.size} customer(s)?`)) return;

    setLoading(l => ({ ...l, sending: true }));
    setError(null);
    try {
      if (deliveryMode === 'wame') {
        const results = await generateBulkLinks(shopId, selectedTemplate.id, [...selectedCustomerIds], extraVars, shopName);
        // Open each wa.me link with 800ms delay to avoid browser blocking
        results.forEach((r, i) => setTimeout(() => window.open(r.waLink, '_blank'), i * 800));
        showSuccess(`📲 Opening WhatsApp for ${results.length} customers!`);
      } else {
        for (const customerId of selectedCustomerIds) {
          await sendViaCloud(shopId, selectedTemplate.id, customerId, extraVars, shopName);
        }
        showSuccess(`✅ Messages sent to ${selectedCustomerIds.size} customers via Cloud API!`);
      }
      setLastSentTime(Date.now());
      setSelectedCustomerIds(new Set());
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(l => ({ ...l, sending: false }));
    }
  }

  // ── Message Preview ───────────────────────────────────────────
  function getPreview() {
    if (!selectedTemplate) return '';
    let body = selectedTemplate.body;
    const vars = { customerName: '{{Customer}}', shopName, ...extraVars };
    for (const [k, v] of Object.entries(vars)) {
      body = body.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), v || `{{${k}}}`);
    }
    return body;
  }

  function showSuccess(msg) {
    setSuccess(msg);
    setTimeout(() => setSuccess(null), 4000);
  }

  // ── Template dynamic variables (exclude customerName + shopName) ──
  const editableVars = selectedTemplate?.variables?.filter(v => v !== 'customerName' && v !== 'shopName') || [];

  const varLabels = {
    amount: '₹ Amount Due',
    dueDate: 'Due Date',
    daysPastDue: 'Days Overdue',
    offerDetails: 'Offer Details',
    validTill: 'Valid Till Date',
    festivalName: 'Festival Name',
    discountPercent: 'Discount %',
    orderDetails: 'Order Details',
    totalAmount: '₹ Total Amount',
  };

  return (
    <div className="wa-hub">
      {/* Toast Notifications */}
      {error && (
        <div className="wa-toast wa-toast--error" onClick={() => setError(null)}>
          ⚠️ {error}
        </div>
      )}
      {success && (
        <div className="wa-toast wa-toast--success">
          {success}
        </div>
      )}

      {/* Header */}
      <div className="wa-hub-header">
        <div className="wa-hub-header-left">
          <div className="wa-hub-icon">💬</div>
          <div>
            <h2 className="wa-hub-title">WhatsApp Notification Hub</h2>
            <p className="wa-hub-subtitle">
              Send payment reminders, offers & updates to {shopName}'s customers
            </p>
          </div>
        </div>

        {/* Delivery Mode Toggle */}
        <div className="wa-mode-toggle">
          <button
            type="button"
            className={`wa-mode-btn ${deliveryMode === 'wame' ? 'wa-mode-btn--active' : ''}`}
            onClick={() => { setDeliveryMode('wame'); localStorage.setItem(DELIVERY_MODE_KEY, 'wame'); }}
            title="Free — opens WhatsApp from shopkeeper's own number"
          >
            📲 wa.me (Free)
          </button>
          <button
            type="button"
            className={`wa-mode-btn ${deliveryMode === 'cloud' ? 'wa-mode-btn--active' : ''}`}
            onClick={() => { setDeliveryMode('cloud'); localStorage.setItem(DELIVERY_MODE_KEY, 'cloud'); }}
            title="Requires WhatsApp Business API setup in .env or 1-Click Connection"
          >
            ☁️ Cloud API
          </button>
        </div>
      </div>

      {/* ── WhatsApp Business Connection Banner (1-Click Embedded Signup) ── */}
      <div className={`wa-conn-banner ${waStatus.connected ? 'wa-conn-banner--active' : 'wa-conn-banner--idle'}`}>
        <div className="wa-conn-info">
          <div className="wa-conn-badge">
            <span className={`wa-status-dot ${waStatus.connected ? 'wa-status-dot--green' : 'wa-status-dot--yellow'}`} />
            <span className="wa-conn-label">
              {waStatus.connected
                ? `WhatsApp Business: ${waStatus.displayPhoneNumber || waStatus.verifiedName || 'Active Cloud API'}`
                : 'WhatsApp Cloud API: Connect your number for cold outbound sends'}
            </span>
          </div>
          <div className="wa-conn-subtext">
            {waStatus.connected
              ? `Automated notifications will dispatch directly via ${waStatus.verifiedName || shopName}'s official WhatsApp WABA.`
              : 'Shopkeeper can connect their WhatsApp number in 30 seconds with 1-Click Meta Login (no tokens or developer setup needed).'}
          </div>
        </div>

        <div className="wa-conn-actions">
          {waStatus.connected ? (
            <div className="wa-conn-btn-group">
              <button
                type="button"
                className="wa-btn-reconnect"
                onClick={() => {
                  setPhoneInput('');
                  setShowConnectModal(true);
                }}
                disabled={loading.oauth}
                title="Switch or re-link phone number"
              >
                🔄 Switch Number
              </button>
              <button
                type="button"
                className="wa-btn-disconnect"
                onClick={handleDisconnectWhatsApp}
              >
                Disconnect
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="wa-btn-connect-oauth"
              onClick={() => {
                setPhoneInput('');
                setShowConnectModal(true);
              }}
              disabled={loading.oauth}
            >
              ⚡ Connect WhatsApp Number
            </button>
          )}
        </div>
      </div>

      {/* ── Sub-Navigation Tabs ──────────────────────────────── */}
      <div className="wa-main-nav-tabs">
        <button
          type="button"
          className={`wa-main-nav-btn ${activeTab === 'composer' ? 'wa-main-nav-btn--active' : ''}`}
          onClick={() => setActiveTab('composer')}
        >
          ✉️ Notification Composer
        </button>
        <button
          type="button"
          className={`wa-main-nav-btn ${activeTab === 'history' ? 'wa-main-nav-btn--active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          📜 Message History & Live Status
        </button>
      </div>

      {activeTab === 'history' ? (
        <WhatsAppHistory shopId={shopId} shopName={shopName} lastSentTime={lastSentTime} />
      ) : (
        <div className="wa-hub-body">
          {/* ── LEFT PANEL: Customer Ledger ─────────────────────── */}
          <div className="wa-ledger-panel">
          <div className="wa-ledger-toolbar">
            <div className="wa-ledger-title-row">
              <span className="wa-ledger-title">👥 Customer Ledger</span>
              <span className="wa-ledger-count">{customers.length} contacts</span>
            </div>
            <div className="wa-ledger-actions">
              <input
                type="text"
                className="wa-search-input"
                placeholder="Search by name or phone..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
              <button
                type="button"
                className="wa-add-btn"
                onClick={() => setShowAddForm(true)}
              >
                ➕ Add
              </button>
            </div>
          </div>

          {/* Add Customer Form */}
          {showAddForm && (
            <form className="wa-add-form" onSubmit={handleAddCustomer}>
              <h4 className="wa-form-title">➕ New Customer</h4>
              <input
                className="wa-form-input"
                type="text"
                placeholder="Customer name *"
                value={newCustomer.name}
                onChange={e => setNewCustomer(p => ({ ...p, name: e.target.value }))}
                required
                autoFocus
              />
              <input
                className="wa-form-input"
                type="tel"
                placeholder="Phone number (e.g. 9876543210) *"
                value={newCustomer.phone}
                onChange={e => setNewCustomer(p => ({ ...p, phone: e.target.value }))}
                required
              />
              <input
                className="wa-form-input"
                type="number"
                placeholder="Balance due (₹)"
                value={newCustomer.balanceDue}
                onChange={e => setNewCustomer(p => ({ ...p, balanceDue: e.target.value }))}
              />
              <input
                className="wa-form-input"
                type="text"
                placeholder="Notes (optional)"
                value={newCustomer.notes}
                onChange={e => setNewCustomer(p => ({ ...p, notes: e.target.value }))}
              />
              <div className="wa-form-actions">
                <button type="submit" className="wa-form-save-btn">Save Customer</button>
                <button type="button" className="wa-form-cancel-btn" onClick={() => setShowAddForm(false)}>Cancel</button>
              </div>
            </form>
          )}

          {/* Select All Toggle */}
          {filteredCustomers.length > 0 && (
            <div className="wa-select-bar">
              <label className="wa-select-all-label">
                <input
                  type="checkbox"
                  checked={filteredCustomers.length > 0 && filteredCustomers.every(c => selectedCustomerIds.has(c.id))}
                  onChange={toggleAll}
                  className="wa-checkbox"
                />
                <span>Select All ({filteredCustomers.length})</span>
              </label>
              {selectedCustomerIds.size > 0 && (
                <button
                  type="button"
                  className="wa-bulk-send-btn"
                  onClick={handleSendBulk}
                  disabled={loading.sending}
                >
                  {loading.sending ? '📤 Sending…' : `📲 Send to ${selectedCustomerIds.size} Selected`}
                </button>
              )}
            </div>
          )}

          {/* Customer List */}
          <div className="wa-customer-list">
            {loading.customers ? (
              <div className="wa-loading">Loading customer ledger…</div>
            ) : filteredCustomers.length === 0 ? (
              <div className="wa-empty-ledger">
                <span className="wa-empty-icon">👥</span>
                <p>{searchQuery ? 'No customers match your search.' : 'No customers added yet.'}</p>
                {!searchQuery && (
                  <button type="button" className="wa-add-first-btn" onClick={() => setShowAddForm(true)}>
                    ➕ Add First Customer
                  </button>
                )}
              </div>
            ) : (
              filteredCustomers.map(customer => {
                const isSelected = selectedCustomerIds.has(customer.id);
                const isEditing = editingCustomer?.id === customer.id;
                const isOverdue = customer.balanceDue > 0;

                return (
                  <div
                    key={customer.id}
                    className={`wa-customer-card ${isSelected ? 'wa-customer-card--selected' : ''}`}
                  >
                    {isEditing ? (
                      <form className="wa-inline-edit" onSubmit={handleUpdateCustomer}>
                        <input className="wa-form-input" value={editingCustomer.name} onChange={e => setEditingCustomer(p => ({ ...p, name: e.target.value }))} placeholder="Name" required />
                        <input className="wa-form-input" value={editingCustomer.phone} onChange={e => setEditingCustomer(p => ({ ...p, phone: e.target.value }))} placeholder="Phone" required />
                        <input className="wa-form-input" type="number" value={editingCustomer.balanceDue} onChange={e => setEditingCustomer(p => ({ ...p, balanceDue: e.target.value }))} placeholder="Balance Due ₹" />
                        <div className="wa-form-actions">
                          <button type="submit" className="wa-form-save-btn">Save</button>
                          <button type="button" className="wa-form-cancel-btn" onClick={() => setEditingCustomer(null)}>Cancel</button>
                        </div>
                      </form>
                    ) : (
                      <>
                        <label className="wa-customer-check">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleCustomer(customer.id)}
                            className="wa-checkbox"
                          />
                        </label>

                        <div className="wa-customer-avatar">
                          {customer.name.charAt(0).toUpperCase()}
                        </div>

                        <div className="wa-customer-info">
                          <span className="wa-customer-name">{customer.name}</span>
                          <span className="wa-customer-phone">📞 +{customer.phone.startsWith('91') ? customer.phone : '91' + customer.phone}</span>
                          {customer.notes && <span className="wa-customer-notes">{customer.notes}</span>}
                          {customer.lastReminder && (
                            <span className="wa-customer-last-sent">
                              Last notified: {new Date(customer.lastReminder).toLocaleDateString()}
                            </span>
                          )}
                        </div>

                        <div className="wa-customer-right">
                          {customer.balanceDue > 0 && (
                            <span className="wa-balance-badge wa-balance-badge--due">
                              ₹{Number(customer.balanceDue).toLocaleString('en-IN')} due
                            </span>
                          )}
                          {customer.balanceDue === 0 && (
                            <span className="wa-balance-badge wa-balance-badge--clear">✅ Clear</span>
                          )}

                          <div className="wa-customer-actions">
                            <button
                              type="button"
                              className="wa-action-icon-btn wa-send-btn"
                              onClick={() => handleSendSingle(customer)}
                              disabled={loading.sending || !selectedTemplate}
                              title="Send WhatsApp notification"
                            >
                              📲
                            </button>
                            <button
                              type="button"
                              className="wa-action-icon-btn wa-edit-btn"
                              onClick={() => setEditingCustomer({ ...customer })}
                              title="Edit customer"
                            >
                              ✏️
                            </button>
                            <button
                              type="button"
                              className="wa-action-icon-btn wa-delete-btn"
                              onClick={() => handleDeleteCustomer(customer)}
                              title="Remove customer"
                            >
                              🗑️
                            </button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* ── RIGHT PANEL: Notification Composer ──────────────── */}
        <div className="wa-composer-panel">
          <div className="wa-composer-title-row">
            <span className="wa-composer-title">📋 Notification Composer</span>
            <span className="wa-composer-mode-label">
              Mode: {deliveryMode === 'wame' ? '📲 wa.me (Free)' : '☁️ Cloud API'}
            </span>
          </div>

          {/* Template Picker */}
          <div className="wa-templates-section">
            <div className="wa-templates-header">
              <div className="wa-section-label">SELECT TEMPLATE</div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button
                  type="button"
                  className="wa-sync-tpl-btn"
                  onClick={handleSyncTemplates}
                  disabled={loading.syncingTpls}
                  title="Fetch latest approved templates directly from Meta"
                >
                  {loading.syncingTpls ? '⏳ Syncing…' : '🔄 Sync from Meta'}
                </button>
                <button
                  type="button"
                  className="wa-create-tpl-btn"
                  onClick={() => setShowCreateTplModal(true)}
                >
                  ➕ Create Template
                </button>
              </div>
            </div>

            {templates.length === 0 ? (
              <div className="wa-templates-empty">
                <p>No templates registered yet on Meta WhatsApp Cloud API.</p>
                <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
                  <button
                    type="button"
                    className="wa-sync-tpl-btn"
                    onClick={handleSyncTemplates}
                    disabled={loading.syncingTpls}
                  >
                    {loading.syncingTpls ? '⏳ Syncing…' : '🔄 Sync from Meta'}
                  </button>
                  <button
                    type="button"
                    className="wa-create-tpl-btn"
                    onClick={() => setShowCreateTplModal(true)}
                  >
                    ➕ Create First Template
                  </button>
                </div>
              </div>
            ) : (
              <div className="wa-templates-grid">
                {templates.map(tpl => (
                  <div
                    key={tpl.id}
                    className={`wa-template-card ${selectedTemplate?.id === tpl.id ? 'wa-template-card--selected' : ''}`}
                    onClick={() => setSelectedTemplate(tpl)}
                  >
                    <div className="wa-template-card-top">
                      <span className="wa-template-icon">{tpl.name.split(' ')[0]}</span>
                      <button
                        type="button"
                        className="wa-tpl-delete-btn"
                        onClick={(e) => handleDeleteTemplate(tpl, e)}
                        title="Delete template from Meta WABA"
                      >
                        🗑️
                      </button>
                    </div>
                    <span className="wa-template-name">{tpl.name.slice(tpl.name.indexOf(' ') + 1)}</span>
                    <span className="wa-template-desc">{tpl.description}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Dynamic Variables Form */}
          {editableVars.length > 0 && (
            <div className="wa-vars-section">
              <div className="wa-section-label">FILL IN DETAILS</div>
              <div className="wa-vars-grid">
                {editableVars.map(varName => (
                  <div key={varName} className="wa-var-field">
                    <label className="wa-var-label">
                      {varLabels[varName] || varName}
                    </label>
                    <input
                      className="wa-var-input"
                      type="text"
                      placeholder={`Enter ${varLabels[varName] || varName}…`}
                      value={extraVars[varName] || ''}
                      onChange={e => setExtraVars(prev => ({ ...prev, [varName]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Live Message Preview */}
          <div className="wa-preview-section">
            <div className="wa-section-label">MESSAGE PREVIEW</div>
            <div className="wa-preview-bubble">
              <div className="wa-preview-header">
                <span className="wa-preview-from">{shopName}</span>
                <span className="wa-preview-time">Now</span>
              </div>
              <pre className="wa-preview-body">{getPreview()}</pre>
              <div className="wa-preview-tick">✓✓</div>
            </div>
          </div>

          {/* CTA */}
          <div className="wa-cta-section">
            {selectedCustomerIds.size > 0 ? (
              <button
                type="button"
                className="wa-cta-btn wa-cta-btn--bulk"
                onClick={handleSendBulk}
                disabled={loading.sending || !selectedTemplate}
              >
                {loading.sending
                  ? '📤 Sending…'
                  : `📲 Send to ${selectedCustomerIds.size} Selected Customer${selectedCustomerIds.size > 1 ? 's' : ''}`}
              </button>
            ) : (
              <div className="wa-cta-hint">
                ← Select customers from the ledger to send bulk notifications
              </div>
            )}
          </div>
        </div>
      </div>
      )}

      {/* ── CREATE TEMPLATE MODAL ─────────────────────────────── */}
      {showCreateTplModal && (
        <div className="wa-modal-overlay" onClick={() => setShowCreateTplModal(false)}>
          <div className="wa-modal" onClick={e => e.stopPropagation()}>
            <div className="wa-modal-header">
              <div className="wa-modal-title-box">
                <span className="wa-modal-icon">✨</span>
                <h3>Create New WhatsApp Template</h3>
              </div>
              <button
                type="button"
                className="wa-modal-close-btn"
                onClick={() => setShowCreateTplModal(false)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateTemplate} className="wa-modal-form">
              <div className="wa-modal-row">
                <div className="wa-modal-field">
                  <label className="wa-var-label">Icon / Emoji</label>
                  <div className="wa-emoji-picker">
                    {EMOJI_OPTIONS.map(emoji => (
                      <button
                        key={emoji}
                        type="button"
                        className={`wa-emoji-btn ${newTpl.icon === emoji ? 'wa-emoji-btn--selected' : ''}`}
                        onClick={() => setNewTpl(p => ({ ...p, icon: emoji }))}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="wa-modal-field">
                  <label className="wa-var-label">Category</label>
                  <select
                    className="wa-form-input"
                    value={newTpl.category}
                    onChange={e => setNewTpl(p => ({ ...p, category: e.target.value }))}
                  >
                    <option value="payment">💳 Payment</option>
                    <option value="promotion">🎉 Promotion / Offer</option>
                    <option value="order">📦 Order Update</option>
                    <option value="festival">🪔 Festival</option>
                    <option value="reminder">⏰ Reminder</option>
                    <option value="general">📢 General Announcement</option>
                  </select>
                </div>
              </div>

              <div className="wa-modal-field">
                <label className="wa-var-label">Template Name *</label>
                <input
                  type="text"
                  className="wa-form-input"
                  placeholder="e.g. Weekend Flash Sale or 50% Off On Kurti"
                  value={newTpl.name}
                  onChange={e => setNewTpl(p => ({ ...p, name: e.target.value }))}
                  required
                />
              </div>

              <div className="wa-modal-field">
                <label className="wa-var-label">Description (optional)</label>
                <input
                  type="text"
                  className="wa-form-input"
                  placeholder="Short note about when to use this template"
                  value={newTpl.description}
                  onChange={e => setNewTpl(p => ({ ...p, description: e.target.value }))}
                />
              </div>

              <div className="wa-modal-field">
                <div className="wa-field-header-row">
                  <label className="wa-var-label">Message Body *</label>
                  <span className="wa-tag-hint">Click a tag below to insert it at your cursor:</span>
                </div>

                {/* Quick Variable Insertion Pills */}
                <div className="wa-tags-bar">
                  {COMMON_TAGS.map(({ tag, label }) => (
                    <button
                      key={tag}
                      type="button"
                      className="wa-tag-pill"
                      onClick={() => handleInsertTag(tag)}
                      title={`Insert ${tag}`}
                    >
                      + {label} <span className="wa-tag-code">{tag}</span>
                    </button>
                  ))}
                </div>

                <textarea
                  ref={bodyTextareaRef}
                  className="wa-form-textarea"
                  rows={6}
                  placeholder={`Hello {{customerName}}! 👋\n\nWe have a special announcement from {{shopName}}...\n\nThank you! 🙏`}
                  value={newTpl.body}
                  onChange={e => setNewTpl(p => ({ ...p, body: e.target.value }))}
                  required
                />
              </div>

              {/* Submit to Meta Cloud Option */}
              <div className="wa-meta-opt-in">
                <label className="wa-checkbox-label">
                  <input
                    type="checkbox"
                    checked={Boolean(newTpl.submitToMeta)}
                    onChange={e => setNewTpl(p => ({ ...p, submitToMeta: e.target.checked }))}
                    className="wa-checkbox"
                  />
                  <span>☁️ Submit to Meta WhatsApp Cloud (Registers template directly with Meta for cold sends)</span>
                </label>
              </div>

              {/* Live Preview Inside Modal */}
              {newTpl.body.trim() && (
                <div className="wa-modal-preview">
                  <label className="wa-var-label">Live Message Preview</label>
                  <div className="wa-preview-bubble">
                    <div className="wa-preview-header">
                      <span className="wa-preview-from">{shopName}</span>
                      <span className="wa-preview-time">Now</span>
                    </div>
                    <pre className="wa-preview-body">
                      {newTpl.body
                        .replace(/\{\{customerName\}\}/g, 'Rahul Gupta')
                        .replace(/\{\{shopName\}\}/g, shopName)
                        .replace(/\{\{amount\}\}/g, '1,500')
                        .replace(/\{\{dueDate\}\}/g, '25-Aug-2026')
                        .replace(/\{\{offerDetails\}\}/g, 'Flat 20% OFF on all items')
                        .replace(/\{\{validTill\}\}/g, 'Sunday')
                        .replace(/\{\{discountPercent\}\}/g, '20')}
                    </pre>
                  </div>
                </div>
              )}

              <div className="wa-modal-actions">
                <button
                  type="submit"
                  className="wa-cta-btn wa-cta-btn--bulk"
                  disabled={loading.creatingTpl}
                >
                  {loading.creatingTpl ? 'Saving…' : '💾 Save Template'}
                </button>
                <button
                  type="button"
                  className="wa-form-cancel-btn"
                  onClick={() => setShowCreateTplModal(false)}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── CONNECT / SWITCH WHATSAPP MODAL ────────────────── */}
      {showConnectModal && (
        <div className="wa-modal-overlay" onClick={() => setShowConnectModal(false)}>
          <div className="wa-modal" onClick={e => e.stopPropagation()}>
            <div className="wa-modal-header">
              <div className="wa-modal-title-box">
                <span className="wa-modal-icon">📱</span>
                <h3>Connect / Switch WhatsApp Business Number</h3>
              </div>
              <button
                type="button"
                className="wa-modal-close-btn"
                onClick={() => setShowConnectModal(false)}
              >
                ✕
              </button>
            </div>

            <div className="wa-modal-form">
              {availableNumbers.length > 0 && (
                <div className="wa-modal-field">
                  <label className="wa-var-label">Select from your verified WhatsApp Business Numbers</label>
                  <div className="wa-avail-numbers-list">
                    {availableNumbers.map(num => (
                      <button
                        key={num.phoneNumberId}
                        type="button"
                        className={`wa-avail-num-card ${waStatus.phoneNumberId === num.phoneNumberId ? 'wa-avail-num-card--active' : ''}`}
                        onClick={(e) => handleConnectPhoneNumber(e, num)}
                        disabled={loading.oauth}
                      >
                        <div className="wa-avail-num-main">
                          <span className="wa-avail-num-phone">📱 {num.displayPhoneNumber}</span>
                          <span className="wa-avail-num-name">{num.verifiedName || 'WhatsApp Business'}</span>
                        </div>
                        <div className="wa-avail-num-meta">
                          <span className="wa-avail-num-badge">
                            {waStatus.phoneNumberId === num.phoneNumberId ? 'Active Now' : '⚡ Click to Connect'}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <form onSubmit={handleConnectPhoneNumber} className="wa-modal-manual-phone">
                <div className="wa-modal-field">
                  <label className="wa-var-label">Or enter your WhatsApp Mobile Number</label>
                  <div className="wa-phone-input-row">
                    <input
                      type="tel"
                      className="wa-form-input"
                      placeholder="e.g. 7814051127 or +91 78140 51127"
                      value={phoneInput}
                      onChange={e => setPhoneInput(e.target.value)}
                    />
                    <button
                      type="submit"
                      className="wa-cta-btn wa-cta-btn--bulk"
                      disabled={loading.oauth || !phoneInput.trim()}
                    >
                      {loading.oauth ? '⏳ Connecting…' : '⚡ Connect'}
                    </button>
                  </div>
                  <span className="wa-tag-hint">The system automatically discovers and links your official Meta WhatsApp Business account.</span>
                </div>
              </form>

              <div className="wa-modal-actions">
                <button
                  type="button"
                  className="wa-form-cancel-btn"
                  onClick={() => setShowConnectModal(false)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

