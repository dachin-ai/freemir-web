import axios from 'axios';

// Determine API endpoint dynamically
const getBaseURL = () => {
  const isDev = import.meta.env.MODE === 'development';
  const envBackend = import.meta.env.VITE_API_URL;

  // In local dev, default to local backend to avoid mixing
  // local frontend with stale/older remote APIs.
  if (isDev) {
    if (envBackend && /localhost|127\.0\.0\.1/.test(envBackend)) {
      return envBackend;
    }
    return 'http://localhost:8000/api';
  }

  // Allow overriding API target outside development.
  if (envBackend) {
    return envBackend;
  }
  
  // Fallback: Cloud Run backend (freemir-web-api; override with VITE_API_URL in build)
  return 'https://freemir-web-api-123563250077.asia-southeast1.run.app/api';
};

const baseURL = getBaseURL();

const api = axios.create({
  baseURL,
  timeout: 60000, // 60 second timeout for Render cold starts
});

// Auto-attach Bearer token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('fm_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle timeout errors with better messaging
api.interceptors.response.use(
  response => response,
  error => {
    if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
      error.response = error.response || {};
      error.response.data = error.response.data || {};
      error.response.data.detail = 'Request timeout. Server may be slow or unavailable. Try again in a moment.';
      error.response.status = 504;
    }
    return Promise.reject(error);
  }
);

export const syncUsers = () => api.post('/auth/sync-users');
export const forgotPassword = (username, email) => api.post('/auth/forgot-password', { username, email });
export const changePassword = (current_password, new_password) => api.post('/auth/change-password', { current_password, new_password });

export const askAssistant = (messages) => api.post('/chat/ask', { messages });
export const downloadPhotoTemplate = () => api.get('/photo-downloader/template', { responseType: 'blob' });
export const downloadPhotoDirect = (name, url) =>
  api.post('/photo-downloader/direct', { name, url }, { responseType: 'blob' });
export const downloadPhotoBatch = (file) => {
  const formData = new FormData();
  formData.append('file', file);
  return api.post('/photo-downloader/batch', formData, { responseType: 'blob' });
};

// Access management
export const submitAccessRequest = (tool_key) => api.post('/access/request', { tool_key });
export const getMyAccessRequests = () => api.get('/access/my-requests');
export const getAccessRequests = () => api.get('/access/requests');
export const approveAccessRequest = (id, name) => api.put(`/access/requests/${id}/approve`, { name });
export const rejectAccessRequest = (id) => api.put(`/access/requests/${id}/reject`);
export const getAllUsersWithPermissions = () => api.get('/access/users');
export const updateUserPermissions = (username, permissions, name) => api.put(`/access/users/${username}/permissions`, { permissions, name });
export const getUserActivity = (payload) => api.post('/access/user-activity', payload);

/** Shared Quick Links (all logged-in users read/write same data) */
export const getQuickLinks = () => api.get('quick-links');
export const putQuickLinks = (groups) => api.put('quick-links', { groups });

export default api;

