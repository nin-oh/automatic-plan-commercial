export interface StatusDotProps {
  status: 'active' | 'inactive' | 'warning' | 'error';
  label?: string;
  className?: string;
}
