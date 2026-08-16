# Matter Marketing

A private full-stack dashboard to post text, images, and links directly to your Facebook Page.

## Stack
- **Frontend**: React (Vite) + Vanilla CSS
- **Backend**: Node.js + Express
- **API**: Facebook Graph API v19.0

## Project Structure
```
matter-marketing/
├── backend/
│   ├── src/
│   │   ├── index.js              # Express entry point
│   │   ├── routes/facebook.js    # API routes
│   │   └── services/facebookService.js
│   ├── .env.example              # Copy this to .env
│   └── package.json
└── frontend/
    ├── src/
    │   ├── api/facebook.js       # Axios API layer
    │   ├── components/           # PageHeader, PostComposer, RecentPosts
    │   └── App.jsx
    └── package.json
```

## Quick Start

### 1. Set up Facebook credentials
See `fb-setup-guide.md` (in the Antigravity sidebar) for the full step-by-step guide.

### 2. Configure the backend
```bash
cd backend
cp .env.example .env
# Edit .env with your Facebook credentials
npm install
npm run dev      # Runs on http://localhost:5000
```

### 3. Start the frontend
```bash
cd frontend
npm install
npm run dev      # Opens on http://localhost:5173
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/fb/page-info` | Page name, followers, avatar |
| GET | `/api/fb/posts?limit=10` | Recent page posts |
| POST | `/api/fb/post/text` | Publish text post |
| POST | `/api/fb/post/link` | Publish link post |
| POST | `/api/fb/post/photo` | Publish photo post (multipart) |
| DELETE | `/api/fb/post/:postId` | Delete a post |
