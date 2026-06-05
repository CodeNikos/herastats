import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { AiOutlineMail, AiOutlineEye, AiOutlineEyeInvisible } from 'react-icons/ai';
import './LoginForm.css';

const LoginForm = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });
  const [isLoading, setIsLoading] = useState(false);
  const { login, error, clearError } = useAuth();

  const [showPassword, setShowPassword] = useState(false);

  const handleCheckboxChange = () => {
    setShowPassword(!showPassword);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
    if (error) clearError();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);

    const result = await login(formData.email, formData.password);

    if (result.success) {
      navigate('/home');
    } else {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-page-container">
      <div className="card-container">
        <div className="login-form">
          <div className="parent">
            <div className="login-header">
              <div className="login-logo">
                <img src="/Hera_logo.png" alt="Herastats" /> <p>Herastats</p>
              </div>
            </div>

            <div className="login-body">
              <div className="login-form">
                <div className="lbody">
                  <p>Inicia el viaje</p>
                </div>
                <h3>Anota partidos con Herastats</h3>
                <form onSubmit={handleSubmit}>
                  <div className="form-group">
                    <input
                      type="email"
                      name="email"
                      value={formData.email}
                      placeholder="nombre@correo.com"
                      onChange={handleChange}
                      required
                    />
                    <label>Email</label>
                    <AiOutlineMail className="email-icon" />
                  </div>
                  <div className="form-group">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      name="password"
                      value={formData.password}
                      placeholder="Password"
                      onChange={handleChange}
                      required
                      disabled={isLoading}
                    />
                    <label>Contraseña</label>
                    {showPassword ? (
                      <AiOutlineEye className="password-icon" />
                    ) : (
                      <AiOutlineEyeInvisible className="password-icon" />
                    )}
                  </div>
                  <div className="showpass">
                    <input
                      type="checkbox"
                      name="show-password"
                      className="show-password"
                      id="show-password"
                      onChange={handleCheckboxChange}
                    />
                    <label className="label-show-password" htmlFor="show-password">
                      <span>Mostrar Password</span>
                    </label>
                  </div>
                  <button type="submit" disabled={isLoading}>
                    {isLoading ? 'Ingresando…' : 'Log In'}
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
        <div className="login-img">
          <img src="/campo4.jpeg" alt="" />
        </div>
      </div>
    </div>
  );
};

export default LoginForm;
