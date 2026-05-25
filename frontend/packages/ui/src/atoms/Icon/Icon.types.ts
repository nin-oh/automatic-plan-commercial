import type { Size } from '../../types';

export interface IconProps {
  /** SVG content or icon component */
  children: React.ReactNode;
  /** Icon size */
  size?: Size;
  /** Icon color */
  color?: string;
  className?: string;
  style?: React.CSSProperties;
}
