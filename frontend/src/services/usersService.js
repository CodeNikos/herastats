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

  async assignTournamentToken(userId, token) {
    const response = await api.post(`/users/${userId}/tournament-tokens`, { token });
    return response.data;
  },

  async updateTournamentToken(userId, tokenId, token) {
    const response = await api.put(`/users/${userId}/tournament-tokens/${tokenId}`, { token });
    return response.data;
  },

  async revokeTournamentToken(userId, tokenId) {
    const response = await api.delete(`/users/${userId}/tournament-tokens/${tokenId}`);
    return response.data;
  },

  async getUserTournamentTokens(userId) {
    const response = await api.get(`/users/${userId}/tournament-tokens`);
    return response.data;
  },
};
