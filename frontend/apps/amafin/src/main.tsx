import React from 'react';
import ReactDOM from 'react-dom/client';
import { injectThemeVars } from '@amafin/ui';
import './index.css';
import { App } from './App';

// Inject CSS variables from theme tokens (same as intern's main.jsx)
injectThemeVars();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
