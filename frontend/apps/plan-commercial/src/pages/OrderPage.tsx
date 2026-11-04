import { useEffect, useMemo, useState } from 'react';
import { SectionCard, Toast } from '@amafin/ui';
import {
  DndContext, PointerSensor, useSensor, useSensors, closestCenter,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, verticalListSortingStrategy, useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ListOrdered, GripVertical, Search, ChevronDown, ChevronRight, Tag, Wand2 } from 'lucide-react';
import { PageShell, PC_ACCENT, pcButton } from './PageShell';
import * as api from '../api';
import { usePlanCommercial } from '../store/usePlanCommercial';

/**
 * Two-level reordering, now drag-first:
 *   • OUTER — drag a whole brand block by its header grip. `moveBrand(brand, N)`.
 *   • INNER — drag a SKU row by its grip inside its own brand block.
 *     `moveProductInBrand(idx, N)`. Number inputs are kept as a precise
 *     fallback (jump 40 positions without 40 drags).
 *
 * Both layers are remembered in SQLite (sku_priority + brand_priority) and
 * survive Excel/SAP re-imports — see `apply_stored_priority` on the backend.
 *
 * Dragging is disabled while the search filter is active: positions in a
 * filtered list don't map 1:1 to real positions, so a drop there would move
 * rows somewhere the user doesn't expect.
 */

// ── Sortable brand block ────────────────────────────────────────────────
function SortableBrand({
  brand, children, dragDisabled,
}: {
  brand: string;
  children: (handleProps: Record<string, any>) => React.ReactNode;
  dragDisabled: boolean;
}) {
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging,
  } = useSortable({ id: `brand:${brand}`, disabled: dragDisabled });
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.65 : 1,
        zIndex: isDragging ? 10 : undefined,
        position: 'relative',
      }}
    >
      {children({ ...attributes, ...listeners })}
    </div>
  );
}

// ── Sortable SKU row ────────────────────────────────────────────────────
function SortableSku({
  id, children, dragDisabled,
}: {
  id: string;
  children: (handleProps: Record<string, any>) => React.ReactNode;
  dragDisabled: boolean;
}) {
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging,
  } = useSortable({ id, disabled: dragDisabled });
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.65 : 1,
        background: isDragging ? '#FFF7ED' : undefined,
        position: 'relative',
        zIndex: isDragging ? 10 : undefined,
      }}
    >
      {children({ ...attributes, ...listeners })}
    </div>
  );
}

const gripStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  width: 22, height: 22, borderRadius: 5, border: 'none',
  background: 'transparent', color: '#c4c4c8', cursor: 'grab',
  touchAction: 'none',
};

