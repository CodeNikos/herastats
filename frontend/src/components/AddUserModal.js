import { Fragment, useEffect, useState } from 'react';
import { usersService } from '../services/usersService';
import { configService } from '../services/configService';
import { useAuth } from '../hooks/useAuth';
import { isSuperuser } from '../utils/userRoles';
import './AddUserModal.css';

const EMPTY_FORM = {
  email: '',
  role: 'anotador',
  torneo_id: '',
  tournament_token: '',
};

function generateTournamentToken() {
  const part = () => Math.random().toString(36).slice(2, 8).toUpperCase();
  return `TOR-${part()}-${part()}`;
}

function rolePillClass(role) {
  if (role === 'admin') return 'user-admin-role-pill admin';
  if (role === 'superuser') return 'user-admin-role-pill superuser';
  return 'user-admin-role-pill';
}

function UserTokenManager({
  user,
  newTokenDraft,
  editingTokenId,
  editingTokenValue,
  busy,
  onDraftChange,
  onGenerateDraft,
  onAssign,
  onStartEdit,
  onEditChange,
  onSaveEdit,
  onCancelEdit,
  onRevoke,
}) {
  const tokens = user.tournament_tokens || [];
  const isAdmin = user.role === 'admin';

  if (!isAdmin) {
    return (
      <span className="user-admin-muted">
        Los tokens solo aplican a administradores.
      </span>
    );
  }

  return (
    <div>
      {tokens.length > 0 ? (
        <div className="user-admin-token-list">
          {tokens.map((tokenRow) => {
            const isAvailable = tokenRow.status === 'available';
            const isEditing = editingTokenId === tokenRow.token_id;

            return (
              <div
                key={tokenRow.token_id}
                className={`user-admin-token-item ${isAvailable ? '' : 'used'}`}
              >
                {isEditing ? (
                  <input
                    className="user-admin-input"
                    type="text"
                    value={editingTokenValue}
                    onChange={(e) => onEditChange(e.target.value)}
                    maxLength={64}
                    disabled={busy}
                  />
                ) : (
                  <span className="user-admin-token-code">{tokenRow.token}</span>
                )}
                <span
                  className={`user-admin-token-status ${
                    isAvailable ? 'available' : 'used'
                  }`}
                >
                  {isAvailable ? 'Disponible' : 'Usado'}
                </span>
                {isAvailable && !isEditing && (
                  <button
                    type="button"
                    className="user-admin-btn user-admin-btn-secondary user-admin-btn-small"
                    onClick={() => onStartEdit(tokenRow)}
                    disabled={busy}
                  >
                    Editar
                  </button>
                )}
                {isEditing && (
                  <button
                    type="button"
                    className="user-admin-btn user-admin-btn-primary user-admin-btn-small"
                    onClick={() => onSaveEdit(user.id, tokenRow.token_id)}
                    disabled={busy}
                  >
                    Guardar
                  </button>
                )}
                {isEditing && (
                  <button
                    type="button"
                    className="user-admin-btn user-admin-btn-secondary user-admin-btn-small"
                    onClick={onCancelEdit}
                    disabled={busy}
                  >
                    Cancelar
                  </button>
                )}
                {isAvailable && !isEditing && (
                  <button
                    type="button"
                    className="user-admin-btn user-admin-btn-danger user-admin-btn-small"
                    onClick={() => onRevoke(user.id, tokenRow.token_id, tokenRow.token)}
                    disabled={busy}
                  >
                    Quitar
                  </button>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="user-admin-muted">Sin tokens asignados.</p>
      )}

      <div className="user-admin-new-token-box">
        <label className="user-admin-label">Nuevo token</label>
        <div className="user-admin-token-row">
          <input
            className="user-admin-input"
            type="text"
            placeholder="TOR-XXXXXX-XXXXXX"
            value={newTokenDraft}
            onChange={(e) => onDraftChange(e.target.value)}
            maxLength={64}
            disabled={busy}
          />
          <button
            type="button"
            className="user-admin-btn user-admin-btn-ghost"
            onClick={onGenerateDraft}
            disabled={busy}
          >
            Generar
          </button>
        </div>
        <div className="user-admin-actions">
          <button
            type="button"
            className="user-admin-btn user-admin-btn-primary user-admin-btn-small"
            onClick={() => onAssign(user.id)}
            disabled={busy || !newTokenDraft.trim()}
          >
            Asignar token
          </button>
        </div>
      </div>
    </div>
  );
}

function AddUserModal({ open, onClose, tournamentId = null }) {
  const { user } = useAuth();
  const userIsSuperuser = isSuperuser(user);

  const [form, setForm] = useState(EMPTY_FORM);
  const [tournaments, setTournaments] = useState([]);
  const [users, setUsers] = useState([]);
  const [expandedUserId, setExpandedUserId] = useState(null);
  const [newTokenDrafts, setNewTokenDrafts] = useState({});
  const [editingTokenId, setEditingTokenId] = useState(null);
  const [editingTokenValue, setEditingTokenValue] = useState('');
  const [loadingTournaments, setLoadingTournaments] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [tokenActionBusy, setTokenActionBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const tournamentRequired = form.role === 'anotador';
  const resolvedTournamentId =
    tournamentRequired && tournamentId ? String(tournamentId) : form.torneo_id;
  const showTournamentPicker = tournamentRequired && !tournamentId;
  const showTokenField = userIsSuperuser && form.role === 'admin';

  const loadUsers = async () => {
    if (!userIsSuperuser) return;
    setLoadingUsers(true);
    try {
      const response = await usersService.getUsers();
      setUsers(response?.data?.users || []);
    } catch {
      setUsers([]);
    } finally {
      setLoadingUsers(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    setForm({
      ...EMPTY_FORM,
      torneo_id: tournamentId && form.role === 'anotador' ? String(tournamentId) : '',
    });
    setFormError('');
    setSuccessMessage('');
    setExpandedUserId(null);
    setNewTokenDrafts({});
    setEditingTokenId(null);
    setEditingTokenValue('');
    loadUsers();
  }, [open, tournamentId, userIsSuperuser]);

  useEffect(() => {
    if (!open || !showTournamentPicker) return;

    let cancelled = false;
    const loadTournaments = async () => {
      setLoadingTournaments(true);
      try {
        const response = await configService.getTournaments();
        if (!cancelled) {
          setTournaments(response?.data?.tournaments || []);
        }
      } catch {
        if (!cancelled) {
          setTournaments([]);
        }
      } finally {
        if (!cancelled) {
          setLoadingTournaments(false);
        }
      }
    };

    loadTournaments();
    return () => {
      cancelled = true;
    };
  }, [open, showTournamentPicker]);

  if (!open) return null;

  const clearMessages = () => {
    setFormError('');
    setSuccessMessage('');
  };

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => {
      const next = { ...prev, [name]: value };
      if (name === 'role') {
        if (value === 'admin') {
          next.torneo_id = '';
        } else {
          next.tournament_token = '';
        }
      }
      return next;
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    clearMessages();

    const torneoId = Number(resolvedTournamentId);
    if (tournamentRequired && (!Number.isInteger(torneoId) || torneoId <= 0)) {
      setFormError('Selecciona un torneo para asignar al anotador');
      return;
    }

    if (showTokenField && !form.tournament_token.trim()) {
      setFormError('Asigna un token de creación de torneo al administrador');
      return;
    }

    setSubmitting(true);

    try {
      const payload = {
        email: form.email.trim(),
        role: form.role,
      };
      if (tournamentRequired && Number.isInteger(torneoId) && torneoId > 0) {
        payload.torneo_id = torneoId;
      }
      if (showTokenField && form.tournament_token.trim()) {
        payload.tournament_token = form.tournament_token.trim();
      }

      const response = await usersService.createUser(payload);
      setSuccessMessage(
        response?.message ||
          'Usuario creado. Se envió un correo para configurar la contraseña.'
      );
      setForm({
        ...EMPTY_FORM,
        torneo_id: tournamentId && form.role === 'anotador' ? String(tournamentId) : '',
      });
      await loadUsers();
    } catch (err) {
      setFormError(err.response?.data?.message || 'No se pudo crear el usuario');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAssignToken = async (targetUserId) => {
    const token = String(newTokenDrafts[targetUserId] || '').trim();
    if (!token) {
      setFormError('Escribe un token para asignar');
      return;
    }

    clearMessages();
    setTokenActionBusy(true);

    try {
      const response = await usersService.assignTournamentToken(targetUserId, token);
      setSuccessMessage(response?.message || 'Token asignado correctamente');
      setNewTokenDrafts((prev) => ({ ...prev, [targetUserId]: '' }));
      await loadUsers();
    } catch (err) {
      setFormError(err.response?.data?.message || 'No se pudo asignar el token');
    } finally {
      setTokenActionBusy(false);
    }
  };

  const handleSaveEdit = async (targetUserId, tokenId) => {
    const token = editingTokenValue.trim();
    if (!token) {
      setFormError('El token no puede estar vacío');
      return;
    }

    clearMessages();
    setTokenActionBusy(true);

    try {
      const response = await usersService.updateTournamentToken(targetUserId, tokenId, token);
      setSuccessMessage(response?.message || 'Token actualizado');
      setEditingTokenId(null);
      setEditingTokenValue('');
      await loadUsers();
    } catch (err) {
      setFormError(err.response?.data?.message || 'No se pudo actualizar el token');
    } finally {
      setTokenActionBusy(false);
    }
  };

  const handleRevoke = async (targetUserId, tokenId, tokenLabel) => {
    const confirmed = window.confirm(`¿Quitar el token ${tokenLabel}?`);
    if (!confirmed) return;

    clearMessages();
    setTokenActionBusy(true);

    try {
      const response = await usersService.revokeTournamentToken(targetUserId, tokenId);
      setSuccessMessage(response?.message || 'Token eliminado');
      await loadUsers();
    } catch (err) {
      setFormError(err.response?.data?.message || 'No se pudo quitar el token');
    } finally {
      setTokenActionBusy(false);
    }
  };

  const helperText = userIsSuperuser
    ? 'Gestiona usuarios existentes y sus tokens. Cada token disponible permite crear un torneo.'
    : form.role === 'admin'
      ? 'El administrador podrá crear sus propios torneos cuando tenga un token asignado por el superusuario.'
      : 'El anotador tendrá acceso de escritura solo en el torneo seleccionado.';

  const busy = submitting || tokenActionBusy;

  return (
    <div
      className="user-admin-overlay"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="user-admin-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="user-admin-title"
      >
        <header className="user-admin-header">
          <h2 id="user-admin-title" className="user-admin-title">
            {userIsSuperuser ? 'Administración de usuarios' : 'Invitar usuario'}
          </h2>
          <p className="user-admin-subtitle">{helperText}</p>
        </header>

        <div className="user-admin-body">
          {formError && <div className="user-admin-message error">{formError}</div>}
          {successMessage && <div className="user-admin-message success">{successMessage}</div>}

          <div className={`user-admin-grid ${userIsSuperuser ? '' : ''}`}>
            <section className="user-admin-card">
              <h3>Invitar nuevo usuario</h3>
              <p>
                Se enviará un correo con enlace para que el usuario defina su contraseña.
              </p>
              <form onSubmit={handleSubmit}>
                <label className="user-admin-label" htmlFor="add-user-email">
                  Correo electrónico
                </label>
                <input
                  id="add-user-email"
                  className="user-admin-input"
                  type="email"
                  name="email"
                  value={form.email}
                  onChange={handleChange}
                  placeholder="correo@dominio.com"
                  autoComplete="email"
                  required
                  disabled={busy}
                />

                <label className="user-admin-label" htmlFor="add-user-role">
                  Rol
                </label>
                <select
                  id="add-user-role"
                  className="user-admin-select"
                  name="role"
                  value={form.role}
                  onChange={handleChange}
                  disabled={busy}
                >
                  <option value="anotador">Anotador</option>
                  <option value="admin">Administrador</option>
                </select>

                {showTournamentPicker && (
                  <>
                    <label className="user-admin-label" htmlFor="add-user-torneo">
                      Torneo
                    </label>
                    <select
                      id="add-user-torneo"
                      className="user-admin-select"
                      name="torneo_id"
                      value={form.torneo_id}
                      onChange={handleChange}
                      required
                      disabled={busy || loadingTournaments}
                    >
                      <option value="">
                        {loadingTournaments ? 'Cargando torneos…' : 'Selecciona un torneo'}
                      </option>
                      {tournaments.map((t) => (
                        <option key={t.torneo_id} value={String(t.torneo_id)}>
                          {t.name} ({t.year})
                        </option>
                      ))}
                    </select>
                  </>
                )}

                {showTokenField && (
                  <>
                    <label className="user-admin-label" htmlFor="add-user-token">
                      Token de creación de torneo
                    </label>
                    <div className="user-admin-token-row">
                      <input
                        id="add-user-token"
                        className="user-admin-input"
                        type="text"
                        name="tournament_token"
                        value={form.tournament_token}
                        onChange={handleChange}
                        placeholder="TOR-XXXXXX-XXXXXX"
                        maxLength={64}
                        required
                        disabled={busy}
                      />
                      <button
                        type="button"
                        className="user-admin-btn user-admin-btn-ghost"
                        onClick={() =>
                          setForm((prev) => ({
                            ...prev,
                            tournament_token: generateTournamentToken(),
                          }))
                        }
                        disabled={busy}
                      >
                        Generar
                      </button>
                    </div>
                    <p className="user-admin-token-hint">
                      Un token = un torneo creado. Más adelante se asignará al confirmar un pago.
                    </p>
                  </>
                )}

                <div className="user-admin-actions">
                  <button
                    type="submit"
                    className="user-admin-btn user-admin-btn-primary"
                    disabled={
                      busy ||
                      (showTournamentPicker && loadingTournaments) ||
                      (showTokenField && !form.tournament_token.trim())
                    }
                  >
                    {submitting ? 'Guardando…' : 'Crear usuario y enviar correo'}
                  </button>
                </div>
              </form>
            </section>
          </div>

          {userIsSuperuser && (
            <section className="user-admin-card user-admin-users-section">
              <h3>Usuarios del sistema</h3>
              <p>Usuarios creados previamente. Expande un administrador para gestionar sus tokens.</p>
              <div className="user-admin-table-wrap">
                <table className="user-admin-table">
                  <thead>
                    <tr>
                      <th>Email</th>
                      <th>Rol</th>
                      <th>Tokens disp.</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((entry) => {
                      const fullName = [entry.name, entry.lname].filter(Boolean).join(' ').trim();
                      const isExpanded = expandedUserId === entry.id;
                      const canManageTokens = entry.role === 'admin';

                      return (
                        <Fragment key={entry.id}>
                          <tr>
                            <td>
                              <div>{entry.email}</div>
                              {fullName && (
                                <div className="user-admin-muted">{fullName}</div>
                              )}
                            </td>
                            <td>
                              <span className={rolePillClass(entry.role)}>{entry.role}</span>
                            </td>
                            <td>
                              {canManageTokens ? (
                                <span
                                  className={`user-admin-badge ${
                                    entry.tournament_tokens_available > 0 ? '' : 'muted'
                                  }`}
                                >
                                  {entry.tournament_tokens_available || 0}
                                </span>
                              ) : (
                                <span className="user-admin-muted">—</span>
                              )}
                            </td>
                            <td>
                              {canManageTokens ? (
                                <button
                                  type="button"
                                  className="user-admin-btn user-admin-btn-secondary user-admin-btn-small"
                                  onClick={() =>
                                    setExpandedUserId(isExpanded ? null : entry.id)
                                  }
                                  disabled={busy}
                                >
                                  {isExpanded ? 'Ocultar' : 'Gestionar tokens'}
                                </button>
                              ) : (
                                <span className="user-admin-muted">N/A</span>
                              )}
                            </td>
                          </tr>
                          {isExpanded && canManageTokens && (
                            <tr className="user-admin-user-row-expanded">
                              <td colSpan={4}>
                                <UserTokenManager
                                  user={entry}
                                  newTokenDraft={newTokenDrafts[entry.id] || ''}
                                  editingTokenId={editingTokenId}
                                  editingTokenValue={editingTokenValue}
                                  busy={busy}
                                  onDraftChange={(value) =>
                                    setNewTokenDrafts((prev) => ({
                                      ...prev,
                                      [entry.id]: value,
                                    }))
                                  }
                                  onGenerateDraft={() =>
                                    setNewTokenDrafts((prev) => ({
                                      ...prev,
                                      [entry.id]: generateTournamentToken(),
                                    }))
                                  }
                                  onAssign={handleAssignToken}
                                  onStartEdit={(tokenRow) => {
                                    setEditingTokenId(tokenRow.token_id);
                                    setEditingTokenValue(tokenRow.token);
                                  }}
                                  onEditChange={setEditingTokenValue}
                                  onSaveEdit={handleSaveEdit}
                                  onCancelEdit={() => {
                                    setEditingTokenId(null);
                                    setEditingTokenValue('');
                                  }}
                                  onRevoke={handleRevoke}
                                />
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                    {!loadingUsers && users.length === 0 && (
                      <tr>
                        <td colSpan={4}>No hay usuarios registrados.</td>
                      </tr>
                    )}
                    {loadingUsers && (
                      <tr>
                        <td colSpan={4}>Cargando usuarios…</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>

        <footer className="user-admin-footer">
          <button
            type="button"
            className="user-admin-btn user-admin-btn-secondary"
            onClick={onClose}
            disabled={busy}
          >
            Cerrar
          </button>
        </footer>
      </div>
    </div>
  );
}

export default AddUserModal;
