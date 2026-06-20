import { api } from './authHttp';

export const sportsService = {
  async getSports() {
    const response = await api.get('/sports');
    return response.data;
  },

  async createSport(payload) {
    const response = await api.post('/sports', payload);
    return response.data;
  },
};
