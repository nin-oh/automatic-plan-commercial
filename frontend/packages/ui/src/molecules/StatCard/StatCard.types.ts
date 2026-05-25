export interface StatCardProps {
  title: string;
  value: number | string;
  format?: 'currency' | 'percent' | 'plain';
  locale?: string;
  color: string;
  icon?: React.ReactNode;
  trend?: { value: number; direction: 'up' | 'down' };
  className?: string;
}

export interface StatCardGroupProps {
  children: React.ReactNode;
  className?: string;
}
