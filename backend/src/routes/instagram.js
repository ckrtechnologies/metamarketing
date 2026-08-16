const express = require('express');
const multer = require('multer');
const path = require('path');
const ig = require('../services/instagramService');
const fb = require('../services/facebookService');

const router = express.Router();

// Multer config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, process.env.UPLOAD_DIR || 'uploads');
  },
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}${path.extname(file.originalname)}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB
});

// ── GET /api/ig/account ───────────────────────────────────────
router.get('/account', async (req, res) => {
  try {
    const account = await ig.getAccountInfo();
    res.json({ success: true, data: account });
  } catch (err) {
    console.error('ig/account error:', err.response?.data || err.message);
    res.status(500).json({ success: false, error: err.response?.data?.error || err.message });
  }
});

// ── GET /api/ig/media ─────────────────────────────────────────
router.get('/media', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 12;
    const media = await ig.getMedia(limit);
    res.json({ success: true, data: media });
  } catch (err) {
    console.error('ig/media error:', err.response?.data || err.message);
    res.status(500).json({ success: false, error: err.response?.data?.error || err.message });
  }
});

// ── POST /api/ig/post/photo ───────────────────────────────────
router.post('/post/photo', async (req, res) => {
  try {
    const { caption, imageUrl } = req.body;
    if (!imageUrl) {
      return res.status(400).json({ success: false, error: 'Public image URL is required for Instagram.' });
    }
    const result = await ig.publishPhoto(caption, imageUrl);
    res.json({ success: true, data: result });
  } catch (err) {
    console.error('ig/post/photo error:', err.response?.data || err.message);
    res.status(500).json({ success: false, error: err.response?.data?.error || err.message });
  }
});

// ── POST /api/ig/post/cross ───────────────────────────────────
// Publish to both Facebook and Instagram simultaneously
router.post('/post/cross', async (req, res) => {
  try {
    const { message, imageUrl, postToFb, postToIg } = req.body;
    const results = {};

    if (postToFb) {
      try {
        if (imageUrl) {
          results.fb = await fb.publishLinkPost(message, imageUrl);
        } else {
          results.fb = await fb.publishTextPost(message);
        }
      } catch (err) {
        results.fbError = err.response?.data?.error?.message || err.message;
      }
    }

    if (postToIg && imageUrl) {
      try {
        results.ig = await ig.publishPhoto(message, imageUrl);
      } catch (err) {
        results.igError = err.response?.data?.error?.message || err.message;
      }
    }

    res.json({ success: true, data: results });
  } catch (err) {
    console.error('ig/post/cross error:', err.response?.data || err.message);
    res.status(500).json({ success: false, error: err.response?.data?.error || err.message });
  }
});

module.exports = router;
