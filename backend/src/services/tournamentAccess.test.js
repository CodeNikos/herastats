jest.mock('../models/TournamentConfig', () => ({
  findById: jest.fn()
}));

const TournamentConfig = require('../models/TournamentConfig');
const { assertTournamentEditAccess } = require('./tournamentAccess');

describe('assertTournamentEditAccess', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('rechaza sin usuario autenticado', async () => {
    const result = await assertTournamentEditAccess({}, 1);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(401);
  });

  test('permite al dueño del torneo (anotador)', async () => {
    TournamentConfig.findById.mockResolvedValue({
      id: 1,
      created_by: 'owner@test.com'
    });
    const req = { user: { email: 'owner@test.com', role: 'anotador' } };
    const result = await assertTournamentEditAccess(req, 1);
    expect(result.ok).toBe(true);
  });

  test('rechaza anotador que no es dueño', async () => {
    TournamentConfig.findById.mockResolvedValue({
      id: 1,
      created_by: 'owner@test.com'
    });
    const req = { user: { email: 'other@test.com', role: 'anotador' } };
    const result = await assertTournamentEditAccess(req, 1);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(403);
  });

  test('permite admin global aunque no sea dueño', async () => {
    TournamentConfig.findById.mockResolvedValue({
      id: 1,
      created_by: 'owner@test.com'
    });
    const req = { user: { email: 'admin@test.com', role: 'admin' } };
    const result = await assertTournamentEditAccess(req, 1);
    expect(result.ok).toBe(true);
  });
});
