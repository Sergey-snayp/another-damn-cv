import {
  DndContext, DragOverlay, MouseSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core';
import { useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ALL_STATUSES, STATUS_LABELS, jobName, type JobStatus, type JobSummary } from '../jobsApi';

/**
 * Jobs as a board: one column per status. Drag a card to another column to
 * move it, or use the card's "Move to" menu (keyboard and touch). Clicking a
 * card opens the job.
 */
export function Board({ rows, columns, onMove }: {
  rows: JobSummary[];
  columns: JobStatus[];
  onMove: (row: JobSummary, to: JobStatus) => void;
}) {
  const [dragging, setDragging] = useState<JobSummary | null>(null);
  // Some browsers fire a click when a drag ends; it must not open the card.
  const droppedAt = useRef(0);

  const sensors = useSensors(
    // A few pixels of movement first, so a plain click still opens the card,
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    // and press-and-hold on touch screens, so a swipe still scrolls.
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
  );

  const start = ({ active }: DragStartEvent) => setDragging(rows.find((row) => row.id === active.id) ?? null);
  const end = ({ active, over }: DragEndEvent) => {
    droppedAt.current = Date.now();
    setDragging(null);
    const row = rows.find((r) => r.id === active.id);
    const to = over?.id as JobStatus | undefined;
    if (row && to && to !== row.status) onMove(row, to);
  };

  const label = (id: unknown) => STATUS_LABELS[id as JobStatus] ?? String(id);
  const nameOf = (id: unknown) => {
    const row = rows.find((r) => r.id === id);
    return row ? jobName(row) : 'job';
  };

  return (
    <DndContext
      sensors={sensors}
      onDragStart={start}
      onDragEnd={end}
      onDragCancel={() => setDragging(null)}
      accessibility={{
        announcements: {
          onDragStart: ({ active }) => `Picked up ${nameOf(active.id)}.`,
          onDragOver: ({ over }) => (over ? `Over ${label(over.id)}.` : 'Not over a column.'),
          onDragEnd: ({ over }) => (over ? `Dropped on ${label(over.id)}.` : 'Dropped back where it was.'),
          onDragCancel: () => 'Move cancelled.',
        },
      }}
    >
      <div className="board">
        {columns.map((status) => {
          const cards = rows.filter((row) => row.status === status);
          return (
            <Column key={status} status={status} count={cards.length}>
              {cards.map((row) => (
                <Card
                  key={row.id}
                  row={row}
                  dimmed={dragging?.id === row.id}
                  justDropped={() => Date.now() - droppedAt.current < 300}
                  onMove={(to) => onMove(row, to)}
                />
              ))}
            </Column>
          );
        })}
      </div>
      <DragOverlay dropAnimation={null}>
        {dragging && <CardFace row={dragging} lifted />}
      </DragOverlay>
    </DndContext>
  );
}

function Column({ status, count, children }: { status: JobStatus; count: number; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <section ref={setNodeRef} className={`board-col${isOver ? ' over' : ''}`} aria-labelledby={`col-${status}`}>
      <h2 id={`col-${status}`}>
        <span className={`dot ${status}`} />
        <span className="board-col-name">{STATUS_LABELS[status]}</span>
        <span className="muted">{count}</span>
      </h2>
      {count > 0 ? <ul>{children}</ul> : <p className="board-empty">Nothing here</p>}
    </section>
  );
}

function Card({ row, dimmed, justDropped, onMove }: {
  row: JobSummary;
  dimmed: boolean;
  justDropped: () => boolean;
  onMove: (to: JobStatus) => void;
}) {
  const { setNodeRef, listeners, attributes } = useDraggable({ id: row.id });
  // The menu is the keyboard way to move; dnd-kit's own keyboard role would
  // make Enter pick the card up instead of opening it.
  const { role: _role, tabIndex: _tab, ...dragAttributes } = attributes;

  return (
    <li ref={setNodeRef} {...listeners} {...dragAttributes} className={`board-card-wrap${dimmed ? ' dimmed' : ''}`}>
      <CardFace row={row} onOpen={(e) => { if (justDropped()) e.preventDefault(); }} />
      <select
        className="board-move"
        aria-label={`Move ${jobName(row)} to`}
        value=""
        // The card's drag starts on mouse and touch down; the menu must not.
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        onChange={(e) => { if (e.target.value) onMove(e.target.value as JobStatus); }}
      >
        <option value="" disabled>Move…</option>
        {ALL_STATUSES.filter((s) => s !== row.status).map((s) => (
          <option key={s} value={s}>{STATUS_LABELS[s]}</option>
        ))}
      </select>
    </li>
  );
}

/** What a card shows; also the copy that follows the pointer while dragging. */
function CardFace({ row, lifted = false, onOpen }: {
  row: JobSummary;
  lifted?: boolean;
  onOpen?: (event: React.MouseEvent) => void;
}) {
  const place = [row.location, row.remote ? 'Remote' : null].filter(Boolean).join(' · ');
  return (
    <div className={`board-card${lifted ? ' lifted' : ''}`}>
      <p className="board-company">{row.company || 'Company not read yet'}</p>
      {/* The link covers the card, so clicking anywhere on it opens the job. */}
      <Link to={`/jobs/${row.id}`} className="board-title" title={jobName(row)} draggable={false} onClick={onOpen}>
        {jobName(row)}
      </Link>
      {place && <p className="board-place" title={place}>{place}</p>}
      <p className="board-foot">
        <span>
          {row.extraction === 'pending' && <span className="badge interviewing">reading…</span>}
          {row.extraction === 'failed' && <span className="badge rejected">check details</span>}
          {row.tailoredResumeId && <span className="badge offer">tailored</span>}
        </span>
        <span>{new Date(row.updatedAt).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}</span>
      </p>
    </div>
  );
}
