import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
// Minimal theme profile — must load after index.css so `.theme-minimal`
// overrides win; removing the class restores the classic design intact.
import './themes/minimal.css';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('#root element missing');

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
