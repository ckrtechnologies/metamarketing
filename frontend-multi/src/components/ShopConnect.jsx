import { useState } from 'react';
import { fetchOAuthUrl } from '../api/auth';
import './ShopConnect.css';

export default function ShopConnect({ onStartConnecting, onUseExistingShop, existingShops = [] }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handleConnect() {
    setLoading(true);
    setError(null);
    try {
      const redirectUri = `${window.location.origin}/oauth/callback`;
      const url = await fetchOAuthUrl(redirectUri);

      // Open Meta OAuth popup
      const width = 650;
      const height = 750;
      const left = window.screen.width / 2 - width / 2;
      const top = window.screen.height / 2 - height / 2;

      const popup = window.open(
        url,
        'MetaOAuthPopup',
        `toolbar=no, location=no, directories=no, status=no, menubar=no, scrollbars=yes, resizable=yes, copyhistory=no, width=${width}, height=${height}, top=${top}, left=${left}`
      );

      // Listen for message from popup or redirect
      window.addEventListener('message', function onMessage(event) {
        if (event.origin !== window.location.origin) return;
        if (event.data?.type === 'META_OAUTH_CODE') {
          window.removeEventListener('message', onMessage);
          if (popup && !popup.closed) popup.close();
          onStartConnecting(event.data.code);
        }
      });
    } catch (err) {
      console.error('OAuth start error:', err);
      setError(err.response?.data?.error || err.message || 'Failed to start Facebook Login');
      setLoading(false);
    }
  }

  return (
    <div className="connect-hero">
      <div className="connect-card">
        <div className="connect-card__badge">
          <span className="connect-badge-dot" /> Multi-Tenant Meta Hub
        </div>

        <div className="connect-card__header">
          <div className="connect-icons">
            <span className="connect-icon connect-icon--fb">
              <svg viewBox="0 0 24 24" fill="#1877F2" width="28" height="28">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
              </svg>
            </span>
            <span className="connect-icon-plus">+</span>
            <span className="connect-icon connect-icon--ig">📸</span>
          </div>

          <h1 className="connect-title">Connect Your Shop</h1>
          <p className="connect-subtitle">
            Publish products, photos, videos, and Reels directly to your Facebook Page & Instagram Business account with 1 click.
          </p>
        </div>

        <div className="connect-features">
          <div className="connect-feature-item">
            <span className="feat-icon">✨</span>
            <div>
              <strong>Zero technical setup</strong>
              <p>No tokens or page IDs needed. Just sign in with your Facebook credentials.</p>
            </div>
          </div>
          <div className="connect-feature-item">
            <span className="feat-icon">🔀</span>
            <div>
              <strong>1-Click Cross-Posting</strong>
              <p>Post updates and Reels to Facebook and Instagram simultaneously.</p>
            </div>
          </div>
          <div className="connect-feature-item">
            <span className="feat-icon">📊</span>
            <div>
              <strong>Live Follower Stats</strong>
              <p>Real-time follower counts, engagement stats, and live content grid.</p>
            </div>
          </div>
        </div>

        {error && (
          <div className="connect-error">
            ⚠️ {error}
          </div>
        )}

        <button
          className="connect-btn"
          onClick={handleConnect}
          disabled={loading}
          type="button"
        >
          {loading ? <span className="btn-spinner" /> : '🔵'}
          {loading ? 'Connecting to Meta…' : 'Connect with Facebook & Instagram'}
        </button>

        <p className="connect-footnote">
          🔒 Secure OAuth 2.0 authorization provided directly by Meta.
        </p>

        {existingShops.length > 0 && (
          <div className="existing-shops-section">
            <span className="existing-shops-title">Or continue with a registered shop:</span>
            <div className="existing-shops-list">
              {existingShops.map(shop => (
                <button
                  key={shop.id}
                  type="button"
                  className="existing-shop-chip"
                  onClick={() => onUseExistingShop(shop.id)}
                >
                  <img
                    src={shop.facebook?.pictureUrl || 'https://via.placeholder.com/32'}
                    alt=""
                    className="shop-chip-avatar"
                  />
                  <div className="shop-chip-info">
                    <span className="shop-chip-name">{shop.shopName}</span>
                    <span className="shop-chip-sub">@{shop.instagram?.username || shop.facebook?.pageName}</span>
                  </div>
                  <span className="shop-chip-arrow">→</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
