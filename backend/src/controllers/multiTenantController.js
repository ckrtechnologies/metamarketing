const multiTenantService = require('../services/multiTenantService');

// Middleware helper to extract shopId from header or params
function getShopId(req) {
  return req.headers['x-shop-id'] || req.params.shopId || req.query.shopId;
}

// ── GET /api/v2/shops/:shopId/profile ─────────────────────────
exports.getProfile = async (req, res) => {
  try {
    const shopId = getShopId(req);
    if (!shopId) return res.status(400).json({ success: false, error: 'x-shop-id header or param is required.' });

    const profile = await multiTenantService.getLiveShopProfile(shopId);
    res.json({ success: true, data: profile });
  } catch (err) {
    console.error('getProfile error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

// ── GET /api/v2/shops/:shopId/feeds ───────────────────────────
exports.getFeeds = async (req, res) => {
  try {
    const shopId = getShopId(req);
    if (!shopId) return res.status(400).json({ success: false, error: 'x-shop-id header or param is required.' });

    const limit = parseInt(req.query.limit) || 12;
    const feeds = await multiTenantService.getShopFeeds(shopId, limit);
    res.json({ success: true, data: feeds });
  } catch (err) {
    console.error('getFeeds error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

// ── POST /api/v2/posts/text ───────────────────────────────────
exports.postText = async (req, res) => {
  try {
    const shopId = getShopId(req);
    const { message } = req.body;
    if (!shopId) return res.status(400).json({ success: false, error: 'x-shop-id header or param is required.' });
    if (!message) return res.status(400).json({ success: false, error: 'Message is required.' });

    const result = await multiTenantService.publishTextPost(shopId, message);
    res.json({ success: true, data: result });
  } catch (err) {
    console.error('postText error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

// ── POST /api/v2/posts/link ───────────────────────────────────
exports.postLink = async (req, res) => {
  try {
    const shopId = getShopId(req);
    const { message, link } = req.body;
    if (!shopId) return res.status(400).json({ success: false, error: 'x-shop-id header is required.' });
    if (!link) return res.status(400).json({ success: false, error: 'Link URL is required.' });

    const result = await multiTenantService.publishLinkPost(shopId, message || '', link);
    res.json({ success: true, data: result });
  } catch (err) {
    console.error('postLink error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

// ── POST /api/v2/posts/photo ──────────────────────────────────
exports.postPhoto = async (req, res) => {
  try {
    const shopId = getShopId(req);
    if (!shopId) return res.status(400).json({ success: false, error: 'x-shop-id header is required.' });
    if (!req.file) return res.status(400).json({ success: false, error: 'Image file is required.' });

    const message = req.body.message || '';
    const postToFb = req.body.postToFb !== 'false' && req.body.postToFb !== false;
    const postToIg = req.body.postToIg === 'true' || req.body.postToIg === true;

    const result = await multiTenantService.publishPhotoPost(shopId, message, req.file.path, {
      postToFb,
      postToIg,
    });
    res.json({ success: true, data: result });
  } catch (err) {
    console.error('postPhoto error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

// ── POST /api/v2/posts/reel ───────────────────────────────────
exports.postReel = async (req, res) => {
  try {
    const shopId = getShopId(req);
    if (!shopId) return res.status(400).json({ success: false, error: 'x-shop-id header is required.' });
    if (!req.file) return res.status(400).json({ success: false, error: 'Video file is required.' });

    const message = req.body.message || '';
    const postToFb = req.body.postToFb !== 'false' && req.body.postToFb !== false;
    const postToIg = req.body.postToIg === 'true' || req.body.postToIg === true;

    const result = await multiTenantService.publishReelPost(shopId, message, req.file.path, {
      postToFb,
      postToIg,
    });
    res.json({ success: true, data: result });
  } catch (err) {
    console.error('postReel error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};
