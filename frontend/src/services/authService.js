import { api } from './authHttp';

export const authService = {
  async login(email, password) {
    try {
      const response = await api.post('/auth/login', {
        email,
        password,
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  async register(email, password) {
    try {
      const response = await api.post('/auth/register', {
        email,
        password,
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  async verifyToken() {
    try {
      const response = await api.get('/auth/verify');
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  async setPassword(token, password) {
    try {
      const response = await api.post('/auth/set-password', {
        token,
        password,
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  async updateProfile({ name, lname }) {
    try {
      const response = await api.patch('/auth/profile', { name, lname });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  async getTournamentCreationEligibility() {
    const response = await api.get('/auth/tournament-creation-eligibility');
    return response.data;
  },
};
