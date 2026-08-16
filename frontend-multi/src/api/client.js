import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:5001/api',
});

// Attach active shop ID header dynamically
api.interceptors.request.use((config) => {
  const activeShopId = localStorage.getItem('active_shop_id');
  if (activeShopId) {
    config.headers['x-shop-id'] = activeShopId;
  }
  return config;
});

export default api;
