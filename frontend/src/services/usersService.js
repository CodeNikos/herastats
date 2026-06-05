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

  async getTournamentMembers(tournamentId) {
    const response = await api.get(`/config/tournament/${tournamentId}/members`);
    return response.data;
  },

  async addTournamentMember(tournamentId, email) {
    const response = await api.post(`/config/tournament/${tournamentId}/members`, { email });
    return response.data;
  },

  async removeTournamentMember(tournamentId, userId) {
    const response = await api.delete(`/config/tournament/${tournamentId}/members/${userId}`);
    return response.data;
  },
};
