import type { Size } from '../../types';

export interface TextProps {
  children: React.ReactNode;
  size?: Size;
  weight?: 'normal' | 'medium' | 'semibold' | 'bold';
  color?: string;
  muted?: boolean;
  as?: 'span' | 'p' | 'div' | 'label';
  className?: string;
  style?: React.CSSProperties;
}
