import type { ColorVariant, Size } from '../../types';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual style */
  variant?: ColorVariant;
  /** Size */
  size?: Size;
  /** Show loading spinner instead of content */
  loading?: boolean;
  /** Icon element before text */
  icon?: React.ReactNode;
  /** Stretch to full width */
  fullWidth?: boolean;
}
