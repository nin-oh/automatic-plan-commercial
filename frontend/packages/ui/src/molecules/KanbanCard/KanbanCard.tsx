import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import Badge from '../../atoms/Badge/Badge';

export interface KanbanCardField {
  label: string;
  value: React.ReactNode;
}

export interface KanbanCardProps {
  id: string | number;
  title: string;
  subtitle?: React.ReactNode;
  badge?: { label: string; tone: 'warning' | 'success' | 'danger' };
  fields?: KanbanCardField[];
  borderColor?: string;
  /** If true, card is draggable via dnd-kit */
  draggable?: boolean;
  onClick?: () => void;
}

export default function KanbanCard({
  id,
  title,
  subtitle,
  badge,
  fields = [],
  borderColor = 'var(--color-primary)',
  draggable = true,
  onClick,
}: KanbanCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled: !draggable });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    cursor: draggable ? 'grab' : 'default',
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="kanban-card"
      onClick={onClick}
    >
      <div className="kanban-card__border" style={{ backgroundColor: borderColor }} />
      <div className="kanban-card__body">
        <div className="kanban-card__header">
          <span className="kanban-card__title">{title}</span>
          {badge && <Badge label={badge.label} tone={badge.tone} />}
        </div>
        {subtitle && <div className="kanban-card__subtitle">{subtitle}</div>}
        {fields.length > 0 && (
          <div className="kanban-card__fields">
            {fields.map((f, i) => (
              <div key={i} className="kanban-card__field">
                <span className="kanban-card__field-label">{f.label}</span>
                <span className="kanban-card__field-value">{f.value}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
