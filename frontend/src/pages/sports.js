import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import Navbar from '../components/navbar';
import { useAuth } from '../hooks/useAuth';
import { sportsService } from '../services/sportsService';
import { isSuperuser } from '../utils/userRoles';
import './sports.css';

const EMPTY_FORM = {
  name: '',
  brief_description: '',
};

const SportsPage = () => {
  const { user, loading, isAuthenticated } = useAuth();
  const [sports, setSports] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const loadSports = async () => {
    try {
      setError('');
      const response = await sportsService.getSports();
      setSports(response?.data?.sports || []);
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo cargar la lista de deportes');
    }
  };

  useEffect(() => {
    if (isAuthenticated && isSuperuser(user)) {
      loadSports();
    }
  }, [isAuthenticated, user]);

  const handleFormChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleCreateSport = async (event) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError('');
    setMessage('');

    try {
      const response = await sportsService.createSport({
        name: form.name.trim(),
        brief_description: form.brief_description.trim(),
      });
      setForm(EMPTY_FORM);
      setMessage(response?.message || 'Deporte creado correctamente.');
      await loadSports();
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo crear el deporte');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!loading && !isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (!loading && !isSuperuser(user)) {
    return <Navigate to="/home" replace />;
  }

  return (
    <div className="sports-page">
      <Navbar />
      <main className="sports-content">
        <section className="sports-card">
          <h1>Gestión de deportes</h1>
          <p>
            Solo el superusuario puede registrar nuevos deportes en el sistema. Cada deporte
            incluye un nombre y una descripción breve.
          </p>

          {message && <div className="sports-message success">{message}</div>}
          {error && <div className="sports-message error">{error}</div>}

          <form className="sports-form" onSubmit={handleCreateSport}>
            <input
              type="text"
              name="name"
              placeholder="Nombre del deporte"
              value={form.name}
              onChange={handleFormChange}
              maxLength={255}
              required
              disabled={isSubmitting}
            />
            <textarea
              name="brief_description"
              placeholder="Descripción breve"
              value={form.brief_description}
              onChange={handleFormChange}
              maxLength={500}
              rows={2}
              disabled={isSubmitting}
            />
            <button type="submit" disabled={isSubmitting || !form.name.trim()}>
              {isSubmitting ? 'Guardando...' : 'Agregar deporte'}
            </button>
          </form>
        </section>

        <section className="sports-card">
          <h2>Deportes registrados</h2>
          <div className="sports-table-wrapper">
            <table className="sports-table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Descripción breve</th>
                </tr>
              </thead>
              <tbody>
                {sports.map((sport) => (
                  <tr key={sport.sport_id}>
                    <td>{sport.name}</td>
                    <td className="description-cell">{sport.brief_description || '—'}</td>
                  </tr>
                ))}
                {sports.length === 0 && (
                  <tr>
                    <td colSpan={2}>No hay deportes registrados todavía.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
};

export default SportsPage;
