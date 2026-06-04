import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import Navbar from '../components/navbar';
import { useAuth } from '../hooks/useAuth';
import { usersService } from '../services/usersService';
import { isSuperuser } from '../utils/userRoles';
import './users.css';

const EMPTY_FORM = {
  email: '',
  role: 'anotador',
};

const UsersPage = () => {
  const { user, loading, isAuthenticated } = useAuth();
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
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

  useEffect(() => {
    if (isAuthenticated && isSuperuser(user)) {
      loadUsers();
    }
  }, [isAuthenticated, user]);

  const handleFormChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleCreateUser = async (event) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError('');
    setMessage('');

    try {
      await usersService.createUser(form);
      setForm(EMPTY_FORM);
      setMessage('Usuario creado. Se envió solicitud al correo para definir contraseña.');
      await loadUsers();
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
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo eliminar el usuario');
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
          <p>Solo el superuser puede agregar, editar rol y eliminar usuarios.</p>

          {message && <div className="users-message success">{message}</div>}
          {error && <div className="users-message error">{error}</div>}

          <form className="users-form" onSubmit={handleCreateUser}>
            <input
              type="email"
              name="email"
              placeholder="correo@dominio.com"
              value={form.email}
              onChange={handleFormChange}
              required
              disabled={isSubmitting}
            />
            <select
              name="role"
              value={form.role}
              onChange={handleFormChange}
              disabled={isSubmitting}
            >
              <option value="anotador">anotador</option>
              <option value="admin">admin</option>
            </select>
            <button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Guardando...' : 'Agregar usuario y enviar correo'}
            </button>
          </form>
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
