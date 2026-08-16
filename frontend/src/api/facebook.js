import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:5001/api/fb',
});

// ── Page ──────────────────────────────────────────────────────
export const fetchPageInfo = () => api.get('/page-info').then(r => r.data.data);

// ── Posts ─────────────────────────────────────────────────────
export const fetchRecentPosts = (limit = 10) =>
  api.get('/posts', { params: { limit } }).then(r => r.data.data);

export const deletePost = (postId) =>
  api.delete(`/post/${postId}`).then(r => r.data);

// ── Publish ───────────────────────────────────────────────────
export const publishTextPost = (message) =>
  api.post('/post/text', { message }).then(r => r.data);

export const publishLinkPost = (message, link) =>
  api.post('/post/link', { message, link }).then(r => r.data);

export const publishPhotoPost = (message, imageFile, options = {}) => {
  const form = new FormData();
  form.append('message', message || '');
  form.append('image', imageFile);
  form.append('postToFb', options.postToFb ?? true);
  form.append('postToIg', options.postToIg ?? true);
  return api.post('/post/photo', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then(r => r.data);
};

export const publishVideoPost = (message, videoFile, options = {}) => {
  const form = new FormData();
  form.append('message', message || '');
  form.append('video', videoFile);
  form.append('postToFb', options.postToFb ?? true);
  form.append('postToIg', options.postToIg ?? true);
  return api.post('/post/video', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then(r => r.data);
};
