import type { ReactNode } from 'react';
import { useAccount } from '../hooks/useAccount';
import { BookmarkIcon, HomeIcon, UserIcon } from './Icons';
import { PortfolioGlyph } from './PortfolioIcons';

export type Tab = 'feed' | 'saved' | 'profile';

interface TabBarProps {
  current: Tab;
  /** Called instead of navigating when the tab of the current page is clicked again (e.g. "Fil": refresh). */
  onReselect?: (tab: Tab) => void;
}

export function TabBar({ current, onReselect }: TabBarProps) {
  // The Profile tab shows the icon of the active portfolio (or a person when there is none).
  const active = useAccount()?.active ?? null;
  const tabs: { tab: Tab; href: string; label: string; icon: (on: boolean) => ReactNode }[] = [
    { tab: 'feed', href: '#/', label: 'Fil', icon: (on) => <HomeIcon filled={on} /> },
    { tab: 'saved', href: '#/saved', label: 'Sauvegardés', icon: (on) => <BookmarkIcon filled={on} /> },
    {
      tab: 'profile',
      href: '#/profile',
      label: 'Profil',
      icon: (on) =>
        active ? (
          <span className="tab-bar__pf" style={{ color: active.color }}>
            <PortfolioGlyph icon={active.icon} size={20} />
          </span>
        ) : (
          <UserIcon filled={on} />
        ),
    },
  ];
  return (
    <nav className="tab-bar" aria-label="Navigation principale">
      {tabs.map(({ tab, href, label, icon }) => {
        const on = tab === current;
        return (
          <a
            key={tab}
            href={href}
            className={'tab-bar__item' + (on ? ' tab-bar__item--active' : '')}
            aria-current={on ? 'page' : undefined}
            onClick={
              on && onReselect
                ? (e) => {
                    e.preventDefault();
                    onReselect(tab);
                  }
                : undefined
            }
          >
            {icon(on)}
            <span>{label}</span>
          </a>
        );
      })}
    </nav>
  );
}
