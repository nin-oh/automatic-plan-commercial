export interface ProgressBarProps {
  /** Value between 0 and 100 */
  value: number;
  /** Max value (default 100) */
  max?: number;
  /** Bar color */
  color?: string;
  /** Track (background) color */
  trackColor?: string;
  /** Height in px */
  height?: number;
  /** Show value label */
  showLabel?: boolean;
  className?: string;
}
