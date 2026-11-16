export interface Range {
  min: number;
  max: number;
}

export function getRange(values: number[], padding = 0.05): Range {
  if (values.length === 0) return { min: 0, max: 1 };
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  if (lo === hi) return { min: lo - 1, max: hi + 1 };
  const pad = (hi - lo) * padding;
  return { min: lo - pad, max: hi + pad };
}

export function toPoints(
  values: number[],
  width: number,
  height: number,
  range: Range,
  margin = 4,
): string {
  const span = range.max - range.min || 1;
  const innerW = width - 2 * margin;
  const innerH = height - 2 * margin;
  return values
    .map((v, i) => {
      const x = margin + (values.length > 1 ? (i / (values.length - 1)) * innerW : innerW / 2);
      const y = margin + (1 - (v - range.min) / span) * innerH;
      return `${round(x)},${round(y)}`;
    })
    .join(' ');
}

const round = (n: number) => Math.round(n * 100) / 100;
