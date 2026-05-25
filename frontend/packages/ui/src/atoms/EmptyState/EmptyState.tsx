interface EmptyStateProps {
  message?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  message = 'Aucune donnée',
  icon,
  action,
  className = '',
}: EmptyStateProps) {
  return (
    <div
      className={className}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--space-2xl)',
        color: 'var(--color-text-muted)',
        gap: 'var(--space-md)',
      }}
    >
      {icon && <div style={{ fontSize: 48, opacity: 0.4 }}>{icon}</div>}
      <p style={{ fontSize: 'var(--font-size-lg)', margin: 0 }}>{message}</p>
      {action}
    </div>
  );
}
