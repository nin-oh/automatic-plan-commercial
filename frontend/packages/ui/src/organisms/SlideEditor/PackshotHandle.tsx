import { useEffect, useRef, useState, type MouseEvent, type PointerEvent } from 'react';

export interface PackshotRect {
  left: number; top: number; width: number; height: number;
  slide_width: number; slide_height: number;
}

export interface PackshotHandleProps {
  /** Effective rect in inches + slide dimensions in inches */
  rect: PackshotRect;
  /** Container's pixel size — needed because the overlay is positioned in
   * pixels but the model is in inches. */
  containerWidth: number;
  containerHeight: number;
  /** Brand accent color for the box border + handles */
  accent: string;
  /** Called continuously as user drags (for live preview if you want one) */
  onDrag?: (rect: PackshotRect) => void;
  /** Called once on mouse-up with the final rect */
  onCommit: (rect: PackshotRect) => void;
}

type DragMode =
  | { kind: 'move'; offX: number; offY: number }
  | { kind: 'resize'; corner: Corner; startRect: PackshotRect; startX: number; startY: number };

type Corner = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

const HANDLES: { c: Corner; cursor: string; pos: (l: number, t: number, w: number, h: number) => [number, number] }[] = [
  { c: 'nw', cursor: 'nwse-resize', pos: (l, t)         => [l, t] },
  { c: 'n',  cursor: 'ns-resize',   pos: (l, t, w)      => [l + w / 2, t] },
  { c: 'ne', cursor: 'nesw-resize', pos: (l, t, w)      => [l + w, t] },
  { c: 'e',  cursor: 'ew-resize',   pos: (l, t, w, h)   => [l + w, t + h / 2] },
  { c: 'se', cursor: 'nwse-resize', pos: (l, t, w, h)   => [l + w, t + h] },
  { c: 's',  cursor: 'ns-resize',   pos: (l, t, w, h)   => [l + w / 2, t + h] },
  { c: 'sw', cursor: 'nesw-resize', pos: (l, t, _w, h)  => [l, t + h] },
  { c: 'w',  cursor: 'ew-resize',   pos: (l, t, _w, h)  => [l, t + h / 2] },
];

const MIN_INCHES = 0.5;

/** Draggable + resizable rectangle overlaying the slide preview. The model is
 * in inches; we map to pixels using containerWidth/containerHeight. Mirrors
 * PowerPoint UX: drag the body to move, drag a corner/edge to resize. */
