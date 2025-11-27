import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { ToastProvider } from './components/ui';
import { DiscordProvider } from './discord';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DiscordProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </DiscordProvider>
  </StrictMode>
);
