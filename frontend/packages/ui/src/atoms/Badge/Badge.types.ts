import type { ColorVariant, Size } from '../../types';

export interface BadgeProps {
  children: React.ReactNode;
  variant?: ColorVariant;
  size?: Size;
  className?: string;
}
