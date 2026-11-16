import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Product } from '../types';
import { computeProjections } from '../lib/projections';
import { formatDate, formatPct, formatUsd, formatUsdRounded } from '../lib/format';
import { RISK_LABEL, portfolioValue, riskWarning } from '../lib/account';
import { loadCard, scaleOutlook } from '../lib/api';
import type { CardDetail, DataSource, Outlook, Pipeline, SensitivityPoint } from '../lib/api';
import { useAccount } from '../hooks/useAccount';
import { useProfileRef } from '../hooks/useProfileId';
import { PriceHistoryChart } from './PriceHistoryChart';
import { ProjectionChart } from './ProjectionChart';
import { OutlookChart } from './OutlookChart';
import { QuantityInput } from './QuantityInput';
import { FitBadge } from './CardSummary';
import { AgentProgress, CARD_STEPS } from './AgentProgress';
import { PipelineTimeline } from './PipelineTimeline';
import { SensitivityControl } from './SensitivityControl';
import { ImpactSlider } from './ImpactSlider';
import { HypothesesButton } from './Hypotheses';

interface CardDetailsProps {
  product: Product;
  quantity: number;
  onQuantityChange: (q: number) => void;
}

/** "See more data" view: real data from the backend for live products, the legacy mock view otherwise. */
export function CardDetails(props: CardDetailsProps) {
  return props.product.live ? <LiveDetails {...props} /> : <LegacyDetails {...props} />;
}

// ---- live (backend) view -----------------------------------------------------------------------

type Load = { status: 'loading' } | { status: 'error' } | { status: 'ready'; detail: CardDetail; source: DataSource; w: number | undefined };