export function PackshotHandle({
  rect, containerWidth, containerHeight, accent, onDrag, onCommit,
}: PackshotHandleProps) {
  const [drag, setDrag] = useState<DragMode | null>(null);
  // local copy so the move/resize feels instant — we don't wait for parent
  // to round-trip the patch
  const [local, setLocal] = useState<PackshotRect>(rect);
  const liveRef = useRef<PackshotRect>(rect);

  // Sync external rect changes when not dragging
  useEffect(() => {
    if (!drag) {
      setLocal(rect);
      liveRef.current = rect;
    }
  }, [rect, drag]);

  const inToPx = (inches: number, axis: 'x' | 'y') =>
    axis === 'x'
      ? (inches / rect.slide_width) * containerWidth
      : (inches / rect.slide_height) * containerHeight;
  const pxToIn = (px: number, axis: 'x' | 'y') =>
    axis === 'x'
      ? (px / containerWidth) * rect.slide_width
      : (px / containerHeight) * rect.slide_height;

  const r = local;
  const boxLeft = inToPx(r.left, 'x');
  const boxTop = inToPx(r.top, 'y');
  const boxW = inToPx(r.width, 'x');
  const boxH = inToPx(r.height, 'y');

  // Helpers for clamping
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

  function startMove(e: PointerEvent<HTMLDivElement>) {
    e.stopPropagation();
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({
      kind: 'move',
      offX: e.clientX - boxLeft,
      offY: e.clientY - boxTop,
    });
  }

  function startResize(corner: Corner) {
    return (e: PointerEvent<HTMLDivElement>) => {
      e.stopPropagation();
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      setDrag({
        kind: 'resize',
        corner,
        startRect: { ...liveRef.current },
        startX: e.clientX,
        startY: e.clientY,
      });
    };
  }

  function onMove(e: PointerEvent<HTMLDivElement>) {
    if (!drag) return;
    e.preventDefault();
    const containerEl = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const px = e.clientX - containerEl.left;
    const py = e.clientY - containerEl.top;

    if (drag.kind === 'move') {
      const newLeftPx = clamp(e.clientX - drag.offX - containerEl.left, 0, containerWidth - boxW);
      const newTopPx  = clamp(e.clientY - drag.offY - containerEl.top, 0, containerHeight - boxH);
      const next = {
        ...liveRef.current,
        left: round2(pxToIn(newLeftPx, 'x')),
        top: round2(pxToIn(newTopPx, 'y')),
      };
      liveRef.current = next;
      setLocal(next);
      onDrag?.(next);
      return;
    }

    // resize
    const start = drag.startRect;
    let newLeft = start.left, newTop = start.top, newW = start.width, newH = start.height;
    const xIn = clamp(pxToIn(px, 'x'), 0, start.slide_width);
    const yIn = clamp(pxToIn(py, 'y'), 0, start.slide_height);

    const right = start.left + start.width;
    const bottom = start.top + start.height;

    switch (drag.corner) {
      case 'nw':
        newLeft = clamp(xIn, 0, right - MIN_INCHES);
        newTop  = clamp(yIn, 0, bottom - MIN_INCHES);
        newW = right - newLeft;
        newH = bottom - newTop;
        break;
      case 'n':
        newTop = clamp(yIn, 0, bottom - MIN_INCHES);
        newH = bottom - newTop;
        break;
      case 'ne':
        newTop = clamp(yIn, 0, bottom - MIN_INCHES);
        newH = bottom - newTop;
        newW = clamp(xIn - start.left, MIN_INCHES, start.slide_width - start.left);
        break;
      case 'e':
        newW = clamp(xIn - start.left, MIN_INCHES, start.slide_width - start.left);
        break;
      case 'se':
        newW = clamp(xIn - start.left, MIN_INCHES, start.slide_width - start.left);
        newH = clamp(yIn - start.top, MIN_INCHES, start.slide_height - start.top);
        break;
      case 's':
        newH = clamp(yIn - start.top, MIN_INCHES, start.slide_height - start.top);
        break;
      case 'sw':
        newLeft = clamp(xIn, 0, right - MIN_INCHES);
        newW = right - newLeft;
        newH = clamp(yIn - start.top, MIN_INCHES, start.slide_height - start.top);
        break;
      case 'w':
        newLeft = clamp(xIn, 0, right - MIN_INCHES);
        newW = right - newLeft;
        break;
    }
    const next = {
      ...start,
      left: round2(newLeft), top: round2(newTop),
      width: round2(newW), height: round2(newH),
    };
    liveRef.current = next;
    setLocal(next);
    onDrag?.(next);
  }

  function onUp(e: PointerEvent<HTMLDivElement>) {
    if (!drag) return;
    e.preventDefault();
    setDrag(null);
    onCommit(liveRef.current);
  }

  const showLabel = !!drag;

  return (
    <div
      // The capture surface — covers the whole preview container so we receive
      // pointermove even when the cursor leaves the box during a fast drag.
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      style={{
        position: 'absolute', inset: 0, pointerEvents: drag ? 'auto' : 'none',
      }}
    >
      <div
        onPointerDown={startMove}
        style={{
          position: 'absolute',
          left: boxLeft, top: boxTop, width: boxW, height: boxH,
          border: `2px dashed ${accent}`,
          background: drag ? `${accent}1f` : 'transparent',
          cursor: drag?.kind === 'move' ? 'grabbing' : 'grab',
          pointerEvents: 'auto',
          transition: drag ? 'none' : 'background 120ms',
          boxShadow: drag ? `0 0 0 4px ${accent}1a` : 'none',
        }}
      >
        {/* corner/edge handles */}
        {HANDLES.map((h) => {
          const [hx, hy] = h.pos(0, 0, boxW, boxH);
          return (
            <div
              key={h.c}
              onPointerDown={startResize(h.c)}
              style={{
                position: 'absolute',
                left: hx - 6, top: hy - 6,
                width: 12, height: 12,
                background: '#fff',
                border: `2px solid ${accent}`,
                borderRadius: 3,
                cursor: h.cursor,
                pointerEvents: 'auto',
                boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
              }}
            />
          );
        })}
      </div>

      {showLabel && (
        <div style={{
          position: 'absolute',
          left: boxLeft, top: Math.max(0, boxTop - 24),
          padding: '3px 8px',
          background: '#18181b', color: '#fff',
          fontSize: 11, fontFamily: '"JetBrains Mono", monospace',
          borderRadius: 5, whiteSpace: 'nowrap',
          pointerEvents: 'none',
          boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
        }}>
          {r.width.toFixed(2)}″ × {r.height.toFixed(2)}″ @ ({r.left.toFixed(2)}, {r.top.toFixed(2)})
        </div>
      )}
    </div>
  );
}

const round2 = (n: number) => Math.round(n * 100) / 100;
