export interface TableCardProps {
  icon?: React.ReactNode;
  title: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}
export default function TableCard({ icon, title, actions, children }: TableCardProps) {
  return (
    <section className="table-card">
      <div className="table-card__header">
        <div className="table-card__title">
          <span>{icon}</span>
          <span>{title}</span>
        </div>
        {actions ? <div className="table-card__actions">{actions}</div> : null}
      </div>
      <div className="table-card__body">{children}</div>
    </section>
  );
}
