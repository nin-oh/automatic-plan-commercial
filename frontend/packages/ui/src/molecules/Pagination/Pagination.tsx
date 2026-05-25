import { Button } from '../../atoms/Button';
import type { PaginationProps } from './Pagination.types';

export function Pagination({ page, totalPages, onChange, className = '' }: PaginationProps) {
  if (totalPages <= 1) return null;

  return (
    <div className={className} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
      >
        Précédent
      </Button>
      <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
        Page {page} / {totalPages}
      </span>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => onChange(page + 1)}
        disabled={page >= totalPages}
      >
        Suivant
      </Button>
    </div>
  );
}
