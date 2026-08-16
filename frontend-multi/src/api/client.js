import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:5001/api',
  timeout: 45000,
});

// Attach active shop ID header dynamically
api.interceptors.request.use((config) => {
  const activeShopId = localStorage.getItem('active_shop_id');
  if (activeShopId) {
    config.headers['x-shop-id'] = activeShopId;
  }
  return config;
});

// Automatic retry once on network error or server disconnect
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error.config;
    if (!config || config.__isRetry) {
      return Promise.reject(error);
    }

    // Only retry GET requests on network failures
    if (config.method === 'get' && (!error.response || error.response.status >= 500)) {
      config.__isRetry = true;
      await new Promise(r => setTimeout(r, 600));
      return api(config);
    }

    return Promise.reject(error);
  }
);

export default api;
