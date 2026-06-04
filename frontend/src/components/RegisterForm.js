import React, { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { AiOutlineMail, AiOutlineEye, AiOutlineEyeInvisible  } from "react-icons/ai";
import './RegisterForm.css'

const RegisterForm = ({ onToggleMode }) => {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [validationErrors, setValidationErrors] = useState({});
  const { register, error, clearError } = useAuth();

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    // Limpiar errores cuando el usuario empiece a escribir
    if (error) clearError();
    if (validationErrors[name]) {
      setValidationErrors(prev => ({
        ...prev,
        [name]: ''
      }));
    }
  };

  const validateForm = () => {
    const errors = {};


    if (!formData.email.trim()) {
      errors.email = 'El email es obligatorio';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      errors.email = 'El email no es válido';
    }

    if (!formData.password) {
      errors.password = 'La contraseña es obligatoria';
    } else if (formData.password.length < 8) {
      errors.password = 'La contraseña debe tener al menos 8 caracteres';
    }

    if (formData.password !== formData.confirmPassword) {
      errors.confirmPassword = 'Las contraseñas no coinciden';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    setIsLoading(true);

    const result = await register(formData.email, formData.password);
    
    if (result.success) {
      setIsLoading(false);
      // Limpiar el formulario
      setFormData({
        email: '',
        password: '',
        confirmPassword: '',
      });
      // Regresar al formulario de login
      onToggleMode();
    } else {
      setIsLoading(false);
    }
  };

  return (
    <div className='login-page-container'>
    <div className="card-container">
      <div className='login-form'>
        <div className="parent">
            <div className="login-header">
              <div className='login-logo'>
               <img src="/Hera_logo.png" /> <p>Herastats</p>
              </div>
            </div>

            <div className="login-body">
              <div className='login-form'>
              <div className='lbody'><p>Inicia el viaje</p></div>
              <h3>Anota partidos con Herastats</h3>

              {error && (
        <div className="error-message text-center mb-4">
          {error}
        </div>
      )}

              <form onSubmit={handleSubmit}>

              <div className="form-group">
          <label htmlFor="email" className="form-label">
            Email
          </label>
          <input
            type="email"
            id="email"
            name="email"
            value={formData.email}
            onChange={handleChange}
            className="form-input"
            placeholder="tu@email.com"
            required
            disabled={isLoading}
          />
          {validationErrors.email && (
            <div className="error-message">{validationErrors.email}</div>
          )}
        </div>

        <div className="form-group">
          <label htmlFor="password" className="form-label">
            Contraseña
          </label>
          <input
            type="password"
            id="password"
            name="password"
            value={formData.password}
            onChange={handleChange}
            className="form-input"
            placeholder="Mínimo 8 caracteres"
            required
            disabled={isLoading}
          />
          {validationErrors.password && (
            <div className="error-message">{validationErrors.password}</div>
          )}
        </div>

        <div className="form-group">
          <label htmlFor="confirmPassword" className="form-label">
            Confirmar Contraseña
          </label>
          <input
            type="password"
            id="confirmPassword"
            name="confirmPassword"
            value={formData.confirmPassword}
            onChange={handleChange}
            className="form-input"
            placeholder="Repite tu contraseña"
            required
            disabled={isLoading}
          />
          {validationErrors.confirmPassword && (
            <div className="error-message">{validationErrors.confirmPassword}</div>
          )}
        </div>

        <button
          type="submit"
          className="btn btn-primary"
          style={{ width: '100%' }}
          disabled={isLoading}
        >
          {isLoading ? 'Creando cuenta...' : 'Crear Cuenta'}
        </button>
      </form>
                   
              </div>
            </div>

            <div className="login-footer">
              <p>Tienes cuenta <a href='#' onClick={(e) => { e.preventDefault(); onToggleMode(); }}>Ingresa</a></p>
            </div>
        </div>
      </div>
      <div className='login-img'>
        <img src="/campo4.jpeg" />
      </div>

    </div>
  </div>
  );
};

export default RegisterForm;
