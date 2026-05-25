export interface DashboardLayoutProps {
  header?: React.ReactNode;
  sidebar?: React.ReactNode;
  children?: React.ReactNode;
}
export default function DashboardLayout({ header, sidebar, children }: DashboardLayoutProps) {
  return (
    <div className="dashboard-layout">
      <div className="dashboard-header-slot">{header || <div className="dashboard-placeholder" aria-hidden="true" />}</div>
      <div className="dashboard-body">
        <div className="dashboard-sidebar-slot">{sidebar || <div className="dashboard-placeholder" aria-hidden="true" />}</div>
        <main className="app-main">{children || <div className="dashboard-placeholder" aria-hidden="true" />}</main>
      </div>
    </div>
  );
}
