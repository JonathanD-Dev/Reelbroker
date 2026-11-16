import { useCatalogMeta } from '../lib/catalog';
import { apiEnabled } from '../lib/api';

/**
 * Permanent strip above every page: simulation only, not financial advice. A second line tells where
 * the data comes from when it is not the live backend.
 */
export function AppBanner() {
  const { source, loading, failed, loggedIn } = useCatalogMeta();
  return (
    <div className="app-banner">
      <p className="app-banner__main">Simulation — pas un conseil financier</p>
      {!loading && source === 'mock' && failed && (
        <p className="app-banner__sub">Données fictives : le serveur d’analyse n’est pas joignable</p>
      )}
      {!loading && source === 'mock' && !failed && loggedIn && (
        <p className="app-banner__sub">
          {apiEnabled()
            ? 'Profil d’investisseur manquant : répondez au questionnaire'
            : 'Données fictives : mode hors ligne, sans serveur d’analyse'}
        </p>
      )}
      {!loading && source === 'snapshot' && (
        <p className="app-banner__sub">
          Copie locale des données (serveur d’analyse hors ligne)
        </p>
      )}
    </div>
  );
}
