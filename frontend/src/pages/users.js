import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import Navbar from '../components/navbar';
import { useAuth } from '../hooks/useAuth';
import { usersService } from '../services/usersService';
import { configService } from '../services/configService';
import { isSuperuser } from '../utils/userRoles';
import './users.css';

const EMPTY_FORM = {
  email: '',
  role: 'anotador',
  torneo_id: '',
};

const UsersPage = () => {
  const { user, loading, isAuthenticated } = useAuth();
  const [users, setUsers] = useState([]);
  const [tournaments, setTournaments] = useState([]);
  const [members, setMembers] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [selectedTournamentId, setSelectedTournamentId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const loadUsers = async () => {
    try {
      setError('');
      const response = await usersService.getUsers();
      setUsers(response?.data?.users || []);
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo cargar la lista de usuarios');
    }
  };

  const loadTournaments = async () => {
    try {
      const response = await configService.getTournaments();
      const list = response?.data?.tournaments || [];
      setTournaments(list);
      if (list.length > 0) {
        const firstId = String(list[0].torneo_id);
        setSelectedTournamentId((prev) => prev || firstId);
        setForm((prev) => ({ ...prev, torneo_id: prev.torneo_id || firstId }));
      }
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo cargar la lista de torneos');
    }
  };

  const loadMembers = async (tournamentId) => {
    if (!tournamentId) {
      setMembers([]);
      return;
    }
    try {
      const response = await usersService.getTournamentMembers(tournamentId);
      setMembers(response?.data?.members || []);
    } catch (err) {
      setMembers([]);
      setError(err.response?.data?.message || 'No se pudo cargar los miembros del torneo');
    }
  };

  useEffect(() => {
    if (isAuthenticated && isSuperuser(user)) {
      loadUsers();
      loadTournaments();
    }
  }, [isAuthenticated, user]);

  useEffect(() => {
    if (selectedTournamentId) {
      loadMembers(selectedTournamentId);
    }
  }, [selectedTournamentId]);

  const handleFormChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => {
      const next = { ...prev, [name]: value };
      if (name === 'role' && value === 'admin') {
        next.torneo_id = '';
      }
      return next;
    });
  };

  const handleTournamentChange = (event) => {
    const value = event.target.value;
    setSelectedTournamentId(value);
    setForm((prev) => ({ ...prev, torneo_id: value }));
  };

  const handleCreateUser = async (event) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError('');
    setMessage('');

    const torneoId = Number(form.torneo_id);
    if (form.role === 'anotador' && (!Number.isInteger(torneoId) || torneoId <= 0)) {
      setError('Selecciona un torneo para el anotador');
      setIsSubmitting(false);
      return;
    }

    try {
      const payload = {
        email: form.email,
        role: form.role,
      };
      if (form.role === 'anotador') {
        payload.torneo_id = torneoId;
      }

      const response = await usersService.createUser(payload);
      setForm((prev) => ({
        ...EMPTY_FORM,
        torneo_id: prev.role === 'anotador' ? prev.torneo_id : '',
      }));
      setMessage(response?.message || 'Usuario creado correctamente.');
      await loadUsers();
      if (form.role === 'anotador' && form.torneo_id) {
        await loadMembers(form.torneo_id);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo crear el usuario');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRoleChange = async (targetUserId, role) => {
    setError('');
    setMessage('');
    try {
      await usersService.updateUserRole(targetUserId, role);
      setMessage('Rol actualizado');
      await loadUsers();
      if (selectedTournamentId) {
        await loadMembers(selectedTournamentId);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo actualizar el rol');
    }
  };

  const handleDelete = async (targetUserId) => {
    const confirmed = window.confirm('¿Seguro que quieres eliminar este usuario?');
    if (!confirmed) return;

    setError('');
    setMessage('');
    try {
      await usersService.deleteUser(targetUserId);
      setMessage('Usuario eliminado');
      await loadUsers();
      if (selectedTournamentId) {
        await loadMembers(selectedTournamentId);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo eliminar el usuario');
    }
  };

  const handleRemoveMember = async (targetUserId) => {
    const confirmed = window.confirm('¿Quitar el acceso de este usuario al torneo?');
    if (!confirmed) return;

    setError('');
    setMessage('');
    try {
      await usersService.removeTournamentMember(selectedTournamentId, targetUserId);
      setMessage('Acceso al torneo eliminado');
      await loadMembers(selectedTournamentId);
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo quitar el acceso al torneo');
    }
  };

  if (!loading && !isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (!loading && !isSuperuser(user)) {
    return <Navigate to="/home" replace />;
  }

  return (
    <div className="users-page">
      <Navbar />
      <main className="users-content">
        <section className="users-card">
          <h1>Gestión de usuarios</h1>
          <p>
            Los anotadores requieren un torneo asignado. Los administradores pueden crearse sin
            torneo y crearán los suyos al iniciar sesión.
          </p>

          {message && <div className="users-message success">{message}</div>}
          {error && <div className="users-message error">{error}</div>}

          <form className="users-form" onSubmit={handleCreateUser}>
            <select
              name="role"
              value={form.role}
              onChange={handleFormChange}
              disabled={isSubmitting}
            >
              <option value="anotador">anotador</option>
              <option value="admin">admin</option>
            </select>
            {form.role === 'anotador' && (
              <select
                name="torneo_id"
                value={form.torneo_id}
                onChange={handleFormChange}
                disabled={isSubmitting || tournaments.length === 0}
                required
              >
                <option value="">Selecciona torneo</option>
                {tournaments.map((t) => (
                  <option key={t.torneo_id} value={String(t.torneo_id)}>
                    {t.name} ({t.year})
                  </option>
                ))}
              </select>
            )}
            <input
              type="email"
              name="email"
              placeholder="correo@dominio.com"
              value={form.email}
              onChange={handleFormChange}
              required
              disabled={isSubmitting}
            />
            <button
              type="submit"
              disabled={isSubmitting || (form.role === 'anotador' && !form.torneo_id)}
            >
              {isSubmitting ? 'Guardando...' : 'Agregar usuario y enviar correo'}
            </button>
          </form>
        </section>

        <section className="users-card">
          <h2>Miembros por torneo</h2>
          <div className="users-form">
            <select
              value={selectedTournamentId}
              onChange={handleTournamentChange}
              disabled={tournaments.length === 0}
            >
              <option value="">Selecciona torneo</option>
              {tournaments.map((t) => (
                <option key={t.torneo_id} value={String(t.torneo_id)}>
                  {t.name} ({t.year})
                </option>
              ))}
            </select>
          </div>
          <div className="users-table-wrapper">
            <table className="users-table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Email</th>
                  <th>Rol</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {members.map((entry) => {
                  const full = [entry.name, entry.lname].filter(Boolean).join(' ').trim();
                  return (
                    <tr key={entry.id}>
                      <td>{full || '—'}</td>
                      <td>{entry.email}</td>
                      <td>{entry.role}</td>
                      <td>
                        <button
                          type="button"
                          className="users-delete-btn"
                          onClick={() => handleRemoveMember(entry.user_id)}
                        >
                          Quitar acceso
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {selectedTournamentId && members.length === 0 && (
                  <tr>
                    <td colSpan={4}>No hay miembros asignados a este torneo.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="users-card">
          <h2>Usuarios del sistema</h2>
          <div className="users-table-wrapper">
            <table className="users-table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Email</th>
                  <th>Rol</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {users.map((entry) => {
                  const isSuper = isSuperuser({ role: entry.role });
                  const full = [entry.name, entry.lname].filter(Boolean).join(' ').trim();
                  return (
                    <tr key={entry.id}>
                      <td>{full || '—'}</td>
                      <td>{entry.email}</td>
                      <td>
                        {isSuper ? (
                          <span className="users-role-fixed">superuser</span>
                        ) : (
                          <select
                            value={entry.role}
                            onChange={(event) => handleRoleChange(entry.id, event.target.value)}
                          >
                            <option value="admin">admin</option>
                            <option value="anotador">anotador</option>
                          </select>
                        )}
                      </td>
                      <td>
                        {isSuper ? (
                          <span className="users-role-fixed">Sin acciones</span>
                        ) : (
                          <button
                            type="button"
                            className="users-delete-btn"
                            onClick={() => handleDelete(entry.id)}
                          >
                            Eliminar
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
};

export default UsersPage;
