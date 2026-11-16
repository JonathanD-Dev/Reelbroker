import { useEffect, useId, useRef, useState } from 'react';
import { STATIC_PERSONAS } from '../lib/questionnaire';

interface WelcomePageProps {
  /** Names of the accounts stored on this device (shortcuts that fill the name field). */
  accountNames: string[];
  /** Logs in by account name; returns false when no account has this name. */
  onLogin: (name: string) => boolean;
  onSignup: () => void;
  /** One-click persona account (Amira, Mateo, Robert): resolves when the profile is ready. */
  onPersona?: (personaId: string) => Promise<void> | void;
}

/** Landing page shown on arrival. Demo login by account name (no password). */
export function WelcomePage({ accountNames, onLogin, onSignup, onPersona }: WelcomePageProps) {
  const uid = useId();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  const submit = () => {
    if (!name.trim()) {
      setError('Indiquez le nom de votre compte.');
      inputRef.current?.focus();
      return;
    }
    if (!onLogin(name)) {
      setError(`Aucun compte ne porte le nom « ${name.trim()} » sur cet appareil.`);
      inputRef.current?.focus();
    }
  };

  const pickPersona = async (id: string) => {
    if (pending || !onPersona) return;
    setPending(id);
    try {
      await onPersona(id);
    } finally {
      setPending(null);
    }
  };

  return (
    <main className="welcome">
      <div className="welcome__brand" aria-hidden="true">
        BNCD
      </div>
      <div className="welcome__body">
        <h1 className="welcome__title" tabIndex={-1} ref={titleRef}>
          Bienvenue
        </h1>
        <p className="welcome__lead">
          Découvrez des idées d’investissement, une carte à la fois, et suivez-les dans vos portefeuilles.
        </p>
      </div>
      <form
        className="welcome__actions"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label htmlFor={`${uid}-name`} className="welcome__label">
          Nom du compte
        </label>
        <input
          id={`${uid}-name`}
          ref={inputRef}
          className="welcome__input"
          value={name}
          maxLength={40}
          autoComplete="username"
          aria-invalid={error !== null}
          aria-describedby={error ? `${uid}-err` : undefined}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
        />
        {error && (
          <p id={`${uid}-err`} className="welcome__error" role="alert">
            {error}
          </p>
        )}
        {accountNames.length > 0 && (
          <div className="welcome__accounts" role="group" aria-label="Comptes sur cet appareil">
            {accountNames.map((n) => (
              <button
                key={n}
                type="button"
                className="welcome__account"
                onClick={() => {
                  setName(n);
                  setError(null);
                  inputRef.current?.focus();
                }}
              >
                {n}
              </button>
            ))}
          </div>
        )}
        <button type="submit" className="welcome__btn welcome__btn--primary">
          Se connecter
        </button>
        <button type="button" className="welcome__btn welcome__btn--secondary" onClick={onSignup}>
          Créer un compte
        </button>
        {onPersona && (
          <section className="welcome__personas" aria-labelledby={`${uid}-personas`}>
            <h2 id={`${uid}-personas`} className="welcome__personas-title">
              Essayer avec un profil type
            </h2>
            <div className="welcome__persona-list">
              {STATIC_PERSONAS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="welcome__persona"
                  disabled={pending !== null}
                  aria-busy={pending === p.id}
                  onClick={() => pickPersona(p.id)}
                >
                  <strong>{pending === p.id ? `${p.name}…` : p.name}</strong>
                  <span>{p.summary}</span>
                </button>
              ))}
            </div>
          </section>
        )}
        <p className="welcome__note">
          Prototype de démonstration : connexion par le nom du compte, sans mot de passe. Données fictives,
          pas un conseil financier.
        </p>
      </form>
    </main>
  );
}
