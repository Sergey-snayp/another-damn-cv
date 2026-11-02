import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { useRef, useState, type ReactNode } from 'react';
import {
  STATUS_LABELS,
  jobName,
  type JobStatus,
  type JobSummary,
} from '../jobsApi';
import { ApplicationCard, type ApplicationActions } from './ApplicationCard';
import { DashboardIcon } from './DashboardIcon';

export function Board({
  rows,
  columns,
  actions,
  onHide,
  loading,
}: {
  rows: JobSummary[];
  columns: JobStatus[];
  actions: ApplicationActions;
  onHide(status: JobStatus): void;
  loading: boolean;
}) {
  const [dragging, setDragging] = useState<JobSummary | null>(null);
  const droppedAt = useRef(0);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 8 },
    }),
  );
  function start({ active }: DragStartEvent) {
    setDragging(rows.find((row) => row.id === active.id) ?? null);
  }
  function end({ active, over }: DragEndEvent) {
    droppedAt.current = Date.now();
    setDragging(null);
    const row = rows.find((job) => job.id === active.id);
    const status = over?.id as JobStatus | undefined;
    if (
      row &&
      status &&
      columns.includes(status) &&
      status !== row.status &&
      !actions.busyIds.has(row.id)
    )
      actions.onMove(row, status);
  }
  return (
    <DndContext
      sensors={sensors}
      onDragStart={start}
      onDragEnd={end}
      onDragCancel={() => setDragging(null)}
      accessibility={{
        announcements: {
          onDragStart: ({ active }) =>
            `Picked up ${jobName(rows.find((row) => row.id === active.id) ?? { title: null, pageTitle: null })}.`,
          onDragOver: ({ over }) =>
            over
              ? `Over ${STATUS_LABELS[over.id as JobStatus]}.`
              : 'Not over a column.',
          onDragEnd: ({ over }) =>
            over
              ? `Moved to ${STATUS_LABELS[over.id as JobStatus]}.`
              : 'Move cancelled.',
          onDragCancel: () => 'Move cancelled.',
        },
      }}
    >
      <div className="application-board" aria-label="Applications board">
        {columns.map((status) => {
          const cards = rows.filter((row) => row.status === status);
          return (
            <Column
              key={status}
              status={status}
              count={cards.length}
              onHide={() => onHide(status)}
              canHide={columns.length > 1}
              loading={loading}
            >
              {cards.map((row) => (
                <Card
                  key={row.id}
                  row={row}
                  actions={actions}
                  dimmed={dragging?.id === row.id}
                  justDropped={() => Date.now() - droppedAt.current < 300}
                />
              ))}
            </Column>
          );
        })}
      </div>
      <DragOverlay dropAnimation={null}>
        {dragging && (
          <div aria-hidden="true">
            <ApplicationCard row={dragging} lifted />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
function Column({
  status,
  count,
  children,
  onHide,
  canHide,
  loading,
}: {
  status: JobStatus;
  count: number;
  children: ReactNode;
  onHide(): void;
  canHide: boolean;
  loading: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <section
      className={`application-column${isOver ? ' is-over' : ''}`}
      ref={setNodeRef}
      aria-labelledby={`application-column-${status}`}
    >
      <header className="application-column-heading">
        <DashboardIcon name={status} size={18} />
        <h2 id={`application-column-${status}`}>{STATUS_LABELS[status]}</h2>
        <span>{loading ? '—' : count}</span>
        <button
          type="button"
          className="dashboard-icon-button"
          aria-label={`Hide ${STATUS_LABELS[status]} column`}
          disabled={!canHide}
          onClick={onHide}
        >
          <DashboardIcon name="eyeOff" size={19} />
        </button>
      </header>
      {loading ? (
        <div
          className="application-board-loading"
          aria-label="Loading applications"
        >
          <span />
          <span />
          <span />
        </div>
      ) : count ? (
        <ul className="application-column-cards">{children}</ul>
      ) : (
        <div className="application-column-empty">
          <strong>No applications</strong>
          <span>
            Move applications into {STATUS_LABELS[status].toLowerCase()}.
          </span>
        </div>
      )}
    </section>
  );
}
function Card({
  row,
  actions,
  dimmed,
  justDropped,
}: {
  row: JobSummary;
  actions: ApplicationActions;
  dimmed: boolean;
  justDropped(): boolean;
}) {
  const { setNodeRef, listeners, attributes } = useDraggable({
    id: row.id,
    disabled: actions.managing || actions.busyIds.has(row.id),
  });
  const {
    role: _role,
    tabIndex: _tab,
    'aria-disabled': _disabled,
    ...dragAttributes
  } = attributes;
  return (
    <li
      className={`application-card-wrap${dimmed ? ' is-dragging' : ''}`}
      ref={setNodeRef}
      {...listeners}
      {...dragAttributes}
    >
      <ApplicationCard
        row={row}
        actions={actions}
        onOpen={(event) => {
          if (justDropped()) event.preventDefault();
        }}
      />
    </li>
  );
}
