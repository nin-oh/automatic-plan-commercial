import type { Size } from '../../types';

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size' | 'type'> {
  /** Label text next to checkbox */
  label?: string;
  /** Size variant */
  size?: Size;
}
