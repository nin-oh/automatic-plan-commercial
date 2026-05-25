/** Generic ID type — works with Django integer PKs or string IDs */
export type ID = string | number;

/** Sort direction for table columns */
export type SortDirection = 'asc' | 'desc' | null;

/** Common size scale used across components */
export type Size = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

/** Color variants for buttons, badges, tags, cards */
export type ColorVariant =
  | 'primary'
  | 'secondary'
  | 'success'
  | 'danger'
  | 'warning'
  | 'info'
  | 'ghost';

/** Base props that most components accept */
export interface BaseProps {
  className?: string;
  style?: React.CSSProperties;
}
