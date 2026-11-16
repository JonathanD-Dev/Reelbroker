import { readPortfolioProfile } from '../lib/apiProfile';
import { OBJECTIVE_FR } from './DeclaredProfile';
import { forwardRef } from 'react';
import type { CSSProperties } from 'react';
import {
  GOAL_LABEL,
  RISK_LABEL,
  WITHDRAWAL_LABEL,
  horizonLabel,
  investedValue,
  portfolioValue,
  projectPortfolio,
} from '../lib/account';
import type { Portfolio } from '../lib/account';
import { getRange, toPoints } from '../lib/chartMath';
import { formatUsd, formatUsdRounded } from '../lib/format';
import { RiskDots } from './RiskDots';
import { PortfolioGlyph } from './PortfolioIcons';
import { PositionList } from './PositionList';

interface PortfolioCardProps {
  portfolio: Portfolio;
  active: boolean;
  index: number;
  total: number;
  onSetActive: () => void;
  onEdit: () => void;
}

const CW = 260;
const CH = 48;

export const PortfolioCard = forwardRef<HTMLLIElement, PortfolioCardProps>(function PortfolioCard(
  { portfolio: p, active, index, total, onSetActive, onEdit },
  ref,
) {
  const value = portfolioValue(p);
  const invested = investedValue(p);
  const assetsPct = value > 0 ? Math.round((invested / value) * 100) : 0;
  const stored = readPortfolioProfile(p.id);
  const backend = stored?.profileId ? stored : null;
  const goalLabel = (backend?.profile?.objective && OBJECTIVE_FR[backend.profile.objective]) || GOAL_LABEL[p.goal];
  const projection = projectPortfolio(p);
  const endYear = new Date().getFullYear() + p.horizonYears;
  const final = projection[projection.length - 1];
  const line = toPoints(projection, CW, CH, getRange(projection), 2);
  const monthly = p.monthlyContribution > 0 ? ` + ${formatUsdRounded(p.monthlyContribution)}/mois` : '';

  return (
    <li
      ref={ref}
      className={'pf-card' + (active ? ' pf-card--active' : ' pf-card--selectable')}
      style={{ '--pf': p.color } as CSSProperties}
      aria-label={`${p.name}, portefeuille ${index + 1} sur ${total}${active ? ', actif' : ''}`}
      // A tap anywhere on an inactive card makes it the active portfolio. Taps on the card's
      // own controls (Modifier, Voir toutes les positions…) keep their action. Keyboard and
      // screen-reader users activate it with the portfolio name, which is a button.
      onClick={(e) => {
        if (active) return;
        if ((e.target as Element).closest('button, a, input, select, [role="dialog"]')) return;
        onSetActive();
      }}
    >
      <div className="pf-card__top">
        {active ? (
          <span className="pf-card__badge">Actif</span>
        ) : (
          // Keeps "Modifier" on the right (same top-row layout as an active card).
          <span aria-hidden="true" />
        )}
        <button type="button" className="pf-card__edit" onClick={onEdit} aria-label={`Modifier ${p.name}`}>
          Modifier
        </button>
      </div>

      <h3 className="pf-card__name">
        <span className="pf-card__icon">
          <PortfolioGlyph icon={p.icon} size={22} />
        </span>
        {active ? (
          p.name
        ) : (
          // The name is the keyboard / screen-reader way to activate the portfolio; it looks
          // like plain text (a tap anywhere on the card does the same).
          <button
            type="button"
            className="pf-card__name-btn"
            aria-label={`Définir ${p.name} comme portefeuille actif`}
            onClick={onSetActive}
          >
            {p.name}
          </button>
        )}
      </h3>
      <p className="pf-card__goal">Objectif : {goalLabel.toLowerCase()}</p>

      {/* Split between cash (uninvested money) and assets (shares, at purchase price),
          then the total below it. */}
      <div className="pf-split">
        <div className="pf-split__bar" aria-hidden="true">
          <span className="pf-split__cash" style={{ width: `${100 - assetsPct}%` }} />
          <span className="pf-split__assets" style={{ width: `${assetsPct}%` }} />
        </div>
        <dl className="pf-split__legend">
          <div>
            <dt>
              <span className="pf-split__dot pf-split__dot--cash" aria-hidden="true" />
              Encaisse
            </dt>
            <dd>
              <span className="pf-split__amount">{formatUsd(p.cash)}</span>
              <span className="pf-split__pct">{100 - assetsPct} %</span>
            </dd>
          </div>
          <div>
            <dt>
              <span className="pf-split__dot pf-split__dot--assets" aria-hidden="true" />
              Actifs (actions)
            </dt>
            <dd>
              <span className="pf-split__amount">{formatUsd(invested)}</span>
              <span className="pf-split__pct">{assetsPct} %</span>
            </dd>
          </div>
        </dl>
      </div>

      <p className="pf-card__total">
        <span>Valeur totale</span>
        <span className="pf-card__total-amount">{formatUsd(value)}</span>
      </p>

      {p.positions.length > 0 ? (
        <PositionList positions={p.positions} portfolioName={p.name} />
      ) : (
        <p className="pf-card__positions">Aucune position : tout est en encaisse.</p>
      )}

      <figure className={'pf-card__chart' + (backend ? ' pf-card__chart--nochart' : '')}>
        {!backend && (
        <svg viewBox={`0 0 ${CW} ${CH}`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
          <polygon points={`2,${CH} ${line} ${CW - 2},${CH}`} fill="currentColor" opacity="0.18" />
          <polyline points={line} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />
        </svg>
        )}
        <figcaption>
          {backend
            ? 'Voir les scénarios hypothétiques dans le fil (bouton « See more data »).'
            : `Projection médiane fictive en ${endYear} : ${formatUsdRounded(final)} (fictif)`}
        </figcaption>
      </figure>

      <dl className="pf-card__grid">
        <div>
          <dt>Horizon</dt>
          <dd>{horizonLabel(p.horizonYears)}</dd>
        </div>
        <div>
          <dt>Risque</dt>
          <dd>
            {backend?.profile?.level !== undefined ? (
              `Niveau ${backend.profile.level} / 5 (${backend.profile.level_label ?? ''})`
            ) : (
              <>
                {RISK_LABEL[p.risk]} <RiskDots risk={p.risk} />
              </>
            )}
          </dd>
        </div>
        <div>
          <dt>Mise initiale</dt>
          <dd>
            {formatUsdRounded(p.initialAmount)}
            {monthly}
          </dd>
        </div>
        <div>
          <dt>Retraits</dt>
          <dd>{WITHDRAWAL_LABEL[p.withdrawal]}</dd>
        </div>
      </dl>
    </li>
  );
});
