/**
 * PromoCanvasEditor — Konva-based interactive editor for promo slide visuals.
 *
 * Each promo "slot" (left/right bag, carton, ribbon) is a draggable +
 * resizable Konva image. The user manipulates them visually; the parent
 * receives back a `PromoLayout` object whose keys are the slot names and
 * values are positions in INCHES (matching the python-pptx coordinate
 * system used by `generator.py` and `preview.py`).
 *
 * Slot visibility is driven by `enabled` (the four boolean flags from the
 * existing carton/ribbon checkboxes). Slot images are driven by
 * `cartonSrc` / `ribbonSrc` / `packshotSrc`. Position is taken from
 * `layout[slot]` if the user has moved it; otherwise from `PROMO_DEFAULTS`.
 */
import { useEffect, useRef, useState } from 'react';
import { Stage, Layer, Image as KonvaImage, Rect, Transformer } from 'react-konva';
import type Konva from 'konva';
import {
  type PromoLayout, type PromoSlot, type PromoSlotPos,
  PROMO_DEFAULTS, SLIDE_W_IN, SLIDE_H_IN,
} from './types';

export interface PromoCanvasEditorProps {
  /** Pixel width of the canvas. Height is computed to keep 13.333:7.5 */
  width?: number;
  /** Per-slot position overrides — comes from the parent's stored layout */
  layout: PromoLayout;
  /** Visibility flags from the existing checkboxes */
  enabled: {
    leftCarton: boolean;
    rightCarton: boolean;
    leftRibbon: boolean;
    rightRibbon: boolean;
  };
  /** Filenames passed straight to `resolveImageUrl` to build <img src> */
  packshotSrc: string;
  cartonSrc: string;
  ribbonSrc: string;
  resolveImageUrl: (filename: string) => string;
  /** Called whenever any slot is dragged or resized */
  onChange: (next: PromoLayout) => void;
}

export function PromoCanvasEditor({
  width = 880, layout, enabled,
  packshotSrc, cartonSrc, ribbonSrc,
  resolveImageUrl, onChange,
}: PromoCanvasEditorProps) {
  const height = width * (SLIDE_H_IN / SLIDE_W_IN);
  const inToPx = (i: number) => (i / SLIDE_W_IN) * width;
  const pxToIn = (p: number) => (p / width) * SLIDE_W_IN;

  const [selected, setSelected] = useState<PromoSlot | null>(null);

  /** Update one slot in the layout and bubble up. */
  function updateSlot(slot: PromoSlot, partial: Partial<PromoSlotPos>) {
    const current = layout[slot] ?? defaultsFor(slot, enabled);
    onChange({
      ...layout,
      [slot]: { ...current, ...partial },
    });
  }

  /** Click on empty stage area → deselect */
  function handleStageClick(e: Konva.KonvaEventObject<MouseEvent>) {
    if (e.target === e.target.getStage()) setSelected(null);
  }

  return (
    <div style={{
      border: '1px solid #e4e4e7', borderRadius: 12, overflow: 'hidden',
      background: '#fafafa', display: 'inline-block',
      boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
    }}>
      <Stage width={width} height={height} onMouseDown={handleStageClick} onTouchStart={handleStageClick}>
        <Layer>
          {/* Subtle background grid so the user has visual reference */}
          <Rect x={0} y={0} width={width} height={height} fill="#ffffff" />

          {/* Order matters — back to front */}
          {enabled.leftCarton && (
            <Slot
              slot="left_carton" src={cartonSrc}
              layout={layout} enabled={enabled}
              inToPx={inToPx} pxToIn={pxToIn}
              resolveImageUrl={resolveImageUrl}
              isSelected={selected === 'left_carton'}
              onSelect={() => setSelected('left_carton')}
              onCommit={(p) => updateSlot('left_carton', p)}
            />
          )}
          {enabled.rightCarton && (
            <Slot
              slot="right_carton" src={cartonSrc}
              layout={layout} enabled={enabled}
              inToPx={inToPx} pxToIn={pxToIn}
              resolveImageUrl={resolveImageUrl}
              isSelected={selected === 'right_carton'}
              onSelect={() => setSelected('right_carton')}
              onCommit={(p) => updateSlot('right_carton', p)}
            />
          )}
          <Slot
            slot="left_bag" src={packshotSrc}
            layout={layout} enabled={enabled}
            inToPx={inToPx} pxToIn={pxToIn}
            resolveImageUrl={resolveImageUrl}
            isSelected={selected === 'left_bag'}
            onSelect={() => setSelected('left_bag')}
            onCommit={(p) => updateSlot('left_bag', p)}
          />
          <Slot
            slot="right_bag" src={packshotSrc}
            layout={layout} enabled={enabled}
            inToPx={inToPx} pxToIn={pxToIn}
            resolveImageUrl={resolveImageUrl}
            isSelected={selected === 'right_bag'}
            onSelect={() => setSelected('right_bag')}
            onCommit={(p) => updateSlot('right_bag', p)}
          />
          {enabled.leftRibbon && (
            <Slot
              slot="left_ribbon" src={ribbonSrc}
              layout={layout} enabled={enabled}
              inToPx={inToPx} pxToIn={pxToIn}
              resolveImageUrl={resolveImageUrl}
              isSelected={selected === 'left_ribbon'}
              onSelect={() => setSelected('left_ribbon')}
              onCommit={(p) => updateSlot('left_ribbon', p)}
            />
          )}
          {enabled.rightRibbon && (
            <Slot
              slot="right_ribbon" src={ribbonSrc}
              layout={layout} enabled={enabled}
              inToPx={inToPx} pxToIn={pxToIn}
              resolveImageUrl={resolveImageUrl}
              isSelected={selected === 'right_ribbon'}
              onSelect={() => setSelected('right_ribbon')}
              onCommit={(p) => updateSlot('right_ribbon', p)}
            />
          )}
        </Layer>
      </Stage>
    </div>
  );
}

