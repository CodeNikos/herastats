import { useEffect, useState } from 'react';
import { usersService } from '../services/usersService';
import { configService } from '../services/configService';
import './ProfileEditModal.css';

const EMPTY_FORM = {
  email: '',
  role: 'anotador',
  torneo_id: '',
};

function AddUserModal({ open, onClose, tournamentId = null }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [tournaments, setTournaments] = useState([]);
  const [loadingTournaments, setLoadingTournaments] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    if (!open) return;
    setForm({
      ...EMPTY_FORM,
      torneo_id: tournamentId ? String(tournamentId) : '',
    });
    setFormError('');
    setSuccessMessage('');
  }, [open, tournamentId]);

  useEffect(() => {
    if (!open || tournamentId) return;

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
  }, [open, tournamentId]);

  if (!open) return null;

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setFormError('');
    setSuccessMessage('');

    const torneoId = Number(form.torneo_id || tournamentId);
    if (!Number.isInteger(torneoId) || torneoId <= 0) {
      setFormError('Selecciona un torneo para asignar al usuario');
      return;
    }

    setSubmitting(true);

    try {
      const response = await usersService.createUser({
        email: form.email.trim(),
        role: form.role,
        torneo_id: torneoId,
      });
      setSuccessMessage(
        response?.message ||
          'Usuario creado. Se envió un correo para configurar la contraseña.'
      );
      setForm({
        ...EMPTY_FORM,
        torneo_id: tournamentId ? String(tournamentId) : '',
      });
    } catch (err) {
      setFormError(err.response?.data?.message || 'No se pudo crear el usuario');
    } finally {
      setSubmitting(false);
    }
  };

  const showTournamentPicker = !tournamentId;

  return (
    <div
      className="profile-edit-overlay"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="profile-edit-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-user-title"
      >
        <h2 id="add-user-title" className="profile-edit-title">
          Agregar usuario
        </h2>
        <p className="profile-edit-email">
          El usuario tendrá acceso de escritura solo en el torneo seleccionado.
          Se enviará un correo con un enlace para crear su contraseña.
        </p>
        <form onSubmit={handleSubmit}>
          {showTournamentPicker && (
            <>
              <label className="profile-edit-label" htmlFor="add-user-torneo">
                Torneo
              </label>
              <select
                id="add-user-torneo"
                className="profile-edit-input"
                name="torneo_id"
                value={form.torneo_id}
                onChange={handleChange}
                required
                disabled={submitting || loadingTournaments}
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
          <label className="profile-edit-label" htmlFor="add-user-email">
            Correo electrónico
          </label>
          <input
            id="add-user-email"
            className="profile-edit-input"
            type="email"
            name="email"
            value={form.email}
            onChange={handleChange}
            placeholder="correo@dominio.com"
            autoComplete="email"
            required
            disabled={submitting}
          />
          <label className="profile-edit-label" htmlFor="add-user-role">
            Rol
          </label>
          <select
            id="add-user-role"
            className="profile-edit-input"
            name="role"
            value={form.role}
            onChange={handleChange}
            disabled={submitting}
          >
            <option value="anotador">Anotador</option>
            <option value="admin">Administrador</option>
          </select>
          {formError && <p className="profile-edit-error">{formError}</p>}
          {successMessage && (
            <p className="profile-edit-success">{successMessage}</p>
          )}
          <div className="profile-edit-actions">
            <button
              type="button"
              className="profile-edit-btn profile-edit-btn-secondary"
              onClick={onClose}
              disabled={submitting}
            >
              Cerrar
            </button>
            <button
              type="submit"
              className="profile-edit-btn profile-edit-btn-primary"
              disabled={submitting || (showTournamentPicker && loadingTournaments)}
            >
              {submitting ? 'Enviando…' : 'Agregar y enviar correo'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default AddUserModal;
