import type { Size } from '../../types';

export interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  size?: Size;
  fullWidth?: boolean;
  className?: string;
}
