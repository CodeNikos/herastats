import React, { useEffect, useRef, useState } from 'react';
import LoginForm from '../components/LoginForm';
import RegisterForm from '../components/RegisterForm';
import { useAuth } from '../hooks/useAuth';
import { showToast } from '../utils/toast';
import '../styles/toast.css';
import './LoginPage.css';

const LoginPage = () => {
  const [isLoginMode, setIsLoginMode] = useState(true);
  const { error, clearError } = useAuth();
  const lastLoginErrorToastRef = useRef('');

  useEffect(() => {
    clearError();
    return () => clearError();
  }, [clearError]);

  useEffect(() => {
    if (!error) {
      lastLoginErrorToastRef.current = '';
    }
  }, [error]);

  useEffect(() => {
    if (!isLoginMode || !error) return;
    const message = String(error).trim();
    if (!message || message === lastLoginErrorToastRef.current) return;
    lastLoginErrorToastRef.current = message;
    showToast(message, { variant: 'error', duration: 4500 });
  }, [error, isLoginMode]);

  const toggleMode = () => {
    clearError();
    lastLoginErrorToastRef.current = '';
    setIsLoginMode(!isLoginMode);
  };

  return (
    <main className="login-page-route">
      {isLoginMode ? (
        <LoginForm />
      ) : (
        <RegisterForm onToggleMode={toggleMode} />
      )}
    </main>
  );
};

export default LoginPage;
