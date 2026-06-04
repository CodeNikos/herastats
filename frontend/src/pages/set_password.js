import React, { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { authService } from '../services/authService';
import './set_password.css';

const SetPasswordPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token') || '';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');

    if (!token) {
      setError('Token inválido o ausente');
      return;
    }

    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres');
      return;
    }

    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden');
      return;
    }

    setLoading(true);
    try {
      await authService.setPassword(token, password);
      setMessage('Contraseña actualizada. Ahora puedes iniciar sesión.');
      setTimeout(() => navigate('/login'), 1200);
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo actualizar la contraseña');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="set-password-page">
      <div className="set-password-card">
        <h1>Configurar contraseña</h1>
        <p>Define tu nueva contraseña para ingresar a Herastats.</p>

        {message && <div className="set-password-message success">{message}</div>}
        {error && <div className="set-password-message error">{error}</div>}

        <form onSubmit={handleSubmit} className="set-password-form">
          <input
            type="password"
            placeholder="Nueva contraseña"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            minLength={6}
            required
            disabled={loading}
          />
          <input
            type="password"
            placeholder="Confirmar contraseña"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            minLength={6}
            required
            disabled={loading}
          />
          <button type="submit" disabled={loading}>
            {loading ? 'Guardando...' : 'Guardar contraseña'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default SetPasswordPage;
