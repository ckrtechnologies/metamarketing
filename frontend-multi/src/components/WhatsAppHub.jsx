import { useState, useEffect, useCallback } from 'react';
import {
  getTemplates, getCustomers, addCustomer,
  updateCustomer, deleteCustomer, generateWALink,
  generateBulkLinks, sendViaCloud,
} from '../api/whatsapp';
import './WhatsAppHub.css';

const DELIVERY_MODE_KEY = 'wa_delivery_mode';

export default function WhatsAppHub({ shop }) {
  const shopId = shop?.id || shop?.shopId;
  const shopName = shop?.shopName || shop?.facebook?.pageName || 'Shop';

  // ── State ────────────────────────────────────────────────────
  const [templates, setTemplates] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [selectedCustomerIds, setSelectedCustomerIds] = useState(new Set());
  const [extraVars, setExtraVars] = useState({});
  const [deliveryMode, setDeliveryMode] = useState(() => localStorage.getItem(DELIVERY_MODE_KEY) || 'wame');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState({ customers: true, sending: false });
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [newCustomer, setNewCustomer] = useState({ name: '', phone: '', balanceDue: '', notes: '' });

  // ── Load Data ─────────────────────────────────────────────────
  const loadCustomers = useCallback(() => {
    if (!shopId) return;
    setLoading(l => ({ ...l, customers: true }));
    getCustomers(shopId)
      .then(setCustomers)
      .catch(e => setError(e.response?.data?.error || e.message))
      .finally(() => setLoading(l => ({ ...l, customers: false })));
  }, [shopId]);

  useEffect(() => {
    getTemplates().then(tpls => {
      setTemplates(tpls);
      if (tpls.length > 0) setSelectedTemplate(tpls[0]);
    }).catch(console.error);
    loadCustomers();
  }, [loadCustomers]);

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
            title="Requires WhatsApp Business API setup in .env"
          >
            ☁️ Cloud API
          </button>
        </div>
      </div>

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
            <div className="wa-section-label">SELECT TEMPLATE</div>
            <div className="wa-templates-grid">
              {templates.map(tpl => (
                <button
                  key={tpl.id}
                  type="button"
                  className={`wa-template-card ${selectedTemplate?.id === tpl.id ? 'wa-template-card--selected' : ''}`}
                  onClick={() => setSelectedTemplate(tpl)}
                >
                  <span className="wa-template-icon">{tpl.name.split(' ')[0]}</span>
                  <span className="wa-template-name">{tpl.name.slice(tpl.name.indexOf(' ') + 1)}</span>
                  <span className="wa-template-desc">{tpl.description}</span>
                </button>
              ))}
            </div>
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
    </div>
  );
}
