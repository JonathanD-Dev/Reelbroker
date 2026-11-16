import { useEffect, useId, useRef, useState } from 'react';
import type { Answers, Question } from '../lib/api';
import { fetchNext, questionLabel, remainingEstimate } from '../lib/questionnaire';
import type { Scope } from '../lib/questionnaire';
import { BackIcon } from './Icons';

interface QuestionFlowProps {
  scope: Scope;
  /** Header title ("Créer un compte", "Premier portefeuille"...). */
  title: string;
  /** Answers already known (account answers when asking the portfolio questions): context only. */
  baseAnswers?: Answers;
  /** Called once, when the backend (or the static copy) has no more question for this scope. */
  onFinish: (answers: Answers) => void;
  /** Back arrow on the first question. */
  onExit: () => void;
  /** Steps done before this flow (name step...), for the progress bar. */
  stepOffset?: number;
}

/** One question per screen, adaptive: the next question is asked to the API (static copy offline). */
export function QuestionFlow({ scope, title, baseAnswers = {}, onFinish, onExit, stepOffset = 0 }: QuestionFlowProps) {
  const uid = useId();
  const [answers, setAnswers] = useState<Answers>({});
  const [history, setHistory] = useState<string[]>([]);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [question, setQuestion] = useState<Question | null>(null);
  const [offline, setOffline] = useState(false);
  const [loading, setLoading] = useState(true);
  const [choice, setChoice] = useState<string | string[] | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const seq = useRef(0);
  const finished = useRef(false);
  const maxPct = useRef(0);
  // Answers given so far, kept even when going back (the previous choice stays preselected).
  const prefill = useRef<Answers>({});
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;
  const base = useRef(baseAnswers);

  useEffect(() => {
    const mine = ++seq.current;
    setLoading(true);
    fetchNext({ ...base.current, ...answers }, scope).then((r) => {
      if (mine !== seq.current) return;
      setOffline(r.offline);
      if (!r.question) {
        if (!finished.current) {
          finished.current = true;
          onFinishRef.current(answers);
        }
        return;
      }
      setQuestion(r.question);
      const prev = answers[r.question.id] ?? prefill.current[r.question.id];
      setChoice(prev ?? (r.question.type === 'multi' ? [] : null));
      setLoading(false);
    });
  }, [answers, scope]);

  useEffect(() => {
    if (!loading) headingRef.current?.focus();
  }, [loading, question?.id]);

  const multi = question?.type === 'multi';
  const ready = multi ? Array.isArray(choice) && choice.length > 0 : typeof choice === 'string';

  const submit = (value: string | string[]) => {
    if (!question) return;
    const text = Array.isArray(value) ? value.map((v) => questionLabel(question, v)).join(', ') : questionLabel(question, value);
    prefill.current[question.id] = value;
    setLabels((l) => ({ ...l, [question.id]: text }));
    setHistory((h) => [...h.filter((x) => x !== question.id), question.id]);
    setAnswers((a) => ({ ...a, [question.id]: value }));
  };
  const back = () => {
    if (history.length === 0) return onExit();
    const last = history[history.length - 1];
    setHistory((h) => h.slice(0, -1));
    setAnswers((a) => {
      const { [last]: _gone, ...rest } = a;
      return rest;
    });
  };

  const toggle = (code: string) => {
    const cur = Array.isArray(choice) ? choice : [];
    if (cur.includes(code)) return setChoice(cur.filter((c) => c !== code));
    // "Aucun" / "Je ne sais pas" exclude the other choices, and vice versa.
    const exclusive = code === 'none' || code === 'unknown';
    setChoice(exclusive ? [code] : [...cur.filter((c) => c !== 'none' && c !== 'unknown'), code]);
  };

  const done = history.length;
  const total = done + 1 + remainingEstimate({ ...base.current, ...answers, ...(question ? { [question.id]: 'x' } : {}) }, scope);
  const recap = history.slice(-3).map((id) => labels[id] ?? '').filter(Boolean);
  // Adaptive flow: the total changes, so the bar is monotone (it never goes backwards).
  const raw = ((stepOffset + done) / (stepOffset + total + 0)) * 100;
  maxPct.current = Math.max(maxPct.current, raw);
  const pct = Math.min(maxPct.current, 96);

  return (
    <main className="wizard" aria-busy={loading}>
      <header className="wizard__bar">
        <button type="button" className="wizard__back" onClick={back} aria-label={history.length ? 'Question précédente' : 'Retour'}>
          <BackIcon />
        </button>
        <p className="wizard__name">{title}</p>
        <p className="wizard__step">
          Question {stepOffset + done + 1}
        </p>
      </header>
      <div className="wizard__progress wizard__progress--bar" role="progressbar" aria-label="Progression" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
        <span style={{ width: `${pct}%` }} className="on" />
      </div>
      {recap.length > 0 && (
        <ul className="wizard__recap" aria-label="Réponses précédentes">
          {recap.map((r) => (
            <li key={r}>{r.length > 48 ? `${r.slice(0, 47)}…` : r}</li>
          ))}
        </ul>
      )}

      {loading || !question ? (
        <div className="wizard__body" role="status" aria-label="Chargement de la question">
          <div className="skeleton skeleton--line" style={{ width: '40%' }} />
          <div className="skeleton skeleton--title" />
          <div className="skeleton skeleton--choice" />
          <div className="skeleton skeleton--choice" />
          <div className="skeleton skeleton--choice" />
          {finished.current && <p className="field-note">Calcul de votre profil…</p>}
        </div>
      ) : (
        <form
          className="wizard__body"
          onSubmit={(e) => {
            e.preventDefault();
            if (ready && choice !== null) submit(choice);
          }}
        >
          <p className="wizard__kicker">{question.element ?? (scope === 'account' ? 'Votre profil' : 'Ce portefeuille')}</p>
          <h1 className="wizard__title" tabIndex={-1} ref={headingRef}>
            {question.text}
          </h1>
          {question.help && <p className="field-note" style={{ marginBottom: 14 }}>{question.help}</p>}
          <fieldset className="choices">
            <legend className="sr-only">{question.element ?? question.text}</legend>
            <div className="choices__list choices__list--stack">
              {question.choices.map((c) => {
                const on = Array.isArray(choice) ? choice.includes(c.code) : choice === c.code;
                return (
                  <label key={c.code} className={'choice' + (on ? ' choice--on' : '')}>
                    <input
                      type={multi ? 'checkbox' : 'radio'}
                      name={`${uid}-${question.id}`}
                      value={c.code}
                      checked={on}
                      onChange={() => (multi ? toggle(c.code) : setChoice(c.code))}
                    />
                    {c.label}
                  </label>
                );
              })}
            </div>
          </fieldset>
          {offline && (
            <p className="field-note">Mode hors ligne : questions locales (le serveur ne répond pas).</p>
          )}
          <div className="wizard__footer">
            <button type="submit" className="light-btn light-btn--block" disabled={!ready}>
              Continuer
            </button>
            <button type="button" className="link-btn link-btn--soft" onClick={() => submit('skipped')}>
              Passer cette question
            </button>
          </div>
        </form>
      )}
    </main>
  );
}
