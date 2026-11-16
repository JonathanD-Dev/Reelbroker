import { useEffect, useState } from 'react';
import type { Impact } from '../lib/api';
import { formatPct } from '../lib/format';

/** Weights offered by the slider (each one is a real backend computation, cached by weight). */
export const WEIGHT_STEPS = [0.01, 0.02, 0.05, 0.1, 0.15, 0.2, 0.3];

const VERDICT_LABEL = { compatible: 'Compatible', tension: 'Tension', conflict: 'Conflit' } as const;

interface Props {
  /** Current weight used by the API for the impact block (undefined = API default). */
  weight: number | undefined;
  /** Weight the displayed `impact` was computed for (to show a pending state while recomputing). */
  loadedWeight: number | undefined;
  impact: Impact | undefined;
  onChange: (w: number) => void;
}

/**
 * "Si j’achetais X % du portefeuille" : moves the weight, the backend recomputes ex-ante volatility, worst
 * drawdown and the fit verdict of the simulated portfolio. Nothing is computed in the browser.
 */
export function ImpactSlider({ weight, loadedWeight, impact, onChange }: Props) {
  const nearest = (w: number | undefined) => {
    if (w === undefined) return WEIGHT_STEPS.indexOf(0.05);
    return WEIGHT_STEPS.reduce((best, s, i) => (Math.abs(s - w) < Math.abs(WEIGHT_STEPS[best] - w) ? i : best), 0);
  };
  const [idx, setIdx] = useState(nearest(weight));
  useEffect(() => setIdx(nearest(weight)), [weight]); // eslint-disable-line react-hooks/exhaustive-deps
  const chosen = WEIGHT_STEPS[idx];
  const pending = loadedWeight === undefined ? false : Math.abs(loadedWeight - chosen) > 1e-6;
  const before = impact?.before;
  const after = impact?.after;
  const v = (s: typeof before) => s?.vol ?? s?.ex_ante_vol;
  const fit = impact?.fit;

  return (
    <section className="wslider" data-testid="impact-slider" aria-label="Impact selon le poids dans le portefeuille" aria-busy={pending}>
      <h4 className="wslider__title">Si j’achetais {formatPct(chosen, 0)} du portefeuille</h4>
      <input
        type="range"
        min={0}
        max={WEIGHT_STEPS.length - 1}
        step={1}
        value={idx}
        aria-label="Poids dans le portefeuille simulé"
        aria-valuetext={formatPct(chosen, 0)}
        onChange={(e) => setIdx(Number(e.target.value))}
        onPointerUp={() => onChange(WEIGHT_STEPS[idx])}
        onKeyUp={() => onChange(WEIGHT_STEPS[idx])}
        onBlur={() => onChange(WEIGHT_STEPS[idx])}
      />
      <div className="wslider__ticks" aria-hidden="true">
        {WEIGHT_STEPS.map((s) => (
          <span key={s}>{Math.round(s * 100)}</span>
        ))}
      </div>
      {pending && <p className="wslider__pending">Calcul en cours…</p>}
      {!pending && (before || after || fit) && (
        <dl className="wslider__grid" data-testid="impact-grid">
          {v(before) !== undefined && v(after) !== undefined && (
            <div>
              <dt>Volatilité du portefeuille</dt>
              <dd>
                {formatPct(v(before)!)} → <strong>{formatPct(v(after)!)}</strong>
              </dd>
            </div>
          )}
          {before?.max_drawdown !== undefined && after?.max_drawdown !== undefined && (
            <div>
              <dt>Pire baisse historique</dt>
              <dd>
                {formatPct(before.max_drawdown)} → <strong>{formatPct(after.max_drawdown)}</strong>
              </dd>
            </div>
          )}
          {fit && (
            <div>
              <dt>Adéquation</dt>
              <dd className={`wslider__fit wslider__fit--${fit.verdict}`}>
                <span aria-hidden="true">{fit.verdict === 'compatible' ? '✓' : fit.verdict === 'tension' ? '!' : '✗'}</span>{' '}
                {VERDICT_LABEL[fit.verdict]}
                {fit.max_weight_within_profile !== undefined && ` · maximum dans votre profil : ${formatPct(fit.max_weight_within_profile, 0)}`}
              </dd>
            </div>
          )}
        </dl>
      )}
      {impact?.notes?.map((n) => (
        <p key={n} className="wslider__note">
          {n}
        </p>
      ))}
      <p className="wslider__note">Estimation sur l’historique, pas une prévision. Simulation uniquement.</p>
    </section>
  );
}
