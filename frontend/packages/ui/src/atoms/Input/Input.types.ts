import type { Size } from '../../types';

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  /** Size variant */
  size?: Size;
  /** Show error styling */
  error?: boolean;
  /** Icon on the left side */
  iconLeft?: React.ReactNode;
  /** Icon on the right side */
  iconRight?: React.ReactNode;
  /** Full width */
  fullWidth?: boolean;
}
