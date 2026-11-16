import { useEffect, useState } from 'react';
import { loadHypotheses } from '../lib/api';
import type { HypothesisItem } from '../lib/api';
import { HYPOTHESIS_GROUPS, RISK_LEVELS } from '../data/hypotheses';
import { formatPct } from '../lib/format';
import { BottomSheet } from './BottomSheet';

const RISK_GROUP = 'Niveaux de risque';
const LEVEL_RE = /^Niveau (\d) \((.+?)\) : plafond (de volatilité|d.actifs de croissance)/;

/** Offline copy (src/data/hypotheses.ts) in the same shape as the API list. */
function fallbackItems(): HypothesisItem[] {
  const rows = RISK_LEVELS.flatMap((r) => [
    { group: RISK_GROUP, label: `Niveau ${r.level} (${r.label}) : plafond de volatilité`, value_fr: formatPct(r.maxVol, 0), source: 'hypothèse' as const, code_ref: '' },
    { group: RISK_GROUP, label: `Niveau ${r.level} (${r.label}) : plafond d'actifs de croissance`, value_fr: formatPct(r.maxGrowth, 0), source: 'hypothèse' as const, code_ref: '' },
  ]);
  const rest = HYPOTHESIS_GROUPS.flatMap((g) => g.items.map((label) => ({ group: g.title, label, value_fr: '', source: 'hypothèse' as const, code_ref: '' })));
  return [...rows, ...rest];
}

/** "Toutes nos hypothèses": every assumption of the code, read from the API (fallback: local copy). */
export function HypothesesButton({ className = 'link-btn link-btn--dark' }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [live, setLive] = useState<HypothesisItem[] | null>(null);
  useEffect(() => {
    if (open) void loadHypotheses().then(setLive);
  }, [open]);
  const items = live ?? fallbackItems();

  const levels = new Map<string, { title: string; vol?: string; growth?: string }>();
  for (const it of items) {
    const m = it.group === RISK_GROUP ? LEVEL_RE.exec(it.label) : null;
    if (!m) continue;
    const row = levels.get(m[1]) ?? { title: `${m[1]} (${m[2]})` };
    if (m[3] === 'de volatilité') row.vol = it.value_fr;
    else row.growth = it.value_fr;
    levels.set(m[1], row);
  }
  const groups = new Map<string, HypothesisItem[]>();
  for (const it of items) {
    if (it.group === RISK_GROUP && LEVEL_RE.test(it.label)) continue;
    groups.set(it.group, [...(groups.get(it.group) ?? []), it]);
  }

  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        Toutes nos hypothèses
      </button>
      <BottomSheet open={open} label="Toutes nos hypothèses" onClose={() => setOpen(false)}>
        <div className="idea hypotheses" data-testid="hypotheses">
          <h2 className="hypotheses__title">Toutes nos hypothèses</h2>
          <p className="inline-note">Ces valeurs sont des choix déclarés, pas des faits. Elles changent les résultats : nous les testons.</p>
          {levels.size > 0 && (
            <>
              <h3>{RISK_GROUP}</h3>
              <table className="hypotheses__table">
                <thead>
                  <tr>
                    <th scope="col">Niveau</th>
                    <th scope="col">Volatilité max.</th>
                    <th scope="col">Actifs de croissance max.</th>
                  </tr>
                </thead>
                <tbody>
                  {[...levels.entries()].map(([k, r]) => (
                    <tr key={k}>
                      <th scope="row">{r.title}</th>
                      <td>{r.vol}</td>
                      <td>{r.growth}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          {[...groups.entries()].map(([title, list]) => (
            <section key={title}>
              <h3>{title}</h3>
              <ul>
                {list.map((it) => (
                  <li key={it.label}>
                    {it.label}
                    {it.value_fr && <> : <strong>{it.value_fr}</strong></>}{' '}
                    <span className={`tag tag--${it.source}`}>{it.source}</span>
                    {it.code_ref && <code className="hypotheses__ref">{it.code_ref}</code>}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        <button type="button" className="sheet__cancel" onClick={() => setOpen(false)}>
          Fermer
        </button>
      </BottomSheet>
    </>
  );
}
