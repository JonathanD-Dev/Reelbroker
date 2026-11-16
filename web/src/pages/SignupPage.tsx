import { useEffect, useId, useRef, useState } from 'react';
import type { Answers } from '../lib/api';
import { BackIcon } from '../components/Icons';
import { QuestionFlow } from '../components/QuestionFlow';

/**
 * Account creation, one question per screen: the account name, then the account questions (C*) of the
 * team questionnaire, asked adaptively through the API (`GET /api/questionnaire/next`). The answers are
 * posted to `POST /api/profile` by the caller.
 */
interface SignupPageProps {
  /** True when an account with this name already exists on the device (names are unique). */
  isNameTaken: (name: string) => boolean;
  onCancel: () => void;
  onCreate: (name: string, answers: Answers) => void;
}

export function SignupPage({ isNameTaken, onCancel, onCreate }: SignupPageProps) {
  const uid = useId();
  const [step, setStep] = useState<'name' | 'questions'>('name');
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (step === 'name') headingRef.current?.focus();
  }, [step]);

  if (step === 'questions') {
    return (
      <QuestionFlow
        scope="account"
        title="Créer un compte"
        stepOffset={1}
        onExit={() => setStep('name')}
        onFinish={(answers) => onCreate(name.trim(), answers)}
      />
    );
  }

  const next = () => {
    if (name.trim() === '') {
      setNameError('Indiquez un nom.');
      return;
    }
    if (isNameTaken(name)) {
      setNameError('Un compte porte déjà ce nom sur cet appareil. Connectez-vous ou choisissez un autre nom.');
      return;
    }
    setStep('questions');
  };

  return (
    <main className="wizard">
      <header className="wizard__bar">
        <button type="button" className="wizard__back" onClick={onCancel} aria-label="Annuler">
          <BackIcon />
        </button>
        <p className="wizard__name">Créer un compte</p>
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
          next();
        }}
      >
        <p className="wizard__kicker">Votre compte</p>
        <h1 className="wizard__title" tabIndex={-1} ref={headingRef}>
          Comment souhaitez-vous être appelé ?
        </h1>
        <label htmlFor={`${uid}-name`} className="field-label">
          Nom affiché
        </label>
        <input
          id={`${uid}-name`}
          className="text-input"
          value={name}
          maxLength={40}
          autoComplete="nickname"
          placeholder="Ex. Camille Gagnon"
          aria-invalid={nameError !== null}
          aria-describedby={nameError ? `${uid}-name-err` : undefined}
          onChange={(e) => {
            setName(e.target.value);
            setNameError(null);
          }}
        />
        {nameError && (
          <p id={`${uid}-name-err`} className="field-error" role="alert">
            {nameError}
          </p>
        )}
        <p className="field-note">
          Ce nom sert à vous connecter. Pas de mot de passe : compte de démonstration enregistré sur cet appareil.
        </p>
        <div className="wizard__footer">
          <button type="submit" className="light-btn light-btn--block">
            Continuer
          </button>
        </div>
      </form>
    </main>
  );
}
