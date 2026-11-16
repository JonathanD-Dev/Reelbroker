import type { ProfileResponse } from '../lib/api';

type Declared = NonNullable<ProfileResponse['profile']>;

export const OBJECTIVE_FR: Record<string, string> = {
  preserve: 'Préserver le capital',
  income: 'Générer un revenu',
  balanced: 'Équilibrer croissance et stabilité',
  growth: 'Faire croître le capital',
  emergency: 'Fonds d’urgence',
  project: 'Projet',
  retirement: 'Retraite',
  legacy: 'Transmission',
};
const TAG_FR: Record<string, string> = {
  crypto: 'Cryptoactifs',
  esg_unverified: 'Sociétés sans preuve ESG dans nos données',
  esg_screened: 'Fonds filtré ESG selon son émetteur',
  esg_unscreened_fund: 'Fonds non filtré ESG',
  'Information Technology': 'Technologies de l’information',
};
const tag = (t: string) => TAG_FR[t] ?? t;
const list = (xs?: string[]) => (xs && xs.length > 0 ? xs.map(tag).join(', ') : 'Aucun');

/** Declared profile as computed by the backend (replaces the local default fields of persona accounts). */
export function DeclaredProfile({ profile }: { profile: Declared }) {
  const rows: [string, string][] = [
    ['Objectif', OBJECTIVE_FR[profile.objective ?? ''] ?? profile.objective ?? '—'],
    ['Horizon', profile.horizon_years ? `${profile.horizon_years} ans` : '—'],
    ['Tolérance déclarée', profile.risk_tolerance !== undefined ? `${profile.risk_tolerance} / 5` : '—'],
    ['Capacité à subir une perte', profile.risk_capacity !== undefined ? `${profile.risk_capacity} / 5` : '—'],
    ['Niveau de risque retenu', profile.level !== undefined ? `${profile.level} / 5 (${profile.level_label ?? ''})` : '—'],
    ['Exclusions', list(profile.excluded)],
    ['Centres d’intérêt', list(profile.preferred)],
    ['À éviter si possible', list(profile.avoided)],
  ];
  return (
    <section className="declared" aria-labelledby="declared-title" data-testid="declared-profile">
      <h3 id="declared-title" className="learn__title">
        Profil déclaré
      </h3>
      <dl className="declared__list">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <p className="inline-note">Calculé par le serveur d’analyse à partir de vos réponses. Le niveau retenu est le plus restrictif de la tolérance, de la capacité, de l’horizon et de l’objectif.</p>
    </section>
  );
}