/* ─── Slot — one draggable, resizable element ──────────────────────── */

function Slot({
  slot, src, layout, enabled,
  inToPx, pxToIn, resolveImageUrl,
  isSelected, onSelect, onCommit,
}: {
  slot: PromoSlot;
  src: string;
  layout: PromoLayout;
  enabled: PromoCanvasEditorProps['enabled'];
  inToPx: (i: number) => number;
  pxToIn: (p: number) => number;
  resolveImageUrl: (filename: string) => string;
  isSelected: boolean;
  onSelect: () => void;
  onCommit: (partial: Partial<PromoSlotPos>) => void;
}) {
  const shapeRef = useRef<Konva.Image>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const image = useImage(src ? resolveImageUrl(src) : '');

  // Position (overridden by user) or template default
  const pos = layout[slot] ?? defaultsFor(slot, enabled);

  // Attach transformer to the selected node
  useEffect(() => {
    if (isSelected && shapeRef.current && trRef.current) {
      trRef.current.nodes([shapeRef.current]);
      trRef.current.getLayer()?.batchDraw();
    }
  }, [isSelected]);

  if (!image) return null;

  return (
    <>
      <KonvaImage
        ref={shapeRef}
        image={image}
        x={inToPx(pos.x)} y={inToPx(pos.y)}
        width={inToPx(pos.w)} height={inToPx(pos.h)}
        draggable
        onClick={onSelect}
        onTap={onSelect}
        onDragEnd={(e) => {
          onCommit({
            x: pxToIn(e.target.x()),
            y: pxToIn(e.target.y()),
          });
        }}
        onTransformEnd={() => {
          // Konva applies scale; we bake it into width/height and reset.
          const node = shapeRef.current!;
          const sx = node.scaleX();
          const sy = node.scaleY();
          node.scaleX(1);
          node.scaleY(1);
          onCommit({
            x: pxToIn(node.x()),
            y: pxToIn(node.y()),
            w: Math.max(0.4, pxToIn(node.width() * sx)),
            h: Math.max(0.4, pxToIn(node.height() * sy)),
          });
        }}
      />
      {isSelected && (
        <Transformer
          ref={trRef}
          rotateEnabled={false}
          // Keep handles inside the canvas; clamp tiny sizes
          boundBoxFunc={(_oldBox, newBox) => {
            if (newBox.width < 30 || newBox.height < 30) return _oldBox;
            return newBox;
          }}
        />
      )}
    </>
  );
}

/* ─── Helpers ──────────────────────────────────────────────────────── */

/** Returns the right default for a slot, taking carton-presence into account
 * (bags use a smaller "in-box" position when their carton is enabled). */
function defaultsFor(
  slot: PromoSlot, enabled: PromoCanvasEditorProps['enabled'],
): PromoSlotPos {
  if (slot === 'left_bag')  return enabled.leftCarton  ? PROMO_DEFAULTS.left_bag_inbox  : PROMO_DEFAULTS.left_bag;
  if (slot === 'right_bag') return enabled.rightCarton ? PROMO_DEFAULTS.right_bag_inbox : PROMO_DEFAULTS.right_bag;
  return PROMO_DEFAULTS[slot];
}

/** Tiny `useImage` hook — Konva's `<Image>` wants an HTMLImageElement, not
 * a URL. We load it ourselves and update state on `onload`. */
function useImage(url: string): HTMLImageElement | null {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!url) { setImg(null); return; }
    const el = new window.Image();
    el.crossOrigin = 'anonymous';
    el.onload = () => setImg(el);
    el.onerror = () => setImg(null);
    el.src = url;
    return () => { el.onload = null; el.onerror = null; };
  }, [url]);
  return img;
}
