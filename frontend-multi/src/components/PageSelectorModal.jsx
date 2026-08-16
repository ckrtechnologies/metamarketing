import { useState } from 'react';
import './PageSelectorModal.css';

export default function PageSelectorModal({ user, pages, onSelectPage, onClose }) {
  const [selectedPageId, setSelectedPageId] = useState(pages[0]?.pageId || null);
  const [customShopName, setCustomShopName] = useState(pages[0]?.pageName || '');
  const [loading, setLoading] = useState(false);

  function handlePageClick(page) {
    setSelectedPageId(page.pageId);
    setCustomShopName(page.pageName);
  }

  function handleConfirm() {
    const page = pages.find(p => p.pageId === selectedPageId);
    if (!page) return;
    setLoading(true);
    onSelectPage(user, page, customShopName);
  }

  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <div className="modal-header">
          <div>
            <h2 className="modal-title">Select Your Shop Page</h2>
            <p className="modal-subtitle">
              Welcome, <strong>{user?.name}</strong>! Choose the Facebook Page and Instagram account for your shop.
            </p>
          </div>
          {onClose && (
            <button type="button" className="modal-close" onClick={onClose}>
              ✕
            </button>
          )}
        </div>

        <div className="page-list">
          {pages.map(page => {
            const isSelected = page.pageId === selectedPageId;
            return (
              <div
                key={page.pageId}
                className={`page-card ${isSelected ? 'page-card--selected' : ''}`}
                onClick={() => handlePageClick(page)}
              >
                <input
                  type="radio"
                  name="selected_page"
                  checked={isSelected}
                  onChange={() => handlePageClick(page)}
                  className="page-radio"
                />

                <img
                  src={page.pictureUrl || 'https://via.placeholder.com/48'}
                  alt=""
                  className="page-avatar"
                />

                <div className="page-meta">
                  <div className="page-title-row">
                    <span className="page-name">{page.pageName}</span>
                    <span className="page-cat-badge">{page.category || 'Business'}</span>
                  </div>

                  <div className="page-stats-row">
                    <span className="stat-item">📘 {page.fanCount?.toLocaleString()} FB followers</span>
                    {page.instagram ? (
                      <span className="stat-item stat-item--ig">
                        📸 @{page.instagram.username} ({page.instagram.followersCount?.toLocaleString()} followers)
                      </span>
                    ) : (
                      <span className="stat-item stat-item--warn">⚠️ No Instagram Linked</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="shop-name-input-group">
          <label className="input-label" htmlFor="shop-name">Display Name for your Shop:</label>
          <input
            id="shop-name"
            type="text"
            className="text-input"
            value={customShopName}
            onChange={e => setCustomShopName(e.target.value)}
            placeholder="e.g. Sharma Electronics"
          />
        </div>

        <div className="modal-footer">
          <button
            type="button"
            className="confirm-btn"
            onClick={handleConfirm}
            disabled={!selectedPageId || loading}
          >
            {loading ? <span className="btn-spinner" /> : '🚀 Launch Shop Dashboard'}
          </button>
        </div>
      </div>
    </div>
  );
}
