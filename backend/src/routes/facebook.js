const express = require('express');
const multer = require('multer');
const path = require('path');
const fb = require('../services/facebookService');

const router = express.Router();

// Multer config — store uploaded images temporarily
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
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp/;
    const valid = allowed.test(path.extname(file.originalname).toLowerCase())
      && allowed.test(file.mimetype);
    if (valid) cb(null, true);
    else cb(new Error('Only image files are allowed (jpg, png, gif, webp)'));
  },
});

// ── GET /api/fb/page-info ─────────────────────────────────────
router.get('/page-info', async (req, res) => {
  try {
    const info = await fb.getPageInfo();
    res.json({ success: true, data: info });
  } catch (err) {
    console.error('page-info error:', err.response?.data || err.message);
    res.status(500).json({ success: false, error: err.response?.data?.error || err.message });
  }
});

// ── GET /api/fb/posts ─────────────────────────────────────────
router.get('/posts', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const posts = await fb.getRecentPosts(limit);
    res.json({ success: true, data: posts });
  } catch (err) {
    console.error('posts error:', err.response?.data || err.message);
    res.status(500).json({ success: false, error: err.response?.data?.error || err.message });
  }
});

// ── POST /api/fb/post/text ────────────────────────────────────
router.post('/post/text', async (req, res) => {
  try {
    const { message } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ success: false, error: 'Message is required.' });
    }
    const result = await fb.publishTextPost(message.trim());
    res.json({ success: true, data: result });
  } catch (err) {
    console.error('post/text error:', err.response?.data || err.message);
    res.status(500).json({ success: false, error: err.response?.data?.error || err.message });
  }
});

// ── POST /api/fb/post/link ────────────────────────────────────
router.post('/post/link', async (req, res) => {
  try {
    const { message, link } = req.body;
    if (!link) {
      return res.status(400).json({ success: false, error: 'Link URL is required.' });
    }
    const result = await fb.publishLinkPost(message || '', link);
    res.json({ success: true, data: result });
  } catch (err) {
    console.error('post/link error:', err.response?.data || err.message);
    res.status(500).json({ success: false, error: err.response?.data?.error || err.message });
  }
});

// ── POST /api/fb/post/photo ───────────────────────────────────
router.post('/post/photo', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Image file is required.' });
    }
    const message = req.body.message || '';
    const postToFb = req.body.postToFb !== 'false' && req.body.postToFb !== false;
    const postToIg = req.body.postToIg === 'true' || req.body.postToIg === true;
    const result = await fb.publishPhotoPost(message, req.file.path, { postToFb, postToIg });
    res.json({ success: true, data: result });
  } catch (err) {
    console.error('post/photo error:', err.response?.data || err.message);
    res.status(500).json({ success: false, error: err.response?.data?.error || err.message });
  }
});

// ── POST /api/fb/post/video ───────────────────────────────────
const videoUpload = multer({
  storage,
  limits: { fileSize: 250 * 1024 * 1024 }, // 250 MB
});

router.post('/post/video', videoUpload.single('video'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Video file is required.' });
    }
    const message = req.body.message || '';
    const postToFb = req.body.postToFb !== 'false' && req.body.postToFb !== false;
    const postToIg = req.body.postToIg === 'true' || req.body.postToIg === true;
    const result = await fb.publishVideoPost(message, req.file.path, { postToFb, postToIg });
    res.json({ success: true, data: result });
  } catch (err) {
    console.error('post/video error:', err.response?.data || err.message);
    res.status(500).json({ success: false, error: err.response?.data?.error || err.message });
  }
});

// ── DELETE /api/fb/post/:postId ───────────────────────────────
router.delete('/post/:postId', async (req, res) => {
  try {
    const result = await fb.deletePost(req.params.postId);
    res.json({ success: true, data: result });
  } catch (err) {
    console.error('delete post error:', err.response?.data || err.message);
    res.status(500).json({ success: false, error: err.response?.data?.error || err.message });
  }
});

module.exports = router;
