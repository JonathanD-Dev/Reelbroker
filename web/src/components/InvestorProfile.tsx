import { IdeaCheck } from './IdeaCheck';
import { LearnBlock } from './LearnBlock';
import { HypothesesButton } from './Hypotheses';
import { DeclaredProfile } from './DeclaredProfile';
import { useProfileRef } from '../hooks/useProfileId';
import { pushAccountEdit, pushAccountRename } from '../lib/apiProfile';
import { useId, useState } from 'react';
import type { ReactNode } from 'react';
import type { ExclusionTag, Product } from '../types';
import {
  DEBTS,
  DEBT_LABEL,
  EXCLUSIONS,
  EXCLUSION_LABEL,
  EXPERIENCE_LABEL,
  FUNDS,
  FUND_LABEL,
  INCOMES,
  INCOME_LABEL,
  INSTRUMENTS,
  INSTRUMENT_LABEL,
  LEVELS,
  sharedSummary,
} from '../lib/account';
import type {
  Debt,
  EmergencyFund,
  IncomeStability,
  ExperienceLevel,
  Instrument,
  SharedProfile,
} from '../lib/account';
import type { AccountApi } from '../hooks/useAccount';
import { CheckIcon, ChevronIcon } from './Icons';

type Section = keyof SharedProfile;

const TITLES: Record<Section, string> = {
  financial: 'Situation financière',
  obligations: 'Obligations',
  experience: 'Expérience',
  preferences: 'Préférences et exclusions',
};

interface InvestorProfileProps {
  api: AccountApi;
  catalog: readonly Product[];
  onSaved: (message: string) => void;
}

function Checks() {
  return (
    <>
      <LearnBlock />
      <p className="hypotheses-link">
        <HypothesesButton />
      </p>
      <section className="learn" aria-labelledby="idea-title">
        <h3 id="idea-title" className="learn__title">
          Vérifier une idée
        </h3>
        <IdeaCheck />
      </section>
    </>
  );
}

export function InvestorProfile({ api, catalog, onSaved }: InvestorProfileProps) {
  const { account } = api;
  const [open, setOpen] = useState<Section | 'name' | null>(null);
  const summary = sharedSummary(account.shared);
  const count = account.portfolios.length;
  const { declared } = useProfileRef();

  const save = <K extends Section>(key: K, value: SharedProfile[K]) => {
    api.updateShared(key, value);
    // The account profile and every portfolio profile hold these answers: all of them follow (caches cleared).
    if (api.id) void pushAccountEdit(api.id, account.name, account.portfolios.map((p) => ({ id: p.id, name: p.name })), key, value);
    setOpen(null);
    onSaved(`Section « ${TITLES[key]} » enregistrée`);
  };

  // Accounts with a backend profile show it (the local default fields would contradict it).
  if (declared) {
    return (
      <div className="investor">
        <DeclaredProfile profile={declared} />
        <Checks />
      </div>
    );
  }

  return (
    <div className="investor">
      <p className="investor__scope">
        S’applique à {count > 1 ? `vos ${count} portefeuilles` : count === 1 ? 'votre portefeuille' : 'tous vos futurs portefeuilles'}
      </p>

      <Accordion
        id="name"
        title="Nom du compte"
        summary={account.name}
        done
        open={open === 'name'}
        onToggle={() => setOpen(open === 'name' ? null : 'name')}
      >
        <NameForm
          initial={account.name}
          onCancel={() => setOpen(null)}
          onSave={(name) => {
            api.rename(name);
            if (api.id && name.trim()) void pushAccountRename(api.id, name.trim().slice(0, 40));
            setOpen(null);
            onSaved('Nom du compte enregistré');
          }}
        />
      </Accordion>

      {(Object.keys(TITLES) as Section[]).map((key) => (
        <Accordion
          key={key}
          id={key}
          title={TITLES[key]}
          summary={summary[key] ?? 'À compléter'}
          done={account.shared[key] !== null}
          open={open === key}
          onToggle={() => setOpen(open === key ? null : key)}
        >
          {key === 'financial' && (
            <FinancialForm initial={account.shared.financial} onCancel={() => setOpen(null)} onSave={(v) => save('financial', v)} />
          )}
          {key === 'obligations' && (
            <ObligationsForm initial={account.shared.obligations} onCancel={() => setOpen(null)} onSave={(v) => save('obligations', v)} />
          )}
          {key === 'experience' && (
            <ExperienceForm initial={account.shared.experience} onCancel={() => setOpen(null)} onSave={(v) => save('experience', v)} />
          )}
          {key === 'preferences' && (
            <PreferencesForm
              initial={account.shared.preferences}
              catalog={catalog}
              onCancel={() => setOpen(null)}
              onSave={(v) => save('preferences', v)}
            />
          )}
        </Accordion>
      ))}
      <Checks />
    </div>
  );
}

