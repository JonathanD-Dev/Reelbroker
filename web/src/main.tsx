import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/global.css';
// Couleurs « Blanc et rouge BNC » : chargé après global.css, ne change que les couleurs.
import './styles/theme-bnc.css';
import { resetLocalDataIfOutdated } from './lib/localReset';

// Before the first render: accounts kept by an earlier version are cleared once (see localReset.ts).
resetLocalDataIfOutdated();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
