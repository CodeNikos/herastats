import React from 'react';
import ReactDOM from 'react-dom/client';

import App from './App';
import { AuthProvider } from './hooks/useAuth';
import { UiAmbientProvider } from './context/UiAmbientProvider';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <UiAmbientProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </UiAmbientProvider>
  </React.StrictMode>
);
