import { RISK_LEVEL } from '../lib/account';
import type { Risk } from '../lib/account';

/** Three-segment gauge (decorative: the risk is always also written as text). */
export function RiskDots({ risk }: { risk: Risk }) {
  const level = RISK_LEVEL[risk];
  return (
    <span className={`risk-dots risk-dots--${risk}`} aria-hidden="true">
      {[1, 2, 3].map((i) => (
        <span key={i} className={i <= level ? 'risk-dots__on' : undefined} />
      ))}
    </span>
  );
}
