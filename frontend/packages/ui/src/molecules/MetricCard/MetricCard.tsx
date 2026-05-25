export interface MetricCardProps {
  label: string;
  value: string | number;
  tone?: 'blue' | 'orange' | 'green' | 'red';
}

export default function MetricCard({ label, value, tone = 'blue' }: MetricCardProps) {
  return (
    <div className={`metric-card metric-card--${tone}`}>
      <div className="metric-card__label">{label}</div>
      <div className="metric-card__value">{value}</div>
    </div>
  );
}
