import type { Size } from '../../types';

export interface DatePickerProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size' | 'type'> {
  size?: Size;
  error?: boolean;
  fullWidth?: boolean;
}
