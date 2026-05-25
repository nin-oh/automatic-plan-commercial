import type { ColorVariant, Size } from '../../types';

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: React.ReactNode;
  variant?: ColorVariant;
  size?: Size;
  /** Accessible label (required for icon-only buttons) */
  'aria-label': string;
}
