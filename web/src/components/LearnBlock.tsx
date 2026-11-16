import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { LearnView } from '../lib/api';
import { useProfileRef } from '../hooks/useProfileId';
import { onLearnUpdate } from '../lib/learnBus';

const LEVEL_FR: Record<number, string> = { 1: 'très faible', 2: 'faible', 3: 'modérée', 4: 'élevée', 5: 'très élevée' };
const lvl = (n: number) => `${n} sur 5 (${LEVEL_FR[n] ?? '—'})`;

/** "Déclaré / révélé": the declared risk tolerance next to the one the decisions reveal (GET /api/profile/{id}/learn). */
export function LearnBlock() {
  const { profileId } = useProfileRef();
  const [view, setView] = useState<{ status: 'loading' } | { status: 'error' } | { status: 'ready'; data: LearnView }>({ status: 'loading' });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!profileId) return;
    let cancelled = false;
    setView({ status: 'loading' });
    api
      .learn(profileId)
      .then((data) => !cancelled && setView({ status: 'ready', data }))
      .catch(() => !cancelled && setView({ status: 'error' }));
    return () => {
      cancelled = true;
    };
  }, [profileId, nonce]);

  // A recorded choice brings the fresh comparison (or asks for a reload).
  useEffect(
    () =>
      onLearnUpdate((learn) => {
        if (learn) setView({ status: 'ready', data: learn });
        else setNonce((n) => n + 1);
      }),
    [],
  );

  if (!profileId) return null;
  return (
    <section className="learn" aria-labelledby="learn-title" data-testid="learn-block">
      <h3 id="learn-title" className="learn__title">
        Déclaré et révélé
      </h3>
      {view.status === 'loading' && <div className="skeleton skeleton--line" role="status" aria-label="Chargement" />}
      {view.status === 'error' && (
        <div className="inline-error" role="alert">
          <p>Le comparatif n’est pas disponible : le serveur ne répond pas.</p>
          <button type="button" className="link-btn link-btn--dark" onClick={() => setNonce((n) => n + 1)}>
            Réessayer
          </button>
        </div>
      )}
      {view.status === 'ready' && (
        <>
          <dl className="stats">
            <div>
              <dt>Déclarée</dt>
              <dd>{view.data.declared} / 5</dd>
            </div>
            <div>
              <dt>Révélée</dt>
              <dd>{view.data.revealed.established && view.data.revealed.level !== null ? `${view.data.revealed.level} / 5` : '—'}</dd>
            </div>
            <div>
              <dt>Niveau retenu</dt>
              <dd>{view.data.retained_level} / 5</dd>
            </div>
          </dl>
          {!view.data.revealed.established && (
            <p className="inline-note" data-testid="learn-insufficient">
              Pas assez de décisions : {view.data.revealed.n} / {view.data.revealed.needed}.
            </p>
          )}
          <ul className="learn__messages">
            {view.data.messages.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
          {view.data.update_to !== null && (
            <p className="inline-note">
              {/* The API has no endpoint to apply this update yet (contract gap): the figure is shown, nothing is faked. */}
              Mise à jour possible de la tolérance déclarée à {lvl(view.data.update_to)}.
            </p>
          )}
        </>
      )}
    </section>
  );
}
