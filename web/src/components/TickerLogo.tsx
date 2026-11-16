import { useState } from 'react';

interface TickerLogoProps {
  name: string;
  color: string;
  size?: number;
  /** Shows web/public/logos/<ticker>.png (scripts/fetch_logos.py); initials if absent or not loadable. */
  ticker?: string;
}

export function TickerLogo({ name, color, size = 40, ticker }: TickerLogoProps) {
  const [failed, setFailed] = useState<string | null>(null);
  if (ticker && failed !== ticker) {
    return (
      <span className="ticker-logo" style={{ width: size, height: size }} aria-hidden="true">
        <img
          src={`${import.meta.env.BASE_URL}logos/${encodeURIComponent(ticker)}.png`}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={() => setFailed(ticker)}
        />
      </span>
    );
  }
  const initials = name.slice(0, 2).toUpperCase();
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true" focusable="false">
      <circle cx="20" cy="20" r="20" fill={color} />
      <text
        x="20"
        y="25"
        textAnchor="middle"
        fontSize="15"
        fontWeight="700"
        fill="#fff"
        fontFamily="system-ui, sans-serif"
      >
        {initials}
      </text>
    </svg>
  );
}
