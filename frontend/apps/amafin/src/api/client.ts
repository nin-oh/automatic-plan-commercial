import axios from 'axios';

/**
 * Get CSRF token from Django cookie.
 * Django sets this cookie on every page load.
 */
function getCSRFToken(): string {
  const match = document.cookie.match(/csrftoken=([^;]+)/);
  return match ? match[1] : '';
}

/**
 * Axios instance configured for Django DRF.
 * - Base URL points to Django API
 * - CSRF token included in every write request
 * - Session cookie sent automatically (same origin)
 */
export const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
});

// Add CSRF token to every request that modifies data
api.interceptors.request.use((config) => {
  if (['post', 'put', 'patch', 'delete'].includes(config.method ?? '')) {
    config.headers['X-CSRFToken'] = getCSRFToken();
  }
  return config;
});

// If Django returns 302 (session expired), redirect to login
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 403 || error.response?.status === 401) {
      window.location.href = '/login/';
    }
    return Promise.reject(error);
  },
);
