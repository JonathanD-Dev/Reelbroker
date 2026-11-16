import { useId } from 'react';
import type { CSSProperties } from 'react';
import { useAccount } from '../hooks/useAccount';
import { portfoliosByRecent } from '../lib/account';
import { ChevronIcon } from './Icons';
import { PortfolioGlyph } from './PortfolioIcons';

/**
 * Active-portfolio selector. Each portfolio has its own feed position, saved products and
 * hidden products, so changing it switches those lists. Hidden when there is no portfolio.
 */
export function PortfolioSwitcher({ variant }: { variant: 'overlay' | 'inline' }) {
  const id = useId();
  const api = useAccount();
  if (!api || api.account.portfolios.length === 0) return null;
  const { account, active } = api;
  return (
    <div
      className={`pf-switch pf-switch--${variant}`}
      style={{ '--pf': active?.color ?? '#3d7cf5' } as CSSProperties}
    >
      <label htmlFor={id} className="sr-only">
        Portefeuille actif
      </label>
      {active && (
        <span className="pf-switch__icon">
          <PortfolioGlyph icon={active.icon} size={16} />
        </span>
      )}
      <select id={id} value={account.activeId ?? ''} onChange={(e) => api.setActive(e.target.value)}>
        {portfoliosByRecent(account).map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <ChevronIcon />
    </div>
  );
}
