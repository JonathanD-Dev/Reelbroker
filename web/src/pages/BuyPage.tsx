import { api as backend } from '../lib/api';
import type { PurchaseResult } from '../lib/api';
import { useProfileRef } from '../hooks/useProfileId';
import { FitBadge } from '../components/CardSummary';
import { useId, useState, useRef } from 'react';
import type { Ticker } from '../types';
import { getCatalog } from '../lib/catalog';
import { formatUsd } from '../lib/format';
import { parseQuantity } from '../lib/projections';
import { EXCLUSION_LABEL, RISK_LABEL, portfolioValue, riskWarning } from '../lib/account';
import { bncdQuoteUrl } from '../lib/bncd';
import { useAccount } from '../hooks/useAccount';

interface BuyPageProps {
  ticker: Ticker;
  onBack: () => void;
  onCreatePortfolio?: () => void;
}

/**
 * Cart: choose quantity and portfolio, then continue on BNCD (the order is placed there).
 * The position is also added to the chosen portfolio of this demo.
 */
export function BuyPage({ ticker, onBack, onCreatePortfolio }: BuyPageProps) {
  const uid = useId();
  const api = useAccount();
  const portfolios = api?.account.portfolios ?? [];
  const [portfolioId, setPortfolioId] = useState<string | null>(api?.account.activeId ?? portfolios[0]?.id ?? null);
  const [quantity, setQuantity] = useState(10);
  const [raw, setRaw] = useState('10');
  const [done, setDone] = useState<string | null>(null);
  const product = getCatalog().find((p) => p.ticker === ticker);
  const target = portfolios.find((p) => p.id === portfolioId) ?? null;
  const url = product ? bncdQuoteUrl(product) : null;
  const excluded =
    product?.exclusion && api?.account.shared.preferences?.exclusions.includes(product.exclusion)
      ? EXCLUSION_LABEL[product.exclusion]
      : null;
  // Numbers of live products come from the API: the team's UI-side risk warning only serves the mock data.
  const warning = product && target && !product.live ? riskWarning(product, target) : null;
  const total = product ? Math.round(product.price * quantity * 100) / 100 : 0;
  // Purchases are paid from the chosen portfolio's cash.
  const shortOfCash = Boolean(target && total > target.cash);
  const canBuy = quantity > 0 && !shortOfCash;

  const profile = useProfileRef();
  const [sim, setSim] = useState<PurchaseResult | { error: string } | null>(null);
  // Simulated cart (DIRECT_BNCD = false): the backend checks the purchase against the profile; nothing is sent anywhere.
  const inFlight = useRef(false);
  const simulate = async () => {
    if (!product?.live || !profile.profileId || inFlight.current) return;
    inFlight.current = true;
    // Weight of the purchase in the chosen portfolio (the API accepts up to 50 % per asset); 5 % when the portfolio has no value.
    const value = target ? portfolioValue(target) : 0;
    const weight = value > 0 ? Math.min(0.5, Math.max(0.005, total / value)) : 0.05;
    try {
      setSim(await backend.purchase({ profile_id: profile.profileId, tickers: [product.ticker], weight }));
    } catch {
      setSim({ error: 'Le serveur d’analyse ne répond pas : la vérification de l’achat simulé est impossible.' });
    } finally {
      inFlight.current = false;
    }
  };

  const record = () => {
    if (!product || !canBuy) return;
    if (!url) void simulate();
    if (api && target) api.buy(target.id, product.ticker, quantity, product.price);
    const where = target ? `Position ajoutée à « ${target.name} ».` : 'Aucun portefeuille : position non enregistrée.';
    setDone(url ? `${where} BNCD s’ouvre dans un nouvel onglet.` : where);
  };

  return (
    <main className="page-light">
      <section className="buy-page">
        <h1 className="card__title">Panier</h1>
        {product ? (
          <>
            <p>
              {product.name} ({product.ticker}) : {formatUsd(product.price)}
            </p>
            <p>
              {url
                ? 'L’ordre se passe sur BNCD (connexion requise). Cette application n’effectue aucun achat.'
                : 'Société fictive : elle n’existe pas sur BNCD. La position est seulement ajoutée au portefeuille de la démo.'}
            </p>
            {excluded && <p className="buy-page__note">Ce produit fait partie de vos exclusions ({excluded}).</p>}

            <div className="buy-page__field">
              <label htmlFor={`${uid}-qty`}>Quantité</label>
              <input
                id={`${uid}-qty`}
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                value={raw}
                onChange={(e) => {
                  setRaw(e.target.value);
                  setQuantity(parseQuantity(e.target.value));
                  setDone(null);
                }}
                onBlur={() => setRaw(String(quantity))}
              />
              <span>Total estimé : {formatUsd(total)}</span>
            </div>

            {portfolios.length > 0 ? (
              <fieldset className="buy-page__portfolios">
                <legend>Dans quel portefeuille ?</legend>
                {portfolios.map((p) => (
                  <label key={p.id} className="buy-page__portfolio">
                    <input
                      type="radio"
                      name={`${uid}-pf`}
                      checked={portfolioId === p.id}
                      onChange={() => {
                        setPortfolioId(p.id);
                        setDone(null);
                      }}
                    />
                    <span>
                      {p.name} <small>({RISK_LABEL[p.risk]} · encaisse {formatUsd(p.cash)})</small>
                    </span>
                  </label>
                ))}
              </fieldset>
            ) : (
              <p className="buy-page__note">
                Aucun portefeuille : l’achat ne sera rattaché à aucun projet.{' '}
                {onCreatePortfolio && (
                  <button type="button" className="link-btn" onClick={onCreatePortfolio}>
                    Créer un portefeuille
                  </button>
                )}
              </p>
            )}
            {warning && <p className="buy-page__note">{warning}</p>}
            {shortOfCash && target && (
              <p className="buy-page__note" role="alert">
                Encaisse insuffisante : {formatUsd(target.cash)} disponibles dans « {target.name} » pour un total de{' '}
                {formatUsd(total)}.
              </p>
            )}

            {url ? (
              <a
                className={'primary-btn primary-btn--link' + (canBuy ? '' : ' primary-btn--disabled')}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                aria-disabled={!canBuy}
                onClick={(e) => {
                  if (!canBuy) {
                    e.preventDefault();
                    return;
                  }
                  record();
                }}
              >
                Continuer sur BNCD{' '}
                <span className="sr-only">(nouvel onglet)</span>
              </a>
            ) : (
              <button type="button" className="primary-btn" onClick={record} disabled={!canBuy}>
                Ajouter au portefeuille
              </button>
            )}
            {sim && (
              <div className="idea__result" data-testid="purchase-result" role="status">
                {'error' in sim ? (
                  <p className="inline-error">{sim.error}</p>
                ) : (
                  <>
                    <FitBadge fit={{ verdict: sim.overall.verdict, label: sim.overall.label }} />
                    <p>{sim.summary}</p>
                  </>
                )}
                <p className="inline-note">Simulation : aucun ordre n’est transmis.</p>
              </div>
            )}
            {done !== null && <p role="status">{done}</p>}
          </>
        ) : (
          <p>Produit introuvable.</p>
        )}
        <button type="button" className="link-btn" onClick={onBack}>
          ← Retour
        </button>
      </section>
    </main>
  );
}
