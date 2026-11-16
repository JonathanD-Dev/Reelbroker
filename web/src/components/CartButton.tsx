import { CartIcon } from './Icons';

interface CartButtonProps {
  onClick: () => void;
  label?: string;
  /** Accessible description, e.g. "Ouvre BNCD dans un nouvel onglet". */
  hint?: string;
}

export function CartButton({ onClick, label, hint }: CartButtonProps) {
  return (
    <button
      type="button"
      className={label ? 'rail-btn' : 'icon-btn'}
      aria-label="Simuler l’achat"
      title={hint}
      onClick={onClick}
    >
      <CartIcon />
      {label && <span aria-hidden="true">{label}</span>}
    </button>
  );
}
