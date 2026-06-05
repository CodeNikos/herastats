jest.mock('../models/TournamentConfig', () => ({
  findById: jest.fn()
}));

jest.mock('../models/TournamentMember', () => ({
  hasAccess: jest.fn()
}));

const TournamentConfig = require('../models/TournamentConfig');
const TournamentMember = require('../models/TournamentMember');
const {
  assertTournamentEditAccess,
  assertTournamentInviteAccess
} = require('./tournamentAccess');

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
      torneo_id: 1,
      created_by: 'owner@test.com'
    });
    const req = { user: { id: 10, email: 'owner@test.com', role: 'anotador' } };
    const result = await assertTournamentEditAccess(req, 1);
    expect(result.ok).toBe(true);
    expect(TournamentMember.hasAccess).not.toHaveBeenCalled();
  });

  test('permite anotador con membresía aunque no sea dueño', async () => {
    TournamentConfig.findById.mockResolvedValue({
      torneo_id: 1,
      created_by: 'owner@test.com'
    });
    TournamentMember.hasAccess.mockResolvedValue(true);
    const req = { user: { id: 11, email: 'member@test.com', role: 'anotador' } };
    const result = await assertTournamentEditAccess(req, 1);
    expect(result.ok).toBe(true);
    expect(TournamentMember.hasAccess).toHaveBeenCalledWith(11, 1);
  });

  test('rechaza anotador sin membresía ni ser dueño', async () => {
    TournamentConfig.findById.mockResolvedValue({
      torneo_id: 1,
      created_by: 'owner@test.com'
    });
    TournamentMember.hasAccess.mockResolvedValue(false);
    const req = { user: { id: 12, email: 'other@test.com', role: 'anotador' } };
    const result = await assertTournamentEditAccess(req, 1);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(403);
  });

  test('rechaza admin global sin membresía ni ser dueño', async () => {
    TournamentConfig.findById.mockResolvedValue({
      torneo_id: 1,
      created_by: 'owner@test.com'
    });
    TournamentMember.hasAccess.mockResolvedValue(false);
    const req = { user: { id: 13, email: 'admin@test.com', role: 'admin' } };
    const result = await assertTournamentEditAccess(req, 1);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(403);
  });

  test('permite superuser aunque no sea dueño ni miembro', async () => {
    TournamentConfig.findById.mockResolvedValue({
      torneo_id: 1,
      created_by: 'owner@test.com'
    });
    const req = { user: { id: 14, email: 'super@test.com', role: 'superuser' } };
    const result = await assertTournamentEditAccess(req, 1);
    expect(result.ok).toBe(true);
    expect(TournamentMember.hasAccess).not.toHaveBeenCalled();
  });
});

describe('assertTournamentInviteAccess', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('permite admin con acceso al torneo', async () => {
    TournamentConfig.findById.mockResolvedValue({
      torneo_id: 2,
      created_by: 'admin@test.com'
    });
    const req = { user: { id: 20, email: 'admin@test.com', role: 'admin' } };
    const result = await assertTournamentInviteAccess(req, 2);
    expect(result.ok).toBe(true);
  });

  test('rechaza anotador aunque tenga acceso de edición', async () => {
    TournamentConfig.findById.mockResolvedValue({
      torneo_id: 2,
      created_by: 'owner@test.com'
    });
    TournamentMember.hasAccess.mockResolvedValue(true);
    const req = { user: { id: 21, email: 'scorer@test.com', role: 'anotador' } };
    const result = await assertTournamentInviteAccess(req, 2);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(403);
  });
});
