function parseHex(hex: string): [number, number, number] {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  if (!m) throw new Error(`Invalid hex color: ${hex}`);
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}

/** Scales each channel by `ratio` (0 = black, 1 = unchanged) and returns `#rrggbb`. */
export function mixWithBlack(hex: string, ratio: number): string {
  const r = Math.min(Math.max(ratio, 0), 1);
  return (
    '#' +
    parseHex(hex)
      .map((c) => Math.round(c * r).toString(16).padStart(2, '0'))
      .join('')
  );
}

function luminance(hex: string): number {
  const [r, g, b] = parseHex(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.x contrast ratio between two `#rrggbb` colors (1..21). */
export function contrastRatio(hexA: string, hexB: string): number {
  const a = luminance(hexA);
  const b = luminance(hexB);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
