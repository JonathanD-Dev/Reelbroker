const base = {
  width: 22,
  height: 22,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  focusable: false,
};

export function BookmarkIcon({ filled = false }: { filled?: boolean }) {
  return (
    <svg {...base} fill={filled ? 'currentColor' : 'none'}>
      <path d="M6 3h12v18l-6-4-6 4z" />
    </svg>
  );
}

export function CartIcon() {
  return (
    <svg {...base}>
      <circle cx="9" cy="20" r="1.5" />
      <circle cx="18" cy="20" r="1.5" />
      <path d="M2 3h3l2.7 12.4a1 1 0 0 0 1 .8h8.9a1 1 0 0 0 1-.8L20 8H6" />
    </svg>
  );
}

/** Arrow leaving a box: the link opens another site (BNCD). */
export function ExternalIcon() {
  return (
    <svg {...base}>
      <path d="M14 4h6v6" />
      <path d="M20 4l-9 9" />
      <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
    </svg>
  );
}

export function MenuDotsIcon() {
  return (
    <svg {...base} fill="currentColor" stroke="none">
      <circle cx="12" cy="5" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="12" cy="19" r="2" />
    </svg>
  );
}

export function BanIcon() {
  return (
    <svg {...base}>
      <circle cx="12" cy="12" r="9" />
      <path d="M5.6 5.6l12.8 12.8" />
    </svg>
  );
}
export function HomeIcon({ filled = false }: { filled?: boolean }) {
  return (
    <svg {...base} fill={filled ? 'currentColor' : 'none'}>
      <path d="M3 11l9-8 9 8v10h-6v-6H9v6H3z" />
    </svg>
  );
}
export function SearchIcon() {
  return (
    <svg {...base} width={18} height={18}>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  );
}
export function UserIcon({ filled = false }: { filled?: boolean }) {
  return (
    <svg {...base} fill={filled ? 'currentColor' : 'none'}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 7 0 0 1 16 0z" />
    </svg>
  );
}
export function BackIcon() {
  return (
    <svg {...base}>
      <path d="M15 5l-7 7 7 7" />
    </svg>
  );
}
export function CheckIcon() {
  return (
    <svg {...base} width={14} height={14} strokeWidth={3}>
      <path d="M5 12l5 5 9-10" />
    </svg>
  );
}
export function ChevronIcon({ up = false }: { up?: boolean }) {
  return (
    <svg {...base} width={18} height={18}>
      <path d={up ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'} />
    </svg>
  );
}
export function LogoutIcon() {
  return (
    <svg {...base} width={18} height={18}>
      <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" />
      <path d="M10 17l-5-5 5-5" />
      <path d="M5 12h11" />
    </svg>
  );
}
