import './ShopSwitcher.css';

export default function ShopSwitcher({ shops, activeShopId, onSelectShop, onAddNewShop, onClose, onDeleteShop }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card switcher-card" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="switcher-header">
          <div className="switcher-header-left">
            <div className="switcher-icon-wrap">
              <span className="switcher-main-icon">🏬</span>
            </div>
            <div>
              <h2 className="switcher-title">Switch Shop Profile</h2>
              <p className="switcher-subtitle">
                Select a connected business to manage or connect a new shopkeeper.
              </p>
            </div>
          </div>
          <button type="button" className="switcher-close-btn" onClick={onClose} title="Close modal">
            ✕
          </button>
        </div>

        {/* Shop List */}
        <div className="switcher-body">
          <div className="switcher-section-title">
            <span>CONNECTED SHOPS ({shops.length})</span>
          </div>

          <div className="switcher-list">
            {shops.map(shop => {
              const isActive = shop.id === activeShopId;
              const hasFb = Boolean(shop.facebook?.pageName);
              const hasIg = Boolean(shop.instagram?.username);

              return (
                <div
                  key={shop.id}
                  className={`switcher-item ${isActive ? 'switcher-item--active' : ''}`}
                  onClick={() => onSelectShop(shop.id)}
                >
                  {/* Avatar */}
                  <div className="switcher-avatar-wrap">
                    {shop.facebook?.pictureUrl ? (
                      <img
                        src={shop.facebook.pictureUrl}
                        alt={shop.shopName}
                        className="switcher-avatar"
                      />
                    ) : (
                      <div className="switcher-avatar-fallback">🏬</div>
                    )}
                    {isActive && <span className="switcher-online-dot" title="Currently Active" />}
                  </div>

                  {/* Details */}
                  <div className="switcher-info">
                    <div className="switcher-name-row">
                      <span className="switcher-name">{shop.shopName}</span>
                      {isActive ? (
                        <span className="active-pill">
                          <span className="active-pill-dot" /> Active
                        </span>
                      ) : (
                        <span className="merchant-label">Owner: {shop.ownerName || 'Merchant'}</span>
                      )}
                    </div>

                    <div className="switcher-badges-row">
                      {hasFb && (
                        <span className="switcher-badge switcher-badge--fb">
                          📘 {shop.facebook.pageName}
                          {shop.facebook.fanCount ? ` (${shop.facebook.fanCount.toLocaleString()})` : ''}
                        </span>
                      )}
                      {hasIg ? (
                        <span className="switcher-badge switcher-badge--ig">
                          📸 @{shop.instagram.username}
                          {shop.instagram.followersCount ? ` (${shop.instagram.followersCount.toLocaleString()})` : ''}
                        </span>
                      ) : (
                        <span className="switcher-badge switcher-badge--muted">📸 No IG</span>
                      )}
                    </div>
                  </div>

                  {/* Action Indicator */}
                  <div className="switcher-action-wrap">
                    {isActive ? (
                      <span className="active-check-icon" title="Active">✓</span>
                    ) : (
                      <span className="switch-to-btn">Switch →</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer CTA */}
        <div className="switcher-footer">
          <button
            type="button"
            className="connect-new-shop-btn"
            onClick={onAddNewShop}
          >
            <span className="btn-plus-icon">➕</span>
            <span className="btn-text">Connect Another Shop / Facebook Page</span>
          </button>
        </div>
      </div>
    </div>
  );
}
