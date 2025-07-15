import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { DiscordProvider } from './discord';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DiscordProvider>
      <App />
    </DiscordProvider>
  </StrictMode>
);
