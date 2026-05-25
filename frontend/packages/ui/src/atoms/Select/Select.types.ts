import type { Size, Choice } from '../../types';

export interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  /** Options to display */
  choices: Choice[];
  /** Size variant */
  size?: Size;
  /** Show error styling */
  error?: boolean;
  /** Placeholder text (first empty option) */
  placeholder?: string;
  /** Full width */
  fullWidth?: boolean;
}
