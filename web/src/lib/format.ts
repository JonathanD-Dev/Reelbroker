let currency = 'USD';
let money = new Intl.NumberFormat('fr-FR', { style: 'currency', currency, currencyDisplay: 'narrowSymbol', maximumFractionDigits: 2 });
let moneyRounded = new Intl.NumberFormat('fr-FR', { style: 'currency', currency, currencyDisplay: 'narrowSymbol', maximumFractionDigits: 0 });

/** Currency of the amounts shown (USD for the mock data, CAD for the backend data). */
export function setDisplayCurrency(code: string): void {
  if (code === currency) return;
  currency = code;
  money = new Intl.NumberFormat('fr-FR', { style: 'currency', currency, currencyDisplay: 'narrowSymbol', maximumFractionDigits: 2 });
  moneyRounded = new Intl.NumberFormat('fr-FR', { style: 'currency', currency, currencyDisplay: 'narrowSymbol', maximumFractionDigits: 0 });
}

// Historical names: they format in the display currency.
export function formatUsd(value: number): string {
  return money.format(value);
}

export function formatUsdRounded(value: number): string {
  return moneyRounded.format(value);
}

/** 0.0731 -> "7,3 %" (sign shown when `signed`). */
export function formatPct(x: number, digits = 1, signed = false): string {
  const s = (x * 100).toLocaleString('fr-FR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return `${signed && x > 0 ? '+' : ''}${s} %`;
}

/** "2026-11-12" -> "12 nov. 2026". */
export function formatDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString('fr-CA', { day: 'numeric', month: 'short', year: 'numeric' });
}
