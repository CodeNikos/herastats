import axios from 'axios';
import { resolveApiBaseUrl } from '../config/apiBaseUrl';

/** Cliente sin redirección 401 (rutas públicas: encuesta espíritu). */
export const publicApi = axios.create({
  headers: {
    'Content-Type': 'application/json',
  },
});

publicApi.interceptors.request.use(
  (config) => {
    config.baseURL = resolveApiBaseUrl();
    return config;
  },
  (error) => Promise.reject(error)
);
