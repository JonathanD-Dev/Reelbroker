import { useId, useRef, useState } from 'react';
import { api } from '../lib/api';
import type { CheckResponse, CheckStatus, IdeaChoice, IdeaCheck as IdeaCheckResult } from '../lib/api';
import { formatPct } from '../lib/format';
import { useProfileRef } from '../hooks/useProfileId';
import { FitBadge } from './CardSummary';
import { AgentProgress, CHECK_STEPS } from './AgentProgress';
import { ExplainBadge } from './ExplainBadge';
import { Markdown } from './Markdown';
import { emitLearnUpdate } from '../lib/learnBus';

interface IdeaCheckProps {
  /** Prefilled idea (card menu): ticker and weight in percent. Without it, a free-text field is shown. */
  initial?: { ticker: string; weightPct: number };
}

const ICON: Record<CheckStatus, string> = { ok: '✓', info: 'ℹ', warn: '⚠', conflict: '✗' };
const STATUS_LABEL: Record<CheckStatus, string> = { ok: 'Respecté', info: 'À savoir', warn: 'Attention', conflict: 'Conflit' };
const CHOICES: { code: IdeaChoice; label: string }[] = [
  { code: 'keep', label: 'Je garde l’idée telle quelle' },
  { code: 'adjust', label: 'Je la ramène dans les limites' },
  { code: 'drop', label: 'J’abandonne' },
];

type State =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string; retry?: () => void }
  | { status: 'result'; result: IdeaCheckResult; body: Record<string, unknown>; recorded: IdeaChoice | null };

/**
 * "Vérifier une idée": the investor's own intention (a ticker and a share, or a sentence) is checked
 * against the profile by the backend. All figures and messages come from the API; the three choices are
 * recorded in the learning journal.
 */
export function IdeaCheck({ initial }: IdeaCheckProps) {
  const uid = useId();
  const { profileId } = useProfileRef();
  const [text, setText] = useState('');
  const [weight, setWeight] = useState(String(initial?.weightPct ?? 5));
  const [state, setState] = useState<State>({ status: 'idle' });

  if (!profileId) {
    return <p className="inline-note">La vérification d’une idée est disponible avec un profil calculé par le serveur d’analyse.</p>;
  }

  const run = async (body: Record<string, unknown>) => {
    setState({ status: 'loading' });
    try {
      const r: CheckResponse = await api.check({ profile_id: profileId, ...body });
      if (!r.ok) return setState({ status: 'error', message: r.message });
      setState({ status: 'result', result: r, body, recorded: null });
    } catch {
      setState({
        status: 'error',
        message: 'La vérification n’a pas abouti : le serveur d’analyse a mis plus de 60 secondes à répondre ou ne répond pas.',
        retry: () => void run(body),
      });
    }
  };

  const submit = () => {
    if (initial) {
      const w = Number(weight.replace(',', '.'));
      if (!(w > 0 && w <= 100)) return setState({ status: 'error', message: 'Indiquez une part entre 0 et 100 %.' });
      return run({ ticker: initial.ticker, weight: w / 100 });
    }
    if (text.trim()) return run({ text: text.trim() });
    setState({ status: 'error', message: 'Décrivez votre idée, par exemple « je veux mettre 20 % dans Tesla ».' });
  };

  return (
    <div className="idea">
      <form
        className="idea__form"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {initial ? (
          <div className="idea__row">
            <label htmlFor={`${uid}-w`}>
              Part de {initial.ticker} dans le portefeuille (%)
            </label>
            <input id={`${uid}-w`} className="text-input" type="number" inputMode="decimal" min={1} max={100} step={1} value={weight} onChange={(e) => setWeight(e.target.value)} />
          </div>
        ) : (
          <div className="idea__row">
            <label htmlFor={`${uid}-t`}>Votre idée, avec vos mots</label>
            <textarea id={`${uid}-t`} className="text-input idea__text" rows={2} maxLength={500} value={text} placeholder="Ex. je veux mettre 20 % dans Tesla" onChange={(e) => setText(e.target.value)} />
          </div>
        )}
        <button type="submit" className="light-btn light-btn--block" disabled={state.status === 'loading'}>
          {state.status === 'loading' ? 'Vérification…' : 'Vérifier cette idée'}
        </button>
      </form>

      {state.status === 'loading' && <AgentProgress steps={CHECK_STEPS} label="Vérification en cours" />}
      {state.status === 'error' && (
        <p className="inline-error" role="alert">
          {state.message}{' '}
          {state.retry && (
            <button type="button" className="link-btn link-btn--dark" onClick={state.retry}>
              Réessayer
            </button>
          )}
        </p>
      )}
      {state.status === 'result' && (
        <Result
          state={state}
          onChoice={async (c, decisionId) => {
            try {
              const r = await api.recordChoice({
                profile_id: profileId,
                ticker: state.result.ticker,
                weight: state.result.weight,
                choice: c,
                decision_id: decisionId,
                ...(c === 'adjust' ? { max_weight_within_profile: state.result.max_weight_within_profile } : {}),
              });
              setState({ ...state, recorded: c });
              emitLearnUpdate(r.learn ?? null);
              return true;
            } catch {
              return false;
            }
          }}
        />
      )}
    </div>
  );
}

const newId = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `d-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);

function Result({ state, onChoice }: { state: Extract<State, { status: 'result' }>; onChoice: (c: IdeaChoice, decisionId: string) => Promise<boolean> }) {
  const r = state.result;
  // One decision id per displayed result: re-clicking after a failure cannot record twice (the backend is idempotent).
  const decisionId = useRef(newId());
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const choose = async (c: IdeaChoice) => {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    const ok = await onChoice(c, decisionId.current);
    setBusy(false);
    setFailed(!ok);
  };
  const ex = r.explanation;
  return (
    <div className="idea__result" data-testid="idea-result">
      <h3 className="idea__title">
        {r.name} ({r.ticker}) à {formatPct(r.weight, 0)}
      </h3>
      <FitBadge fit={{ verdict: r.verdict, label: r.verdict_label }} />
      <ul className="idea__checks">
        {r.checks.map((c, i) => (
          <li key={c.code + i} className={`idea__check idea__check--${c.status}`}>
            <span aria-hidden="true">{ICON[c.status]}</span>
            <span className="sr-only">{STATUS_LABEL[c.status]} : </span>
            <span>{c.message}</span>
          </li>
        ))}
      </ul>
      <p className="idea__max" data-testid="idea-max">
        La plus grande part compatible avec votre profil : <strong>{formatPct(r.max_weight_within_profile, 0)}</strong>.
      </p>
      <div className="idea__explain">
        <Markdown text={ex.long ?? ex.short} />
        <p>
          <ExplainBadge mode={ex.mode} />{' '}
          <span className={'badge ' + (ex.governance.passed ? 'badge--ok' : 'badge--ko')}>
            {ex.governance.passed ? 'Gouvernance : conforme' : 'Gouvernance : à revoir'}
          </span>
        </p>
      </div>
      {state.recorded ? (
        <p className="inline-note inline-note--info" role="status">
          Choix enregistré dans votre journal : {CHOICES.find((c) => c.code === state.recorded)?.label}. Simulation uniquement.
        </p>
      ) : (
        <div className="idea__choices" role="group" aria-label="Que décidez-vous ?">
          {CHOICES.map((c) => (
            <button key={c.code} type="button" className="idea__choice" disabled={busy} onClick={() => void choose(c.code)}>
              {c.label}
            </button>
          ))}
          {failed && (
            <p className="inline-error" role="alert">
              Votre choix n’a pas pu être enregistré. Vous pouvez le choisir de nouveau.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
