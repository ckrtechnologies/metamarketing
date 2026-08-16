import { useState, useEffect, useCallback } from 'react';
import ShopConnect from './components/ShopConnect';
import PageSelectorModal from './components/PageSelectorModal';
import ShopHeader from './components/ShopHeader';
import ShopComposer from './components/ShopComposer';
import ShopFeeds from './components/ShopFeeds';
import ShopSwitcher from './components/ShopSwitcher';
import {
  listShops,
  getShopProfile,
  handleOAuthCallback,
  connectShopPage,
  deleteShop,
} from './api/auth';
import './App.css';

export default function App() {
  const [shops, setShops] = useState([]);
  const [activeShopId, setActiveShopId] = useState(
    () => localStorage.getItem('active_shop_id') || null
  );
  const [activeShop, setActiveShop] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Modal states
  const [discoveryData, setDiscoveryData] = useState(null); // { user, pages }
  const [showPageSelector, setShowPageSelector] = useState(false);
  const [showSwitcher, setShowSwitcher] = useState(false);

  // ── Handle OAuth Callback from redirect or popup ────────────
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');

    if (code) {
      // If this window is a popup, notify the opener
      if (window.opener) {
        window.opener.postMessage({ type: 'META_OAUTH_CODE', code }, window.location.origin);
        window.close();
        return;
      }

      // If full page redirect, process code directly
      window.history.replaceState({}, document.title, window.location.pathname);
      processOAuthCode(code);
    }
  }, []);

  // ── Load Registered Shops ───────────────────────────────────
  const loadShops = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listShops();
      setShops(data || []);

      const savedId = localStorage.getItem('active_shop_id');
      const validShop = data?.find(s => s.id === savedId) || data?.[0];

      if (validShop) {
        setActiveShopId(validShop.id);
        localStorage.setItem('active_shop_id', validShop.id);
        try {
          const profile = await getShopProfile(validShop.id);
          setActiveShop(profile);
        } catch (profileErr) {
          console.warn('Could not fetch live profile, using stored shop data:', profileErr);
          setActiveShop(validShop);
        }
      } else {
        setActiveShop(null);
        localStorage.removeItem('active_shop_id');
      }
    } catch (err) {
      console.error('Failed to load shops:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadShops();
  }, [loadShops, refreshTrigger]);

  // ── Process OAuth Code ──────────────────────────────────────
  async function processOAuthCode(code) {
    setLoading(true);
    try {
      const redirectUri = `${window.location.origin}/oauth/callback`;
      const discovery = await handleOAuthCallback(code, redirectUri);
      setDiscoveryData(discovery);
      setShowPageSelector(true);
    } catch (err) {
      console.error('OAuth exchange error:', err);
      alert('Failed to connect Facebook account: ' + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  }

  // ── Confirm Page Selection ──────────────────────────────────
  async function handleSelectPage(user, selectedPage, shopName) {
    setLoading(true);
    try {
      const registeredShop = await connectShopPage({
        user,
        selectedPage,
        shopName,
      });

      setShowPageSelector(false);
      setDiscoveryData(null);
      setActiveShopId(registeredShop.id);
      localStorage.setItem('active_shop_id', registeredShop.id);
      setRefreshTrigger(n => n + 1);
    } catch (err) {
      console.error('Failed to connect page:', err);
      alert('Failed to save shop: ' + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  }

  // ── Switch Active Shop ──────────────────────────────────────
  async function handleSwitchShop(shopId) {
    setActiveShopId(shopId);
    localStorage.setItem('active_shop_id', shopId);
    setShowSwitcher(false);

    // Immediate local switch for fast UX
    const localShop = shops.find(s => s.id === shopId);
    if (localShop) {
      setActiveShop(localShop);
    }

    setLoading(true);
    try {
      const profile = await getShopProfile(shopId);
      setActiveShop(profile);
      setRefreshTrigger(n => n + 1);
    } catch (e) {
      console.warn('Error fetching live shop profile on switch, keeping cached data:', e);
      if (localShop) {
        setActiveShop(localShop);
        setRefreshTrigger(n => n + 1);
      }
    } finally {
      setLoading(false);
    }
  }

  // ── Disconnect Shop ─────────────────────────────────────────
  async function handleDisconnectShop() {
    if (!activeShopId) return;
    if (!window.confirm(`Are you sure you want to disconnect ${activeShop?.shopName}?`)) return;

    try {
      await deleteShop(activeShopId);
      localStorage.removeItem('active_shop_id');
      setActiveShopId(null);
      setActiveShop(null);
      setRefreshTrigger(n => n + 1);
    } catch (err) {
      alert('Failed to disconnect: ' + err.message);
    }
  }

  const currentShopKey = activeShop?.id || activeShop?.shopId || activeShopId || 'default';

  return (
    <div className="app-root">
      {/* If no active shop connected, show onboarding */}
      {!activeShop && !loading && (
        <ShopConnect
          onStartConnecting={processOAuthCode}
          onUseExistingShop={handleSwitchShop}
          existingShops={shops}
        />
      )}

      {/* Main Dashboard for Connected Shop */}
      {activeShop && (
        <div className="dashboard-container" key={currentShopKey}>
          <ShopHeader
            key={`header_${currentShopKey}`}
            shop={activeShop}
            onOpenSwitcher={() => setShowSwitcher(true)}
            onDisconnect={handleDisconnectShop}
          />

          <div className="dashboard-grid">
            <div className="composer-column">
              <ShopComposer
                key={`composer_${currentShopKey}`}
                shop={activeShop}
                onPosted={() => setRefreshTrigger(n => n + 1)}
              />
            </div>

            <div className="feeds-column">
              <ShopFeeds
                key={`feeds_${currentShopKey}`}
                shop={activeShop}
                refreshTrigger={refreshTrigger}
              />
            </div>
          </div>
        </div>
      )}

      {/* Page Selector Modal after OAuth Login */}
      {showPageSelector && discoveryData && (
        <PageSelectorModal
          user={discoveryData.user}
          pages={discoveryData.pages}
          onSelectPage={handleSelectPage}
          onClose={() => setShowPageSelector(false)}
        />
      )}

      {/* Switcher Modal */}
      {showSwitcher && (
        <ShopSwitcher
          shops={shops}
          activeShopId={activeShopId}
          onSelectShop={handleSwitchShop}
          onAddNewShop={() => {
            setShowSwitcher(false);
            setActiveShop(null);
          }}
          onClose={() => setShowSwitcher(false)}
        />
      )}
    </div>
  );
}
