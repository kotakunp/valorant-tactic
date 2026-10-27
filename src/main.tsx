import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

// Ask the browser not to evict saved strategies under storage pressure (best effort).
navigator.storage?.persist?.().catch(() => {});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
