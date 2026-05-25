import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import KanbanCard from '../../molecules/KanbanCard/KanbanCard';
import type { KanbanCardProps } from '../../molecules/KanbanCard/KanbanCard';

export interface KanbanColumnProps {
  id: string;
  title: string;
  color: string;
  cards: KanbanCardProps[];
  totalLabel?: React.ReactNode;
  onCardClick?: (cardId: string | number) => void;
}

export default function KanbanColumn({
  id,
  title,
  color,
  cards,
  totalLabel,
  onCardClick,
}: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div className="kanban-column" ref={setNodeRef}>
      <div className="kanban-column__header" style={{ backgroundColor: color }}>
        <span className="kanban-column__title">{title}</span>
        <span className="kanban-column__count">{cards.length}</span>
      </div>
      {totalLabel && <div className="kanban-column__total">{totalLabel}</div>}
      <div
        className={`kanban-column__body${isOver ? ' kanban-column__body--over' : ''}`}
      >
        <SortableContext
          items={cards.map(c => c.id)}
          strategy={verticalListSortingStrategy}
        >
          {cards.length === 0 ? (
            <div className="kanban-column__empty">Aucun paiement</div>
          ) : (
            cards.map(card => (
              <KanbanCard
                key={card.id}
                {...card}
                onClick={() => onCardClick?.(card.id)}
              />
            ))
          )}
        </SortableContext>
      </div>
    </div>
  );
}
