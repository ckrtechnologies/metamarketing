import './ShopSwitcher.css';

export default function ShopSwitcher({ shops, activeShopId, onSelectShop, onAddNewShop, onClose }) {
  return (
    <div className="modal-backdrop">
      <div className="modal-card switcher-card">
        <div className="modal-header">
          <div>
            <h2 className="modal-title">Switch Shop Profile</h2>
            <p className="modal-subtitle">Select which connected shop to manage or connect a new shopkeeper.</p>
          </div>
          <button type="button" className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="switcher-list">
          {shops.map(shop => {
            const isActive = shop.id === activeShopId;
            return (
              <div
                key={shop.id}
                className={`switcher-item ${isActive ? 'switcher-item--active' : ''}`}
                onClick={() => onSelectShop(shop.id)}
              >
                <img
                  src={shop.facebook?.pictureUrl || 'https://via.placeholder.com/44'}
                  alt=""
                  className="switcher-avatar"
                />
                <div className="switcher-info">
                  <div className="switcher-name-row">
                    <span className="switcher-name">{shop.shopName}</span>
                    {isActive && <span className="active-badge">Active</span>}
                  </div>
                  <span className="switcher-meta">
                    📘 {shop.facebook?.pageName} {shop.instagram && `· 📸 @${shop.instagram.username}`}
                  </span>
                </div>
                <span className="switcher-arrow">→</span>
              </div>
            );
          })}
        </div>

        <div className="switcher-footer">
          <button
            type="button"
            className="add-new-shop-btn"
            onClick={onAddNewShop}
          >
            ➕ Connect Another Shop
          </button>
        </div>
      </div>
    </div>
  );
}
