const multiTenantService = require('../services/multiTenantService');

// Helper to format Meta & system errors into user-friendly messages
function formatError(err) {
  const metaError = err.response?.data?.error;
  if (metaError) {
    if (metaError.code === 190 || metaError.error_subcode === 463) {
      return {
        message: 'Your Facebook login session has expired. Please disconnect and reconnect your shop.',
        code: 'TOKEN_EXPIRED',
        raw: metaError.message,
      };
    }
    if (metaError.code === 200 || metaError.code === 10) {
      return {
        message: 'Missing permission to access this page. Please grant all requested permissions during Facebook Login.',
        code: 'PERMISSION_DENIED',
        raw: metaError.message,
      };
    }
    if (metaError.code === 2207076 || metaError.code === 2207001) {
      return {
        message: 'Instagram Reels upload failed. Please ensure the video is an MP4/MOV file under 250MB.',
        code: 'MEDIA_PROCESSING_FAILED',
        raw: metaError.message,
      };
    }
    return {
      message: metaError.message || 'Meta Graph API encountered an issue.',
      code: 'META_API_ERROR',
      raw: metaError.message,
    };
  }

  if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
    return {
      message: 'Unable to reach the backend server. Please make sure the server is running on port 5001.',
      code: 'SERVER_UNAVAILABLE',
      raw: err.message,
    };
  }

  return {
    message: err.message || 'An unexpected error occurred.',
    code: 'UNKNOWN_ERROR',
    raw: err.message,
  };
}

// Middleware helper to extract shopId from header or params
function getShopId(req) {
  return req.headers['x-shop-id'] || req.params.shopId || req.query.shopId;
}

// ── GET /api/v2/shops/:shopId/profile ─────────────────────────
exports.getProfile = async (req, res) => {
  try {
    const shopId = getShopId(req);
    if (!shopId) {
      return res.status(400).json({
        success: false,
        error: 'Shop ID was not provided in the request.',
        code: 'MISSING_SHOP_ID',
      });
    }

    const profile = await multiTenantService.getLiveShopProfile(shopId);
    res.json({ success: true, data: profile });
  } catch (err) {
    const formatted = formatError(err);
    console.error(`[multiTenantController:getProfile] ${formatted.code}:`, formatted.raw);
    res.status(500).json({ success: false, error: formatted.message, code: formatted.code, details: formatted.raw });
  }
};

// ── GET /api/v2/shops/:shopId/feeds ───────────────────────────
exports.getFeeds = async (req, res) => {
  try {
    const shopId = getShopId(req);
    if (!shopId) {
      return res.status(400).json({
        success: false,
        error: 'Shop ID was not provided in the request.',
        code: 'MISSING_SHOP_ID',
      });
    }

    const limit = parseInt(req.query.limit) || 12;
    const feeds = await multiTenantService.getShopFeeds(shopId, limit);
    res.json({ success: true, data: feeds });
  } catch (err) {
    const formatted = formatError(err);
    console.error(`[multiTenantController:getFeeds] ${formatted.code}:`, formatted.raw);
    res.status(500).json({ success: false, error: formatted.message, code: formatted.code, details: formatted.raw });
  }
};

// ── POST /api/v2/posts/text ───────────────────────────────────
exports.postText = async (req, res) => {
  try {
    const shopId = getShopId(req);
    const { message } = req.body;
    if (!shopId) return res.status(400).json({ success: false, error: 'Shop ID is required.', code: 'MISSING_SHOP_ID' });
    if (!message?.trim()) return res.status(400).json({ success: false, error: 'Post message cannot be empty.', code: 'EMPTY_MESSAGE' });

    const result = await multiTenantService.publishTextPost(shopId, message);
    res.json({ success: true, data: result });
  } catch (err) {
    const formatted = formatError(err);
    console.error(`[multiTenantController:postText] ${formatted.code}:`, formatted.raw);
    res.status(500).json({ success: false, error: formatted.message, code: formatted.code, details: formatted.raw });
  }
};

