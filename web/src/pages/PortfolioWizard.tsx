import { useEffect, useId, useRef, useState } from 'react';
import type { AccountApi } from '../hooks/useAccount';
import {
  GOALS,
  GOAL_ICON,
  GOAL_LABEL,
  ICONS,
  ICON_LABEL,
  MAX_AMOUNT,
  MAX_HORIZON,
  MIN_HORIZON,
  RISKS,
  RISK_LABEL,
  RISK_RANGE,
  WITHDRAWALS,
  WITHDRAWAL_LABEL,
  emptyDraft,
  horizonLabel,
  projectPortfolio,
  suggestRisk,
} from '../lib/account';
import type { Goal, PortfolioDraft, Risk, Withdrawal } from '../lib/account';
import { formatUsdRounded } from '../lib/format';
import { BackIcon } from '../components/Icons';
import { RiskDots } from '../components/RiskDots';
import { PortfolioGlyph } from '../components/PortfolioIcons';
import { NewPortfolioFlow } from './NewPortfolioFlow';
import { DEMO_ACCOUNT_ID } from '../lib/account';
import { pushPortfolioEdit } from '../lib/apiProfile';

const STEPS = ['Objectif', 'Horizon de placement', 'Tolérance au risque', 'Mise initiale et retraits'];
const QUICK_HORIZONS = [2, 5, 10, 20, 30];
const RISK_ANSWER: Record<Risk, string> = {
  prudent: 'Je vends pour limiter les pertes',
  balanced: 'J’attends que ça remonte',
  dynamic: 'J’en profite pour acheter davantage',
};

interface PortfolioWizardProps {
  /** Account whose profile (account answers) is used by the new-portfolio questionnaire. */
  accountId?: string;
  api: AccountApi;
  /** Edit mode when set. */
  editId?: string;
  onDone: (portfolioId: string | null) => void;
  /** Title of the questionnaire (default "Nouveau portefeuille"). */
  title?: string;
  /** When set (first portfolio after account creation), shows "Créer plus tard". */
  onSkip?: () => void;
}

const toAmount = (raw: string) => {
  const n = Math.floor(Number(raw.replace(/\s/g, '').replace(',', '.')));
  return Number.isFinite(n) ? Math.min(Math.max(n, 0), MAX_AMOUNT) : 0;
};

