const express = require('express');
const multer = require('multer');
const path = require('path');
const multiTenantController = require('../controllers/multiTenantController');

const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, process.env.UPLOAD_DIR || 'uploads');
  },
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}${path.extname(file.originalname)}`);
  },
});

const imageUpload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB
});

const videoUpload = multer({
  storage,
  limits: { fileSize: 250 * 1024 * 1024 }, // 250 MB
});

// ── Shop Profile & Feeds ──────────────────────────────────────
router.get('/shops/:shopId/profile', multiTenantController.getProfile);
router.get('/shops/:shopId/feeds', multiTenantController.getFeeds);

// ── Publishing Endpoints ──────────────────────────────────────
router.post('/posts/text', multiTenantController.postText);
router.post('/posts/link', multiTenantController.postLink);
router.post('/posts/photo', imageUpload.single('image'), multiTenantController.postPhoto);
router.post('/posts/reel', videoUpload.single('video'), multiTenantController.postReel);

module.exports = router;
