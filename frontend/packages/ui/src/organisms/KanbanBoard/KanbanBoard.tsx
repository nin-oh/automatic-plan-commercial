import { useState } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import KanbanColumn from '../KanbanColumn/KanbanColumn';
import KanbanCard from '../../molecules/KanbanCard/KanbanCard';
import type { KanbanCardProps } from '../../molecules/KanbanCard/KanbanCard';

export interface KanbanBoardColumn {
  id: string;
  title: string;
  color: string;
  totalLabel?: React.ReactNode;
}

export interface KanbanBoardProps {
  columns: KanbanBoardColumn[];
  cards: Record<string, KanbanCardProps[]>;
  onCardMove?: (cardId: string | number, fromColumn: string, toColumn: string, newIndex: number) => void;
  onCardReorder?: (columnId: string, cardIds: (string | number)[]) => void;
  onCardClick?: (cardId: string | number) => void;
}

export default function KanbanBoard({
  columns,
  cards,
  onCardMove,
  onCardReorder,
  onCardClick,
}: KanbanBoardProps) {
  const [activeCard, setActiveCard] = useState<KanbanCardProps | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  function findColumn(cardId: string | number): string | undefined {
    for (const [colId, colCards] of Object.entries(cards)) {
      if (colCards.some(c => c.id === cardId)) return colId;
    }
    return undefined;
  }

  function handleDragStart(event: DragStartEvent) {
    const { active } = event;
    const colId = findColumn(active.id);
    if (colId) {
      const card = cards[colId]?.find(c => c.id === active.id);
      setActiveCard(card ?? null);
    }
  }

  function handleDragOver(event: DragOverEvent) {
    // handled in handleDragEnd
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveCard(null);
    const { active, over } = event;
    if (!over) return;

    const activeColId = findColumn(active.id);
    // over.id can be a card id or a column id
    let overColId = findColumn(over.id);
    if (!overColId) {
      // Dropped on empty column — over.id is the column id
      overColId = columns.find(c => c.id === String(over.id))?.id;
    }

    if (!activeColId || !overColId) return;

    if (activeColId === overColId) {
      // Reorder within same column
      const colCards = cards[activeColId];
      const oldIndex = colCards.findIndex(c => c.id === active.id);
      const newIndex = colCards.findIndex(c => c.id === over.id);
      if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
        const newOrder = arrayMove(colCards, oldIndex, newIndex);
        onCardReorder?.(activeColId, newOrder.map(c => c.id));
      }
    } else {
      // Move to different column
      const overCards = cards[overColId];
      const newIndex = overCards.findIndex(c => c.id === over.id);
      onCardMove?.(active.id, activeColId, overColId, newIndex >= 0 ? newIndex : overCards.length);
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="kanban-board">
        {columns.map(col => (
          <KanbanColumn
            key={col.id}
            id={col.id}
            title={col.title}
            color={col.color}
            cards={cards[col.id] || []}
            totalLabel={col.totalLabel}
            onCardClick={onCardClick}
          />
        ))}
      </div>

      <DragOverlay>
        {activeCard ? (
          <KanbanCard {...activeCard} draggable={false} />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
