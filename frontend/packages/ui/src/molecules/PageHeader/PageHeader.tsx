export interface PageHeaderProps {
  title: string;
  breadcrumb?: string;
}

export default function PageHeader({ title, breadcrumb }: PageHeaderProps) {
  return (
    <div className="page-header">
      <h1 className="page-title">{title}</h1>
      {breadcrumb ? <div className="breadcrumb">{breadcrumb}</div> : null}
    </div>
  );
}
