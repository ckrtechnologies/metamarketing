import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  getConversations,
  getChatMessages,
  sendChatReply,
  markChatRead,
  getCustomers,
  getTemplates,
} from '../api/whatsapp';
import './WhatsAppMessenger.css';

export default function WhatsAppMessenger({ shopId, shopName, activePhone }) {
  const [conversations, setConversations] = useState([]);
  const [selectedPhone, setSelectedPhone] = useState(null);
  const [activeThread, setActiveThread] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);
  const [search, setSearch] = useState('');
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [extraVars, setExtraVars] = useState({});

  const messagesEndRef = useRef(null);

  // ── Scroll to bottom of chat ─────────────────────────────────
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // ── Load Conversation List ───────────────────────────────────
  const loadConversations = useCallback(async () => {
    if (!shopId) return;
    try {
      const list = await getConversations(shopId, { search });
      setConversations(list || []);
      if (!selectedPhone && list && list.length > 0) {
        setSelectedPhone(list[0].customerPhone);
      }
    } catch (err) {
      console.error('[WhatsAppMessenger] Failed to load conversations:', err);
    } finally {
      setLoadingList(false);
    }
  }, [shopId, search, selectedPhone]);

  // ── Load Customer Ledger and Templates ───────────────────────
  useEffect(() => {
    if (!shopId) return;
    getCustomers(shopId).then(setCustomers).catch(() => {});
    getTemplates(shopId).then(res => {
      const safe = Array.isArray(res) ? res : res?.data || [];
      setTemplates(safe);
    }).catch(() => {});
  }, [shopId]);

  useEffect(() => {
    loadConversations();
    const interval = setInterval(() => {
      loadConversations();
    }, 3000);
    return () => clearInterval(interval);
  }, [loadConversations]);

  // ── Load Selected Thread ─────────────────────────────────────
  const loadThread = useCallback(async (phone) => {
    if (!shopId || !phone) return;
    try {
      const thread = await getChatMessages(shopId, phone);
      setActiveThread(thread);
      // Mark read
      if (thread?.unreadCount > 0) {
        markChatRead(shopId, phone).then(() => {
          setConversations(prev =>
            prev.map(c => (c.customerPhone === phone ? { ...c, unreadCount: 0 } : c))
          );
        });
      }
    } catch (err) {
      console.error('[WhatsAppMessenger] Failed to load thread:', err);
    } finally {
      setLoadingThread(false);
    }
  }, [shopId]);

  useEffect(() => {
    if (selectedPhone) {
      loadThread(selectedPhone);
      const threadInterval = setInterval(() => {
        loadThread(selectedPhone);
      }, 3000);
      return () => clearInterval(threadInterval);
    }
  }, [selectedPhone, loadThread]);

  useEffect(() => {
    scrollToBottom();
  }, [activeThread?.messages?.length]);

  // ── Send Freeform Reply ──────────────────────────────────────
  const handleSendText = async (e) => {
    if (e) e.preventDefault();
    if (!replyText.trim() || !selectedPhone || sending) return;

    setSending(true);
    const textToSend = replyText.trim();
    setReplyText('');

    try {
      const customer = customers.find(c => c.phone?.replace(/\D/g, '').endsWith(selectedPhone));
      const res = await sendChatReply(shopId, {
        customerPhone: selectedPhone,
        text: textToSend,
        customerName: customer?.name || activeThread?.customerName || 'Customer',
      });

      if (res.success) {
        loadThread(selectedPhone);
        loadConversations();
      }
    } catch (err) {
      alert(`Failed to dispatch WhatsApp reply: ${err.response?.data?.error || err.message}`);
    } finally {
      setSending(false);
    }
  };

  // ── Send Template Reply ──────────────────────────────────────
  const handleSendTemplate = async () => {
    if (!selectedTemplateId || !selectedPhone || sending) return;
    setSending(true);

    try {
      const customer = customers.find(c => c.phone?.replace(/\D/g, '').endsWith(selectedPhone));
      const res = await sendChatReply(shopId, {
        customerPhone: selectedPhone,
        templateId: selectedTemplateId,
        extraVars,
        customerName: customer?.name || activeThread?.customerName || 'Customer',
      });

      if (res.success) {
        setShowTemplateModal(false);
        setSelectedTemplateId('');
        setExtraVars({});
        loadThread(selectedPhone);
        loadConversations();
      }
    } catch (err) {
      alert(`Failed to send WhatsApp template: ${err.response?.data?.error || err.message}`);
    } finally {
      setSending(false);
    }
  };

  // ── Quick Reply Shortcut ─────────────────────────────────────
  const handleQuickReply = (text) => {
    setReplyText(text);
  };

  // ── Start Chat with Customer ─────────────────────────────────
  const handleStartNewChat = (cust) => {
    const p = cust.phone.replace(/\D/g, '').slice(-10);
    setSelectedPhone(p);
    setShowNewChatModal(false);
  };

  // ── Format Timestamps ────────────────────────────────────────
  const formatMsgTime = (isoString) => {
    if (!isoString) return '';
    const d = new Date(isoString);
    return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  };

  const formatThreadDate = (isoString) => {
    if (!isoString) return '';
    const d = new Date(isoString);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
    }
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  };

  const selectedTemplate = templates.find(t => t.id === selectedTemplateId || t.metaName === selectedTemplateId);

  return (
    <div className="wa-messenger-app">
      {/* ── LEFT SIDEBAR (CONVERSATIONS LIST) ───────────────── */}
      <div className="wa-msg-sidebar">
        <div className="wa-msg-sidebar-header">
          <div className="wa-msg-account-badge">
            <span className="wa-msg-online-dot"></span>
            <div className="wa-msg-acc-meta">
              <span className="wa-msg-acc-name">{shopName || 'WhatsApp Live Inbox'}</span>
              <span className="wa-msg-acc-phone">{activePhone?.displayPhone || '+91 78140 51127'}</span>
            </div>
          </div>
          <div className="wa-msg-header-btns">
            <button
              type="button"
              className="wa-msg-icon-btn"
              onClick={() => setShowNewChatModal(true)}
              title="Start New Chat"
            >
              ➕
            </button>
            <button
              type="button"
              className="wa-msg-icon-btn"
              onClick={loadConversations}
              title="Refresh Inbox"
            >
              🔄
            </button>
          </div>
        </div>

        <div className="wa-msg-search-wrap">
          <span className="wa-msg-search-icon">🔍</span>
          <input
            type="text"
            className="wa-msg-search-input"
            placeholder="Search chats by name or phone…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <div className="wa-msg-conversations-list">
          {loadingList ? (
            <div className="wa-msg-loading-state">
              <div className="wa-hist-spinner"></div>
              <span>Loading messages…</span>
            </div>
          ) : conversations.length === 0 ? (
            <div className="wa-msg-empty-threads">
              <span>📭</span>
              <p>No conversations yet</p>
              <button
                type="button"
                className="wa-msg-start-btn"
                onClick={() => setShowNewChatModal(true)}
              >
                Start New Chat
              </button>
            </div>
          ) : (
            conversations.map(c => {
              const isSelected = c.customerPhone === selectedPhone;
              return (
                <div
                  key={c.id}
                  className={`wa-msg-thread-item ${isSelected ? 'wa-msg-thread-item--active' : ''}`}
                  onClick={() => setSelectedPhone(c.customerPhone)}
                >
                  <div className="wa-msg-avatar">
                    {(c.customerName || 'C').charAt(0).toUpperCase()}
                    {c.isWindowOpen && <span className="wa-msg-avatar-window-dot" title="24h Active Care Window"></span>}
                  </div>
                  <div className="wa-msg-thread-info">
                    <div className="wa-msg-thread-top">
                      <span className="wa-msg-thread-name">{c.customerName || `Customer (${c.customerPhone})`}</span>
                      <span className="wa-msg-thread-time">{formatThreadDate(c.lastMessageAt)}</span>
                    </div>
                    <div className="wa-msg-thread-bottom">
                      <span className="wa-msg-thread-snippet">
                        {c.lastMessage || 'No messages'}
                      </span>
                      {c.unreadCount > 0 && (
                        <span className="wa-msg-unread-badge">{c.unreadCount}</span>
                      )}
                    </div>
                    {c.isWindowOpen && (
                      <div className="wa-msg-window-tag">
                        🟢 24h Window ({c.windowRemainingMinutes}m left)
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ── RIGHT CHAT PANE ─────────────────────────────────── */}
      <div className="wa-msg-chat-pane">
        {!selectedPhone ? (
          <div className="wa-msg-no-selection">
            <div className="wa-msg-no-sel-icon">💬</div>
            <h3>WhatsApp Live Messenger</h3>
            <p>Select a customer conversation from the left to read and reply to messages in real-time.</p>
            <button
              type="button"
              className="wa-msg-primary-btn"
              onClick={() => setShowNewChatModal(true)}
            >
              ➕ Start New Customer Chat
            </button>
          </div>
        ) : (
          <>
            {/* ── CHAT HEADER ───────────────────────────────── */}
            <div className="wa-msg-chat-header">
              <div className="wa-msg-chat-header-user">
                <div className="wa-msg-avatar wa-msg-avatar--lg">
                  {(activeThread?.customerName || 'C').charAt(0).toUpperCase()}
                </div>
                <div>
                  <h4 className="wa-msg-chat-title">{activeThread?.customerName || 'Customer'}</h4>
                  <span className="wa-msg-chat-phone">+91 {selectedPhone}</span>
                </div>
              </div>

              <div className="wa-msg-chat-header-status">
                {activeThread?.isWindowOpen ? (
                  <span className="wa-msg-status-tag wa-msg-status-tag--open" title="Freeform text replies enabled">
                    🟢 Active 24h Session ({activeThread.windowRemainingMinutes}m remaining)
                  </span>
                ) : (
                  <span className="wa-msg-status-tag wa-msg-status-tag--closed" title="Meta requires an approved template to reopen window">
                    🔒 24h Window Closed
                  </span>
                )}
                <button
                  type="button"
                  className="wa-msg-header-action-btn"
                  onClick={() => setShowTemplateModal(true)}
                  title="Send official template"
                >
                  📋 Send Template
                </button>
              </div>
            </div>

            {/* ── 24-HOUR CARE BANNER ───────────────────────── */}
            {activeThread?.isWindowOpen ? (
              <div className="wa-msg-session-banner wa-msg-session-banner--active">
                ⚡ <strong>Customer Care Window Active:</strong> You can send direct free-form WhatsApp replies to this customer.
              </div>
            ) : (
              <div className="wa-msg-session-banner wa-msg-session-banner--expired">
                ⚠️ <strong>24-Hour Window Closed:</strong> More than 24 hours have passed since the customer's last message. Meta requires sending an <strong>Official Approved Template</strong> to reopen the chat.
              </div>
            )}

            {/* ── MESSAGE BUBBLE STREAM ─────────────────────── */}
            <div className="wa-msg-stream">
              {loadingThread && !activeThread ? (
                <div className="wa-msg-loading-state">
                  <div className="wa-hist-spinner"></div>
                  <span>Loading chat history…</span>
                </div>
              ) : activeThread?.messages?.length === 0 ? (
                <div className="wa-msg-empty-chat">
                  <span>👋</span>
                  <h4>No messages yet</h4>
                  <p>Send a WhatsApp message or template to begin this conversation.</p>
                </div>
              ) : (
                activeThread?.messages?.map(msg => {
                  const isOut = msg.direction === 'outbound';
                  return (
                    <div
                      key={msg.id}
                      className={`wa-msg-bubble-wrap ${isOut ? 'wa-msg-bubble-wrap--out' : 'wa-msg-bubble-wrap--in'}`}
                    >
                      <div className={`wa-msg-bubble ${isOut ? 'wa-msg-bubble--out' : 'wa-msg-bubble--in'}`}>
                        {msg.templateName && (
                          <div className="wa-msg-bubble-template-tag">
                            ☁️ Template: {msg.templateName}
                          </div>
                        )}
                        <p className="wa-msg-bubble-text">{msg.text}</p>
                        <div className="wa-msg-bubble-footer">
                          <span className="wa-msg-bubble-time">{formatMsgTime(msg.timestamp)}</span>
                          {isOut && (
                            <span className="wa-msg-bubble-ticks">
                              {msg.status === 'read' ? (
                                <span className="wa-tick wa-tick--read">✓✓</span>
                              ) : msg.status === 'delivered' ? (
                                <span className="wa-tick wa-tick--delivered">✓✓</span>
                              ) : msg.status === 'failed' ? (
                                <span className="wa-tick wa-tick--failed">✕</span>
                              ) : (
                                <span className="wa-tick wa-tick--sent">✓</span>
                              )}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* ── QUICK REPLIES BAR ─────────────────────────── */}
            <div className="wa-msg-quick-bar">
              <span className="wa-msg-quick-label">⚡ Quick:</span>
              {[
                'Thank you! We received your message.',
                'Your payment is confirmed. Thank you!',
                'How can we help you today?',
                'We are reviewing your request.',
              ].map((q, idx) => (
                <button
                  key={idx}
                  type="button"
                  className="wa-msg-quick-chip"
                  onClick={() => handleQuickReply(q)}
                >
                  {q}
                </button>
              ))}
            </div>

            {/* ── INPUT COMPOSER ────────────────────────────── */}
            <form className="wa-msg-composer" onSubmit={handleSendText}>
              <button
                type="button"
                className="wa-msg-template-btn"
                onClick={() => setShowTemplateModal(true)}
                title="Choose Meta Template"
              >
                📋 Template
              </button>
              <textarea
                className="wa-msg-input"
                placeholder={
                  activeThread?.isWindowOpen
                    ? 'Type a WhatsApp reply… (Press Enter to send)'
                    : '24h window closed — click Template to send an approved template'
                }
                value={replyText}
                onChange={e => setReplyText(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendText();
                  }
                }}
                rows={1}
                disabled={sending}
              />
              <button
                type="submit"
                className="wa-msg-send-btn"
                disabled={!replyText.trim() || sending}
                title="Send Message"
              >
                {sending ? '⏳' : '➤'}
              </button>
            </form>
          </>
        )}
      </div>

      {/* ── NEW CHAT MODAL ─────────────────────────────────── */}
      {showNewChatModal && (
        <div className="wa-modal-overlay" onClick={() => setShowNewChatModal(false)}>
          <div className="wa-modal wa-msg-select-modal" onClick={e => e.stopPropagation()}>
            <div className="wa-modal-header">
              <div className="wa-modal-title-box">
                <span className="wa-modal-icon">👥</span>
                <h3>Select Customer to Message</h3>
              </div>
              <button
                type="button"
                className="wa-modal-close-btn"
                onClick={() => setShowNewChatModal(false)}
              >
                ✕
              </button>
            </div>
            <div className="wa-msg-select-list">
              {customers.length === 0 ? (
                <div className="wa-msg-empty-threads">
                  <p>No customers found in ledger. Add a customer in Notification Composer first.</p>
                </div>
              ) : (
                customers.map(cust => (
                  <div
                    key={cust.id}
                    className="wa-msg-customer-select-item"
                    onClick={() => handleStartNewChat(cust)}
                  >
                    <div className="wa-msg-avatar">
                      {cust.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="wa-msg-cust-meta">
                      <strong>{cust.name}</strong>
                      <span>{cust.phone}</span>
                    </div>
                    <button type="button" className="wa-msg-chat-open-btn">
                      Chat 💬
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── TEMPLATE SENDER MODAL ──────────────────────────── */}
      {showTemplateModal && (
        <div className="wa-modal-overlay" onClick={() => setShowTemplateModal(false)}>
          <div className="wa-modal wa-msg-template-modal" onClick={e => e.stopPropagation()}>
            <div className="wa-modal-header">
              <div className="wa-modal-title-box">
                <span className="wa-modal-icon">📋</span>
                <h3>Send Official Meta WhatsApp Template</h3>
              </div>
              <button
                type="button"
                className="wa-modal-close-btn"
                onClick={() => setShowTemplateModal(false)}
              >
                ✕
              </button>
            </div>

            <div className="wa-msg-modal-body">
              <label className="wa-field-label">Choose Approved Template</label>
              <div className="wa-msg-tpl-grid">
                {templates.map(tpl => (
                  <div
                    key={tpl.id}
                    className={`wa-msg-tpl-card ${selectedTemplateId === tpl.id ? 'wa-msg-tpl-card--selected' : ''}`}
                    onClick={() => setSelectedTemplateId(tpl.id)}
                  >
                    <strong>{tpl.name}</strong>
                    <p>{tpl.body}</p>
                    <span className="wa-msg-tpl-status">{tpl.metaStatus || 'APPROVED'}</span>
                  </div>
                ))}
              </div>

              {selectedTemplate && selectedTemplate.variables?.length > 1 && (
                <div className="wa-msg-vars-section">
                  <label className="wa-field-label">Fill Template Variables</label>
                  {selectedTemplate.variables.slice(1).map(v => (
                    <div key={v} className="wa-msg-var-row">
                      <span>{v}:</span>
                      <input
                        type="text"
                        placeholder={`Value for ${v}`}
                        value={extraVars[v] || ''}
                        onChange={e => setExtraVars({ ...extraVars, [v]: e.target.value })}
                      />
                    </div>
                  ))}
                </div>
              )}

              <div className="wa-modal-actions" style={{ marginTop: '20px' }}>
                <button
                  type="button"
                  className="wa-form-cancel-btn"
                  onClick={() => setShowTemplateModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="wa-msg-primary-btn"
                  disabled={!selectedTemplateId || sending}
                  onClick={handleSendTemplate}
                >
                  {sending ? 'Sending…' : 'Send Template to Customer ➤'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
