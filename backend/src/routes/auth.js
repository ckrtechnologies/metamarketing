const express = require('express');
const authController = require('../controllers/authController');

const router = express.Router();

// OAuth Endpoints
router.get('/facebook/url', authController.getOAuthUrl);
router.post('/facebook/callback', authController.handleOAuthCallback);
router.post('/connect-page', authController.connectShopPage);

// Multi-Shop Management
router.get('/shops', authController.listShops);
router.get('/shops/:shopId', authController.getShop);
router.delete('/shops/:shopId', authController.deleteShop);

module.exports = router;
