import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authService } from '../services/authService';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe ser usado dentro de un AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const verifyToken = useCallback(async () => {
    try {
      setLoading(true);
      const response = await authService.verifyToken();
      if (response.success) {
        setUser(response.data.user);
      } else {
        localStorage.removeItem('token');
        setUser(null);
      }
    } catch (error) {
      console.error('Error verificando token:', error);
      localStorage.removeItem('token');
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Verificar si hay un token guardado al cargar la aplicación
    const token = localStorage.getItem('token');
    if (token) {
      verifyToken();
    } else {
      setLoading(false);
    }
  }, [verifyToken]);

  const login = async (email, password) => {
    try {
      setError(null);
      const response = await authService.login(email, password);
      
      if (response.success) {
        localStorage.setItem('token', response.data.token);
        setUser(response.data.user);
        return { success: true, message: response.message };
      } else {
        setError(response.message);
        return { success: false, message: response.message };
      }
    } catch (error) {
      console.error('Error en login:', error);
      const errorMessage = error.response?.data?.message || error.message || 'Error de conexión. Intenta nuevamente.';
      setError(errorMessage);
      return { success: false, message: errorMessage };
    }
  };

  const register = async (email, password) => {
    try {
      setError(null);
      const response = await authService.register(email, password);
      
      if (response.success) {
        localStorage.setItem('token', response.data.token);
        setUser(response.data.user);
        return { success: true, message: response.message };
      } else {
        setError(response.message);
        return { success: false, message: response.message };
      }
    } catch (error) {
      console.error('Error en registro:', error);
      const errorMessage = error.response?.data?.message || error.message || 'Error de conexión. Intenta nuevamente.';
      setError(errorMessage);
      return { success: false, message: errorMessage };
    }
  };

  /**
   * Cierra sesión. Si pasas `redirectTo` (string) o `{ redirectTo }`, recarga la app en esa ruta
   * sin poner `user` en null antes: evita que `ProtectedRoute` pinte `/login` un instante.
   */
  const logout = useCallback((opts) => {
    localStorage.removeItem('token');
    const redirectTo =
      typeof opts === 'string'
        ? opts
        : opts && typeof opts === 'object'
          ? opts.redirectTo
          : null;
    if (redirectTo) {
      window.location.replace(redirectTo);
      return;
    }
    setUser(null);
    setError(null);
  }, []);

  const updateProfile = async ({ name, lname }) => {
    try {
      setError(null);
      const response = await authService.updateProfile({ name, lname });
      if (response.success) {
        setUser(response.data.user);
        return { success: true, message: response.message };
      }
      const message = response.message || 'No se pudo actualizar el perfil';
      setError(message);
      return { success: false, message };
    } catch (err) {
      console.error('Error actualizando perfil:', err);
      const errorMessage =
        err.response?.data?.message || err.message || 'Error al actualizar el perfil';
      setError(errorMessage);
      return { success: false, message: errorMessage };
    }
  };

  const clearError = () => {
    setError(null);
  };

  const value = {
    user,
    loading,
    error,
    login,
    register,
    logout,
    updateProfile,
    clearError,
    isAuthenticated: !!user
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
