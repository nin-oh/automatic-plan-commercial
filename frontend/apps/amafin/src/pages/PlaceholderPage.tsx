import { PageHeader, TableCard } from '@amafin/ui';

export function PlaceholderPage({ title, description }: { title: string; description?: string }) {
  return (
    <>
      <PageHeader title={title} breadcrumb={`Accueil / ${title}`} />
      <TableCard icon="🚧" title={title}>
        <div className="empty-state">
          <div className="empty-state__icon">🚧</div>
          <div className="empty-state__title">En cours de développement</div>
          <div className="empty-state__text">
            {description ?? 'Cette page sera disponible prochainement.'}
          </div>
        </div>
      </TableCard>
    </>
  );
}
