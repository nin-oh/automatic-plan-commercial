/**
 * Catalogue — editorial flipbook viewer for the plan commercial.
 *
 * Visual system modelled on the modern interior-catalog reference
 * (Adobe-Stock style): white pages, ultra-bold grotesque display type
 * (Archivo Black), terracotta / mustard / teal color blocks, ARCH
 * shapes (border-radius 999px 999px 0 0), circles and half-rounds that
 * bleed off page edges, round price tags, generous whitespace.
 *
 * Rules baked in:
 *  - ONLY products with a resolvable packshot image appear. Rows whose
 *    `packshot_file_url` is null are dropped before spreads are built.
 *  - The book is sized against BOTH viewport axes (width AND height)
 *    so the spread always fits on screen without scrolling — a CSS
 *    min() between the container width and (viewport height × √2).
 *  - Page geometry is true A4 portrait per page (spread aspect ≈ 1.414).
 *  - Flip: drag-the-corner (pointer-driven rotation via motion values)
 *    plus button/keyboard flips. The static page "tilt" of the previous
 *    version was removed — it skewed content — and the flip itself was
 *    shortened + given a directional shade so it reads as paper, not
 *    as a slow CSS demo.
 */
import {
  useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import {
  AnimatePresence, motion, useMotionValue, useTransform, animate,
} from 'framer-motion';
import type { Variants } from 'framer-motion';
import {
  BookOpen, ChevronLeft, ChevronRight, Maximize2, Minimize2, List, X,
} from 'lucide-react';
import { PageShell } from './PageShell';
import * as api from '../api';

// ─── DESIGN TOKENS ──────────────────────────────────────────────────────
const TOKENS = {
  page:       '#FFFFFF',
  panel:      '#F5F1EA',          // warm off-white panels
  ink:        '#181818',
  inkSoft:    '#4C4A45',
  mute:       '#8E887C',
  rule:       '#E2DCD0',

  terra:      '#D9512C',          // terracotta — primary accent
  terraDeep:  '#A93D20',
  terraSoft:  '#F4DDD2',

  mustard:    '#E9A13B',
  mustardSoft:'#F8E8C9',

  teal:       '#23605B',
  tealSoft:   '#D8E5E1',

  charcoal:   '#262626',

  fontDisplay: `"Archivo Black", "Inter", "Arial Black", "Segoe UI", sans-serif`,
  fontSans:    `"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, sans-serif`,
  fontMono:    `"JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace`,

  padTop: 52, padSide: 42, padBottom: 48,
} as const;

// Per-brand hue rotation — terracotta, mustard, teal — exactly the three
// accents the reference template cycles between.
const HUES = [
  { block: TOKENS.terra,   soft: TOKENS.terraSoft,   deep: TOKENS.terraDeep, text: '#FFFFFF' },
  { block: TOKENS.mustard, soft: TOKENS.mustardSoft, deep: '#B5731B',        text: '#231A0C' },
  { block: TOKENS.teal,    soft: TOKENS.tealSoft,    deep: '#16413E',        text: '#FFFFFF' },
] as const;
type Hue = typeof HUES[number];
const hueAt = (i: number): Hue => HUES[((i % HUES.length) + HUES.length) % HUES.length];

// Spread aspect — two A4-portrait pages side by side (√2 : 1).
const BOOK_ASPECT = 1.414;

// Subtle paper grain (multiply) — alpha 0.04, invisible at 2× DPR but
// keeps large white areas from feeling like a slide deck.
const PAPER_NOISE =
  `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.04  0 0 0 0 0.03  0 0 0 0 0.02  0 0 0 0.04 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>")`;

// ─── TYPES ──────────────────────────────────────────────────────────────
type Direction = 'next' | 'prev';

interface CoverSpread {
  kind: 'cover';
  title: string; canal: string; mois: string;
  coverUrl: string;
  totalProducts: number;
  totalBrands: number;
}
interface WelcomeSpread {
  kind: 'welcome';
  title: string; canal: string; mois: string;
  // ALL brands (for the sommaire list on the left page)…
  allBrands: { name: string; count: number }[];
  // …and up to 4 with a packshot teaser for the right-page grid.
  teasers: { name: string; previewUrl: string | null; count: number }[];
  pageNumber: number;
}
interface BrandIntroSpread {
  kind: 'brand-intro';
  brand: string;
  channel: string;
  count: number;
  heroImageUrl: string | null;
  logoUrl: string | null;
  hue: number;
  pageNumber: number;
}
interface ProductSpread {
  kind: 'product';
  slide: api.CatalogueSlide;
  hue: number;
  pageNumber: number;
}
interface GridSpread {
  kind: 'grid';
  brand: string;
  slides: api.CatalogueSlide[];   // up to 8 (4 per page)
  hue: number;
  pageNumber: number;
}
interface BackSpread {
  kind: 'back';
  title: string; canal: string; mois: string;
  totalProducts: number;
}
type Spread =
  | CoverSpread | WelcomeSpread | BrandIntroSpread
  | ProductSpread | GridSpread | BackSpread;

const FLIP_MS = 650;

type Bezier = [number, number, number, number];
const EASE: Bezier = [0.16, 1, 0.3, 1];
const EASE_FLIP: Bezier = [0.45, 0.05, 0.2, 1];

// ─── MAIN COMPONENT ─────────────────────────────────────────────────────
export function PlanCommercialCataloguePage() {
  const [manifest, setManifest] = useState<api.CatalogueManifest | null>(null);
  const [spreadIdx, setSpreadIdx] = useState(0);
  const [direction, setDirection] = useState<Direction>('next');
  const [flipping, setFlipping] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [tocOpen, setTocOpen] = useState(false);
  const [dragging, setDragging] = useState(false);

  const dragX = useMotionValue(0);
  const pageWidthRef = useRef(1);
  const bookRef = useRef<HTMLDivElement>(null);
  const dragState = useRef({ x: 0, t: 0, dragged: false, active: false, pid: -1, dir: 'next' as Direction });
  const animatingButton = useRef(false);

  // Cursor-tracking page-corner curl (0 = flat, 1 = lifted)
  const cornerNextLift = useMotionValue(0);
  const cornerPrevLift = useMotionValue(0);
  const cornerNextSize = useTransform(cornerNextLift, [0, 1], [44, 104]);
  const cornerPrevSize = useTransform(cornerPrevLift, [0, 1], [44, 104]);
  const cornerNextRotate = useTransform(cornerNextLift, [0, 1], [0, -30]);
  const cornerPrevRotate = useTransform(cornerPrevLift, [0, 1], [0, 30]);
  const [showHint, setShowHint] = useState(() => {
    try {
      return typeof window !== 'undefined' && !sessionStorage.getItem('pc-catalogue-hint-seen');
    } catch { return true; }
  });

  const dragRotateY = useTransform(dragX, (dx) => {
    const W = pageWidthRef.current || 1;
    const dir = dragState.current.dir;
    if (dir === 'next') {
      const p = Math.min(Math.max(-dx / W, 0), 1);
      const eased = p * p * (3 - 2 * p);            // smoothstep — paper resists then commits
      return eased * -180;
    }
    const p = Math.min(Math.max(dx / W, 0), 1);
    const eased = p * p * (3 - 2 * p);
    return eased * 180;
  });

  useEffect(() => {
    let cancelled = false;
    api.getCatalogueManifest().then((m) => { if (!cancelled) setManifest(m); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!bookRef.current) return;
    const measure = () => {
      const el = bookRef.current; if (!el) return;
      pageWidthRef.current = el.getBoundingClientRect().width / 2 || 1;
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(bookRef.current);
    return () => ro.disconnect();
  }, [fullscreen, manifest]);

  // ─── Build spreads — IMAGE-ONLY products ─────────────────────────────
  // cover → sommaire → [brand-intro · hero(s) · grids]×brands → back.
  // Products WITHOUT a packshot image are dropped entirely.
  const spreads: Spread[] = useMemo(() => {
    if (!manifest) return [];

    const visible = manifest.slides.filter((s) => !!s.packshot_file_url);
    if (visible.length === 0) return [];

    const byBrand = new Map<string, api.CatalogueSlide[]>();
    for (const s of visible) {
      const key = (s.subgroup || s.group || 'Autres').trim() || 'Autres';
      const arr = byBrand.get(key);
      if (arr) arr.push(s);
      else byBrand.set(key, [s]);
    }
    const brandKeys = [...byBrand.keys()];

    const list: Spread[] = [{
      kind: 'cover',
      title: manifest.title, canal: manifest.canal, mois: manifest.mois,
      coverUrl: manifest.cover_url,
      totalProducts: visible.length,
      totalBrands: brandKeys.length,
    }];

    list.push({
      kind: 'welcome',
      title: manifest.title, canal: manifest.canal, mois: manifest.mois,
      allBrands: brandKeys.map((b) => ({ name: b, count: byBrand.get(b)!.length })),
      teasers: brandKeys.slice(0, 4).map((b) => {
        const arr = byBrand.get(b)!;
        return { name: b, previewUrl: arr[0]?.packshot_file_url ?? null, count: arr.length };
      }),
      pageNumber: 2,
    });

    let pageNumber = 4;
    brandKeys.forEach((brand, bi) => {
      const arr = byBrand.get(brand)!;
      list.push({
        kind: 'brand-intro',
        brand,
        channel: arr[0]?.group || '',
        count: arr.length,
        heroImageUrl: arr[0]?.packshot_file_url ?? null,
        logoUrl: arr[0]?.logo_file_url ?? null,
        hue: bi,
        pageNumber: pageNumber++,
      });

      // Featured (full spread): every promo + the brand's first product.
      const featuredIdx = new Set<number>();
      arr.forEach((s, i) => { if (s.is_promo) featuredIdx.add(i); });
      featuredIdx.add(0);
      const featured = [...featuredIdx].sort((a, b) => a - b).map((i) => arr[i]);
      const rest = arr.filter((_, i) => !featuredIdx.has(i));

      for (const s of featured) {
        list.push({ kind: 'product', slide: s, hue: bi, pageNumber: pageNumber++ });
      }
      for (let i = 0; i < rest.length; i += 8) {
        list.push({
          kind: 'grid', brand,
          slides: rest.slice(i, i + 8),
          hue: bi,
          pageNumber: pageNumber++,
        });
      }
    });

    list.push({
      kind: 'back',
      title: manifest.title, canal: manifest.canal, mois: manifest.mois,
      totalProducts: visible.length,
    });

    return list;
  }, [manifest]);

  const total = spreads.length;
  const canPrev = spreadIdx > 0 && !flipping && !dragging;
  const canNext = spreadIdx < total - 1 && !flipping && !dragging;
  const canShowPrevCorner = spreadIdx > 0 && !flipping;
  const canShowNextCorner = spreadIdx < total - 1 && !flipping;

  const onBookMouseMove = useCallback((e: React.MouseEvent) => {
    if (!bookRef.current) return;
    if (dragging || flipping) return;
    const rect = bookRef.current.getBoundingClientRect();
    const REACH = Math.min(260, rect.width * 0.3);
    if (canNext) {
      const dxN = rect.right - e.clientX;
      const dyN = rect.bottom - e.clientY;
      const dN = Math.sqrt(dxN * dxN + dyN * dyN);
      cornerNextLift.set(Math.max(0, Math.min(1, 1 - dN / REACH)));
    }
    if (canPrev) {
      const dxP = e.clientX - rect.left;
      const dyP = rect.bottom - e.clientY;
      const dP = Math.sqrt(dxP * dxP + dyP * dyP);
      cornerPrevLift.set(Math.max(0, Math.min(1, 1 - dP / REACH)));
    }
  }, [canNext, canPrev, dragging, flipping, cornerNextLift, cornerPrevLift]);

  const onBookMouseLeave = useCallback(() => {
    cornerNextLift.set(0);
    cornerPrevLift.set(0);
  }, [cornerNextLift, cornerPrevLift]);

  const flippingRef = useRef(false);
  const turn = useCallback((dir: Direction) => {
    if (flippingRef.current || dragging) return;
    flippingRef.current = true;
    animatingButton.current = true;
    setDirection(dir);
    setSpreadIdx((i) => {
      const next = dir === 'next' ? i + 1 : i - 1;
      return Math.max(0, Math.min(total - 1, next));
    });
    setFlipping(true);
    setShowHint(false);
    try { sessionStorage.setItem('pc-catalogue-hint-seen', '1'); } catch { /* ignore */ }
  }, [total, dragging]);

  useEffect(() => {
    if (!flipping) return;
    const t = window.setTimeout(() => {
      setFlipping(false);
      flippingRef.current = false;
      animatingButton.current = false;
    }, FLIP_MS);
    return () => window.clearTimeout(t);
  }, [flipping]);

  // Keyboard nav
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') {
        e.preventDefault(); if (canNext) turn('next');
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault(); if (canPrev) turn('prev');
      } else if (e.key === 'Home') {
        e.preventDefault(); setDirection('prev'); setSpreadIdx(0);
      } else if (e.key === 'End') {
        e.preventDefault(); setDirection('next'); setSpreadIdx(total - 1);
      } else if (e.key === 'Escape' && fullscreen) {
        setFullscreen(false);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [canNext, canPrev, fullscreen, total, turn]);

  // Preload neighbours
  useEffect(() => {
    if (!spreads.length) return;
    for (let off = -3; off <= 3; off++) {
      const j = spreadIdx + off;
      if (j < 0 || j >= spreads.length) continue;
      const sp = spreads[j];
      if (sp.kind === 'product') {
        for (const u of [
          sp.slide.packshot_file_url,
          sp.slide.logo_file_url,
          sp.slide.promo_gratuite_image_url,
          sp.slide.promo_remise_image_url,
        ]) {
          if (u) { const im = new Image(); im.src = u; }
        }
      } else if (sp.kind === 'grid') {
        for (const slide of sp.slides) {
          if (slide.packshot_file_url) {
            const im = new Image(); im.src = slide.packshot_file_url;
          }
        }
      } else if (sp.kind === 'brand-intro') {
        for (const u of [sp.heroImageUrl, sp.logoUrl]) {
          if (u) { const im = new Image(); im.src = u; }
        }
      } else if (sp.kind === 'welcome') {
        for (const b of sp.teasers) {
          if (b.previewUrl) { const im = new Image(); im.src = b.previewUrl; }
        }
      } else if (sp.kind === 'cover') {
        const im = new Image(); im.src = sp.coverUrl;
      }
    }
  }, [spreadIdx, spreads]);

  // Sommaire entries — one per brand-intro spread
  const toc = useMemo(() => {
    const items: { brand: string; spreadIdx: number; count: number }[] = [];
    spreads.forEach((sp, i) => {
      if (sp.kind !== 'brand-intro') return;
      items.push({ brand: sp.brand, spreadIdx: i, count: sp.count });
    });
    return items;
  }, [spreads]);

  function jumpTo(i: number) {
    if (i === spreadIdx) { setTocOpen(false); return; }
    setDirection(i > spreadIdx ? 'next' : 'prev');
    setSpreadIdx(i);
    setTocOpen(false);
  }

  // Pointer handlers (drag-to-turn)
  const SPRING = { type: 'spring' as const, stiffness: 200, damping: 26, mass: 1, restDelta: 0.5 };

  const startDrag = (e: React.PointerEvent, dir: Direction) => {
    if (dragState.current.active) return;
    if (animatingButton.current || flipping || dragging) return;
    const ok = (dir === 'next' && canNext) || (dir === 'prev' && canPrev);
    if (!ok) return;
    dragX.set(0);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragState.current = {
      x: e.clientX, t: performance.now(),
      dragged: false, active: true, pid: e.pointerId, dir,
    };
    setDragging(true);
    setShowHint(false);
    try { sessionStorage.setItem('pc-catalogue-hint-seen', '1'); } catch { /* ignore */ }
  };

  const moveDrag = (e: React.PointerEvent) => {
    const s = dragState.current;
    if (!s.active) return;
    e.preventDefault();
    const dx = e.clientX - s.x;
    if (Math.abs(dx) > 6) s.dragged = true;
    dragX.set(dx);
  };

  const endDrag = (e: React.PointerEvent) => {
    const s = dragState.current;
    if (!s.active) return;
    s.active = false;

    if (!s.dragged) {
      setDragging(false);
      dragX.set(0);
      turn(s.dir);
      return;
    }

    const W = pageWidthRef.current || 1;
    const dx = e.clientX - s.x;
    const dt = Math.max(performance.now() - s.t, 16);
    const vx = dx / dt;
    const progress = s.dir === 'next' ? Math.min(-dx / W, 1) : Math.min(dx / W, 1);
    const flickForward = s.dir === 'next' ? (vx < -0.5) : (vx > 0.5);
    const commit = progress > 0.4 || (flickForward && progress > 0.1);
    const targetDx = commit ? (s.dir === 'next' ? -W : W) : 0;

    animate(dragX, targetDx, {
      ...SPRING,
      onComplete: () => {
        setDragging(false);
        if (commit) {
          setDirection(s.dir);
          setSpreadIdx((i) => {
            const next = s.dir === 'next' ? i + 1 : i - 1;
            return Math.max(0, Math.min(total - 1, next));
          });
        }
        requestAnimationFrame(() => dragX.set(0));
      },
    });
  };

  const cancelDrag = () => {
    const s = dragState.current;
    if (!s.active) return;
    s.active = false;
    animate(dragX, 0, {
      ...SPRING,
      onComplete: () => {
        setDragging(false);
        requestAnimationFrame(() => dragX.set(0));
      },
    });
  };

  if (!manifest) {
    return (
      <PageShell title="Catalogue" subtitle="Chargement du catalogue…">
        <div style={loadingBox}>
          <div className="pc-spinner" />
          <div style={{ marginTop: 16, color: TOKENS.mute, fontSize: 13 }}>
            Préparation du catalogue…
          </div>
        </div>
        <style>{spinnerKeyframes}</style>
      </PageShell>
    );
  }

  if (total <= 2) {
    return (
      <PageShell title="Catalogue" subtitle="Le catalogue est vide.">
        <div style={emptyBox}>
          <BookOpen size={48} color={TOKENS.terra} />
          <div style={{ marginTop: 18, fontSize: 15, color: TOKENS.inkSoft, fontWeight: 600 }}>
            Aucun produit avec image à afficher
          </div>
          <div style={{ marginTop: 6, fontSize: 13, color: TOKENS.mute }}>
            Le catalogue ne montre que les produits avec packshot.
            Téléversez des images dans <strong>Contenu</strong>.
          </div>
        </div>
      </PageShell>
    );
  }

  const current = spreads[spreadIdx];
  const prevSpread = spreadIdx > 0 ? spreads[spreadIdx - 1] : null;
  const nextSpread = spreadIdx < total - 1 ? spreads[spreadIdx + 1] : null;

  const counterText =
    current.kind === 'cover' ? 'Couverture' :
    current.kind === 'back' ? 'Dos' :
    `${spreadIdx + 1} / ${total}`;

  const frame = (
    <div style={fullscreen ? frameStyleFull : frameStyle}>
      {/* Toolbar */}
      <div style={fullscreen ? toolbarStyleFs : toolbarStyle}>
        <div style={fullscreen ? titleBoxStyleFs : titleBoxStyle}>
          <span style={{
            width: 8, height: 8, borderRadius: 99, background: TOKENS.terra,
            display: 'inline-block', flexShrink: 0,
          }} />
          <span style={{ fontWeight: 700 }}>{manifest.title}</span>
          <span style={{ opacity: 0.4 }}>·</span>
          <span style={{ opacity: 0.7 }}>{manifest.canal}</span>
          {manifest.mois && (<>
            <span style={{ opacity: 0.4 }}>·</span>
            <span style={{ opacity: 0.7 }}>{manifest.mois}</span>
          </>)}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            style={fullscreen ? iconBtnFs : iconBtn}
            onClick={() => setTocOpen((v) => !v)}
            title="Sommaire"
          >
            <List size={16} />
          </button>
          <button
            style={fullscreen ? iconBtnFs : iconBtn}
            onClick={() => setFullscreen((v) => !v)}
            title={fullscreen ? 'Quitter le plein écran' : 'Plein écran'}
          >
            {fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
        </div>
      </div>

      {/* Stage */}
      <div style={fullscreen ? stageFs : stage}>
        <button
          style={{ ...navBtn(fullscreen), opacity: canPrev ? 1 : 0.25 }}
          disabled={!canPrev}
          onClick={() => turn('prev')}
          aria-label="Précédent"
        >
          <ChevronLeft size={22} />
        </button>

        <div style={bookWrap(fullscreen)}>
          <div
            ref={bookRef}
            style={book(fullscreen)}
            onMouseMove={onBookMouseMove}
            onMouseLeave={onBookMouseLeave}
          >
            {/* Under-layer: destination spread */}
            <SpreadCanvas spread={current} pageNumber={spreadPageNum(current)} brandName={spreadBrandName(current)} />

            {/* Spine */}
            <div style={spineOverlay} />

            {/* Cursor-reactive page corners */}
            {canShowNextCorner && (
              <PageCornerCurl
                side="right"
                size={cornerNextSize}
                rotate={cornerNextRotate}
                pulse={showHint && !dragging}
                onPointerDown={(e) => startDrag(e, 'next')}
                onPointerMove={moveDrag}
                onPointerUp={endDrag}
                onPointerCancel={cancelDrag}
              />
            )}
            {canShowPrevCorner && (
              <PageCornerCurl
                side="left"
                size={cornerPrevSize}
                rotate={cornerPrevRotate}
                pulse={showHint && !dragging}
                onPointerDown={(e) => startDrag(e, 'prev')}
                onPointerMove={moveDrag}
                onPointerUp={endDrag}
                onPointerCancel={cancelDrag}
              />
            )}

            {/* First-visit hint */}
            <AnimatePresence>
              {showHint && canShowNextCorner && !dragging && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.4, delay: 0.6 }}
                  style={hintBubbleStyle}
                  onClick={() => {
                    setShowHint(false);
                    try { sessionStorage.setItem('pc-catalogue-hint-seen', '1'); } catch { /* ignore */ }
                  }}
                >
                  <span style={{ fontWeight: 700 }}>↘ Tirez le coin</span>
                  <span style={{ opacity: 0.7, marginLeft: 6 }}>pour tourner la page</span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* DRAG flap */}
            {dragging && (
              <motion.div
                style={{
                  ...flapBase,
                  left: dragState.current.dir === 'next' ? '50%' : '0%',
                  transformOrigin:
                    dragState.current.dir === 'next' ? 'left center' : 'right center',
                  rotateY: dragRotateY,
                }}
              >
                <div style={flapFaceFront}>
                  {dragState.current.dir === 'next' && prevSpread ? (
                    <HalfPage spread={prevSpread} side="right" pageNumber={spreadPageNum(prevSpread)} brandName={spreadBrandName(prevSpread)} mute />
                  ) : dragState.current.dir === 'prev' && nextSpread ? (
                    <HalfPage spread={nextSpread} side="left" pageNumber={spreadPageNum(nextSpread)} brandName={spreadBrandName(nextSpread)} mute />
                  ) : null}
                  <div style={lightCatch} />
                </div>
                <div style={flapFaceBack}>
                  {dragState.current.dir === 'next' ? (
                    <HalfPage spread={current} side="left" pageNumber={spreadPageNum(current)} brandName={spreadBrandName(current)} mute />
                  ) : (
                    <HalfPage spread={current} side="right" pageNumber={spreadPageNum(current)} brandName={spreadBrandName(current)} mute />
                  )}
                  <div style={lightCatch} />
                </div>
                <div style={flapShadow(dragState.current.dir)} />
              </motion.div>
            )}

            {/* BUTTON-driven flap */}
            <AnimatePresence custom={direction} initial={false}>
              {flipping && !dragging && (
                <motion.div
                  key={`flap-${spreadIdx}-${direction}`}
                  style={{
                    ...flapBase,
                    left: direction === 'next' ? '50%' : '0%',
                    transformOrigin: direction === 'next' ? 'left center' : 'right center',
                  }}
                  custom={direction}
                  variants={flapVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ duration: FLIP_MS / 1000, ease: EASE_FLIP }}
                >
                  <div style={flapFaceFront}>
                    {direction === 'next' && prevSpread ? (
                      <HalfPage spread={prevSpread} side="right" pageNumber={spreadPageNum(prevSpread)} brandName={spreadBrandName(prevSpread)} mute />
                    ) : direction === 'prev' && nextSpread ? (
                      <HalfPage spread={nextSpread} side="left" pageNumber={spreadPageNum(nextSpread)} brandName={spreadBrandName(nextSpread)} mute />
                    ) : null}
                    <div style={lightCatch} />
                  </div>
                  <div style={flapFaceBack}>
                    {direction === 'next' ? (
                      <HalfPage spread={current} side="left" pageNumber={spreadPageNum(current)} brandName={spreadBrandName(current)} mute />
                    ) : (
                      <HalfPage spread={current} side="right" pageNumber={spreadPageNum(current)} brandName={spreadBrandName(current)} mute />
                    )}
                    <div style={lightCatch} />
                  </div>
                  <div style={flapShadow(direction)} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Footer + slider */}
          <div style={footer(fullscreen)}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              minWidth: 0, flex: 1, overflow: 'hidden',
              textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {current.kind === 'product' && (
                <>
                  <span style={{
                    color: fullscreen ? '#d4d4d8' : TOKENS.mute, fontWeight: 700,
                    fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase',
                  }}>
                    {current.slide.subgroup}
                  </span>
                  <span style={{ color: fullscreen ? '#52525b' : '#d4d4d8' }}>·</span>
                  <span style={{ color: fullscreen ? '#f4f4f5' : TOKENS.ink, fontWeight: 600, fontSize: 13 }}>
                    {current.slide.nom}
                  </span>
                </>
              )}
              {current.kind === 'brand-intro' && (
                <span style={{ color: fullscreen ? '#f4f4f5' : TOKENS.ink, fontWeight: 700, fontSize: 13 }}>
                  {current.brand} — {current.count} référence{current.count > 1 ? 's' : ''}
                </span>
              )}
              {current.kind === 'grid' && (
                <span style={{ color: fullscreen ? '#d4d4d8' : TOKENS.inkSoft, fontWeight: 600, fontSize: 12 }}>
                  {current.brand} · {current.slides.length} produits
                </span>
              )}
              {current.kind === 'welcome' && (
                <span style={{ color: fullscreen ? '#d4d4d8' : TOKENS.mute, fontWeight: 600, fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                  Sommaire
                </span>
              )}
            </div>
            <div style={{
              color: TOKENS.terra, fontWeight: 700, fontSize: 11,
              fontFamily: TOKENS.fontMono, letterSpacing: '0.14em', flexShrink: 0,
            }}>
              {counterText}
            </div>
          </div>

          <input
            type="range"
            min={0} max={Math.max(0, total - 1)}
            value={spreadIdx}
            onChange={(e) => {
              const next = Number(e.target.value);
              setDirection(next > spreadIdx ? 'next' : 'prev');
              setSpreadIdx(next);
            }}
            style={slider}
          />
        </div>

        <button
          style={{ ...navBtn(fullscreen), opacity: canNext ? 1 : 0.25 }}
          disabled={!canNext}
          onClick={() => turn('next')}
          aria-label="Suivant"
        >
          <ChevronRight size={22} />
        </button>
      </div>

      {/* Sommaire drawer */}
      <AnimatePresence>
        {tocOpen && (
          <motion.div
            initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            style={tocStyle}
          >
            <div style={tocHeader}>
              <span style={{ fontWeight: 800, fontSize: 12, letterSpacing: '0.14em' }}>SOMMAIRE</span>
              <button style={iconBtn} onClick={() => setTocOpen(false)} aria-label="Fermer">
                <X size={16} />
              </button>
            </div>
            <div style={{ overflow: 'auto', flex: 1 }}>
              <div onClick={() => jumpTo(0)} style={tocItem(spreadIdx === 0)}>
                <span style={{ fontWeight: 700, fontSize: 13 }}>Couverture</span>
                <span style={{ color: TOKENS.mute, fontSize: 10.5, fontFamily: TOKENS.fontMono }}>01</span>
              </div>
              {toc.map((b, i) => {
                const nextStart = i + 1 < toc.length ? toc[i + 1].spreadIdx : total - 1;
                const active = spreadIdx >= b.spreadIdx && spreadIdx < nextStart;
                return (
                  <div key={b.brand} onClick={() => jumpTo(b.spreadIdx)} style={tocItem(active)}>
                    <span style={{ fontWeight: 700, fontSize: 13 }}>{b.brand}</span>
                    <span style={{ color: TOKENS.mute, fontSize: 10.5, fontFamily: TOKENS.fontMono }}>
                      {String(b.count).padStart(2, '0')}
                    </span>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );

  return (
    <>
      <PageShell
        title="Catalogue"
        subtitle="Feuilletez le catalogue — flèches du clavier ou attrapez le coin de la page."
      >
        <div style={{ padding: 8 }}>{frame}</div>
      </PageShell>
      <style>{spinnerKeyframes}</style>
    </>
  );
}

// ─── PageCornerCurl ──────────────────────────────────────────────────
function PageCornerCurl({
  side, size, rotate, pulse,
  onPointerDown, onPointerMove, onPointerUp, onPointerCancel,
}: {
  side: 'left' | 'right';
  size: import('framer-motion').MotionValue<number>;
  rotate: import('framer-motion').MotionValue<number>;
  pulse: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  onPointerCancel: (e: React.PointerEvent) => void;
}) {
  return (
    <motion.div
      className={pulse ? 'pc-corner-pulse' : ''}
      style={{
        position: 'absolute',
        bottom: 0,
        [side === 'right' ? 'right' : 'left']: 0,
        width: size, height: size,
        zIndex: 30,
        cursor: 'grab',
        touchAction: 'none',
        userSelect: 'none',
        WebkitTapHighlightColor: 'transparent',
        transformOrigin: side === 'right' ? 'bottom right' : 'bottom left',
        rotate,
        willChange: 'transform, width, height',
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      title={side === 'right' ? 'Tirez le coin pour tourner la page' : 'Tirez le coin pour revenir'}
    >
      <svg
        viewBox="0 0 100 100"
        style={{ width: '100%', height: '100%', display: 'block', overflow: 'visible' }}
        preserveAspectRatio="none"
      >
        {side === 'right' ? (
          <>
            <path
              d="M 100 100 L 100 18 L 18 100 Z"
              fill="rgba(0, 0, 0, 0.16)"
              transform="translate(-3, 3)"
              style={{ filter: 'blur(3px)' }}
            />
            <path d="M 100 100 L 100 18 L 18 100 Z" fill="#F2EDE4" stroke="#DDD5C6" strokeWidth="0.6" />
            <path d="M 100 18 L 18 100" stroke="rgba(255,255,255,0.6)" strokeWidth="1" fill="none" />
          </>
        ) : (
          <>
            <path
              d="M 0 100 L 0 18 L 82 100 Z"
              fill="rgba(0, 0, 0, 0.16)"
              transform="translate(3, 3)"
              style={{ filter: 'blur(3px)' }}
            />
            <path d="M 0 100 L 0 18 L 82 100 Z" fill="#F2EDE4" stroke="#DDD5C6" strokeWidth="0.6" />
            <path d="M 0 18 L 82 100" stroke="rgba(255,255,255,0.6)" strokeWidth="1" fill="none" />
          </>
        )}
      </svg>
    </motion.div>
  );
}

function spreadPageNum(sp: Spread): number {
  if (sp.kind === 'product' || sp.kind === 'welcome' ||
      sp.kind === 'brand-intro' || sp.kind === 'grid') return sp.pageNumber;
  if (sp.kind === 'cover') return 1;
  return 0;
}

function spreadBrandName(sp: Spread): string {
  if (sp.kind === 'product') return sp.slide.subgroup;
  if (sp.kind === 'brand-intro' || sp.kind === 'grid') return sp.brand;
  return '';
}

// ─── SpreadCanvas ─────────────────────────────────────────────────────
function SpreadCanvas({
  spread, pageNumber, brandName,
}: { spread: Spread; pageNumber: number; brandName: string }) {
  return (
    <div style={spreadCanvas}>
      <HalfPage spread={spread} side="left"  pageNumber={pageNumber} brandName={brandName} />
      <HalfPage spread={spread} side="right" pageNumber={pageNumber} brandName={brandName} />
    </div>
  );
}

// ─── HalfPage ─────────────────────────────────────────────────────────
function HalfPage({
  spread, side, pageNumber, brandName, mute,
}: {
  spread: Spread;
  side: 'left' | 'right';
  pageNumber: number;
  brandName: string;
  mute?: boolean;
}) {
  return (
    <div style={halfPage(side)}>
      <div style={noiseOverlay} />
      <div style={innerGutter(side)} />

      {spread.kind === 'cover' && <CoverHalf side={side} spread={spread} mute={mute} />}
      {spread.kind === 'welcome' && <WelcomeHalf side={side} spread={spread} mute={mute} />}
      {spread.kind === 'brand-intro' && <BrandIntroHalf side={side} spread={spread} mute={mute} />}
      {spread.kind === 'product' && <ProductHalf side={side} spread={spread} mute={mute} />}
      {spread.kind === 'grid' && <GridHalf side={side} spread={spread} mute={mute} />}
      {spread.kind === 'back' && <BackHalf side={side} spread={spread} mute={mute} />}

      {spread.kind !== 'cover' && spread.kind !== 'back' && (
        <div style={folio(side, spread.kind === 'brand-intro' && side === 'left')}>
          {String(pageNumber).padStart(2, '0')}
        </div>
      )}
      {brandName && spread.kind !== 'cover' && spread.kind !== 'back' && (
        <div style={runningHeader(side, spread.kind === 'brand-intro' && side === 'left')}>
          {brandName}
        </div>
      )}
    </div>
  );
}

// ─── COVER ────────────────────────────────────────────────────────────
function CoverHalf({ side, spread, mute }: {
  side: 'left' | 'right';
  spread: CoverSpread;
  mute?: boolean;
}) {
  const t = (delay: number, duration: number, ease: Bezier = EASE) => ({
    delay: mute ? 0 : delay,
    duration: mute ? 0 : duration,
    ease,
  });

  if (side === 'left') {
    const words = (spread.title || 'Catalogue').toUpperCase().split(' ').filter(Boolean);
    return (
      <div style={coverLeftInner}>
        {/* Issue chip — orange block, like the reference "ISSUE 20" */}
        <motion.div
          initial={mute ? false : { opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={t(0.1, 0.5)}
          style={coverChip}
        >
          {spread.mois ? spread.mois.toUpperCase() : 'ÉDITION'}
        </motion.div>

        {/* Display title */}
        <div style={{ marginTop: 40 }}>
          {words.map((w, i) => (
            <div key={i} style={{ overflow: 'hidden' }}>
              <motion.div
                initial={mute ? false : { y: '110%' }}
                animate={{ y: '0%' }}
                transition={t(0.25 + i * 0.09, 0.7)}
                style={coverTitleWord}
              >
                {w}
                {i === words.length - 1 && <span style={{ color: TOKENS.terra }}>.</span>}
              </motion.div>
            </div>
          ))}
        </div>

        {/* Accent rule */}
        <motion.div
          initial={mute ? false : { scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={t(0.6, 0.5)}
          style={coverRule}
        />

        {/* Meta lines */}
        <motion.div
          initial={mute ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={t(0.7, 0.5)}
          style={coverMetaLines}
        >
          <div>{spread.canal} — sélection {spread.mois || 'du mois'}.</div>
          <div style={{ color: TOKENS.mute, marginTop: 4 }}>
            {String(spread.totalBrands).padStart(2, '0')} marques · {String(spread.totalProducts).padStart(3, '0')} références
          </div>
        </motion.div>

        {/* Bottom shape composition — mustard block / teal arch / terra circle */}
        <div style={coverShapesRow}>
          <motion.div
            initial={mute ? false : { scaleY: 0 }}
            animate={{ scaleY: 1 }}
            transition={t(0.8, 0.55)}
            style={{ ...coverShape, background: TOKENS.mustard, transformOrigin: 'bottom' }}
          />
          <motion.div
            initial={mute ? false : { scaleY: 0 }}
            animate={{ scaleY: 1 }}
            transition={t(0.9, 0.55)}
            style={{
              ...coverShape, background: TOKENS.teal,
              borderRadius: '999px 999px 0 0', transformOrigin: 'bottom',
            }}
          />
          <motion.div
            initial={mute ? false : { scale: 0 }}
            animate={{ scale: 1 }}
            transition={t(1.0, 0.55)}
            style={{
              ...coverShape, background: TOKENS.terra,
              borderRadius: 999, alignSelf: 'center', height: 64,
            }}
          />
          <motion.div
            initial={mute ? false : { scaleY: 0 }}
            animate={{ scaleY: 1 }}
            transition={t(1.05, 0.55)}
            style={{
              ...coverShape, background: TOKENS.terraSoft,
              borderRadius: '999px 999px 0 0', transformOrigin: 'bottom', height: 88,
            }}
          />
        </div>
      </div>
    );
  }

  // RIGHT — terracotta page, big arch window with the cover render inside
  return (
    <div style={coverRightInner}>
      {/* Half-circle bleeding off bottom-left */}
      <motion.div
        initial={mute ? false : { scale: 0 }}
        animate={{ scale: 1 }}
        transition={t(0.7, 0.6)}
        style={coverHalfCircle}
      />
      {/* Arch window */}
      <motion.div
        initial={mute ? false : { opacity: 0, y: 26 }}
        animate={{ opacity: 1, y: 0 }}
        transition={t(0.3, 0.8)}
        style={coverArchWindow}
      >
        <img src={spread.coverUrl} alt="Couverture" draggable={false} style={coverArchImg} />
      </motion.div>
      {/* Vertical label */}
      <motion.div
        initial={mute ? false : { opacity: 0, x: 16 }}
        animate={{ opacity: 0.95, x: 0 }}
        transition={t(0.6, 0.6)}
        style={coverVerticalLabel}
      >
        PLAN COMMERCIAL — {(spread.mois || '').toUpperCase() || 'ÉDITION'}
      </motion.div>
      {/* Small circle, top-left */}
      <motion.div
        initial={mute ? false : { scale: 0 }}
        animate={{ scale: 1 }}
        transition={t(0.9, 0.5)}
        style={coverDotTL}
      />
    </div>
  );
}

// ─── WELCOME / SOMMAIRE ──────────────────────────────────────────────
function WelcomeHalf({ side, spread, mute }: {
  side: 'left' | 'right';
  spread: WelcomeSpread;
  mute?: boolean;
}) {
  if (side === 'left') {
    const items = spread.allBrands.slice(0, 9);
    return (
      <div style={welcomeLeftStyle}>
        {/* Decorative arch top-right, soft */}
        <div style={welcomeLeftArch} />
        <motion.div
          initial={mute ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: mute ? 0 : 0.5, delay: mute ? 0 : 0.15, ease: EASE }}
          style={welcomeEyebrow}
        >
          TABLE DES MATIÈRES
        </motion.div>
        <div style={{ overflow: 'hidden', marginTop: 10 }}>
          <motion.div
            initial={mute ? false : { y: '110%' }}
            animate={{ y: '0%' }}
            transition={{ duration: mute ? 0 : 0.65, delay: mute ? 0 : 0.25, ease: EASE }}
            style={welcomeTitle}
          >
            SOMMAIRE<span style={{ color: TOKENS.mustard }}>.</span>
          </motion.div>
        </div>

        <div style={welcomeList}>
          {items.map((b, i) => (
            <motion.div
              key={b.name}
              initial={mute ? false : { opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: mute ? 0 : 0.4, delay: mute ? 0 : 0.4 + i * 0.05, ease: EASE }}
              style={welcomeListRow}
            >
              <span style={welcomeListName}>{b.name}</span>
              <span style={welcomeListDots} />
              <span style={welcomeListCount}>{String(b.count).padStart(2, '0')}</span>
            </motion.div>
          ))}
          {spread.allBrands.length > items.length && (
            <div style={{ ...welcomeListRow, opacity: 0.65 }}>
              <span style={{ ...welcomeListName, fontStyle: 'italic', textTransform: 'none' }}>
                + {spread.allBrands.length - items.length} autres marques…
              </span>
            </div>
          )}
        </div>
      </div>
    );
  }

  // RIGHT — 2×2 teaser cards with arch frames
  return (
    <div style={welcomeRightStyle}>
      <div style={welcomeGridStyle}>
        {spread.teasers.map((b, i) => {
          const hue = hueAt(i);
          return (
            <motion.div
              key={b.name}
              initial={mute ? false : { opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: mute ? 0 : 0.5, delay: mute ? 0 : 0.3 + i * 0.08, ease: EASE }}
              style={welcomeCardStyle}
            >
              <div style={{
                ...welcomeCardFrame,
                background: hue.soft,
                borderRadius: i % 2 === 0 ? '999px 999px 0 0' : 18,
              }}>
                {b.previewUrl
                  ? <img src={b.previewUrl} alt={b.name} draggable={false} style={welcomeCardImage} />
                  : null}
              </div>
              <div style={welcomeCardName}>{b.name}</div>
              <div style={welcomeCardCount}>{b.count} référence{b.count > 1 ? 's' : ''}</div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

// ─── BRAND INTRO ─────────────────────────────────────────────────────
function BrandIntroHalf({ side, spread, mute }: {
  side: 'left' | 'right';
  spread: BrandIntroSpread;
  mute?: boolean;
}) {
  const hue = hueAt(spread.hue);
  if (side === 'left') {
    // Full-bleed color block + arch with the hero packshot
    return (
      <div style={{ ...brandIntroLeftStyle, background: hue.block }}>
        {/* Big soft arch holding the hero image */}
        <motion.div
          initial={mute ? false : { opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: mute ? 0 : 0.7, delay: mute ? 0 : 0.25, ease: EASE }}
          style={{ ...brandIntroArch, background: hue.soft }}
        >
          {spread.heroImageUrl && (
            <motion.img
              src={spread.heroImageUrl}
              alt={spread.brand}
              draggable={false}
              initial={mute ? false : { scale: 1.08, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: mute ? 0 : 0.9, delay: mute ? 0 : 0.4, ease: EASE }}
              style={brandIntroArchImg}
            />
          )}
        </motion.div>
        {/* Circle accent overlapping the arch */}
        <motion.div
          initial={mute ? false : { scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ duration: mute ? 0 : 0.5, delay: mute ? 0 : 0.7, ease: EASE }}
          style={{ ...brandIntroCircle, background: hueAt(spread.hue + 1).block }}
        />
        {/* Vertical label on outer edge */}
        <div style={{ ...brandIntroVertical, color: hue.text }}>
          {spread.brand.toUpperCase()} — COLLECTION
        </div>
      </div>
    );
  }

  // RIGHT — white, giant brand name
  return (
    <div style={brandIntroRightStyle}>
      {spread.logoUrl && (
        <motion.img
          src={spread.logoUrl} alt={spread.brand}
          initial={mute ? false : { opacity: 0, y: -6 }}
          animate={{ opacity: 0.92, y: 0 }}
          transition={{ duration: mute ? 0 : 0.5, delay: mute ? 0 : 0.2, ease: EASE }}
          style={brandLogoTop}
          draggable={false}
        />
      )}
      <div style={{ flex: 1 }} />
      <motion.div
        initial={mute ? false : { opacity: 0, letterSpacing: '0.1em' }}
        animate={{ opacity: 1, letterSpacing: '0.22em' }}
        transition={{ duration: mute ? 0 : 0.55, delay: mute ? 0 : 0.3, ease: EASE }}
        style={{ ...brandIntroEyebrow, color: hue.deep }}
      >
        NOUVELLE SÉLECTION · {String(spread.count).padStart(2, '0')} RÉFÉRENCES
      </motion.div>
      <div style={{ overflow: 'hidden', marginTop: 12 }}>
        <motion.div
          initial={mute ? false : { y: '112%' }}
          animate={{ y: '0%' }}
          transition={{ duration: mute ? 0 : 0.75, delay: mute ? 0 : 0.42, ease: EASE }}
          style={brandIntroName}
        >
          {spread.brand.toUpperCase()}<span style={{ color: hue.block }}>.</span>
        </motion.div>
      </div>
      <motion.div
        initial={mute ? false : { scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: mute ? 0 : 0.5, delay: mute ? 0 : 0.8, ease: EASE }}
        style={{ ...brandIntroBar, background: hue.block }}
      />
      <motion.div
        initial={mute ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: mute ? 0 : 0.55, delay: mute ? 0 : 0.92, ease: EASE }}
        style={brandIntroChannel}
      >
        {spread.channel || 'Catalogue produits'} — tous les prix s'entendent hors taxes.
      </motion.div>
      <div style={{ flex: 1.4 }} />
    </div>
  );
}

// ─── PRODUCT (hero + promo) ──────────────────────────────────────────
function ProductHalf({ side, spread, mute }: {
  side: 'left' | 'right';
  spread: ProductSpread;
  mute?: boolean;
}) {
  const { slide } = spread;
  const hue = hueAt(spread.hue);
  const tp = (slide.type_promo || '').toLowerCase();
  const isRemiseG = tp === 'remise+gratuite';
  const isGratuite = tp === 'gratuite' || isRemiseG;
  const isRemise = tp === 'remise' || isRemiseG;
  const price = slide.prix_gros_net || slide.prix_gros;

  if (side === 'left') {
    return (
      <div style={productLeftInner}>
        {/* Brand logo top-left */}
        {slide.logo_file_url && (
          <motion.img
            src={slide.logo_file_url}
            alt={slide.subgroup}
            initial={mute ? false : { opacity: 0, y: -4 }}
            animate={{ opacity: 0.9, y: 0 }}
            transition={{ duration: mute ? 0 : 0.5, delay: mute ? 0 : 0.18 }}
            style={brandLogoTop}
            draggable={false}
          />
        )}

        {/* PROMO ribbon */}
        {slide.is_promo && (
          <div style={{ ...offreChip, background: TOKENS.charcoal }}>OFFRE SPÉCIALE</div>
        )}

        {/* Big arch + packshot */}
        <motion.div
          initial={mute ? false : { opacity: 0, y: 26 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: mute ? 0 : 0.65, delay: mute ? 0 : 0.25, ease: EASE }}
          style={{ ...productArch, background: hue.soft }}
        >
          <motion.img
            src={slide.packshot_file_url!}
            alt={slide.nom}
            draggable={false}
            initial={mute ? false : { scale: 1.06, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: mute ? 0 : 0.8, delay: mute ? 0 : 0.4, ease: EASE }}
            style={productArchImg}
          />

          {/* Remise roundel pinned to the arch */}
          {isRemise && slide.promo_remise_pct > 0 && (
            <motion.div
              initial={mute ? false : { scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 240, damping: 17, delay: mute ? 0 : 0.55 }}
              style={{ ...remiseRoundel, background: TOKENS.terra }}
            >
              <span style={remiseRoundelNum}>−{Math.round(slide.promo_remise_pct)}%</span>
            </motion.div>
          )}
        </motion.div>

        {/* Price tag circle, overlapping arch bottom-right */}
        <motion.div
          initial={mute ? false : { scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 230, damping: 16, delay: mute ? 0 : 0.6 }}
          style={{ ...priceTagCircle, background: hue.block, color: hue.text }}
        >
          <span style={{ fontSize: 22, fontWeight: 800, lineHeight: 1 }}>
            {fmtInt(price)}
          </span>
          <span style={{ fontSize: 10, fontWeight: 700, opacity: 0.85 }}>DH HT</span>
        </motion.div>

        {/* Free-product satellite (gratuite promos) */}
        {isGratuite && (
          <motion.div
            initial={mute ? false : { scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 220, damping: 18, delay: mute ? 0 : 0.7 }}
            style={freeSatellite}
          >
            <img
              src={slide.promo_gratuite_image_url || slide.packshot_file_url!}
              alt="Produit offert"
              draggable={false}
              style={freeSatelliteImg}
            />
            <div style={freeSatelliteTag}>
              ×{slide.promo_gratuit_qte || 1} OFFERT
            </div>
          </motion.div>
        )}
      </div>
    );
  }

  // RIGHT — data page
  return (
    <div style={productRightInner}>
      <div style={{ height: 26 }} />
      <motion.div
        initial={mute ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: mute ? 0 : 0.45, delay: mute ? 0 : 0.22, ease: EASE }}
        style={{ ...eyebrowStyle, color: hue.deep }}
      >
        {slide.subgroup.toUpperCase()}
        <span style={{ ...eyebrowDash, background: hue.block }} />
      </motion.div>

      <div style={{ overflow: 'hidden', marginTop: 14 }}>
        <motion.div
          initial={mute ? false : { y: '112%' }}
          animate={{ y: '0%' }}
          transition={{ duration: mute ? 0 : 0.65, delay: mute ? 0 : 0.34, ease: EASE }}
          style={titleStyle}
        >
          {slide.nom}
        </motion.div>
      </div>

      <motion.div
        initial={mute ? false : { scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: mute ? 0 : 0.45, delay: mute ? 0 : 0.6, ease: EASE }}
        style={hairlineStyle}
      />

      {/* Price lockup */}
      <motion.div
        initial={mute ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: mute ? 0 : 0.5, delay: mute ? 0 : 0.66, ease: EASE }}
        style={priceSection}
      >
        <div style={priceEyebrow}>PRIX UNITAIRE HT</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={priceInteger}>{fmt(price)}</span>
          <span style={{ ...priceCurrency, color: hue.block }}>DH</span>
        </div>
        {slide.prix_gros_net > 0 && slide.prix_gros > slide.prix_gros_net && (
          <div style={priceBrut}>
            <span style={{ color: TOKENS.mute, marginRight: 8 }}>Brut</span>
            <span style={{ color: TOKENS.inkSoft }}>{fmt(slide.prix_gros)} DH</span>
          </div>
        )}
      </motion.div>

      {/* Offer block (promos) — bold color block, white text */}
      {slide.is_promo && (
        <motion.div
          initial={mute ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: mute ? 0 : 0.5, delay: mute ? 0 : 0.78, ease: EASE }}
          style={{ ...offerBlock, background: TOKENS.terra }}
        >
          <div style={offerEyebrow}>L'OFFRE</div>
          <div style={offerLockup}>
            {isRemise && slide.promo_remise_pct > 0 && (
              <span style={offerBigNum}>−{Math.round(slide.promo_remise_pct)}%</span>
            )}
            {isGratuite && slide.promo_achat_qte > 0 && (
              <span style={offerBigNum}>
                {slide.promo_achat_qte}<span style={offerPlus}>+</span>{slide.promo_gratuit_qte || 1}
              </span>
            )}
            {!isRemise && !isGratuite && (
              <span style={{ ...offerBigNum, fontSize: 22 }}>OFFRE</span>
            )}
          </div>
          <div style={offerTagline}>
            {isGratuite && slide.promo_achat_qte > 0
              ? `Achetez ${slide.promo_achat_qte}, recevez ${slide.promo_gratuit_qte || 1} gratuit${(slide.promo_gratuit_qte || 1) > 1 ? 's' : ''}${isRemiseG && slide.promo_remise_pct > 0 ? ` + ${Math.round(slide.promo_remise_pct)}% de remise` : ''}.`
              : isRemise
                ? 'de remise immédiate sur ce produit.'
                : (slide.promo_texte || 'Offre spéciale du mois.')}
          </div>
          {slide.promo_texte && (isRemise || isGratuite) && (
            <div style={offerTexte}>{slide.promo_texte}</div>
          )}
        </motion.div>
      )}

      <div style={{ flex: 1, minHeight: 0 }} />

      {/* Colisage panel */}
      {(slide.colisage || slide.colisage_prix_gros > 0) && (
        <motion.div
          initial={mute ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: mute ? 0 : 0.5, delay: mute ? 0 : 0.86, ease: EASE }}
          style={colisageCard}
        >
          <div style={colisageHead}>CONDITIONNEMENT</div>
          {slide.colisage && (
            <div style={colisageRow}>
              <span style={colisageLabel}>Colisage</span>
              <span style={colisageValue}>{slide.colisage}</span>
            </div>
          )}
          {slide.colisage_prix_gros_net > 0 && (
            <div style={colisageRow}>
              <span style={colisageLabel}>Prix colis HT</span>
              <span style={colisageValue}>{fmt(slide.colisage_prix_gros_net)} DH</span>
            </div>
          )}
          {slide.colisage_prix_gros > 0 && slide.colisage_prix_gros !== slide.colisage_prix_gros_net && (
            <div style={colisageRow}>
              <span style={colisageLabel}>Brut colis</span>
              <span style={{ ...colisageValue, color: TOKENS.mute }}>{fmt(slide.colisage_prix_gros)} DH</span>
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}

// ─── GRID — 4 cards per page ─────────────────────────────────────────
function GridHalf({ side, spread, mute }: {
  side: 'left' | 'right';
  spread: GridSpread;
  mute?: boolean;
}) {
  const cards = side === 'left' ? spread.slides.slice(0, 4) : spread.slides.slice(4, 8);
  const baseIdx = side === 'left' ? 0 : 4;
  return (
    <div style={gridHalfStyle}>
      <div style={gridGridStyle}>
        {cards.map((slide, i) => (
          <motion.div
            key={`${slide.row_idx}-${slide.promo_idx}-${i}`}
            initial={mute ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: mute ? 0 : 0.45, delay: mute ? 0 : 0.2 + i * 0.07, ease: EASE }}
          >
            <ProductCard slide={slide} idx={baseIdx + i} hue={spread.hue} />
          </motion.div>
        ))}
        {Array.from({ length: Math.max(0, 4 - cards.length) }).map((_, i) => (
          <div key={`empty-${i}`} />
        ))}
      </div>
    </div>
  );
}

function ProductCard({ slide, idx, hue }: { slide: api.CatalogueSlide; idx: number; hue: number }) {
  const h = hueAt(hue + idx);
  const price = slide.prix_gros_net || slide.prix_gros;
  return (
    <div style={cardStyle}>
      <div style={{
        ...cardImageWrapStyle,
        background: h.soft,
        borderRadius: idx % 2 === 0 ? '999px 999px 14px 14px' : 16,
      }}>
        <img src={slide.packshot_file_url!} alt={slide.nom} draggable={false} style={cardImageStyle} />
        <div style={{ ...cardPriceTagStyle, background: h.block, color: h.text }}>
          {fmtInt(price)}
          <span style={{ fontSize: 8, fontWeight: 700, opacity: 0.85 }}>DH</span>
        </div>
        {slide.is_promo && <div style={cardPromoBadgeStyle}>PROMO</div>}
      </div>
      <div style={cardNameStyle}>{slide.nom}</div>
      <div style={cardColisageStyle}>{slide.colisage || '—'}</div>
    </div>
  );
}

// ─── BACK COVER ──────────────────────────────────────────────────────
function BackHalf({ side, spread, mute }: { side: 'left' | 'right'; spread: BackSpread; mute?: boolean }) {
  if (side === 'left') {
    return (
      <div style={backLeftStyle}>
        <div style={backLeftArch} />
        <div style={backLeftCircle} />
        <div style={backLeftLabel}>FIN DE LA SÉLECTION</div>
      </div>
    );
  }
  return (
    <div style={backRightStyle}>
      <motion.div
        initial={mute ? false : { opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: mute ? 0 : 0.6, delay: mute ? 0 : 0.2, ease: EASE }}
        style={backTitle}
      >
        MERCI<span style={{ color: TOKENS.mustard }}>.</span>
      </motion.div>
      <motion.div
        initial={mute ? false : { opacity: 0 }}
        animate={{ opacity: 0.9 }}
        transition={{ duration: mute ? 0 : 0.5, delay: mute ? 0 : 0.45 }}
        style={backMeta}
      >
        {String(spread.totalProducts).padStart(3, '0')} références · {spread.canal} · {spread.mois}
      </motion.div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────
function fmt(n: number): string {
  if (!n || !isFinite(n)) return '—';
  return n.toLocaleString('fr-FR', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
}
function fmtInt(n: number): string {
  if (!n || !isFinite(n)) return '—';
  return Math.round(n).toLocaleString('fr-FR');
}

// ─── Variants ─────────────────────────────────────────────────────────
const flapVariants: Variants = {
  enter: { rotateY: 0 },
  center: (d: Direction) => ({
    rotateY: d === 'next' ? -180 : 180,
    transition: { duration: FLIP_MS / 1000, ease: EASE_FLIP },
  }),
  exit: { opacity: 1, transition: { duration: 0 } },
};

// ─── STYLES ───────────────────────────────────────────────────────────
const frameStyle: React.CSSProperties = {
  position: 'relative',
  background: 'linear-gradient(180deg, #FAF8F4 0%, #F1EDE5 100%)',
  border: `1px solid ${TOKENS.rule}`,
  borderRadius: 16,
  padding: '14px 14px 18px',
  boxShadow: '0 8px 32px rgba(15,15,20,0.06)',
  overflow: 'hidden',
};
const frameStyleFull: React.CSSProperties = {
  ...frameStyle,
  position: 'fixed', inset: 0, zIndex: 9999,
  borderRadius: 0, padding: '14px 22px 18px',
  background: 'linear-gradient(180deg, #141210 0%, #221E19 100%)',
  border: 'none',
  display: 'flex', flexDirection: 'column',
};
const toolbarStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  marginBottom: 12, gap: 8,
};
const toolbarStyleFs: React.CSSProperties = { ...toolbarStyle, color: '#fafafa', flexShrink: 0 };
const titleBoxStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 8,
  padding: '6px 14px', borderRadius: 999,
  background: '#ffffff', border: `1px solid ${TOKENS.rule}`,
  fontSize: 12, color: TOKENS.ink,
  fontFamily: TOKENS.fontSans, letterSpacing: '0.02em',
};
const titleBoxStyleFs: React.CSSProperties = {
  ...titleBoxStyle,
  background: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.1)',
  color: '#fafafa', backdropFilter: 'blur(6px)',
};
const iconBtn: React.CSSProperties = {
  width: 32, height: 32, display: 'inline-flex',
  alignItems: 'center', justifyContent: 'center',
  border: `1px solid ${TOKENS.rule}`, background: '#ffffff',
  borderRadius: 999, cursor: 'pointer', color: TOKENS.ink,
};
const iconBtnFs: React.CSSProperties = {
  ...iconBtn,
  background: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.1)',
  color: '#fafafa', backdropFilter: 'blur(6px)',
};
const stage: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14,
};
const stageFs: React.CSSProperties = {
  ...stage, flex: 1, minHeight: 0,
};
function navBtn(full: boolean): React.CSSProperties {
  return {
    width: 46, height: 46, borderRadius: 999,
    border: full ? '1px solid rgba(255,255,255,0.12)' : `1px solid ${TOKENS.rule}`,
    background: full ? 'rgba(255,255,255,0.06)' : '#ffffff',
    color: full ? '#fafafa' : TOKENS.ink,
    cursor: 'pointer', flexShrink: 0,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: full ? '0 2px 12px rgba(0,0,0,0.3)' : '0 2px 8px rgba(0,0,0,0.06)',
    backdropFilter: 'blur(6px)',
  };
}
// Book sizing — fits BOTH axes. Width is the min of the container and
// (viewport height − chrome) × aspect, with a 480px floor so tiny
// windows still show a readable book.
function bookWrap(full: boolean): React.CSSProperties {
  return {
    flex: 1, minWidth: 0,
    maxWidth: `min(1240px, max(480px, calc((100vh - ${full ? 230 : 320}px) * ${BOOK_ASPECT})))`,
    display: 'flex', flexDirection: 'column', gap: 12,
    margin: '0 auto',
  };
}
function book(_full: boolean): React.CSSProperties {
  return {
    position: 'relative',
    aspectRatio: `${BOOK_ASPECT} / 1`,
    perspective: 2200,
    perspectiveOrigin: '50% 50%',
    borderRadius: 4,
    touchAction: 'none',
    background: TOKENS.page,
    boxShadow: [
      '0 1px 0 rgba(0,0,0,0.14)',
      '0 4px 10px -2px rgba(0,0,0,0.16)',
      '0 18px 36px -8px rgba(0,0,0,0.16)',
      '0 42px 80px -24px rgba(30,20,10,0.18)',
    ].join(', '),
  };
}
const spreadCanvas: React.CSSProperties = {
  position: 'absolute', inset: 0,
  display: 'flex', overflow: 'hidden',
  background: TOKENS.page,
  borderRadius: 4,
};
function halfPage(_side: 'left' | 'right'): React.CSSProperties {
  return {
    flex: 1, position: 'relative',
    overflow: 'hidden',
    background: TOKENS.page,
  };
}
const noiseOverlay: React.CSSProperties = {
  position: 'absolute', inset: 0, pointerEvents: 'none',
  backgroundImage: PAPER_NOISE,
  backgroundSize: '220px 220px',
  backgroundRepeat: 'repeat',
  mixBlendMode: 'multiply',
  zIndex: 5,
};
function innerGutter(side: 'left' | 'right'): React.CSSProperties {
  return {
    position: 'absolute', top: 0, bottom: 0,
    [side === 'left' ? 'right' : 'left']: 0,
    width: 30, pointerEvents: 'none', zIndex: 4,
    background: side === 'left'
      ? 'linear-gradient(90deg, transparent 0%, rgba(0,0,0,0.10) 100%)'
      : 'linear-gradient(270deg, transparent 0%, rgba(0,0,0,0.10) 100%)',
  };
}
const spineOverlay: React.CSSProperties = {
  position: 'absolute', top: 0, bottom: 0, left: 'calc(50% - 28px)',
  width: 56, pointerEvents: 'none', zIndex: 6,
  background: `linear-gradient(to right,
    transparent 0%, rgba(0,0,0,0.10) 47%,
    rgba(0,0,0,0.22) 50%, rgba(0,0,0,0.10) 53%, transparent 100%)`,
  mixBlendMode: 'multiply',
};
function folio(side: 'left' | 'right', onColor: boolean): React.CSSProperties {
  return {
    position: 'absolute', bottom: 22,
    [side === 'left' ? 'left' : 'right']: TOKENS.padSide,
    fontFamily: TOKENS.fontMono,
    fontSize: 10, fontWeight: 500,
    letterSpacing: '0.16em',
    color: onColor ? 'rgba(255,255,255,0.85)' : TOKENS.mute,
    zIndex: 7,
  };
}
function runningHeader(side: 'left' | 'right', onColor: boolean): React.CSSProperties {
  return {
    position: 'absolute', top: 22,
    [side === 'left' ? 'left' : 'right']: TOKENS.padSide,
    fontFamily: TOKENS.fontSans,
    fontSize: 9, fontWeight: 800, letterSpacing: '0.2em',
    textTransform: 'uppercase',
    color: onColor ? 'rgba(255,255,255,0.85)' : TOKENS.mute,
    zIndex: 7,
  };
}
const hintBubbleStyle: React.CSSProperties = {
  position: 'absolute',
  bottom: 'calc(26% + 8px)',
  right: 12,
  padding: '7px 14px',
  background: TOKENS.ink,
  color: '#FFFFFF',
  fontFamily: TOKENS.fontSans,
  fontSize: 12,
  fontWeight: 500,
  borderRadius: 999,
  letterSpacing: '0.02em',
  whiteSpace: 'nowrap',
  cursor: 'pointer',
  zIndex: 32,
  boxShadow: '0 8px 18px rgba(0,0,0,0.22), 0 2px 4px rgba(0,0,0,0.18)',
  pointerEvents: 'auto',
};
const flapBase: React.CSSProperties = {
  position: 'absolute',
  top: 0, bottom: 0,
  width: '50%',
  transformStyle: 'preserve-3d',
  willChange: 'transform',
  zIndex: 10,
};
const flapFaceFront: React.CSSProperties = {
  position: 'absolute', inset: 0,
  backfaceVisibility: 'hidden',
  background: TOKENS.page,
  overflow: 'hidden',
  transformStyle: 'preserve-3d',
};
const flapFaceBack: React.CSSProperties = {
  position: 'absolute', inset: 0,
  backfaceVisibility: 'hidden',
  background: TOKENS.page,
  overflow: 'hidden',
  transform: 'rotateY(180deg)',
  transformStyle: 'preserve-3d',
};
const lightCatch: React.CSSProperties = {
  position: 'absolute', inset: 0, pointerEvents: 'none',
  background: 'linear-gradient(120deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.14) 50%, rgba(255,255,255,0) 100%)',
  mixBlendMode: 'screen',
};
function flapShadow(d: Direction): React.CSSProperties {
  return {
    position: 'absolute', inset: 0, pointerEvents: 'none',
    background: d === 'next'
      ? 'linear-gradient(90deg,  rgba(0,0,0,0.18) 0%, rgba(0,0,0,0) 16%)'
      : 'linear-gradient(270deg, rgba(0,0,0,0.18) 0%, rgba(0,0,0,0) 16%)',
  };
}
function footer(full: boolean): React.CSSProperties {
  return {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    gap: 12, padding: '0 6px',
    fontSize: 12, color: full ? '#d4d4d8' : TOKENS.inkSoft,
    flexShrink: 0,
  };
}
const slider: React.CSSProperties = {
  width: '100%', accentColor: TOKENS.terra, flexShrink: 0,
};

// ─── COVER styles ─────────────────────────────────────────────────────
const coverLeftInner: React.CSSProperties = {
  position: 'absolute', inset: 0,
  background: TOKENS.page,
  padding: `${TOKENS.padTop}px ${TOKENS.padSide}px 0`,
  display: 'flex', flexDirection: 'column',
  overflow: 'hidden',
};
const coverChip: React.CSSProperties = {
  alignSelf: 'flex-start',
  padding: '8px 16px',
  background: TOKENS.terra,
  color: '#fff',
  fontFamily: TOKENS.fontSans,
  fontSize: 11, fontWeight: 800, letterSpacing: '0.18em',
};
const coverTitleWord: React.CSSProperties = {
  fontFamily: TOKENS.fontDisplay,
  fontSize: 'clamp(40px, 6.2vw, 86px)',
  lineHeight: 1.02,
  color: TOKENS.ink,
  letterSpacing: '-0.01em',
  textTransform: 'uppercase',
};
const coverRule: React.CSSProperties = {
  width: 64, height: 5, background: TOKENS.ink,
  marginTop: 26, transformOrigin: 'left',
};
const coverMetaLines: React.CSSProperties = {
  marginTop: 18,
  fontFamily: TOKENS.fontSans,
  fontSize: 13.5, lineHeight: 1.5,
  color: TOKENS.inkSoft,
  fontWeight: 500,
  maxWidth: 340,
};
const coverShapesRow: React.CSSProperties = {
  marginTop: 'auto',
  display: 'flex', alignItems: 'flex-end', gap: 14,
  height: 130,
};
const coverShape: React.CSSProperties = {
  flex: 1, height: 110,
};
const coverRightInner: React.CSSProperties = {
  position: 'absolute', inset: 0,
  background: TOKENS.terra,
  overflow: 'hidden',
};
const coverHalfCircle: React.CSSProperties = {
  position: 'absolute', left: '-14%', bottom: '-12%',
  width: '46%', aspectRatio: '1 / 1',
  borderRadius: 999,
  background: TOKENS.mustard,
};
const coverArchWindow: React.CSSProperties = {
  position: 'absolute',
  left: '14%', right: '14%', top: '11%', bottom: '17%',
  borderRadius: '999px 999px 0 0',
  background: TOKENS.panel,
  overflow: 'hidden',
  boxShadow: '0 30px 60px rgba(0,0,0,0.25)',
};
const coverArchImg: React.CSSProperties = {
  width: '100%', height: '100%', objectFit: 'cover',
  userSelect: 'none',
};
const coverVerticalLabel: React.CSSProperties = {
  position: 'absolute',
  right: 16, top: '50%',
  transform: 'translateY(-50%) rotate(-90deg)',
  transformOrigin: 'center',
  fontFamily: TOKENS.fontSans,
  fontSize: 10, fontWeight: 800,
  letterSpacing: '0.4em',
  textTransform: 'uppercase',
  color: 'rgba(255,255,255,0.92)',
  whiteSpace: 'nowrap',
};
const coverDotTL: React.CSSProperties = {
  position: 'absolute', left: '8%', top: '6%',
  width: 26, height: 26, borderRadius: 999,
  background: TOKENS.teal,
};

// ─── WELCOME styles ──────────────────────────────────────────────────
const welcomeLeftStyle: React.CSSProperties = {
  position: 'absolute', inset: 0,
  background: TOKENS.terra,
  padding: `${TOKENS.padTop + 12}px ${TOKENS.padSide}px ${TOKENS.padBottom}px`,
  display: 'flex', flexDirection: 'column',
  overflow: 'hidden',
};
const welcomeLeftArch: React.CSSProperties = {
  position: 'absolute', right: '-16%', top: '-22%',
  width: '54%', aspectRatio: '1 / 1.5',
  borderRadius: '0 0 999px 999px',
  background: 'rgba(255,255,255,0.12)',
};
const welcomeEyebrow: React.CSSProperties = {
  fontFamily: TOKENS.fontSans,
  fontSize: 10.5, fontWeight: 800, letterSpacing: '0.26em',
  color: 'rgba(255,255,255,0.8)',
};
const welcomeTitle: React.CSSProperties = {
  fontFamily: TOKENS.fontDisplay,
  fontSize: 'clamp(34px, 4.6vw, 62px)',
  color: '#fff', lineHeight: 1,
  letterSpacing: '-0.01em',
};
const welcomeList: React.CSSProperties = {
  marginTop: 34,
  display: 'flex', flexDirection: 'column', gap: 0,
  overflow: 'hidden',
};
const welcomeListRow: React.CSSProperties = {
  display: 'flex', alignItems: 'baseline', gap: 12,
  padding: '11px 0',
  borderBottom: '1px solid rgba(255,255,255,0.22)',
};
const welcomeListName: React.CSSProperties = {
  fontFamily: TOKENS.fontSans,
  fontSize: 14.5, fontWeight: 700, color: '#fff',
  textTransform: 'uppercase', letterSpacing: '0.06em',
  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
};
const welcomeListDots: React.CSSProperties = { flex: 1 };
const welcomeListCount: React.CSSProperties = {
  fontFamily: TOKENS.fontMono,
  fontSize: 12, color: 'rgba(255,255,255,0.85)',
  letterSpacing: '0.1em',
};
const welcomeRightStyle: React.CSSProperties = {
  position: 'absolute', inset: 0,
  background: TOKENS.page,
  padding: `${TOKENS.padTop + 8}px ${TOKENS.padSide}px ${TOKENS.padBottom + 8}px`,
  display: 'flex', alignItems: 'center',
};
const welcomeGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 22,
  width: '100%',
};
const welcomeCardStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 6,
};
const welcomeCardFrame: React.CSSProperties = {
  aspectRatio: '1 / 1.06',
  display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
  overflow: 'hidden',
  padding: 12,
};
const welcomeCardImage: React.CSSProperties = {
  maxWidth: '82%', maxHeight: '86%', objectFit: 'contain', userSelect: 'none',
  filter: 'drop-shadow(0 10px 14px rgba(0,0,0,0.14))',
};
const welcomeCardName: React.CSSProperties = {
  fontFamily: TOKENS.fontSans,
  fontSize: 14, fontWeight: 800, color: TOKENS.ink,
  letterSpacing: '0.02em', textTransform: 'uppercase',
  marginTop: 6,
};
const welcomeCardCount: React.CSSProperties = {
  fontFamily: TOKENS.fontSans,
  fontSize: 10.5, fontWeight: 600, color: TOKENS.mute,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
};

// ─── BRAND INTRO styles ──────────────────────────────────────────────
const brandIntroLeftStyle: React.CSSProperties = {
  position: 'absolute', inset: 0,
  overflow: 'hidden',
};
const brandIntroArch: React.CSSProperties = {
  position: 'absolute',
  left: '16%', right: '16%', top: '14%', bottom: '14%',
  borderRadius: '999px 999px 0 0',
  display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
  overflow: 'hidden',
  padding: '10% 7% 7%',
};
const brandIntroArchImg: React.CSSProperties = {
  maxWidth: '94%', maxHeight: '94%',
  objectFit: 'contain',
  filter: 'drop-shadow(0 24px 32px rgba(0,0,0,0.22))',
  userSelect: 'none',
};
const brandIntroCircle: React.CSSProperties = {
  position: 'absolute',
  left: '9%', bottom: '9%',
  width: '17%', aspectRatio: '1 / 1',
  borderRadius: 999,
  boxShadow: '0 14px 26px rgba(0,0,0,0.2)',
};
const brandIntroVertical: React.CSSProperties = {
  position: 'absolute',
  left: 14, top: '50%',
  transform: 'translateY(-50%) rotate(-90deg)',
  transformOrigin: 'center',
  fontFamily: TOKENS.fontSans,
  fontSize: 10, fontWeight: 800,
  letterSpacing: '0.38em',
  whiteSpace: 'nowrap',
  opacity: 0.9,
};
const brandIntroRightStyle: React.CSSProperties = {
  position: 'absolute', inset: 0,
  background: TOKENS.page,
  padding: `${TOKENS.padTop}px ${TOKENS.padSide}px ${TOKENS.padBottom}px`,
  display: 'flex', flexDirection: 'column',
};
const brandLogoTop: React.CSSProperties = {
  position: 'absolute', top: 46, left: TOKENS.padSide,
  width: 76, height: 'auto', objectFit: 'contain',
  zIndex: 3,
};
const brandIntroEyebrow: React.CSSProperties = {
  fontFamily: TOKENS.fontSans,
  fontSize: 10.5, fontWeight: 800,
  textTransform: 'uppercase',
};
const brandIntroName: React.CSSProperties = {
  fontFamily: TOKENS.fontDisplay,
  fontSize: 'clamp(36px, 5vw, 72px)',
  lineHeight: 1,
  color: TOKENS.ink,
  letterSpacing: '-0.01em',
  wordBreak: 'break-word',
};
const brandIntroBar: React.CSSProperties = {
  width: 84, height: 6, marginTop: 22,
  transformOrigin: 'left',
};
const brandIntroChannel: React.CSSProperties = {
  marginTop: 16,
  fontFamily: TOKENS.fontSans,
  fontSize: 13.5, fontWeight: 500, lineHeight: 1.55,
  color: TOKENS.inkSoft,
  maxWidth: 360,
};

// ─── PRODUCT styles ──────────────────────────────────────────────────
const productLeftInner: React.CSSProperties = {
  position: 'absolute', inset: 0,
  background: TOKENS.page,
  overflow: 'hidden',
};
const offreChip: React.CSSProperties = {
  position: 'absolute', top: 0, right: 0,
  padding: '9px 18px 9px 24px',
  color: '#fff',
  fontFamily: TOKENS.fontSans,
  fontSize: 10, fontWeight: 800, letterSpacing: '0.18em',
  clipPath: 'polygon(12px 0, 100% 0, 100% 100%, 0 100%)',
  zIndex: 8,
};
const productArch: React.CSSProperties = {
  position: 'absolute',
  left: '15%', right: '15%', top: '13%', bottom: '15%',
  borderRadius: '999px 999px 0 0',
  display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
  overflow: 'visible',
  padding: '12% 6% 6%',
};
const productArchImg: React.CSSProperties = {
  maxWidth: '92%', maxHeight: '100%',
  objectFit: 'contain',
  filter: 'drop-shadow(0 22px 28px rgba(0,0,0,0.2))',
  userSelect: 'none',
};
const priceTagCircle: React.CSSProperties = {
  position: 'absolute',
  right: '9%', bottom: '10%',
  width: 88, height: 88, borderRadius: 999,
  display: 'flex', flexDirection: 'column',
  alignItems: 'center', justifyContent: 'center',
  fontFamily: TOKENS.fontSans,
  boxShadow: '0 12px 24px rgba(0,0,0,0.22)',
  zIndex: 6,
};
const remiseRoundel: React.CSSProperties = {
  position: 'absolute', top: '4%', right: '-6%',
  width: 110, height: 110, borderRadius: 999,
  color: '#fff',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  boxShadow: '0 14px 26px rgba(0,0,0,0.22), inset 0 0 0 1px rgba(255,255,255,0.2)',
  zIndex: 6,
};
const remiseRoundelNum: React.CSSProperties = {
  fontFamily: TOKENS.fontDisplay,
  fontSize: 30, lineHeight: 1,
};
const freeSatellite: React.CSSProperties = {
  position: 'absolute',
  left: '6%', bottom: '7%',
  width: '26%', aspectRatio: '1 / 1',
  borderRadius: 999,
  background: '#fff',
  border: `1px solid ${TOKENS.rule}`,
  boxShadow: '0 16px 30px rgba(0,0,0,0.18)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  zIndex: 6,
};
const freeSatelliteImg: React.CSSProperties = {
  maxWidth: '72%', maxHeight: '72%', objectFit: 'contain', userSelect: 'none',
};
const freeSatelliteTag: React.CSSProperties = {
  position: 'absolute', bottom: -10, left: '50%',
  transform: 'translateX(-50%)',
  padding: '4px 12px', borderRadius: 999,
  background: TOKENS.charcoal, color: '#fff',
  fontFamily: TOKENS.fontSans,
  fontSize: 9.5, fontWeight: 800, letterSpacing: '0.12em',
  whiteSpace: 'nowrap',
};
const productRightInner: React.CSSProperties = {
  position: 'absolute', inset: 0,
  background: TOKENS.page,
  padding: `${TOKENS.padTop}px ${TOKENS.padSide}px ${TOKENS.padBottom}px`,
  display: 'flex', flexDirection: 'column',
};
const eyebrowStyle: React.CSSProperties = {
  fontFamily: TOKENS.fontSans,
  fontSize: 11, fontWeight: 800, letterSpacing: '0.2em',
  display: 'flex', alignItems: 'center', gap: 10,
};
const eyebrowDash: React.CSSProperties = {
  width: 34, height: 3, display: 'inline-block',
};
const titleStyle: React.CSSProperties = {
  fontFamily: TOKENS.fontDisplay,
  fontSize: 'clamp(22px, 2.6vw, 36px)',
  lineHeight: 1.12,
  color: TOKENS.ink,
  letterSpacing: '0',
  textTransform: 'uppercase',
  display: '-webkit-box',
  WebkitLineClamp: 3,
  WebkitBoxOrient: 'vertical' as any,
  overflow: 'hidden',
};
const hairlineStyle: React.CSSProperties = {
  width: '100%', height: 1, background: TOKENS.rule,
  marginTop: 22, transformOrigin: 'left',
};
const priceSection: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 6,
  marginTop: 22,
};
const priceEyebrow: React.CSSProperties = {
  fontFamily: TOKENS.fontSans,
  fontSize: 9.5, fontWeight: 800, letterSpacing: '0.22em',
  color: TOKENS.mute,
};
const priceInteger: React.CSSProperties = {
  fontFamily: TOKENS.fontDisplay,
  fontSize: 42, color: TOKENS.ink,
  letterSpacing: '-0.01em', lineHeight: 1,
  fontVariantNumeric: 'tabular-nums' as any,
};
const priceCurrency: React.CSSProperties = {
  fontFamily: TOKENS.fontSans,
  fontSize: 17, fontWeight: 800,
};
const priceBrut: React.CSSProperties = {
  fontFamily: TOKENS.fontSans,
  fontSize: 12, marginTop: 2, fontWeight: 500,
  display: 'flex', alignItems: 'baseline',
};
const offerBlock: React.CSSProperties = {
  marginTop: 22,
  padding: '18px 20px',
  color: '#fff',
  display: 'flex', flexDirection: 'column', gap: 8,
  borderRadius: 4,
};
const offerEyebrow: React.CSSProperties = {
  fontFamily: TOKENS.fontSans,
  fontSize: 9.5, fontWeight: 800, letterSpacing: '0.24em',
  opacity: 0.85,
};
const offerLockup: React.CSSProperties = {
  display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap',
};
const offerBigNum: React.CSSProperties = {
  fontFamily: TOKENS.fontDisplay,
  fontSize: 40, lineHeight: 1,
  fontVariantNumeric: 'tabular-nums' as any,
};
const offerPlus: React.CSSProperties = {
  fontFamily: TOKENS.fontDisplay,
  fontSize: 26, margin: '0 6px',
  opacity: 0.9,
};
const offerTagline: React.CSSProperties = {
  fontFamily: TOKENS.fontSans,
  fontSize: 13, fontWeight: 600, lineHeight: 1.45,
};
const offerTexte: React.CSSProperties = {
  fontFamily: TOKENS.fontSans,
  fontSize: 11, fontWeight: 500, fontStyle: 'italic',
  opacity: 0.85,
  borderTop: '1px dashed rgba(255,255,255,0.4)',
  paddingTop: 8,
};
const colisageCard: React.CSSProperties = {
  background: TOKENS.panel,
  borderRadius: 4,
  padding: '16px 20px',
  display: 'flex', flexDirection: 'column', gap: 9,
};
const colisageHead: React.CSSProperties = {
  fontFamily: TOKENS.fontSans,
  fontSize: 9.5, fontWeight: 800, letterSpacing: '0.22em',
  color: TOKENS.mute,
};
const colisageRow: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
};
const colisageLabel: React.CSSProperties = {
  fontFamily: TOKENS.fontSans,
  fontSize: 12.5, fontWeight: 500, color: TOKENS.inkSoft,
};
const colisageValue: React.CSSProperties = {
  fontFamily: TOKENS.fontSans,
  fontSize: 12.5, fontWeight: 700, color: TOKENS.ink,
  fontVariantNumeric: 'tabular-nums' as any,
};

// ─── GRID styles ─────────────────────────────────────────────────────
const gridHalfStyle: React.CSSProperties = {
  position: 'absolute', inset: 0,
  background: TOKENS.page,
  padding: `${TOKENS.padTop}px ${TOKENS.padSide}px ${TOKENS.padBottom}px`,
  display: 'flex', flexDirection: 'column',
};
const gridGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gridAutoRows: '1fr',
  gap: 18, flex: 1, minHeight: 0,
};
const cardStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 5,
  height: '100%', minHeight: 0,
};
const cardImageWrapStyle: React.CSSProperties = {
  flex: 1, minHeight: 0,
  display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
  position: 'relative',
  overflow: 'visible',
  padding: '14% 8% 8%',
};
const cardImageStyle: React.CSSProperties = {
  maxWidth: '86%', maxHeight: '100%', objectFit: 'contain',
  userSelect: 'none',
  filter: 'drop-shadow(0 8px 10px rgba(0,0,0,0.12))',
};
const cardPriceTagStyle: React.CSSProperties = {
  position: 'absolute',
  top: -6, right: -6,
  width: 50, height: 50,
  borderRadius: 999,
  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
  fontFamily: TOKENS.fontSans,
  fontWeight: 800, fontSize: 14,
  letterSpacing: '-0.01em',
  lineHeight: 1,
  boxShadow: '0 6px 14px rgba(0,0,0,0.18)',
  zIndex: 2,
};
const cardPromoBadgeStyle: React.CSSProperties = {
  position: 'absolute',
  top: 8, left: 8,
  padding: '3px 9px',
  background: TOKENS.charcoal,
  color: '#fff',
  fontFamily: TOKENS.fontSans,
  fontSize: 8.5, fontWeight: 800,
  letterSpacing: '0.16em',
  borderRadius: 999,
  zIndex: 2,
};
const cardNameStyle: React.CSSProperties = {
  fontFamily: TOKENS.fontSans,
  fontSize: 12.5, fontWeight: 800,
  color: TOKENS.ink, letterSpacing: '0.01em',
  lineHeight: 1.2,
  textTransform: 'uppercase',
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical' as any,
  overflow: 'hidden',
  marginTop: 6,
};
const cardColisageStyle: React.CSSProperties = {
  fontFamily: TOKENS.fontSans,
  fontSize: 10, fontWeight: 600, color: TOKENS.mute,
  letterSpacing: '0.08em', textTransform: 'uppercase',
};

// ─── BACK styles ─────────────────────────────────────────────────────
const backLeftStyle: React.CSSProperties = {
  position: 'absolute', inset: 0,
  background: TOKENS.page,
  overflow: 'hidden',
};
const backLeftArch: React.CSSProperties = {
  position: 'absolute',
  left: '22%', right: '22%', top: '20%', bottom: 0,
  borderRadius: '999px 999px 0 0',
  background: TOKENS.tealSoft,
};
const backLeftCircle: React.CSSProperties = {
  position: 'absolute',
  left: '14%', bottom: '14%',
  width: 90, height: 90, borderRadius: 999,
  background: TOKENS.mustard,
};
const backLeftLabel: React.CSSProperties = {
  position: 'absolute', top: 28, left: TOKENS.padSide,
  fontFamily: TOKENS.fontSans,
  fontSize: 9.5, fontWeight: 800, letterSpacing: '0.24em',
  color: TOKENS.mute,
};
const backRightStyle: React.CSSProperties = {
  position: 'absolute', inset: 0,
  background: TOKENS.terra,
  display: 'flex', flexDirection: 'column',
  alignItems: 'flex-start', justifyContent: 'flex-end',
  padding: `${TOKENS.padTop}px ${TOKENS.padSide}px ${TOKENS.padBottom + 18}px`,
  overflow: 'hidden',
};
const backTitle: React.CSSProperties = {
  fontFamily: TOKENS.fontDisplay,
  fontSize: 'clamp(46px, 6vw, 92px)',
  color: '#fff', lineHeight: 1,
};
const backMeta: React.CSSProperties = {
  marginTop: 16,
  fontFamily: TOKENS.fontSans,
  fontSize: 12.5, fontWeight: 600, letterSpacing: '0.08em',
  color: 'rgba(255,255,255,0.92)',
  textTransform: 'uppercase',
};

// ─── ToC ──────────────────────────────────────────────────────────────
const tocStyle: React.CSSProperties = {
  position: 'absolute', top: 0, right: 0, bottom: 0,
  width: 300, background: '#fff',
  borderLeft: `1px solid ${TOKENS.rule}`,
  display: 'flex', flexDirection: 'column', zIndex: 20,
};
const tocHeader: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  padding: '14px 16px',
  borderBottom: `1px solid ${TOKENS.rule}`,
  background: TOKENS.panel,
  fontFamily: TOKENS.fontSans,
};
function tocItem(active: boolean): React.CSSProperties {
  return {
    display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
    padding: '13px 16px', cursor: 'pointer',
    background: active ? `${TOKENS.terra}12` : 'transparent',
    borderLeft: active ? `3px solid ${TOKENS.terra}` : '3px solid transparent',
    color: active ? TOKENS.terraDeep : TOKENS.ink,
    transition: 'background 120ms',
    fontFamily: TOKENS.fontSans,
  };
}

// ─── Loading / empty ──────────────────────────────────────────────────
const loadingBox: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', alignItems: 'center',
  justifyContent: 'center', padding: '80px 20px',
  background: '#fff', border: `1px solid ${TOKENS.rule}`, borderRadius: 8,
};
const emptyBox: React.CSSProperties = {
  ...loadingBox, padding: '100px 20px',
};
const spinnerKeyframes = `
@keyframes pc-spin { to { transform: rotate(360deg); } }
.pc-spinner {
  width: 40px; height: 40px; border-radius: 50%;
  border: 3px solid #f4f4f5;
  border-top-color: ${TOKENS.terra};
  animation: pc-spin 0.9s linear infinite;
}
@keyframes pc-corner-pulse {
  0%, 100% { filter: drop-shadow(0 0 0 rgba(217,81,44,0)); }
  50%      { filter: drop-shadow(0 0 20px rgba(217,81,44,0.5)); }
}
.pc-corner-pulse {
  animation: pc-corner-pulse 1.5s ease-in-out infinite;
}
`;
