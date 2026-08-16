import api from './client';

// ── OAuth Flow ────────────────────────────────────────────────
export const fetchOAuthUrl = (redirectUri) =>
  api.get('/auth/facebook/url', { params: { redirectUri } }).then(r => r.data.url);

export const handleOAuthCallback = (code, redirectUri) =>
  api.post('/auth/facebook/callback', { code, redirectUri }).then(r => r.data.data);

export const connectShopPage = (payload) =>
  api.post('/auth/connect-page', payload).then(r => r.data.shop);

// ── Shop Management ───────────────────────────────────────────
export const listShops = () =>
  api.get('/auth/shops').then(r => r.data.data);

export const getShopProfile = (shopId) =>
  api.get(`/v2/shops/${shopId}/profile`).then(r => r.data.data);

export const getShopFeeds = (shopId, limit = 12) =>
  api.get(`/v2/shops/${shopId}/feeds`, { params: { limit } }).then(r => r.data.data);

export const deleteShop = (shopId) =>
  api.delete(`/auth/shops/${shopId}`).then(r => r.data);

// ── Publishing ────────────────────────────────────────────────
export const publishTextPost = (message) =>
  api.post('/v2/posts/text', { message }).then(r => r.data);

export const publishLinkPost = (message, link) =>
  api.post('/v2/posts/link', { message, link }).then(r => r.data);

export const publishPhotoPost = (message, imageFile, options = {}) => {
  const form = new FormData();
  form.append('message', message || '');
  form.append('image', imageFile);
  form.append('postToFb', options.postToFb ?? true);
  form.append('postToIg', options.postToIg ?? true);
  return api.post('/v2/posts/photo', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then(r => r.data);
};

export const publishReelPost = (message, videoFile, options = {}) => {
  const form = new FormData();
  form.append('message', message || '');
  form.append('video', videoFile);
  form.append('postToFb', options.postToFb ?? true);
  form.append('postToIg', options.postToIg ?? true);
  return api.post('/v2/posts/reel', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then(r => r.data);
};
