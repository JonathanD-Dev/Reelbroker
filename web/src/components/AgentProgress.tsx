import { useEffect, useRef, useState } from 'react';

export const CHECK_STEPS = [
  'Interprétation de la demande',
  'Calculs (outils)',
  'Rédaction par Claude sur Amazon Bedrock',
  'Contrôle de gouvernance',
];
export const CARD_STEPS = ['Recherche des sources', 'Collecte des données', 'Calculs et vérification des faits', 'Rédaction et gouvernance'];

/**
 * Progress panel naming the agents in order while the backend works (a Bedrock answer takes about 17 s).
 * Advances on a timer (it cannot know the real step) and disappears when the caller unmounts it.
 */
export function AgentProgress({
  steps,
  label,
  stepMs = 4000,
  reveal = true,
}: {
  steps: string[];
  label: string;
  stepMs?: number;
  /** Scroll the panel into view (right under a button the user just pressed). Off where it would jump a page. */
  reveal?: boolean;
}) {
  const [current, setCurrent] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  // The wait is long: bring the panel into view (it sits right under the button).
  useEffect(() => {
    if (reveal) ref.current?.scrollIntoView?.({ block: 'nearest' });
  }, []);
  useEffect(() => {
    const t = setInterval(() => setCurrent((c) => Math.min(c + 1, steps.length - 1)), stepMs);
    return () => clearInterval(t);
  }, [steps.length, stepMs]);
  return (
    <div ref={ref} className="agent-progress" role="status" aria-label={label} data-testid="agent-progress">
      <p className="agent-progress__title">{label}</p>
      <ol>
        {steps.map((s, i) => (
          <li key={s} className={i < current ? 'is-done' : i === current ? 'is-current' : undefined} aria-current={i === current ? 'step' : undefined}>
            <span aria-hidden="true">{i < current ? '✓' : i === current ? '●' : '○'}</span>
            <span>{s}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
