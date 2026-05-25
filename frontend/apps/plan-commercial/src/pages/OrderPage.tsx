import { useEffect, useMemo, useState } from 'react';
import { SectionCard, Toast } from '@amafin/ui';
import { ListOrdered, GripVertical, Search } from 'lucide-react';
import { PageShell, PC_ACCENT } from './PageShell';
import * as api from '../api';
import { usePlanCommercial } from '../store/usePlanCommercial';

/**
 * Reorder SKUs by typing a target priority. The semantics match the user's
 * mental model: setting a row's priority to N moves it to the Nth position
 * and everyone else shifts to make room — whoever was at N drops to N+1, etc.
 *
 * The whole reshuffle happens server-side via a single `pop + insert` call
 * (`POST /api/products/{idx}/move`) so we never invent positions that diverge
 * from the deck's actual storage order — the rendered slide order IS this list.
 */
export function PlanCommercialOrderPage() {
  const { products, refreshProducts, bumpPreview } = usePlanCommercial();
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [search, setSearch] = useState('');
  // Per-row editable buffer keyed by SKU position-snapshot id. We use the
  // current array index because rows have no stable id field — refreshing
  // after a move re-keys everything correctly.
  const [drafts, setDrafts] = useState<Record<number, string>>({});

  useEffect(() => { refreshProducts(); }, [refreshProducts]);
  // Reset the per-row drafts whenever the list changes — otherwise drafts
  // would point at stale indices after a successful move.
  useEffect(() => { setDrafts({}); }, [products.length, products]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products.map((p, i) => ({ row: p, idx: i }));
    return products
      .map((p, i) => ({ row: p, idx: i }))
      .filter(({ row }) =>
        (row.nom || '').toLowerCase().includes(q) ||
        (row.groupe || '').toLowerCase().includes(q) ||
        (row.sous_groupe || '').toLowerCase().includes(q),
      );
  }, [products, search]);

  async function commitMove(idx: number, raw: string) {
    const parsed = parseInt(raw, 10);
    if (!Number.isFinite(parsed) || parsed < 1) {
      // Invalid input — just clear the draft so the cell reverts.
      setDrafts((d) => { const { [idx]: _, ...rest } = d; return rest; });
      return;
    }
    // No-op if user typed the row's current position.
    if (parsed === idx + 1) {
      setDrafts((d) => { const { [idx]: _, ...rest } = d; return rest; });
      return;
    }
    try {
      const r = await api.moveProduct(idx, parsed);
      await refreshProducts();
      bumpPreview();
      setToast({
        message: `Déplacé : position ${r.from + 1} → ${r.to + 1}`,
        type: 'success',
      });
    } catch (e: any) {
      setToast({
        message: e?.response?.data?.detail ?? "Échec du déplacement",
        type: 'error',
      });
    }
  }

  return (
    <PageShell
      title="Ordre des slides"
      subtitle="Tapez la priorité souhaitée d'un SKU (1 = premier). Les autres se décalent automatiquement."
    >
      <SectionCard
        icon={<ListOrdered size={16} />}
        accent={PC_ACCENT}
        title={`Priorité (${products.length} SKU${products.length > 1 ? 's' : ''})`}
        subtitle="Modifier le champ « Position » d'une ligne déclenche la réorganisation immédiatement (Entrée ou perte de focus)."
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
              placeholder="Filtrer par nom, groupe ou sous-groupe…"
              style={{
                width: '100%', padding: '8px 10px 8px 32px',
                border: '1px solid #e4e4e7', borderRadius: 8,
                fontSize: 12.5, color: '#18181b', background: '#fff',
              }}
            />
          </div>
          <div style={{ color: '#71717a', fontSize: 11.5 }}>
            {filtered.length} affiché{filtered.length > 1 ? 's' : ''} sur {products.length}
          </div>
        </div>

        <div style={{
          border: '1px solid #e4e4e7', borderRadius: 8, overflow: 'hidden',
          background: '#fff',
        }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: '80px 90px 1fr 200px 160px',
            padding: '10px 14px', background: '#fafafa',
            borderBottom: '1px solid #e4e4e7',
            fontSize: 11, fontWeight: 700, color: '#71717a', letterSpacing: 0.3,
            textTransform: 'uppercase',
          }}>
            <div>Position</div>
            <div>Nouvelle</div>
            <div>SKU</div>
            <div>Sous-groupe / Marque</div>
            <div>Groupe / Canal</div>
          </div>
          {filtered.length === 0 && (
            <div style={{ padding: '24px 14px', color: '#a1a1aa', fontSize: 12.5, textAlign: 'center' }}>
              Aucun SKU à afficher.
            </div>
          )}
          {filtered.map(({ row, idx }) => {
            const draft = drafts[idx];
            return (
              <div
                key={idx}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '80px 90px 1fr 200px 160px',
                  padding: '10px 14px',
                  borderBottom: '1px solid #f4f4f5',
                  alignItems: 'center',
                  fontSize: 12.5,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#52525b' }}>
                  <GripVertical size={13} style={{ color: '#d4d4d8' }} />
                  <span style={{ fontWeight: 700, color: '#18181b' }}>#{idx + 1}</span>
                </div>
                <div>
                  <input
                    type="number"
                    min={1}
                    max={products.length}
                    value={draft ?? ''}
                    placeholder={String(idx + 1)}
                    onChange={(e) => setDrafts((d) => ({ ...d, [idx]: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.currentTarget.blur();
                      } else if (e.key === 'Escape') {
                        setDrafts((d) => { const { [idx]: _, ...rest } = d; return rest; });
                        e.currentTarget.blur();
                      }
                    }}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v) commitMove(idx, v);
                    }}
                    style={{
                      width: 64, padding: '5px 8px', textAlign: 'center',
                      border: `1px solid ${draft ? PC_ACCENT : '#e4e4e7'}`,
                      borderRadius: 6, fontSize: 12.5, fontWeight: 600,
                      color: '#18181b', background: '#fff',
                    }}
                  />
                </div>
                <div style={{ color: '#18181b', fontWeight: 500 }}>
                  {row.nom || <span style={{ color: '#d4d4d8' }}>(sans nom)</span>}
                </div>
                <div style={{ color: '#52525b' }}>
                  {row.sous_groupe || '—'}
                </div>
                <div style={{ color: '#71717a', fontSize: 12 }}>
                  {row.groupe || '—'}
                </div>
              </div>
            );
          })}
        </div>
      </SectionCard>

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </PageShell>
  );
}
