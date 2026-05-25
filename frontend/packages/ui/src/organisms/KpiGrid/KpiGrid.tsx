import { MetricCard } from '../../molecules/MetricCard';
export interface KpiGridItem {
  label: string;
  value: string | number;
  tone?: 'blue' | 'orange' | 'green' | 'red';
}
export interface KpiGridProps {
  items: KpiGridItem[];
}
export default function KpiGrid({ items }: KpiGridProps) {
  return (
    <div className="kpi-grid">
      {items.map((item) => <MetricCard key={`${item.label}-${item.tone}`} label={item.label} value={item.value} tone={item.tone} />)}
    </div>
  );
}
