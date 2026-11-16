import type { ReactNode } from 'react';
import type { PortfolioIcon } from '../lib/account';

// 24×24 line icons (stroke = currentColor). The plane path comes from Lucide (ISC licence).
const GLYPHS: Record<PortfolioIcon, ReactNode> = {
  sunset: (
    <>
      <path d="M3 18h18M5 21h14" />
      <path d="M7 18a5 5 0 0 1 10 0" />
      <path d="M12 8v3M5.6 11.6l1.6 1.6M18.4 11.6l-1.6 1.6" />
    </>
  ),
  home: <path d="M3 11l9-8 9 8M5 9.5V21h14V9.5M10 21v-6h4v6" />,
  plane: (
    <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z" />
  ),
  school: <path d="M22 10 12 5 2 10l10 5 10-5zM6 12v5c3 3 9 3 12 0v-5M22 10v6" />,
  shield: <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />,
  wallet: <path d="M3 7h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 7V6a2 2 0 0 1 2-2h11M16 13h2" />,
  car: (
    <>
      <path d="M3 17v-4l2-5a2 2 0 0 1 2-1h10a2 2 0 0 1 2 1l2 5v4M3 13h18M9 17h6" />
      <circle cx="7" cy="17" r="2" />
      <circle cx="17" cy="17" r="2" />
    </>
  ),
  heart: <path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z" />,
  growth: <path d="M3 3v18h18M7 15l4-4 3 3 5-6M15 8h4v4" />,
  briefcase: <path d="M3 8h18v12H3zM8 8V5h8v3M3 13h18" />,
  gift: (
    <path d="M3 9h18v4H3zM5 13v8h14v-8M12 9v12M12 9C9.5 9 7 4 9.5 4S12 9 12 9zM12 9c2.5 0 5-5 2.5-5S12 9 12 9z" />
  ),
  star: <path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3l-5.5 2.9 1-6.2L3 9.6l6.2-.9z" />,
};

/** Decorative portfolio icon; give the meaning in text next to it (name or label). */
export function PortfolioGlyph({ icon, size = 22 }: { icon: PortfolioIcon; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {GLYPHS[icon]}
    </svg>
  );
}
