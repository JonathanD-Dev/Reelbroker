import { useEffect, useState } from 'react';
import type { CardExtras, FactCheck } from '../lib/api';
import { loadCard } from '../lib/api';
import { formatDate } from '../lib/format';
import { useProfileRef } from '../hooks/useProfileId';
import { incomeNote } from './CardInsights';
import { BottomSheet } from './BottomSheet';

const NUM = ['①', '②', '③', '④'];

interface SourcesSheetProps {
  ticker: string;
  name: string;
  asOf: string;
  currency: string;
  /** Raw source string of the card (shown when the backend sends no structured sources). */
  source: string;
  extras?: CardExtras;
}

/**
 * Feed card, bottom of the sheet: one tappable line "① Yahoo Finance · …". It opens a panel with
 * every source (link, coverage), how the card's figures are computed, and the checks of the
 * pipeline's fact-checker. Those checks are loaded only when the panel is opened (card details).
 */
export function SourcesSheet({ ticker, name, asOf, currency, source, extras }: SourcesSheetProps) {
  const ref = useProfileRef();
  const [open, setOpen] = useState(false);
  const [check, setCheck] = useState<FactCheck | null | 'loading'>(null);
  const sources = extras?.sources ?? [{ id: 'raw', label: source, detail: '' }];

  useEffect(() => {
    if (!open || check !== null) return;
    let cancelled = false;
    setCheck('loading');
    loadCard(ticker, ref).then((r) => {
      if (!cancelled) setCheck(r?.detail.pipeline?.fact_check ?? null);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const passed = check && check !== 'loading' ? check.checks.filter((c) => c.ok).length : 0;

  return (
    <>
      <button type="button" className="card-sources" onClick={() => setOpen(true)} data-testid="card-source" aria-haspopup="dialog">
        <span className="card-sources__list">
          {sources.map((s, i) => (
            <span key={s.id}>
              {extras ? `${NUM[i] ?? i + 1} ` : 'Source : '}
              {extras ? s.label.split(' · ')[0] : `${s.label} · au ${formatDate(asOf)} · ${currency}`}
            </span>
          ))}
        </span>
        <span className="card-sources__more">Sources ›</span>
      </button>
      <BottomSheet open={open} label={`Sources et vérifications : ${name}`} onClose={() => setOpen(false)}>
        <div className="sources-sheet" data-testid="sources-sheet">
          <h2 className="sources-sheet__title">D’où viennent ces chiffres</h2>
          <ol className="sources-sheet__list">
            {sources.map((s, i) => (
              <li key={s.id}>
                <p className="sources-sheet__label">
                  <span aria-hidden="true">{NUM[i] ?? i + 1}</span> {s.label}
                </p>
                {s.detail && <p className="sources-sheet__detail">{s.detail}</p>}
                {s.url && (
                  <a className="sources-sheet__link" href={s.url} target="_blank" rel="noopener noreferrer">
                    {s.url.replace(/^https:\/\//, '')} <span className="sr-only">(nouvel onglet)</span>
                  </a>
                )}
              </li>
            ))}
          </ol>
          <p className="sources-sheet__detail">
            Données au {formatDate(asOf)} · montants en {currency}.
          </p>
          {extras?.income && (
            <p className="sources-sheet__detail">
              Prix et dividendes sur 5 ans : {incomeNote(extras.income)} {extras.income.method}
            </p>
          )}
          {extras?.risk_tags && extras.risk_tags.length > 0 && (
            <p className="sources-sheet__detail">Tags de risque : règles et seuils fixés dans le code (alphaforge/card_extras.py), touchez un tag pour lire la sienne.</p>
          )}
          <h3 className="sources-sheet__sub">Vérifications des données</h3>
          {check === 'loading' && <p className="sources-sheet__detail" role="status">Chargement des vérifications du pipeline…</p>}
          {check === null && <p className="sources-sheet__detail">Vérifications indisponibles : le serveur ne répond pas.</p>}
          {check && check !== 'loading' && (
            <>
              <p className={'sources-sheet__verdict' + (check.passed ? ' sources-sheet__verdict--ok' : '')} data-testid="sources-checks">
                {check.passed ? '✓' : '!'} {passed} vérification{passed > 1 ? 's' : ''} sur {check.checks.length} réussie{passed > 1 ? 's' : ''}
              </p>
              <ul className="sources-sheet__checks">
                {check.checks.map((c) => (
                  <li key={c.name} className={c.ok ? 'is-ok' : 'is-ko'}>
                    <span aria-hidden="true">{c.ok ? '✓' : '✕'}</span> {c.detail ?? c.name}
                  </li>
                ))}
              </ul>
            </>
          )}
          <button type="button" className="sheet__cancel" onClick={() => setOpen(false)}>
            Fermer
          </button>
        </div>
      </BottomSheet>
    </>
  );
}
