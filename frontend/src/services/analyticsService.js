import { api } from './authHttp';

export const analyticsService = {
  async getSummary(params = {}) {
    const response = await api.get('/analytics/summary', { params });
    return response.data;
  },

  async getVisits(params = {}) {
    const response = await api.get('/analytics/visits', { params });
    return response.data;
  },

  async getTimeseries(params = {}) {
    const response = await api.get('/analytics/timeseries', { params });
    return response.data;
  }
};
