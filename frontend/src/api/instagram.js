import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:5001/api/ig',
});

// ── Account ───────────────────────────────────────────────────
export const fetchInstagramAccount = () =>
  api.get('/account').then(r => r.data.data);

// ── Media Feed ────────────────────────────────────────────────
export const fetchInstagramMedia = (limit = 12) =>
  api.get('/media', { params: { limit } }).then(r => r.data.data);

// ── Publish Photo ─────────────────────────────────────────────
export const publishInstagramPhoto = (caption, imageUrl) =>
  api.post('/post/photo', { caption, imageUrl }).then(r => r.data);

// ── Cross Post ────────────────────────────────────────────────
export const crossPost = (payload) =>
  api.post('/post/cross', payload).then(r => r.data);
