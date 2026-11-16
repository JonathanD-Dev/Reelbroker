import { useEffect, useId, useRef, useState } from 'react';
import type { AccountApi } from '../hooks/useAccount';
import { GOAL_ICON, ICONS, ICON_LABEL } from '../lib/account';
import type { PortfolioIcon, SharedProfile } from '../lib/account';
import type { Answers } from '../lib/api';
import { draftFromAnswers, sharedFromAnswers } from '../lib/questionnaire';
import { accountAnswersOf, submitProfile, writeAccountProfile, writePortfolioProfile } from '../lib/apiProfile';
import { BackIcon } from '../components/Icons';
import { PortfolioGlyph } from '../components/PortfolioIcons';
import { QuestionFlow } from '../components/QuestionFlow';

interface NewPortfolioFlowProps {
  api: AccountApi;
  accountId: string;
  title: string;
  onDone: (portfolioId: string | null) => void;
  onSkip?: () => void;
}

/**
 * New portfolio: name and icon, then the portfolio questions (P*) of the team questionnaire, asked one
 * per screen through the API. At the end the backend computes the portfolio's profile (risk level).
 *
 * Existing accounts:
 *  - only the account answers (C*) are sent as context. A persona account also stores the answers of
 *    its first portfolio; sending them made the backend consider the questionnaire finished, so the
 *    new portfolio was a silent copy of the first one;
 *  - an account without account answers (created by the root app, or the demo account) is asked the
 *    account questions (C*) first, once, so the portfolio profile is computed with the person's
 *    situation. The answers are then kept as the account profile.
 */
export function NewPortfolioFlow({ api, accountId, title, onDone, onSkip }: NewPortfolioFlowProps) {
  const uid = useId();
  const [step, setStep] = useState<'name' | 'account' | 'questions' | 'saving'>('name');
  const [name, setName] = useState('');
  const [icon, setIcon] = useState<PortfolioIcon>(GOAL_ICON.retirement);
  const [nameError, setNameError] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const accountAnswers = useRef<Answers>(accountAnswersOf(accountId));
  // Read once: answering the account questions during this flow must not change the plan.
  const needsAccount = useRef(Object.keys(accountAnswers.current).length === 0);

  useEffect(() => {
    if (step === 'name') headingRef.current?.focus();
  }, [step]);

  const finishAccount = (answers: Answers) => {
    accountAnswers.current = answers;
    setStep('questions');
  };

  const finish = async (answers: Answers) => {
    setStep('saving');
    if (needsAccount.current && Object.keys(accountAnswers.current).length > 0) {
      // Same as account creation (SignupPage): backend account profile, local "Profil investisseur".
      const account = await submitProfile({ answers: accountAnswers.current, name: api.account.name });
      writeAccountProfile(accountId, { ...account, answers: accountAnswers.current });
      const shared = sharedFromAnswers(accountAnswers.current);
      (Object.keys(shared) as (keyof SharedProfile)[]).forEach((k) => api.updateShared(k, shared[k]));
    }
    const stored = await submitProfile({ answers: { ...accountAnswers.current, ...answers }, name: name.trim() });
    const id = api.createPortfolio(draftFromAnswers(name.trim().slice(0, 60), answers, stored.profile, icon));
    writePortfolioProfile(id, { ...stored, answers });
    onDone(id);
  };

  if (step === 'saving') {
    return (
      <main className="wizard" aria-busy="true">
        <div className="wizard__body" role="status">
          <div className="skeleton skeleton--title" />
          <p className="field-note">Calcul du profil du portefeuille…</p>
        </div>
      </main>
    );
  }
  if (step === 'account') {
    return (
      <QuestionFlow
        key="account"
        scope="account"
        title={title}
        stepOffset={1}
        onExit={() => setStep('name')}
        onFinish={finishAccount}
      />
    );
  }
  if (step === 'questions') {
    const asked = needsAccount.current ? Object.keys(accountAnswers.current).length : 0;
    return (
      <QuestionFlow
        key="portfolio"
        scope="portfolio"
        title={title}
        baseAnswers={accountAnswers.current}
        stepOffset={1 + asked}
        onExit={() => setStep(needsAccount.current ? 'account' : 'name')}
        onFinish={finish}
      />
    );
  }

  return (
    <main className="wizard">
      <header className="wizard__bar">
        <button type="button" className="wizard__back" onClick={() => (onSkip ? onSkip() : onDone(null))} aria-label={onSkip ? 'Créer plus tard' : 'Annuler'}>
          <BackIcon />
        </button>
        <p className="wizard__name">{title}</p>
        <p className="wizard__step">
          Étape 1
        </p>
      </header>
      <div className="wizard__progress wizard__progress--bar" role="progressbar" aria-label="Progression" aria-valuemin={0} aria-valuemax={100} aria-valuenow={4}>
        <span style={{ width: `4%` }} className="on" />
      </div>
      <form
        className="wizard__body"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim() === '') return setNameError(true);
          setStep(needsAccount.current ? 'account' : 'questions');
        }}
      >
        <p className="wizard__kicker">Votre portefeuille</p>
        <h1 className="wizard__title" tabIndex={-1} ref={headingRef}>
          Comment appelez-vous ce portefeuille ?
        </h1>
        <label htmlFor={`${uid}-name`} className="field-label">
          Nom du portefeuille
        </label>
        <input
          id={`${uid}-name`}
          className="text-input"
          value={name}
          maxLength={60}
          placeholder="Ex. Retraite, Maison, Voyage"
          aria-invalid={nameError}
          aria-describedby={nameError ? `${uid}-name-err` : undefined}
          onChange={(e) => {
            setName(e.target.value);
            if (e.target.value.trim()) setNameError(false);
          }}
        />
        {nameError && (
          <p id={`${uid}-name-err`} className="field-error" role="alert">
            Donnez un nom au portefeuille.
          </p>
        )}
        {needsAccount.current && (
          <p className="field-note">
            Ce compte n’a pas encore de profil investisseur : quelques questions sur votre situation viendront d’abord, une seule fois.
          </p>
        )}
        <fieldset className="choices">
          <legend>Icône</legend>
          <div className="icon-grid">
            {ICONS.map((i) => (
              <label key={i} className={'icon-choice' + (icon === i ? ' icon-choice--on' : '')} title={ICON_LABEL[i]}>
                <input type="radio" name={`${uid}-icon`} checked={icon === i} onChange={() => setIcon(i)} />
                <PortfolioGlyph icon={i} size={24} />
                <span className="sr-only">{ICON_LABEL[i]}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="wizard__footer">
          <button type="submit" className="light-btn light-btn--block">
            Continuer
          </button>
          {onSkip && (
            <button type="button" className="skip-link" onClick={onSkip}>
              Créer plus tard
            </button>
          )}
        </div>
      </form>
    </main>
  );
}
