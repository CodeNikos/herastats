import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import './ProfileEditModal.css';

function ProfileEditModal({ open, onClose }) {
  const { user, updateProfile } = useAuth();
  const [name, setName] = useState('');
  const [lname, setLname] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (!open || !user) return;
    setName(user.name ?? '');
    setLname(user.lname ?? '');
    setFormError('');
  }, [open, user]);

  if (!open) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    setSaving(true);
    try {
      const result = await updateProfile({
        name: name.trim(),
        lname: lname.trim(),
      });
      if (result.success) {
        onClose();
      } else {
        setFormError(result.message || 'No se pudo guardar');
      }
    } catch (err) {
      setFormError(err.message || 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="profile-edit-overlay"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="profile-edit-dialog" role="dialog" aria-modal="true" aria-labelledby="profile-edit-title">
        <h2 id="profile-edit-title" className="profile-edit-title">
          Editar perfil
        </h2>
        {user?.email && (
          <p className="profile-edit-email">{user.email}</p>
        )}
        <form onSubmit={handleSubmit}>
          <label className="profile-edit-label" htmlFor="profile-edit-name">
            Nombre
          </label>
          <input
            id="profile-edit-name"
            className="profile-edit-input"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="given-name"
            disabled={saving}
          />
          <label className="profile-edit-label" htmlFor="profile-edit-lname">
            Apellido
          </label>
          <input
            id="profile-edit-lname"
            className="profile-edit-input"
            type="text"
            value={lname}
            onChange={(e) => setLname(e.target.value)}
            autoComplete="family-name"
            disabled={saving}
          />
          {formError && <p className="profile-edit-error">{formError}</p>}
          <div className="profile-edit-actions">
            <button type="button" className="profile-edit-btn profile-edit-btn-secondary" onClick={onClose} disabled={saving}>
              Cancelar
            </button>
            <button type="submit" className="profile-edit-btn profile-edit-btn-primary" disabled={saving}>
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default ProfileEditModal;
