/** A position + size in INCHES — slide is 13.333" × 7.5". */
export interface PromoSlotPos {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Per-slot position overrides. Only slots the user has touched land here;
 * everything else falls back to the template defaults at render time. The
 * booleans on `Product` (promo_carton_left/right, promo_ribbon_left/right)
 * still control VISIBILITY — this object only controls placement. */
export interface PromoLayout {
  left_carton?:  PromoSlotPos;
  right_carton?: PromoSlotPos;
  left_bag?:     PromoSlotPos;
  right_bag?:    PromoSlotPos;
  left_ribbon?:  PromoSlotPos;
  right_ribbon?: PromoSlotPos;
}

export type PromoSlot = keyof PromoLayout;

export const SLIDE_W_IN = 13.333;
export const SLIDE_H_IN = 7.5;

/** Default positions — must mirror the constants in
 * `src/plan_commercial/preview.py` and `generator.py`. The template falls
 * back to these when the user hasn't moved a slot yet. */
export const PROMO_DEFAULTS = {
  left_carton:        { x: 1.20, y: 3.95, w: 2.80, h: 3.50 },
  right_carton:       { x: 8.80, y: 3.95, w: 2.80, h: 3.50 },
  left_bag:           { x: 1.20, y: 3.95, w: 2.80, h: 3.50 }, // when no carton
  right_bag:          { x: 8.80, y: 3.95, w: 2.80, h: 3.50 },
  left_bag_inbox:     { x: 1.50, y: 3.85, w: 2.20, h: 3.30 }, // bag in front of carton
  right_bag_inbox:    { x: 9.10, y: 3.85, w: 2.20, h: 3.30 },
  left_ribbon:        { x: 2.80, y: 3.85, w: 1.60, h: 1.40 },
  right_ribbon:       { x: 10.40, y: 3.85, w: 1.60, h: 1.40 },
} as const satisfies Record<string, PromoSlotPos>;
