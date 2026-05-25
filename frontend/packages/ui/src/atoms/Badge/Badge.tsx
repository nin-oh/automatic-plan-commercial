export interface BadgeProps {
  label: string;
  tone?: 'warning' | 'success' | 'danger';
}

export default function Badge({ label, tone = 'warning' }: BadgeProps) {
  return <span className={`badge badge--${tone}`}>{label}</span>;
}
