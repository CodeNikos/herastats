import React from 'react';
import ReactDOM from 'react-dom/client';
import { HelmetProvider } from 'react-helmet-async';

import App from './App';
import { AuthProvider } from './hooks/useAuth';
import { UiAmbientProvider } from './context/UiAmbientProvider';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <HelmetProvider>
      <UiAmbientProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </UiAmbientProvider>
    </HelmetProvider>
  </React.StrictMode>
);
