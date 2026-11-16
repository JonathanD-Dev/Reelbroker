import type { Outlook, SensitivityPoint } from '../lib/api';
import { formatPct } from '../lib/format';

/** Baseline = the grid pair whose central annual rate equals the displayed central scenario. */
export function baselinePoint(outlook: Outlook): SensitivityPoint | null {
  const grid = outlook.sensitivity ?? [];
  return grid.find((p) => Math.abs(p.central_annual - outlook.scenarios.central.annual) < 1e-4) ?? null;
}

const uniq = (xs: number[]) => [...new Set(xs)].sort((a, b) => a - b);

interface Props {
  outlook: Outlook;
  /** Selected pair, or null = the base hypotheses. */
  value: SensitivityPoint | null;
  onChange: (p: SensitivityPoint | null) => void;
}

/**
 * "What if the assumptions change?" Two segmented controls (shrink toward the market prior x equity risk premium)
 * over the API's sensitivity grid. Shows the central annual rate the API computed for the chosen pair (no path is
 * drawn: the UI never computes a figure). Always a hypothetical scenario: the range (favourable / unfavourable) stays on screen.
 */
export function SensitivityControl({ outlook, value, onChange }: Props) {
  const grid = outlook.sensitivity ?? [];
  if (grid.length < 2) return null;
  const base = baselinePoint(outlook);
  const current = value ?? base ?? grid[0];
  const shrinks = uniq(grid.map((g) => g.shrink));
  const erps = uniq(grid.map((g) => g.erp));
  const pick = (shrink: number, erp: number) => {
    const p = grid.find((g) => g.shrink === shrink && g.erp === erp);
    if (!p) return;
    onChange(base && p === base ? null : p);
  };
  const isBase = base !== null && current === base;
  const diff = base ? (current.central_annual - base.central_annual) * 100 : null;

  return (
    <section className="sens" data-testid="sensitivity-control" aria-label="Sensibilité aux hypothèses">
      <h4 className="sens__title">Et si les hypothèses changeaient ?</h4>
      <p className="sens__intro">
        Le scénario central dépend de deux hypothèses déclarées, pas seulement des données. Changez-les pour voir l’écart.
      </p>
      <div className="sens__row" role="group" aria-label="Part de l’historique remplacée par le prior de marché">
        <span className="sens__label">Réduction vers le marché</span>
        <span className="seg">
          {shrinks.map((s) => (
            <button key={s} type="button" aria-pressed={current.shrink === s} onClick={() => pick(s, current.erp)}>
              {Math.round(s * 100)} %
            </button>
          ))}
        </span>
      </div>
      <div className="sens__row" role="group" aria-label="Prime de risque actions par an">
        <span className="sens__label">Prime de risque actions</span>
        <span className="seg">
          {erps.map((e) => (
            <button key={e} type="button" aria-pressed={current.erp === e} onClick={() => pick(current.shrink, e)}>
              {Math.round(e * 100)} %
            </button>
          ))}
        </span>
      </div>
      <p className="sens__result" data-testid="sensitivity-result" aria-live="polite">
        Scénario central avec ces hypothèses : <strong>{formatPct(current.central_annual, 1, true)} par an</strong>
        {isBase && ' (hypothèses de base)'}
        {!isBase && diff !== null && ` (${diff > 0 ? '+' : ''}${diff.toLocaleString('fr-FR', { maximumFractionDigits: 1, minimumFractionDigits: 1 })} point par rapport à la base)`}
        .
      </p>
      {!isBase && (
        <button type="button" className="link-btn link-btn--dark" onClick={() => onChange(null)}>
          Revenir aux hypothèses de base
        </button>
      )}
    </section>
  );
}
