import { publicApi } from '../api/publicApi';

export async function fetchSpiritInvite(token) {
  const response = await publicApi.get('/spirit-survey/invite', { params: { token } });
  return response.data;
}

export async function submitSpiritSurvey(payload) {
  const response = await publicApi.post('/spirit-survey/respond', payload);
  return response.data;
}
