const authService = require('../services/authService');
const shopRepo = require('../repositories/shopRepository');

// ── GET /api/auth/facebook/url ────────────────────────────────
exports.getOAuthUrl = async (req, res) => {
  try {
    const redirectUri = req.query.redirectUri || 'http://localhost:5174/oauth/callback';
    const state = req.query.state || 'default';
    const url = authService.getFacebookAuthUrl(redirectUri, state);
    res.json({ success: true, url });
  } catch (err) {
    console.error('getOAuthUrl error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

// ── POST /api/auth/facebook/callback ──────────────────────────
exports.handleOAuthCallback = async (req, res) => {
  try {
    const { code, redirectUri } = req.body;
    if (!code) {
      return res.status(400).json({ success: false, error: 'OAuth code is required.' });
    }

    const callbackUri = redirectUri || 'http://localhost:5174/oauth/callback';
    const longLivedUserToken = await authService.exchangeCodeForLongLivedToken(code, callbackUri);
    const discovery = await authService.fetchEligiblePagesAndInstagram(longLivedUserToken);

    res.json({
      success: true,
      data: discovery, // { user, pages: [ { pageId, pageName, pageAccessToken, instagram } ] }
    });
  } catch (err) {
    console.error('OAuth callback error:', err.response?.data || err.message);
    res.status(500).json({
      success: false,
      error: err.response?.data?.error?.message || err.message,
    });
  }
};

// ── POST /api/auth/connect-page ───────────────────────────────
exports.connectShopPage = async (req, res) => {
  try {
    const { user, selectedPage, shopName } = req.body;
    if (!selectedPage || !selectedPage.pageId || !selectedPage.pageAccessToken) {
      return res.status(400).json({ success: false, error: 'Valid selectedPage with token is required.' });
    }

    const registeredShop = authService.registerOrUpdateShop(user || {}, selectedPage, shopName);
    res.json({ success: true, shop: registeredShop });
  } catch (err) {
    console.error('connectShopPage error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

// ── GET /api/auth/shops ───────────────────────────────────────
exports.listShops = async (req, res) => {
  try {
    const shops = shopRepo.getAllShops();
    res.json({ success: true, count: shops.length, data: shops });
  } catch (err) {
    console.error('listShops error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

// ── GET /api/auth/shops/:shopId ───────────────────────────────
exports.getShop = async (req, res) => {
  try {
    const shop = shopRepo.findShopById(req.params.shopId);
    if (!shop) {
      return res.status(404).json({ success: false, error: 'Shop not found' });
    }
    res.json({ success: true, data: shopRepo.sanitizeShop(shop) });
  } catch (err) {
    console.error('getShop error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

// ── DELETE /api/auth/shops/:shopId ────────────────────────────
exports.deleteShop = async (req, res) => {
  try {
    shopRepo.deleteShop(req.params.shopId);
    res.json({ success: true, message: 'Shop disconnected successfully.' });
  } catch (err) {
    console.error('deleteShop error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};
