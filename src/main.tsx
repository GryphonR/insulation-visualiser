import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { startSync } from './engine/sync';
import './styles.css';
import './drafting.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
void startSync();