function LiveDetails({ product, quantity, onQuantityChange }: CardDetailsProps) {
  const ref = useProfileRef();
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [nonce, setNonce] = useState(0);
  const retry = useCallback(() => setNonce((n) => n + 1), []);
  const live = product.live!;
  const active = useAccount()?.active ?? null;
  // Impact weight = quantity x price / portfolio value (clamped 0,5 % to 100 %); unknown portfolio value: API default 5 %.
  const pfValue = active ? portfolioValue(active) : 0;
  const rawWeight = pfValue > 0 && quantity > 0 ? Math.min(1, Math.max(0.005, (quantity * product.price) / pfValue)) : undefined;
  // The weight slider overrides the quantity-derived weight until the quantity changes again.
  const [sliderWeight, setSliderWeight] = useState<number | null>(null);
  useEffect(() => setSliderWeight(null), [quantity]);
  const effectiveWeight = sliderWeight ?? rawWeight;
  const [weight, setWeight] = useState(effectiveWeight);
  useEffect(() => {
    const t = setTimeout(() => setWeight(effectiveWeight), sliderWeight !== null ? 0 : 600); // do not recompute on every keystroke
    return () => clearTimeout(t);
  }, [effectiveWeight, sliderWeight]);
  const [altPair, setAltPair] = useState<SensitivityPoint | null>(null);
  const weightKey = weight === undefined ? '' : weight.toFixed(3);

  useEffect(() => {
    let cancelled = false;
    setLoad((l) => (l.status === 'ready' ? l : { status: 'loading' }));
    loadCard(product.ticker, ref, weight).then((r) => {
      if (!cancelled) setLoad(r ? { status: 'ready', detail: r.detail, source: r.source, w: weight } : { status: 'error' });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.ticker, ref.profileId, ref.persona, nonce, weightKey]);

  const s = live.stats;
  const outlook = useMemo(
    () => (load.status === 'ready' ? scaleOutlook(load.detail.outlook, quantity) : null),
    [load, quantity],
  );
  const beta = load.status === 'ready' ? load.detail.outlook.history?.beta : undefined;
  const proxy = load.status === 'ready' ? (load.detail.outlook.history?.beta_proxy ?? 'le marché') : '';
  const start = product.price * quantity;
  const share = load.status === 'ready' ? load.detail.outlook.share_below_start : null;
  const sharePct = share === null ? null : share > 1 ? share : share * 100;
  const weightShown = load.status === 'ready' ? load.detail.impact?.weight : undefined;
  const notes = load.status === 'ready' ? (load.detail.impact?.notes ?? []) : [];

  // "Research note" layout (version B of docs/mockups-see-more-meme-contenu.png): same blocks and texts,
  // grouped in five sections with a red kicker and hairlines between them.
  return (
    <div className="card__body card__body--live card__body--report">
      <SectionHead kicker="Cours" title="Historique du produit" first />
      <PriceHistoryChart ticker={product.ticker} fallback={product.history[0]} currency={live.currency || 'CAD'} />
      <dl className="stats" aria-label="Statistiques sur la période">
        <div>
          <dt>Rendement annuel</dt>
          <dd>{formatPct(s.cagr, 1, true)}</dd>
        </div>
        <div>
          <dt>Volatilité</dt>
          <dd>{formatPct(s.vol)}</dd>
        </div>
        <div>
          <dt>Pire baisse</dt>
          <dd>{formatPct(s.max_drawdown)}</dd>
        </div>
      </dl>
      <p className="stats__meta">
        Période : {formatDate(s.window[0])} → {formatDate(s.window[1])} · Source : {live.source} · Données au{' '}
        {formatDate(live.asOf)} · Montants en {live.currency}. Le rendement passé ne garantit pas le rendement futur.
        {beta !== undefined && ` Bêta vs ${proxy} : ${beta.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`}
      </p>
      <SectionHead kicker="Profil" title="Adéquation à votre profil" />
      <FitBadge fit={live.fit} />
      {product.reasons.length > 0 && (
        <details className="fold" data-testid="all-reasons">
          <summary>Pourquoi : toutes les raisons</summary>
          <ul className="reasons-full">
            {product.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </details>
      )}

      <SectionHead kicker="Projection" title="Vue à 5 ans : trois scénarios hypothétiques" />
      {load.status === 'loading' && (
        <>
          {/* The detailed view opens at its top: the scenarios load further down without scrolling the page. */}
          <AgentProgress steps={CARD_STEPS} label="Chargement des scénarios" reveal={false} />
          <div className="skeleton skeleton--chart" aria-hidden="true" />
        </>
      )}
      {load.status === 'error' && (
        <div className="inline-error" role="alert">
          <p>Les scénarios de ce titre ne sont pas disponibles : le serveur ne répond pas (délai de 60 secondes) et la copie locale ne le contient pas.</p>
          <button type="button" className="link-btn link-btn--dark" onClick={retry}>
            Réessayer
          </button>
        </div>
      )}
      {outlook && load.status === 'ready' && (
        <>
          {load.source === 'snapshot' && (
            <p className="inline-note">Copie locale des données (le serveur ne répond pas).</p>
          )}
          {outlook.scenarios.central.annual < 0 && (
            <p className="inline-note inline-note--info" data-testid="vol-drag-note">
              Avec une forte volatilité, la valeur médiane peut baisser même si la moyenne monte.
            </p>
          )}
          <div className="impact">
            <OutlookChart outlook={outlook} startDate={live.asOf} />
          </div>
          <SectionHead kicker="Simulation" title="Simuler un achat" />
          <QuantityInput value={quantity} onChange={onQuantityChange} />
          <SensitivityControl outlook={outlook} value={altPair} onChange={setAltPair} />
          {quantity > 0 && (
            <p className="impact__summary" data-testid="outlook-summary">
              Mise de départ : {formatUsd(start)}. {sharePct !== null && <>Environ {Math.round(sharePct)} % des scénarios simulés finissent sous cette valeur après 5 ans.</>}
            </p>
          )}
          {weightShown !== undefined && quantity > 0 && (
            <p className="impact__portfolio">
              Poids dans le portefeuille simulé : {formatPct(weightShown)}{rawWeight === undefined ? ' (hypothèse : 5 %)' : ''}.
              {notes.map((n) => (
                <span key={n}> {n}</span>
              ))}
            </p>
          )}
          {quantity > 0 && load.source === 'api' && (
            <ImpactSlider
              weight={weightShown ?? effectiveWeight}
              loadedWeight={load.w ?? weightShown}
              impact={load.detail.impact}
              onChange={(w) => setSliderWeight(w)}
            />
          )}
          <SectionHead kicker="Méthode" title="Méthode et sources" />
          <details className="fold">
            <summary>Méthode, hypothèses et limites</summary>
            <p>{outlook.method}</p>
            {outlook.sensitivity_summary && (
              <p data-testid="sensitivity">
                <strong>Sensibilité aux hypothèses.</strong> {outlook.sensitivity_summary}
              </p>
            )}
            <h4>Hypothèses</h4>
            <ul>
              {outlook.assumptions.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
            <h4>Limites</h4>
            <ul>
              {outlook.limits.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </details>
          <PipelinePanel pipeline={load.detail.pipeline} outlook={load.detail.outlook} />
          <p className="disclaimer-inline" data-testid="outlook-disclaimer">
            {outlook.disclaimer}
          </p>
          <p className="hypotheses-link">
            <HypothesesButton />
          </p>
        </>
      )}
      {active && quantity > 0 && (
        <p className="impact__portfolio">
          Portefeuille actif « {active.name} » ({RISK_LABEL[active.risk]}) : simulation uniquement, aucun ordre réel n’est
          envoyé par cette étape.
        </p>
      )}
    </div>
  );
}

/** Section title of the detailed view: small red kicker over the title, hairline above (except the first). */
function SectionHead({ kicker, title, first = false }: { kicker: string; title: string; first?: boolean }) {
  return (
    <header className={'dsec' + (first ? ' dsec--first' : '')}>
      <span className="dsec__kicker" aria-hidden="true">
        {kicker}
      </span>
      <h2 className="dsec__title">{title}</h2>
    </header>
  );
}

function PipelinePanel({ pipeline, outlook }: { pipeline: Pipeline; outlook: Outlook }) {
  return (
    <details className="fold fold--pipeline" data-testid="pipeline-panel">
      <summary>Comment ces chiffres ont été obtenus</summary>
      <p className="fold__intro">
        Quatre agents travaillent en séquence. Le code calcule tous les chiffres ; le modèle ne fait que rédiger l’explication,
        qui est ensuite contrôlée. Chaque étape montre ce que le serveur a réellement renvoyé.
      </p>
      <PipelineTimeline pipeline={pipeline} outlook={outlook} />
    </details>
  );
}

// ---- legacy (mock data) view -------------------------------------------------------------------

function LegacyDetails({ product, quantity, onQuantityChange }: CardDetailsProps) {
  const projections = useMemo(
    () => computeProjections(product.price, quantity, product.rates),
    [product.price, product.rates, quantity],
  );
  const start = product.price * quantity;
  const finalMedian = projections.median[projections.median.length - 1].value;
  const pct = Math.round(product.rates.median * 1000) / 10;
  const active = useAccount()?.active ?? null;
  const base = active?.initialAmount ?? 0;
  const share = base > 0 ? Math.round((start / base) * 1000) / 10 : 0;
  const warning = active ? riskWarning(product, active) : null;

  return (
    <div className="card__body">
      <h2 className="card__title">Historique du produit</h2>
      <PriceHistoryChart fallback={product.history[0]} currency="USD" fictional />

      <h3 className="card__subtitle">Impacts prévus sur le portefeuille (données fictives)</h3>
      <div className="impact">
        <ProjectionChart projections={projections} quantity={quantity} />
        <QuantityInput value={quantity} onChange={onQuantityChange} />
      </div>
      {quantity > 0 && (
        <p className="impact__summary" data-testid="projection-summary">
          Chiffres fictifs : mise de départ {formatUsd(start)} (fictif), valeur centrale hypothétique à 12 mois {formatUsd(finalMedian)} (fictif, {pct >= 0 ? '+' : ''}
          {pct.toLocaleString('fr-FR')} %)
        </p>
      )}
      {active && quantity > 0 && (
        <p className="impact__portfolio">
          Portefeuille actif « {active.name} » ({RISK_LABEL[active.risk]}) :{' '}
          {base > 0
            ? `cet achat représenterait ${share.toLocaleString('fr-FR')} % de la mise initiale prévue (${formatUsdRounded(active.initialAmount)}).`
            : 'aucune mise initiale prévue.'}
          {warning && <span className="impact__warning"> {warning}</span>}
        </p>
      )}
    </div>
  );
}
