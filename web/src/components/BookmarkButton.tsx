import { BookmarkIcon } from './Icons';

interface BookmarkButtonProps {
  active: boolean;
  onToggle: () => void;
  label?: string;
}

export function BookmarkButton({ active, onToggle, label }: BookmarkButtonProps) {
  return (
    <button
      type="button"
      className={label ? 'rail-btn' : 'icon-btn'}
      aria-pressed={active}
      aria-label={active ? 'Retirer des favoris' : 'Ajouter aux favoris'}
      onClick={onToggle}
    >
      <BookmarkIcon filled={active} />
      {label && <span aria-hidden="true">{label}</span>}
    </button>
  );
}
