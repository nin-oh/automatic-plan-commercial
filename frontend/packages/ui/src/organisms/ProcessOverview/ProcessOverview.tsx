import { PageHeader } from '../../molecules/PageHeader';
import KpiGrid from '../KpiGrid/KpiGrid';
import TableCard from '../TableCard/TableCard';
import type { KpiGridItem } from '../KpiGrid/KpiGrid';
export interface ProcessOverviewProps {
  title: string;
  breadcrumb?: string;
  metrics?: KpiGridItem[];
  cardIcon?: React.ReactNode;
  cardTitle: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}
export default function ProcessOverview({ title, breadcrumb, metrics, cardIcon, cardTitle, action, children }: ProcessOverviewProps) {
  return (
    <>
      <PageHeader title={title} breadcrumb={breadcrumb} />
      {metrics?.length ? <KpiGrid items={metrics} /> : null}
      <TableCard icon={cardIcon} title={cardTitle} actions={action}>{children}</TableCard>
    </>
  );
}
