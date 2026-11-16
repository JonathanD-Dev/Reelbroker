import type { Product } from '../types';

/**
 * Quote page of a security on National Bank Direct Brokerage (BNCD). Requires the user to be
 * signed in to the BNCD platform. `{symbol}` and `{market}` are replaced (URL-encoded).
 * Change this single constant if the platform URL changes.
 */
export const BNCD_QUOTE_URL =
  'https://client.bnc.ca/cdbn/markets/quote/STOCK/{symbol}/{market}/overview/chart';

export const DEFAULT_MARKET = 'USA';

/**
 * Product decision: true = "Buy now" opens the BNCD quote page (new tab); false = simulated purchase in the
 * app (cart page, nothing leaves the app). One switch for the whole app.
 */
export const DIRECT_BNCD: boolean = false;

/**
 * "Voir sur BNCD": the quote page to look at, whatever DIRECT_BNCD says (it only opens a page, nothing
 * is bought or recorded). `null` when the product has no BNCD page (fictional company, crypto...).
 */
export function bncdViewUrl(product: Product): string | null {
  return bncdQuoteUrl(product, true);
}

/** BNCD quote URL of a product, or `null` for fictional companies. */
export function bncdQuoteUrl(product: Product, direct: boolean = DIRECT_BNCD): string | null {
  if (!direct || product.fictional || product.noQuote) return null;
  return BNCD_QUOTE_URL.replace('{symbol}', encodeURIComponent(product.bncdSymbol ?? product.ticker)).replace(
    '{market}',
    encodeURIComponent(product.market ?? DEFAULT_MARKET),
  );
}