// ── POST /api/v2/posts/link ───────────────────────────────────
exports.postLink = async (req, res) => {
  try {
    const shopId = getShopId(req);
    const { message, link } = req.body;
    if (!shopId) return res.status(400).json({ success: false, error: 'Shop ID is required.', code: 'MISSING_SHOP_ID' });
    if (!link?.trim()) return res.status(400).json({ success: false, error: 'Link URL is required.', code: 'EMPTY_LINK' });

    const result = await multiTenantService.publishLinkPost(shopId, message || '', link);
    res.json({ success: true, data: result });
  } catch (err) {
    const formatted = formatError(err);
    console.error(`[multiTenantController:postLink] ${formatted.code}:`, formatted.raw);
    res.status(500).json({ success: false, error: formatted.message, code: formatted.code, details: formatted.raw });
  }
};

// ── POST /api/v2/posts/photo ──────────────────────────────────
exports.postPhoto = async (req, res) => {
  try {
    const shopId = getShopId(req);
    if (!shopId) return res.status(400).json({ success: false, error: 'Shop ID is required.', code: 'MISSING_SHOP_ID' });
    if (!req.file) return res.status(400).json({ success: false, error: 'Please choose an image to upload.', code: 'MISSING_FILE' });

    const message = req.body.message || '';
    const postToFb = req.body.postToFb !== 'false' && req.body.postToFb !== false;
    const postToIg = req.body.postToIg === 'true' || req.body.postToIg === true;

    const result = await multiTenantService.publishPhotoPost(shopId, message, req.file.path, {
      postToFb,
      postToIg,
    });
    res.json({ success: true, data: result });
  } catch (err) {
    const formatted = formatError(err);
    console.error(`[multiTenantController:postPhoto] ${formatted.code}:`, formatted.raw);
    res.status(500).json({ success: false, error: formatted.message, code: formatted.code, details: formatted.raw });
  }
};

// ── POST /api/v2/posts/reel ───────────────────────────────────
exports.postReel = async (req, res) => {
  try {
    const shopId = getShopId(req);
    if (!shopId) return res.status(400).json({ success: false, error: 'Shop ID is required.', code: 'MISSING_SHOP_ID' });
    if (!req.file) return res.status(400).json({ success: false, error: 'Please choose a video file for the Reel.', code: 'MISSING_FILE' });

    const message = req.body.message || '';
    const postToFb = req.body.postToFb !== 'false' && req.body.postToFb !== false;
    const postToIg = req.body.postToIg === 'true' || req.body.postToIg === true;

    const result = await multiTenantService.publishReelPost(shopId, message, req.file.path, {
      postToFb,
      postToIg,
    });
    res.json({ success: true, data: result });
  } catch (err) {
    const formatted = formatError(err);
    console.error(`[multiTenantController:postReel] ${formatted.code}:`, formatted.raw);
    res.status(500).json({ success: false, error: formatted.message, code: formatted.code, details: formatted.raw });
  }
};

// ── DELETE /api/v2/posts/:postId ──────────────────────────────
exports.deletePost = async (req, res) => {
  try {
    const shopId = getShopId(req);
    const postId = req.params.postId;
    if (!shopId) return res.status(400).json({ success: false, error: 'Shop ID is required.', code: 'MISSING_SHOP_ID' });
    if (!postId) return res.status(400).json({ success: false, error: 'Post ID is required.', code: 'MISSING_POST_ID' });

    const result = await multiTenantService.deleteFacebookPost(shopId, postId);
    res.json({ success: true, message: 'Post deleted successfully from Facebook Page.', data: result });
  } catch (err) {
    const formatted = formatError(err);
    console.error(`[multiTenantController:deletePost] ${formatted.code}:`, formatted.raw);
    res.status(500).json({ success: false, error: formatted.message, code: formatted.code, details: formatted.raw });
  }
};