// ---------------------------------------------------------------------------------------------

function Accordion({
  id,
  title,
  summary,
  done,
  open,
  onToggle,
  children,
}: {
  id: string;
  title: string;
  summary: string;
  done: boolean;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const uid = useId();
  const panelId = `${uid}-${id}`;
  return (
    <section className={'acc' + (open ? ' acc--open' : '')}>
      <h3 className="acc__heading">
        <button type="button" className="acc__toggle" aria-expanded={open} aria-controls={panelId} onClick={onToggle}>
          <span className="acc__text">
            <span className="acc__title">{title}</span>
            {!open && <span className={'acc__summary' + (done ? '' : ' acc__summary--todo')}>{summary}</span>}
          </span>
          {open ? (
            <ChevronIcon up />
          ) : done ? (
            <span className="acc__done" aria-label="complété">
              <CheckIcon />
            </span>
          ) : (
            <ChevronIcon />
          )}
        </button>
      </h3>
      {open && (
        <div id={panelId} className="acc__panel">
          {children}
        </div>
      )}
    </section>
  );
}

function FormActions({ onCancel, disabled = false }: { onCancel: () => void; disabled?: boolean }) {
  return (
    <div className="form-actions">
      <button type="button" className="ghost-btn" onClick={onCancel}>
        Annuler
      </button>
      <button type="submit" className="light-btn" disabled={disabled}>
        Enregistrer
      </button>
    </div>
  );
}

export function ChoiceGroup<T extends string>({
  legend,
  name,
  options,
  labels,
  value,
  onChange,
}: {
  legend: string;
  name: string;
  options: readonly T[];
  labels: Record<T, string>;
  value: T | null;
  onChange: (v: T) => void;
}) {
  const uid = useId();
  return (
    <fieldset className="choices">
      <legend>{legend}</legend>
      <div className="choices__list">
        {options.map((o) => (
          <label key={o} className={'choice' + (value === o ? ' choice--on' : '')}>
            <input type="radio" name={`${uid}-${name}`} value={o} checked={value === o} onChange={() => onChange(o)} />
            {labels[o]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function MultiChoice<T extends string>({
  legend,
  options,
  labels,
  value,
  onChange,
}: {
  legend: string;
  options: readonly T[];
  labels: Record<T, string>;
  value: readonly T[];
  onChange: (v: T[]) => void;
}) {
  return (
    <fieldset className="choices">
      <legend>{legend}</legend>
      <div className="choices__list">
        {options.map((o) => {
          const on = value.includes(o);
          return (
            <label key={o} className={'choice' + (on ? ' choice--on' : '')}>
              <input
                type="checkbox"
                checked={on}
                onChange={() => onChange(on ? value.filter((x) => x !== o) : [...value, o])}
              />
              {on && <CheckIcon />}
              {labels[o]}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function NameForm({ initial, onSave, onCancel }: { initial: string; onSave: (n: string) => void; onCancel: () => void }) {
  const id = useId();
  const [name, setName] = useState(initial);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave(name);
      }}
    >
      <label htmlFor={id} className="field-label">
        Nom affiché
      </label>
      <input id={id} className="text-input" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
      <FormActions onCancel={onCancel} disabled={name.trim() === ''} />
    </form>
  );
}

function FinancialForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: SharedProfile['financial'];
  onSave: (v: NonNullable<SharedProfile['financial']>) => void;
  onCancel: () => void;
}) {
  const [income, setIncome] = useState<IncomeStability | null>(initial?.income ?? null);
  const [fund, setFund] = useState<EmergencyFund | null>(initial?.emergencyFund ?? null);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (income && fund) onSave({ income, emergencyFund: fund });
      }}
    >
      <ChoiceGroup legend="Stabilité de l’emploi ou des revenus" name="income" options={INCOMES} labels={INCOME_LABEL} value={income} onChange={setIncome} />
      <ChoiceGroup legend="Fonds d’urgence" name="fund" options={FUNDS} labels={FUND_LABEL} value={fund} onChange={setFund} />
      <FormActions onCancel={onCancel} disabled={!income || !fund} />
    </form>
  );
}

function ObligationsForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: SharedProfile['obligations'];
  onSave: (v: NonNullable<SharedProfile['obligations']>) => void;
  onCancel: () => void;
}) {
  const [debts, setDebts] = useState<Debt[]>(initial?.debts ?? []);
  const [dependents, setDependents] = useState(initial?.dependents ?? 0);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave({ debts, dependents });
      }}
    >
      <MultiChoice legend="Dettes et engagements" options={DEBTS} labels={DEBT_LABEL} value={debts} onChange={setDebts} />
      <fieldset className="choices">
        <legend>Personnes à charge</legend>
        <div className="stepper">
          <button type="button" aria-label="Retirer une personne" disabled={dependents === 0} onClick={() => setDependents((d) => Math.max(0, d - 1))}>
            −
          </button>
          <output aria-live="polite">{dependents}</output>
          <button type="button" aria-label="Ajouter une personne" disabled={dependents >= 20} onClick={() => setDependents((d) => Math.min(20, d + 1))}>
            +
          </button>
        </div>
      </fieldset>
      <FormActions onCancel={onCancel} />
    </form>
  );
}

function ExperienceForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: SharedProfile['experience'];
  onSave: (v: NonNullable<SharedProfile['experience']>) => void;
  onCancel: () => void;
}) {
  const [level, setLevel] = useState<ExperienceLevel | null>(initial?.level ?? null);
  const [instruments, setInstruments] = useState<Instrument[]>(initial?.instruments ?? []);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (level) onSave({ level, instruments });
      }}
    >
      <ChoiceGroup legend="Connaissances en investissement" name="level" options={LEVELS} labels={EXPERIENCE_LABEL} value={level} onChange={setLevel} />
      <MultiChoice legend="Produits déjà utilisés" options={INSTRUMENTS} labels={INSTRUMENT_LABEL} value={instruments} onChange={setInstruments} />
      <FormActions onCancel={onCancel} disabled={!level} />
    </form>
  );
}

function PreferencesForm({
  initial,
  catalog,
  onSave,
  onCancel,
}: {
  initial: SharedProfile['preferences'];
  catalog: readonly Product[];
  onSave: (v: NonNullable<SharedProfile['preferences']>) => void;
  onCancel: () => void;
}) {
  const esgId = useId();
  const [esg, setEsg] = useState(initial?.esg ?? false);
  const [exclusions, setExclusions] = useState<ExclusionTag[]>(initial?.exclusions ?? []);
  const excludedCount = catalog.filter((p) => p.exclusion && exclusions.includes(p.exclusion)).length;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave({ esg, exclusions });
      }}
    >
      <div className="switch-row">
        <span id={esgId}>Privilégier les entreprises ESG</span>
        <button
          type="button"
          role="switch"
          aria-checked={esg}
          aria-labelledby={esgId}
          className={'switch' + (esg ? ' switch--on' : '')}
          onClick={() => setEsg((v) => !v)}
        >
          <span />
        </button>
      </div>
      <MultiChoice legend="Exclure ces secteurs" options={EXCLUSIONS} labels={EXCLUSION_LABEL} value={exclusions} onChange={setExclusions} />
      <p className="field-note">Les produits exclus n’apparaissent plus dans le fil ni dans les sauvegardés.</p>
      <p className="field-count" aria-live="polite">
        {excludedCount === 0
          ? 'Aucun produit du fil n’est exclu'
          : `${excludedCount} produit${excludedCount > 1 ? 's' : ''} du fil ${excludedCount > 1 ? 'sont exclus' : 'est exclu'}`}
      </p>
      <FormActions onCancel={onCancel} />
    </form>
  );
}
