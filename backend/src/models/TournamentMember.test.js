jest.mock('../config/database', () => ({
  query: jest.fn()
}));

const pool = require('../config/database');
const TournamentMember = require('./TournamentMember');

describe('TournamentMember', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('hasAccess devuelve true cuando existe la fila', async () => {
    pool.query.mockResolvedValue({ rows: [{ '?column?': 1 }] });
    const result = await TournamentMember.hasAccess(5, 9);
    expect(result).toBe(true);
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('FROM tournament_members'),
      [5, 9]
    );
  });

  test('hasAccess devuelve false con ids inválidos', async () => {
    const result = await TournamentMember.hasAccess(0, 9);
    expect(result).toBe(false);
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('add inserta membresía y devuelve fila', async () => {
    pool.query.mockResolvedValue({
      rows: [{ id: 1, user_id: 5, torneo_id: 9, invited_by: 2 }]
    });
    const row = await TournamentMember.add({ userId: 5, torneoId: 9, invitedBy: 2 });
    expect(row).toEqual({ id: 1, user_id: 5, torneo_id: 9, invited_by: 2 });
  });
});
