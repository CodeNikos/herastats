import { api } from './authHttp';

export const usersService = {
  async getUsers() {
    const response = await api.get('/users');
    return response.data;
  },

  async createUser(payload) {
    const response = await api.post('/users', payload);
    return response.data;
  },

  async updateUserRole(userId, role) {
    const response = await api.put(`/users/${userId}`, { role });
    return response.data;
  },

  async deleteUser(userId) {
    const response = await api.delete(`/users/${userId}`);
    return response.data;
  },
};
