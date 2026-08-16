import { useState, useEffect, useCallback } from 'react';
import { getMessageHistory, getHistoryStats } from '../api/whatsapp';
import './WhatsAppHistory.css';

export default function WhatsAppHistory({ shopId, shopName, lastSentTime }) {
  const [history, setHistory] = useState({ items: [], total: 0 });
  const [stats, setStats] = useState({ total: 0, sent: 0, delivered: 0, read: 0, failed: 0, deliveryRate: 0, readRate: 0 });
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedMessage, setSelectedMessage] = useState(null);

  const loadData = useCallback(async () => {
    if (!shopId) return;
    setLoading(true);
    try {
      const [histData, statsData] = await Promise.all([
        getMessageHistory(shopId, { status: statusFilter, search }),
        getHistoryStats(shopId),
      ]);
      setHistory(histData || { items: [], total: 0 });
      setStats(statsData || { total: 0, sent: 0, delivered: 0, read: 0, failed: 0, deliveryRate: 0, readRate: 0 });
    } catch (err) {
      console.error('[WhatsAppHistory] Failed to load history:', err);
    } finally {
      setLoading(false);
    }
  }, [shopId, statusFilter, search]);

  useEffect(() => {
    loadData();
  }, [loadData, lastSentTime]);

  const formatDate = (isoString) => {
    if (!isoString) return '—';
    const d = new Date(isoString);
    return d.toLocaleString('en-IN', {
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const renderStatusBadge = (msg) => {
    switch (msg.status) {
      case 'read':
        return (
          <span className="wa-hist-badge wa-hist-badge--read" title="Message read by customer">
            <span className="wa-tick wa-tick--read">✓✓</span> Read
          </span>
        );
      case 'delivered':
        return (
          <span className="wa-hist-badge wa-hist-badge--delivered" title="Delivered to customer's phone">
            <span className="wa-tick wa-tick--delivered">✓✓</span> Delivered
          </span>
        );
      case 'sent':
        return (
          <span className="wa-hist-badge wa-hist-badge--sent" title="Dispatched from Meta server">
            <span className="wa-tick wa-tick--sent">✓</span> Sent
          </span>
        );
      case 'failed':
        return (
          <span className="wa-hist-badge wa-hist-badge--failed" title={msg.errorMessage || 'Message delivery failed'}>
            <span className="wa-tick wa-tick--failed">✕</span> Failed
          </span>
        );
      default:
        return <span className="wa-hist-badge">{msg.status}</span>;
    }
  };

  return (
    <div className="wa-history-module">
      {/* ── KPI METRICS CARDS ──────────────────────────────── */}
      <div className="wa-hist-metrics-grid">
        <div className="wa-hist-metric-card">
          <div className="wa-hist-metric-icon">📤</div>
          <div className="wa-hist-metric-info">
            <span className="wa-hist-metric-val">{stats.total}</span>
            <span className="wa-hist-metric-label">Total Messages</span>
          </div>
        </div>

        <div className="wa-hist-metric-card">
          <div className="wa-hist-metric-icon wa-hist-metric-icon--green">📬</div>
          <div className="wa-hist-metric-info">
            <span className="wa-hist-metric-val">{stats.delivered + stats.read}</span>
            <span className="wa-hist-metric-label">Delivered ({stats.deliveryRate}%)</span>
          </div>
        </div>

        <div className="wa-hist-metric-card">
          <div className="wa-hist-metric-icon wa-hist-metric-icon--blue">👁️</div>
          <div className="wa-hist-metric-info">
            <span className="wa-hist-metric-val">{stats.read}</span>
            <span className="wa-hist-metric-label">Read / Seen ({stats.readRate}%)</span>
          </div>
        </div>

        <div className="wa-hist-metric-card">
          <div className="wa-hist-metric-icon wa-hist-metric-icon--red">⚠️</div>
          <div className="wa-hist-metric-info">
            <span className="wa-hist-metric-val">{stats.failed}</span>
            <span className="wa-hist-metric-label">Failed Deliveries</span>
          </div>
        </div>
      </div>

      {/* ── CONTROLS & FILTER BAR ──────────────────────────── */}
      <div className="wa-hist-toolbar">
        <div className="wa-hist-filter-tabs">
          {[
            { id: 'all', label: 'All Messages', count: stats.total },
            { id: 'sent', label: 'Sent', count: stats.sent },
            { id: 'delivered', label: 'Delivered', count: stats.delivered },
            { id: 'read', label: 'Read', count: stats.read },
            { id: 'failed', label: 'Failed', count: stats.failed },
          ].map(tab => (
            <button
              key={tab.id}
              type="button"
              className={`wa-hist-tab-btn ${statusFilter === tab.id ? 'wa-hist-tab-btn--active' : ''}`}
              onClick={() => setStatusFilter(tab.id)}
            >
              {tab.label} <span className="wa-hist-tab-count">{tab.count}</span>
            </button>
          ))}
        </div>

        <div className="wa-hist-search-box">
          <span className="wa-hist-search-icon">🔍</span>
          <input
            type="text"
            className="wa-hist-search-input"
            placeholder="Search by customer, phone, or template…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button type="button" className="wa-hist-clear-search" onClick={() => setSearch('')}>
              ✕
            </button>
          )}
          <button
            type="button"
            className="wa-hist-refresh-btn"
            onClick={loadData}
            title="Refresh history"
            disabled={loading}
          >
            {loading ? '⏳' : '🔄'}
          </button>
        </div>
      </div>

      {/* ── HISTORY TABLE ──────────────────────────────────── */}
      <div className="wa-hist-table-container">
        {loading && history.items.length === 0 ? (
          <div className="wa-hist-empty">
            <div className="wa-hist-spinner"></div>
            <p>Loading message history…</p>
          </div>
        ) : history.items.length === 0 ? (
          <div className="wa-hist-empty">
            <span className="wa-hist-empty-icon">📭</span>
            <h4>No Messages Found</h4>
            <p>
              {statusFilter !== 'all' || search
                ? 'No messages match your current filters.'
                : 'Send your first WhatsApp notification to see real-time delivery logs here!'}
            </p>
          </div>
        ) : (
          <table className="wa-hist-table">
            <thead>
              <tr>
                <th>Recipient</th>
                <th>Template / Type</th>
                <th>Message Content</th>
                <th>Channel</th>
                <th>Status</th>
                <th>Dispatched At</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {history.items.map(msg => (
                <tr key={msg.id} className="wa-hist-row" onClick={() => setSelectedMessage(msg)}>
                  <td className="wa-hist-cell-user">
                    <span className="wa-hist-user-name">{msg.recipientName}</span>
                    <span className="wa-hist-user-phone">{msg.recipientPhone}</span>
                  </td>
                  <td className="wa-hist-cell-template">
                    <span className="wa-hist-tpl-badge">{msg.templateName}</span>
                  </td>
                  <td className="wa-hist-cell-preview">
                    <span className="wa-hist-preview-text">{msg.renderedBody}</span>
                  </td>
                  <td>
                    <span className={`wa-hist-channel-tag wa-hist-channel-tag--${msg.deliveryMode}`}>
                      {msg.deliveryMode === 'cloud' ? '⚡ Cloud API' : '🔗 wa.me Link'}
                    </span>
                  </td>
                  <td>{renderStatusBadge(msg)}</td>
                  <td className="wa-hist-cell-time">{formatDate(msg.sentAt)}</td>
                  <td>
                    <button
                      type="button"
                      className="wa-hist-view-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedMessage(msg);
                      }}
                    >
                      View 👁️
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── MESSAGE DETAIL MODAL ───────────────────────────── */}
      {selectedMessage && (
        <div className="wa-modal-overlay" onClick={() => setSelectedMessage(null)}>
          <div className="wa-modal wa-hist-modal" onClick={e => e.stopPropagation()}>
            <div className="wa-modal-header">
              <div className="wa-modal-title-box">
                <span className="wa-modal-icon">📱</span>
                <h3>WhatsApp Notification Log</h3>
              </div>
              <button
                type="button"
                className="wa-modal-close-btn"
                onClick={() => setSelectedMessage(null)}
              >
                ✕
              </button>
            </div>

            <div className="wa-hist-modal-body">
              <div className="wa-hist-detail-grid">
                <div className="wa-hist-detail-item">
                  <span className="wa-hist-detail-label">Recipient</span>
                  <span className="wa-hist-detail-val">{selectedMessage.recipientName} ({selectedMessage.recipientPhone})</span>
                </div>
                <div className="wa-hist-detail-item">
                  <span className="wa-hist-detail-label">Template</span>
                  <span className="wa-hist-detail-val">{selectedMessage.templateName}</span>
                </div>
                <div className="wa-hist-detail-item">
                  <span className="wa-hist-detail-label">Delivery Channel</span>
                  <span className="wa-hist-detail-val">
                    {selectedMessage.deliveryMode === 'cloud' ? 'Meta WhatsApp Cloud API (Automated)' : 'wa.me Deep Link (Browser Direct)'}
                  </span>
                </div>
                <div className="wa-hist-detail-item">
                  <span className="wa-hist-detail-label">Current Status</span>
                  <span className="wa-hist-detail-val">{renderStatusBadge(selectedMessage)}</span>
                </div>
                {selectedMessage.wamid && (
                  <div className="wa-hist-detail-item wa-hist-detail-item--full">
                    <span className="wa-hist-detail-label">Meta Message ID (WAMID)</span>
                    <code className="wa-hist-detail-code">{selectedMessage.wamid}</code>
                  </div>
                )}
                {selectedMessage.errorMessage && (
                  <div className="wa-hist-detail-item wa-hist-detail-item--full wa-hist-detail-item--error">
                    <span className="wa-hist-detail-label">Failure Reason</span>
                    <span className="wa-hist-error-text">{selectedMessage.errorMessage}</span>
                  </div>
                )}
              </div>

              <div className="wa-hist-bubble-preview">
                <span className="wa-hist-bubble-title">Rendered WhatsApp Bubble</span>
                <div className="wa-phone-bubble">
                  <p>{selectedMessage.renderedBody}</p>
                  <div className="wa-phone-bubble-meta">
                    <span>{new Date(selectedMessage.sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    {selectedMessage.status === 'read' && <span className="wa-phone-tick wa-phone-tick--read">✓✓</span>}
                    {selectedMessage.status === 'delivered' && <span className="wa-phone-tick wa-phone-tick--delivered">✓✓</span>}
                    {selectedMessage.status === 'sent' && <span className="wa-phone-tick">✓</span>}
                  </div>
                </div>
              </div>

              <div className="wa-modal-actions">
                <button
                  type="button"
                  className="wa-form-cancel-btn"
                  onClick={() => setSelectedMessage(null)}
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
