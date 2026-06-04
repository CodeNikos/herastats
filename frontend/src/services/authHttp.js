import axios from 'axios';
import { resolveApiBaseUrl } from '../config/apiBaseUrl';
import { appPath } from '../config/appRoutes';

const api = axios.create({
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use(
  (config) => {
    config.baseURL = resolveApiBaseUrl();
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    if (config.data instanceof FormData) {
      delete config.headers['Content-Type'];
    }
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Si ya no había token (p. ej. logout reciente), no forzar /login: evita parpadeo.
      const hadSession = localStorage.getItem('token');
      localStorage.removeItem('token');
      if (hadSession) {
        window.location.replace(appPath('/login'));
      }
    }
    return Promise.reject(error);
  }
);

export { api };
