import { createRoot } from 'react-dom/client';
import { ApplicationRoot } from './ApplicationRoot';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <ApplicationRoot
    mode={import.meta.env.MODE}
    hostname={window.location.hostname}
    search={window.location.search}
  />
);