function EditPortfolioWizard({ api, accountId, editId, onDone, title = 'Nouveau portefeuille', onSkip }: PortfolioWizardProps) {
  const uid = useId();
  const editing = editId ? api.account.portfolios.find((p) => p.id === editId) ?? null : null;
  const [draft, setDraft] = useState<PortfolioDraft>(() =>
    editing
      ? {
          name: editing.name,
          icon: editing.icon,
          goal: editing.goal,
          horizonYears: editing.horizonYears,
          risk: editing.risk,
          initialAmount: editing.initialAmount,
          monthlyContribution: editing.monthlyContribution,
          withdrawal: editing.withdrawal,
        }
      : emptyDraft(),
  );
  const [answer, setAnswer] = useState<Risk | null>(editing ? editing.risk : null);
  const [step, setStep] = useState(0);
  const [nameError, setNameError] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleted, setDeleted] = useState(false);
  // The icon follows the goal until the user picks one (always "picked" when editing).
  const [iconPicked, setIconPicked] = useState(Boolean(editing));
  const [initialRaw, setInitialRaw] = useState(String(draft.initialAmount));
  const [monthlyRaw, setMonthlyRaw] = useState(String(draft.monthlyContribution));
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Move focus to the step title so screen-reader and keyboard users follow the flow.
  useEffect(() => {
    headingRef.current?.focus();
  }, [step]);

  if (deleted) return null; // navigating back to the profile
  if (editId && !editing) {
    return (
      <main className="wizard">
        <h1 className="wizard__title">Portefeuille introuvable</h1>
        <button type="button" className="light-btn" onClick={() => onDone(null)}>
          Retour au profil
        </button>
      </main>
    );
  }

  const set = <K extends keyof PortfolioDraft>(key: K, value: PortfolioDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));
  const suggestion = answer ? suggestRisk(answer, draft.horizonYears, api.account.shared) : null;
  const projection = projectPortfolio({ ...draft, risk: suggestion?.risk ?? draft.risk });
  const endYear = new Date().getFullYear() + draft.horizonYears;

  const next = () => {
    if (step === 0 && draft.name.trim() === '') {
      setNameError(true);
      return;
    }
    if (step === 2 && !suggestion) return;
    if (step < 3) {
      setStep(step + 1);
      return;
    }
    const final: PortfolioDraft = { ...draft, name: draft.name.trim().slice(0, 60), risk: suggestion?.risk ?? draft.risk };
    if (editing) {
      api.updatePortfolio(editing.id, final);
      // The server profile of this portfolio follows the new parameters (its caches are cleared).
      void pushPortfolioEdit(accountId ?? DEMO_ACCOUNT_ID, editing.id, editing, final);
      onDone(editing.id);
    } else {
      onDone(api.createPortfolio(final));
    }
  };
  const back = () => (step > 0 ? setStep(step - 1) : onSkip ? onSkip() : onDone(editing?.id ?? null));

  const recap = [
    step > 0 && draft.name.trim() ? `Objectif : ${draft.name.trim()}` : null,
    step > 1 ? `Horizon : ${draft.horizonYears} an${draft.horizonYears > 1 ? 's' : ''}` : null,
    step > 2 && suggestion ? `Risque : ${RISK_LABEL[suggestion.risk]}` : null,
  ].filter((x): x is string => x !== null);

  return (
    <main className="wizard">
      <header className="wizard__bar">
        <button type="button" className="wizard__back" onClick={back} aria-label={step > 0 ? 'Étape précédente' : onSkip ? 'Créer plus tard' : 'Annuler'}>
          <BackIcon />
        </button>
        <p className="wizard__name">{editing ? 'Modifier le portefeuille' : title}</p>
        <p className="wizard__step">
          <span className="sr-only">Étape </span>
          {step + 1} / 4
        </p>
      </header>
      <div className="wizard__progress" aria-hidden="true">
        {STEPS.map((s, i) => (
          <span key={s} className={i <= step ? 'on' : undefined} />
        ))}
      </div>
      {recap.length > 0 && (
        <ul className="wizard__recap" aria-label="Réponses précédentes">
          {recap.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}

      <form
        className="wizard__body"
        onSubmit={(e) => {
          e.preventDefault();
          next();
        }}
      >
        <p className="wizard__kicker">{STEPS[step]}</p>

        {step === 0 && (
          <>
            <h1 className="wizard__title" tabIndex={-1} ref={headingRef}>
              Quel est l’objectif de ce portefeuille ?
            </h1>
            <label htmlFor={`${uid}-name`} className="field-label">
              Nom du portefeuille
            </label>
            <input
              id={`${uid}-name`}
              className="text-input"
              value={draft.name}
              maxLength={60}
              placeholder="Ex. Retraite, Maison, Voyage"
              aria-invalid={nameError}
              aria-describedby={nameError ? `${uid}-name-err` : undefined}
              onChange={(e) => {
                set('name', e.target.value);
                if (e.target.value.trim()) setNameError(false);
              }}
            />
            {nameError && (
              <p id={`${uid}-name-err`} className="field-error">
                Donnez un nom au portefeuille.
              </p>
            )}
            <fieldset className="choices">
              <legend>Objectif d’investissement</legend>
              <div className="choices__list">
                {GOALS.map((g) => (
                  <label key={g} className={'choice' + (draft.goal === g ? ' choice--on' : '')}>
                    <input
                      type="radio"
                      name={`${uid}-goal`}
                      checked={draft.goal === g}
                      onChange={() =>
                        setDraft((d) => ({ ...d, goal: g as Goal, icon: iconPicked ? d.icon : GOAL_ICON[g as Goal] }))
                      }
                    />
                    {GOAL_LABEL[g]}
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset className="choices">
              <legend>Icône</legend>
              <div className="icon-grid">
                {ICONS.map((icon) => (
                  <label
                    key={icon}
                    className={'icon-choice' + (draft.icon === icon ? ' icon-choice--on' : '')}
                    title={ICON_LABEL[icon]}
                  >
                    <input
                      type="radio"
                      name={`${uid}-icon`}
                      checked={draft.icon === icon}
                      onChange={() => {
                        setIconPicked(true);
                        set('icon', icon);
                      }}
                    />
                    <PortfolioGlyph icon={icon} size={24} />
                    <span className="sr-only">{ICON_LABEL[icon]}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          </>
        )}

        {step === 1 && (
          <>
            <h1 className="wizard__title" tabIndex={-1} ref={headingRef}>
              Dans combien de temps aurez-vous besoin de cet argent ?
            </h1>
            <p className="wizard__big" aria-live="polite">
              {horizonLabel(draft.horizonYears)}
            </p>
            <label htmlFor={`${uid}-horizon`} className="sr-only">
              Horizon en années
            </label>
            <input
              id={`${uid}-horizon`}
              type="range"
              className="range"
              min={MIN_HORIZON}
              max={MAX_HORIZON}
              value={draft.horizonYears}
              onChange={(e) => set('horizonYears', Number(e.target.value))}
            />
            <div className="choices__list" role="group" aria-label="Horizons courants">
              {QUICK_HORIZONS.map((y) => (
                <button
                  key={y}
                  type="button"
                  className={'choice' + (draft.horizonYears === y ? ' choice--on' : '')}
                  aria-pressed={draft.horizonYears === y}
                  onClick={() => set('horizonYears', y)}
                >
                  {y} ans
                </button>
              ))}
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h1 className="wizard__title" tabIndex={-1} ref={headingRef}>
              Si ce portefeuille perdait 20 % en un mois, que feriez-vous ?
            </h1>
            <fieldset className="risk-options">
              <legend className="sr-only">Votre réaction</legend>
              {RISKS.map((r) => (
                <label key={r} className={'risk-option' + (answer === r ? ' risk-option--on' : '')}>
                  <input type="radio" name={`${uid}-risk`} checked={answer === r} onChange={() => setAnswer(r)} />
                  <span className="risk-option__text">
                    <span className="risk-option__label">{RISK_ANSWER[r]}</span>
                    <span className="risk-option__risk">
                      {RISK_LABEL[r]} <RiskDots risk={r} />
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>
            {suggestion && (
              <div className="suggestion" aria-live="polite">
                <p className="suggestion__title">Profil retenu : {RISK_LABEL[suggestion.risk]}</p>
                <p>{RISK_RANGE[suggestion.risk]}</p>
                {suggestion.reasons.map((r) => (
                  <p key={r} className="suggestion__reason">
                    {suggestion.risk !== answer ? 'Limité : ' : ''}
                    {r}
                  </p>
                ))}
              </div>
            )}
          </>
        )}

        {step === 3 && (
          <>
            <h1 className="wizard__title" tabIndex={-1} ref={headingRef}>
              Combien prévoyez-vous d’investir, et aurez-vous des retraits ?
            </h1>
            <div className="amount-row">
              <div>
                <label htmlFor={`${uid}-initial`} className="field-label">
                  Mise initiale ($)
                </label>
                <input
                  id={`${uid}-initial`}
                  className="text-input"
                  inputMode="numeric"
                  value={initialRaw}
                  onChange={(e) => {
                    setInitialRaw(e.target.value);
                    set('initialAmount', toAmount(e.target.value));
                  }}
                  onBlur={() => setInitialRaw(String(draft.initialAmount))}
                />
              </div>
              <div>
                <label htmlFor={`${uid}-monthly`} className="field-label">
                  Versement mensuel ($)
                </label>
                <input
                  id={`${uid}-monthly`}
                  className="text-input"
                  inputMode="numeric"
                  value={monthlyRaw}
                  onChange={(e) => {
                    setMonthlyRaw(e.target.value);
                    set('monthlyContribution', toAmount(e.target.value));
                  }}
                  onBlur={() => setMonthlyRaw(String(draft.monthlyContribution))}
                />
              </div>
            </div>
            <fieldset className="choices">
              <legend>Besoins de retrait</legend>
              <div className="choices__list">
                {WITHDRAWALS.map((w) => (
                  <label key={w} className={'choice' + (draft.withdrawal === w ? ' choice--on' : '')}>
                    <input type="radio" name={`${uid}-withdrawal`} checked={draft.withdrawal === w} onChange={() => set('withdrawal', w as Withdrawal)} />
                    {WITHDRAWAL_LABEL[w]}
                  </label>
                ))}
              </div>
            </fieldset>
            <p className="suggestion">
              Projection médiane en {endYear} : <strong>{formatUsdRounded(projection[projection.length - 1])}</strong>
              <br />
              <span className="suggestion__reason">Hypothèse fictive : rendement fixe selon le risque, hors frais et impôts.</span>
            </p>
          </>
        )}

        <div className="wizard__footer">
          <button type="submit" className="light-btn light-btn--block" disabled={step === 2 && !suggestion}>
            {step < 3 ? 'Continuer' : editing ? 'Enregistrer' : 'Créer le portefeuille'}
          </button>
          {onSkip && !editing && (
            <button type="button" className="skip-link" onClick={onSkip}>
              Créer plus tard
            </button>
          )}
          {editing && step === 0 && (
            <button
              type="button"
              className={'danger-link' + (confirmDelete ? ' danger-link--confirm' : '')}
              onClick={() => {
                if (!confirmDelete) {
                  setConfirmDelete(true);
                  return;
                }
                setDeleted(true);
                api.deletePortfolio(editing.id);
                onDone(null);
              }}
            >
              {confirmDelete ? 'Confirmer la suppression (positions comprises)' : 'Supprimer ce portefeuille'}
            </button>
          )}
        </div>
      </form>
    </main>
  );
}

/** Creation = questionnaire of the team (NewPortfolioFlow); edition keeps the 4-step form. */
export function PortfolioWizard(props: PortfolioWizardProps) {
  if (props.editId) return <EditPortfolioWizard {...props} />;
  return (
    <NewPortfolioFlow
      api={props.api}
      accountId={props.accountId ?? 'demo'}
      title={props.title ?? 'Nouveau portefeuille'}
      onDone={props.onDone}
      onSkip={props.onSkip}
    />
  );
}
