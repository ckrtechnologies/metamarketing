import './ShopHeader.css';

export default function ShopHeader({ shop, onOpenSwitcher, onDisconnect }) {
  if (!shop) return null;

  return (
    <header className="shop-header">
      <div className="shop-identity">
        <div className="shop-avatar-cluster">
          {shop.facebook?.pictureUrl ? (
            <img
              src={shop.facebook.pictureUrl}
              alt={shop.shopName}
              className="shop-main-avatar"
            />
          ) : (
            <div className="shop-main-avatar shop-main-avatar--placeholder">🏬</div>
          )}
          <span className="shop-status-dot" title="Live & Connected" />
        </div>

        <div className="shop-details">
          <div className="shop-title-row">
            <h1 className="shop-name">{shop.shopName}</h1>
            <span className="shop-owner-badge">Owner: {shop.ownerName || 'Merchant'}</span>
          </div>

          <div className="shop-platforms-row">
            {/* Facebook Badge */}
            <div className="platform-pill platform-pill--fb">
              <span className="pill-icon">📘</span>
              <span className="pill-name">{shop.facebook?.pageName}</span>
              <span className="pill-followers">{shop.facebook?.fanCount?.toLocaleString() ?? 0} fans</span>
            </div>

            {/* Instagram Badge */}
            {shop.instagram ? (
              <div className="platform-pill platform-pill--ig">
                <span className="pill-icon">📸</span>
                <span className="pill-name">@{shop.instagram.username}</span>
                <span className="pill-followers">{shop.instagram.followersCount?.toLocaleString() ?? 0} followers</span>
              </div>
            ) : (
              <div className="platform-pill platform-pill--warn">
                <span>📸 No Instagram Connected</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="shop-header-actions">
        <button
          type="button"
          className="header-action-btn header-action-btn--switch"
          onClick={onOpenSwitcher}
          title="Switch to another shop"
        >
          🔄 Switch Shop
        </button>

        <button
          type="button"
          className="header-action-btn header-action-btn--disconnect"
          onClick={onDisconnect}
          title="Disconnect this shop"
        >
          🚪 Disconnect
        </button>
      </div>
    </header>
  );
}
