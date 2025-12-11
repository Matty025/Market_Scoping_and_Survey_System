import axios from "axios";

const baseURL = import.meta.env.VITE_API_URL || "http://localhost:3001";

const api = axios.create({ baseURL });

api.interceptors.request.use((config) => {
  try {
    const token = localStorage.getItem("token");
    if (token) config.headers = { ...(config.headers || {}), Authorization: `Bearer ${token}` };
    // If sending FormData, let the browser set the Content-Type including the boundary.
    if (config.data && typeof FormData !== 'undefined' && config.data instanceof FormData) {
      // remove any pre-set content-type so the browser can add the correct multipart boundary
      if (config.headers && config.headers['Content-Type']) delete config.headers['Content-Type'];
      if (config.headers && config.headers['content-type']) delete config.headers['content-type'];
    } else {
      // default to JSON for non-formdata requests when not already set
      config.headers = { 'Content-Type': 'application/json', ...(config.headers || {}) };
    }
  } catch (e) {
    // ignore
  }
  return config;
});

export default api;
