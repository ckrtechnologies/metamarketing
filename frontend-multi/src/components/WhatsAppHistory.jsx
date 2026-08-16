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
  const [showReportModal, setShowReportModal] = useState(false);

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

  const formatTimeOnly = (isoString) => {
    if (!isoString) return '';
    const d = new Date(isoString);
    return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  };

  // ── Export Delivery Report to CSV ────────────────────────────
  const handleExportCSV = () => {
    if (!history.items || history.items.length === 0) {
      alert('No message delivery data to export.');
      return;
    }

    const headers = [
      'Recipient Name',
      'Recipient Phone',
      'Template Name',
      'Channel',
      'Delivery Status',
      'Dispatched At',
      'Delivered At',
      'Read At',
      'Meta WAMID',
      'Failure Reason',
      'Rendered Message',
    ];

    const rows = history.items.map(m => [
      `"${(m.recipientName || '').replace(/"/g, '""')}"`,
      `"${(m.recipientPhone || '').replace(/"/g, '""')}"`,
      `"${(m.templateName || '').replace(/"/g, '""')}"`,
      `"${m.deliveryMode === 'cloud' ? 'Meta Cloud API' : 'wa.me'}"`,
      `"${(m.status || '').toUpperCase()}"`,
      `"${m.sentAt ? new Date(m.sentAt).toLocaleString('en-IN') : ''}"`,
      `"${m.deliveredAt ? new Date(m.deliveredAt).toLocaleString('en-IN') : ''}"`,
      `"${m.readAt ? new Date(m.readAt).toLocaleString('en-IN') : ''}"`,
      `"${(m.wamid || '').replace(/"/g, '""')}"`,
      `"${(m.errorMessage || '').replace(/"/g, '""')}"`,
      `"${(m.renderedBody || '').replace(/"/g, '""').replace(/\n/g, ' ')}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `WhatsApp_Delivery_Report_${shopName || 'Shop'}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const renderStatusBadge = (msg) => {
    switch (msg.status) {
      case 'read':
        return (
          <div className="wa-hist-status-col">
            <span className="wa-hist-badge wa-hist-badge--read" title={`Read at ${formatDate(msg.readAt)}`}>
              <span className="wa-tick wa-tick--read">✓✓</span> Read
            </span>
            {msg.readAt && <span className="wa-hist-status-sub">{formatTimeOnly(msg.readAt)}</span>}
          </div>
        );
      case 'delivered':
        return (
          <div className="wa-hist-status-col">
            <span className="wa-hist-badge wa-hist-badge--delivered" title={`Delivered to device at ${formatDate(msg.deliveredAt)}`}>
              <span className="wa-tick wa-tick--delivered">✓✓</span> Delivered
            </span>
            {msg.deliveredAt && <span className="wa-hist-status-sub">{formatTimeOnly(msg.deliveredAt)}</span>}
          </div>
        );
      case 'sent':
        return (
          <div className="wa-hist-status-col">
            <span className="wa-hist-badge wa-hist-badge--sent" title="Dispatched to Meta Cloud - Waiting for phone receipt">
              <span className="wa-tick wa-tick--sent">✓</span> Dispatched
            </span>
            <span className="wa-hist-status-sub">Awaiting Device</span>
          </div>
        );
      case 'failed':
        return (
          <div className="wa-hist-status-col">
            <span className="wa-hist-badge wa-hist-badge--failed" title={msg.errorMessage || 'Undelivered to phone'}>
              <span className="wa-tick wa-tick--failed">✕</span> Undelivered
            </span>
            {msg.errorMessage && <span className="wa-hist-status-sub wa-hist-status-sub--err">{msg.errorMessage}</span>}
          </div>
        );
      default:
        return <span className="wa-hist-badge">{msg.status}</span>;
    }
  };

  return (
    <div className="wa-history-module">
      {/* ── KPI METRICS CARDS & REPORT SUMMARY ──────────────── */}
      <div className="wa-hist-metrics-grid">
        <div className="wa-hist-metric-card">
          <div className="wa-hist-metric-icon">📤</div>
          <div className="wa-hist-metric-info">
            <span className="wa-hist-metric-val">{stats.total}</span>
            <span className="wa-hist-metric-label">Total Dispatched</span>
          </div>
        </div>

        <div className="wa-hist-metric-card">
          <div className="wa-hist-metric-icon wa-hist-metric-icon--green">📬</div>
          <div className="wa-hist-metric-info">
            <span className="wa-hist-metric-val">{stats.delivered + stats.read}</span>
            <span className="wa-hist-metric-label">Confirmed Delivered ({stats.deliveryRate}%)</span>
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
            <span className="wa-hist-metric-label">Undelivered / Failed</span>
          </div>
        </div>
      </div>

      {/* ── DELIVERY DIAGNOSTIC BANNER ────────────────────── */}
      {stats.sent > 0 && stats.delivered === 0 && (
        <div style={{
          background: 'rgba(234, 179, 8, 0.1)',
          border: '1px solid rgba(234, 179, 8, 0.25)',
          borderRadius: '10px',
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          color: '#fef08a',
          fontSize: '12.5px',
          gap: '12px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '18px' }}>⚠️</span>
            <span>
              <strong>{stats.sent} messages are currently queued (Awaiting Device):</strong> Meta Cloud API accepted the request, but delivery to customer phones is held because sender display name for <code>+91 89209 32354</code> was rejected on Meta WhatsApp Manager.
            </span>
          </div>
          <button
            type="button"
            className="wa-report-action-btn"
            onClick={() => setShowReportModal(true)}
            style={{ flexShrink: 0, padding: '4px 10px', fontSize: '11.5px' }}
          >
            📊 View Full Report
          </button>
        </div>
      )}

      {/* ── CONTROLS & FILTER BAR ──────────────────────────── */}
      <div className="wa-hist-toolbar">
        <div className="wa-hist-filter-tabs">
          {[
            { id: 'all', label: 'All Messages', count: stats.total },
            { id: 'sent', label: 'Dispatched', count: stats.sent },
            { id: 'delivered', label: 'Delivered', count: stats.delivered },
            { id: 'read', label: 'Read', count: stats.read },
            { id: 'failed', label: 'Undelivered', count: stats.failed },
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

        <div className="wa-hist-actions-bar">
          <button
            type="button"
            className="wa-report-action-btn"
            onClick={() => setShowReportModal(true)}
            title="View full delivery analytics report"
          >
            📊 Delivery Report
          </button>
          <button
            type="button"
            className="wa-report-action-btn wa-report-action-btn--export"
            onClick={handleExportCSV}
            title="Download delivery logs as CSV"
          >
            📥 Export CSV
          </button>
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
              title="Refresh delivery report"
              disabled={loading}
            >
              {loading ? '⏳' : '🔄'}
            </button>
          </div>
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

      {/* ── DELIVERY REPORT & AUDIT MODAL ────────────────────── */}
      {showReportModal && (
        <div className="wa-modal-overlay" onClick={() => setShowReportModal(false)}>
          <div className="wa-modal wa-report-modal" onClick={e => e.stopPropagation()}>
            <div className="wa-modal-header">
              <div className="wa-modal-title-box">
                <span className="wa-modal-icon">📊</span>
                <h3>WhatsApp Delivery Performance & Audit Report</h3>
              </div>
              <button
                type="button"
                className="wa-modal-close-btn"
                onClick={() => setShowReportModal(false)}
              >
                ✕
              </button>
            </div>

            <div className="wa-hist-modal-body">
              <div className="wa-report-summary-box">
                <div className="wa-report-kpi">
                  <span className="wa-report-kpi-val">{stats.total}</span>
                  <span className="wa-report-kpi-label">Total Dispatched</span>
                </div>
                <div className="wa-report-kpi wa-report-kpi--green">
                  <span className="wa-report-kpi-val">{stats.delivered + stats.read}</span>
                  <span className="wa-report-kpi-label">Confirmed Delivered ({stats.deliveryRate}%)</span>
                </div>
                <div className="wa-report-kpi wa-report-kpi--blue">
                  <span className="wa-report-kpi-val">{stats.read}</span>
                  <span className="wa-report-kpi-label">Read / Seen ({stats.readRate}%)</span>
                </div>
                <div className="wa-report-kpi wa-report-kpi--red">
                  <span className="wa-report-kpi-val">{stats.failed}</span>
                  <span className="wa-report-kpi-label">Undelivered ({stats.total > 0 ? Math.round((stats.failed / stats.total) * 100) : 0}%)</span>
                </div>
              </div>

              <div className="wa-report-section-title">Delivery Status Explanations</div>
              <div className="wa-report-guide-grid">
                <div className="wa-report-guide-item">
                  <div className="wa-report-guide-badge"><span className="wa-tick wa-tick--sent">✓</span> Dispatched</div>
                  <p>Successfully processed by Meta's Cloud servers. Handed over to telecom/WhatsApp carrier for delivery.</p>
                </div>
                <div className="wa-report-guide-item">
                  <div className="wa-report-guide-badge"><span className="wa-tick wa-tick--delivered">✓✓</span> Delivered</div>
                  <p>Packet physically delivered to the recipient's phone (phone is online and connected).</p>
                </div>
                <div className="wa-report-guide-item">
                  <div className="wa-report-guide-badge"><span className="wa-tick wa-tick--read">✓✓</span> Read</div>
                  <p>The recipient opened the chat and viewed the message contents.</p>
                </div>
                <div className="wa-report-guide-item">
                  <div className="wa-report-guide-badge"><span className="wa-tick wa-tick--failed">✕</span> Undelivered</div>
                  <p>Message could not reach recipient (e.g. invalid number, phone off &gt;24h, blocked, or unapproved display name).</p>
                </div>
              </div>

              <div className="wa-modal-actions" style={{ justifyContent: 'space-between', marginTop: '20px' }}>
                <button
                  type="button"
                  className="wa-report-action-btn wa-report-action-btn--export"
                  onClick={handleExportCSV}
                >
                  📥 Export Full CSV Report
                </button>
                <button
                  type="button"
                  className="wa-form-cancel-btn"
                  onClick={() => setShowReportModal(false)}
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
