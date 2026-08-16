require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const facebookRoutes = require('./routes/facebook');
const instagramRoutes = require('./routes/instagram');

const app = express();
const PORT = process.env.PORT || 5000;

// Ensure uploads directory exists
const uploadDir = process.env.UPLOAD_DIR || 'uploads';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// ── Middleware ────────────────────────────────────────────────
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:3000'],
  methods: ['GET', 'POST', 'DELETE'],
  allowedHeaders: ['Content-Type'],
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// ── Routes ────────────────────────────────────────────────────
app.use('/api/fb', facebookRoutes);
app.use('/api/ig', instagramRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Start ─────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 Matter Marketing Backend running on http://localhost:${PORT}`);
  console.log(`   Facebook Page ID : ${process.env.FB_PAGE_ID || '⚠️  NOT SET'}`);
  console.log(`   Token status     : ${process.env.FB_PAGE_ACCESS_TOKEN ? '✅ SET' : '❌ NOT SET'}\n`);
});