export function PlanCommercialOrderPage() {
  const { state, products, refreshState, refreshProducts, bumpPreview, previewBust } = usePlanCommercial();
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [search, setSearch] = useState('');
  // Per-row buffers. SKU drafts keyed by global index; brand drafts by name.
  const [skuDrafts, setSkuDrafts] = useState<Record<number, string>>({});
  const [brandDrafts, setBrandDrafts] = useState<Record<string, string>>({});
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const sensors = useSensors(
    // 6px activation distance so plain clicks (collapse, inputs) never
    // start a drag by accident.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  useEffect(() => { refreshProducts(); refreshState(); }, [refreshProducts, refreshState]);
  useEffect(() => { setSkuDrafts({}); setBrandDrafts({}); }, [products.length, products]);

  const isDetail = ((state?.canal || '').toLowerCase()).includes('detail')
    || ((state?.canal || '').toLowerCase()).includes('détail');
  // Gros uses one catalogue-wide family list; Détail has one per marque.
  const presetLabel = isDetail ? (state?.marque || 'MIO') : 'Gros';

  async function applyDefaultOrder() {
    if (!confirm(
      `Réordonner les ${products.length} produits selon l'ordre par défaut ` +
      `${presetLabel} (familles : poudre main, IRIS, Matic, A+, Javel…) ? ` +
      "L'ordre actuel sera remplacé.",
    )) return;
    try {
      const r = await api.applyDefaultOrder();
      await refreshProducts();
      bumpPreview();
      setToast({
        message: `Ordre ${r.marque} appliqué — ${r.matched}/${r.total} produits reconnus par famille.`,
        type: 'success',
      });
    } catch (e: any) {
      setToast({ message: e?.response?.data?.detail ?? 'Échec', type: 'error' });
    }
  }

  const dragDisabled = search.trim().length > 0;

  // Group products by sous_groupe (= brand). Preserve current order — the
  // brand_priority is mirrored from this every save, so the iteration order
  // IS the brand order.
  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const seen: string[] = [];
    const byBrand: Record<string, Array<{ row: any; idx: number }>> = {};
    products.forEach((p: any, idx: number) => {
      const brand = (p.sous_groupe || '').trim() || '(sans marque)';
      if (!byBrand[brand]) { byBrand[brand] = []; seen.push(brand); }
      // Filter by search at SKU level — empty groups are auto-hidden.
      if (!q
        || (p.nom || '').toLowerCase().includes(q)
        || (p.groupe || '').toLowerCase().includes(q)
        || brand.toLowerCase().includes(q)
      ) {
        byBrand[brand].push({ row: p, idx });
      }
    });
    return seen
      .map((brand, brandPos) => ({
        brand,
        brandPos,
        items: byBrand[brand],
      }))
      .filter((g) => g.items.length > 0);
  }, [products, search]);

  async function commitSkuMove(idx: number, raw: string) {
    const parsed = parseInt(raw, 10);
    if (!Number.isFinite(parsed) || parsed < 1) {
      setSkuDrafts((d) => { const { [idx]: _, ...rest } = d; return rest; });
      return;
    }
    try {
      const r = await api.moveProductInBrand(idx, parsed);
      await refreshProducts();
      bumpPreview();
      setToast({
        message: `${r.brand} · position ${r.from + 1} → ${r.to + 1}`,
        type: 'success',
      });
    } catch (e: any) {
      setToast({ message: e?.response?.data?.detail ?? 'Échec du déplacement', type: 'error' });
    }
  }

  async function commitBrandMove(brand: string, raw: string) {
    const parsed = parseInt(raw, 10);
    if (!Number.isFinite(parsed) || parsed < 1) {
      setBrandDrafts((d) => { const { [brand]: _, ...rest } = d; return rest; });
      return;
    }
    try {
      const r = await api.moveBrand(brand, parsed);
      await refreshProducts();
      bumpPreview();
      setToast({
        message: `Marque «${brand}» : position ${r.from + 1} → ${r.to + 1}`,
        type: 'success',
      });
    } catch (e: any) {
      setToast({ message: e?.response?.data?.detail ?? 'Échec du déplacement de marque', type: 'error' });
    }
  }

  // ── Drag handlers ──
  async function onBrandDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = String(active.id).replace('brand:', '');
    const toBrand = String(over.id).replace('brand:', '');
    const target = groups.findIndex((g) => g.brand === toBrand);
    if (target === -1) return;
    await commitBrandMove(from, String(target + 1));
  }

  function makeSkuDragEnd(items: Array<{ row: any; idx: number }>) {
    return async (e: DragEndEvent) => {
      const { active, over } = e;
      if (!over || active.id === over.id) return;
      const fromIdx = Number(String(active.id).replace('sku:', ''));
      const overIdx = Number(String(over.id).replace('sku:', ''));
      const targetWithin = items.findIndex((it) => it.idx === overIdx);
      if (targetWithin === -1) return;
      await commitSkuMove(fromIdx, String(targetWithin + 1));
    };
  }

  const totalBrands = useMemo(() => {
    const s = new Set<string>();
    products.forEach((p: any) => s.add((p.sous_groupe || '').trim() || '(sans marque)'));
    return s.size;
  }, [products]);

  return (
    <PageShell
      title="Ordre des slides"
      subtitle={`Glissez les marques et les SKUs pour réordonner (${totalBrands} marques, ${products.length} SKUs). Tout est mémorisé et survit aux ré-imports Excel/SAP.`}
    >
      <SectionCard
        icon={<ListOrdered size={16} />}
        accent={PC_ACCENT}
        title="Ordre des marques + ordre des SKUs"
        subtitle="Attrapez la poignée ⠿ d'une marque pour déplacer tout son bloc, ou celle d'un SKU pour le déplacer dans sa marque. Les champs numériques restent disponibles pour un saut précis."
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <div style={{ position: 'relative', flex: 1, maxWidth: 360 }}>
            <Search size={14} style={{
              position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
              color: '#a1a1aa', pointerEvents: 'none',
            }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filtrer par marque, SKU ou groupe…"
              style={{
                width: '100%', padding: '8px 10px 8px 32px',
                border: '1px solid #e4e4e7', borderRadius: 8,
                fontSize: 12.5, background: '#fff',
              }}
            />
          </div>
          <div style={{ color: '#71717a', fontSize: 11.5 }}>
            {groups.reduce((s, g) => s + g.items.length, 0)} SKUs sur {products.length}
            {dragDisabled && (
              <span style={{ color: PC_ACCENT, marginLeft: 8, fontWeight: 600 }}>
                — glisser désactivé pendant la recherche
              </span>
            )}
          </div>
          <button
            onClick={applyDefaultOrder}
            title={`Réordonne par famille de produits selon la liste ${presetLabel} (poudre main → IRIS → Matic → A+ → Javel → …)`}
            style={{ ...pcButton.base, ...pcButton.primary, marginLeft: 'auto' }}
          >
            <Wand2 size={13} /> Ordre par défaut {presetLabel}
          </button>
        </div>

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onBrandDragEnd}>
          <SortableContext
            items={groups.map((g) => `brand:${g.brand}`)}
            strategy={verticalListSortingStrategy}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {groups.map(({ brand, brandPos, items }) => {
                const brandDraft = brandDrafts[brand];
                const open = collapsed[brand] !== true;
                return (
                  <SortableBrand key={brand} brand={brand} dragDisabled={dragDisabled}>
                    {(brandHandle) => (
                      <div style={{
                        border: '1px solid #e4e4e7', borderRadius: 8, background: '#fff', overflow: 'hidden',
                      }}>
                        {/* Brand header */}
                        <div style={{
                          display: 'grid',
                          gridTemplateColumns: '26px 36px 1fr 200px',
                          padding: '12px 14px',
                          background: `linear-gradient(90deg, ${PC_ACCENT}1A, #ffffff)`,
                          borderBottom: open ? '1px solid #e4e4e7' : 'none',
                          alignItems: 'center', gap: 10,
                        }}>
                          <button
                            {...brandHandle}
                            style={{ ...gripStyle, cursor: dragDisabled ? 'default' : 'grab' }}
                            title={dragDisabled ? 'Effacez la recherche pour glisser' : 'Glisser la marque'}
                          >
                            <GripVertical size={15} />
                          </button>
                          <button
                            onClick={() => setCollapsed((c) => ({ ...c, [brand]: open }))}
                            style={{
                              width: 28, height: 28, border: 'none', background: 'transparent',
                              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}
                            title={open ? 'Replier' : 'Déplier'}
                          >
                            {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                          </button>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <Tag size={14} style={{ color: PC_ACCENT }} />
                            <span style={{ fontSize: 14, fontWeight: 700, color: '#18181b' }}>{brand}</span>
                            <span style={{ fontSize: 11.5, color: '#71717a' }}>
                              · {items.length} SKU{items.length > 1 ? 's' : ''}
                            </span>
                            <span style={{ fontSize: 11.5, color: '#a1a1aa', marginLeft: 'auto' }}>
                              Position globale de la marque : #{brandPos + 1}
                            </span>
                          </div>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                            <span style={{ fontSize: 11, color: '#71717a' }}>Position marque</span>
                            <input
                              type="number" min={1}
                              value={brandDraft ?? ''}
                              placeholder={String(brandPos + 1)}
                              onChange={(e) => setBrandDrafts((d) => ({ ...d, [brand]: e.target.value }))}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
                                else if (e.key === 'Escape') {
                                  setBrandDrafts((d) => { const { [brand]: _, ...rest } = d; return rest; });
                                  (e.currentTarget as HTMLInputElement).blur();
                                }
                              }}
                              onBlur={(e) => {
                                const v = e.target.value.trim();
                                if (v) commitBrandMove(brand, v);
                              }}
                              style={{
                                width: 70, padding: '5px 8px', textAlign: 'center',
                                border: `1px solid ${brandDraft ? PC_ACCENT : '#d4d4d8'}`,
                                borderRadius: 6, fontSize: 12.5, fontWeight: 600,
                              }}
                            />
                          </label>
                        </div>

                        {/* Brand body */}
                        {open && (
                          <DndContext
                            sensors={sensors}
                            collisionDetection={closestCenter}
                            onDragEnd={makeSkuDragEnd(items)}
                          >
                            <div style={{
                              display: 'grid',
                              gridTemplateColumns: '26px 66px 90px 110px 1fr 160px',
                              padding: '8px 14px', background: '#fafafa',
                              borderBottom: '1px solid #f4f4f5',
                              fontSize: 10.5, fontWeight: 700, color: '#71717a',
                              letterSpacing: 0.3, textTransform: 'uppercase',
                              gap: 10, alignItems: 'center',
                            }}>
                              <div />
                              <div>Slide</div>
                              <div>Pos. globale</div>
                              <div>Pos. marque</div>
                              <div>SKU</div>
                              <div>Groupe / Canal</div>
                            </div>
                            <SortableContext
                              items={items.map(({ idx }) => `sku:${idx}`)}
                              strategy={verticalListSortingStrategy}
                            >
                              {items.map(({ row, idx }, withinIdx) => {
                                const draft = skuDrafts[idx];
                                return (
                                  <SortableSku key={idx} id={`sku:${idx}`} dragDisabled={dragDisabled}>
                                    {(skuHandle) => (
                                      <div
                                        style={{
                                          display: 'grid',
                                          gridTemplateColumns: '26px 66px 90px 110px 1fr 160px',
                                          padding: '7px 14px',
                                          borderBottom: '1px solid #f4f4f5',
                                          alignItems: 'center',
                                          fontSize: 12.5,
                                          gap: 10,
                                          background: '#fff',
                                        }}
                                      >
                                        <button
                                          {...skuHandle}
                                          style={{ ...gripStyle, cursor: dragDisabled ? 'default' : 'grab' }}
                                          title={dragDisabled ? 'Effacez la recherche pour glisser' : 'Glisser le SKU'}
                                        >
                                          <GripVertical size={13} />
                                        </button>
                                        {/* Mini slide thumbnail (server-cached) */}
                                        <div style={{
                                          width: 58, height: 33, borderRadius: 4, overflow: 'hidden',
                                          background: '#f8f8f8', border: '1px solid #ececee',
                                        }}>
                                          <img
                                            src={api.previewProductUrl(idx, previewBust, 0, 116)}
                                            alt=""
                                            loading="lazy"
                                            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                                            onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }}
                                          />
                                        </div>
                                        <div style={{ fontWeight: 700, color: '#18181b' }}>#{idx + 1}</div>
                                        <div>
                                          <input
                                            type="number" min={1} max={items.length}
                                            value={draft ?? ''}
                                            placeholder={String(withinIdx + 1)}
                                            onChange={(e) => setSkuDrafts((d) => ({ ...d, [idx]: e.target.value }))}
                                            onKeyDown={(e) => {
                                              if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
                                              else if (e.key === 'Escape') {
                                                setSkuDrafts((d) => { const { [idx]: _, ...rest } = d; return rest; });
                                                (e.currentTarget as HTMLInputElement).blur();
                                              }
                                            }}
                                            onBlur={(e) => {
                                              const v = e.target.value.trim();
                                              if (v) commitSkuMove(idx, v);
                                            }}
                                            style={{
                                              width: 64, padding: '4px 8px', textAlign: 'center',
                                              border: `1px solid ${draft ? PC_ACCENT : '#e4e4e7'}`,
                                              borderRadius: 6, fontSize: 12.5, fontWeight: 600,
                                            }}
                                          />
                                        </div>
                                        <div style={{ color: '#18181b', fontWeight: 500 }}>
                                          {row.nom || <span style={{ color: '#d4d4d8' }}>(sans nom)</span>}
                                        </div>
                                        <div style={{ color: '#71717a', fontSize: 12 }}>
                                          {row.groupe || '—'}
                                        </div>
                                      </div>
                                    )}
                                  </SortableSku>
                                );
                              })}
                            </SortableContext>
                          </DndContext>
                        )}
                      </div>
                    )}
                  </SortableBrand>
                );
              })}
              {groups.length === 0 && (
                <div style={{
                  padding: '24px 14px', border: '1px dashed #e4e4e7', borderRadius: 8,
                  color: '#a1a1aa', textAlign: 'center', fontSize: 12.5, background: '#fff',
                }}>
                  Aucun SKU à afficher.
                </div>
              )}
            </div>
          </SortableContext>
        </DndContext>
      </SectionCard>

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </PageShell>
  );
}
