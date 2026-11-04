import { useEffect, useState } from 'react';
import { DeckMetaForm, Toast } from '@amafin/ui';
import { PageShell, PC_ACCENT, PC_ACCENT2 } from './PageShell';
import * as api from '../api';
import { usePlanCommercial } from '../store/usePlanCommercial';

export function PlanCommercialDeckPage() {
  const { state, refreshState } = usePlanCommercial();
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => { if (!state) refreshState(); }, [state, refreshState]);

  if (!state) return <PageShell title="Deck"><div>Chargement…</div></PageShell>;

  // Debounced auto-save: every change PUTs the meta. Single-user, low-traffic
  // backend — no need to be cleverer than that.
  async function saveMeta(patch: Partial<typeof state>) {
    try {
      const next = await api.updateMeta(patch as any);
      usePlanCommercial.setState({ state: next });
    } catch (e: any) {
      setToast({ message: e?.message ?? 'Erreur', type: 'error' });
    }
  }

  return (
    <PageShell title="Deck" subtitle="Métadonnées et images globales du plan.">
      <DeckMetaForm
        meta={state}
        accent={PC_ACCENT}
        accent2={PC_ACCENT2}
        onChange={(patch) => {
          // Optimistic local update; persist in the background
          usePlanCommercial.setState({ state: { ...state, ...patch } as any });
          saveMeta(patch as any);
        }}
        onUploadGlobal={async (kind, file) => {
          try {
            const next = await api.uploadGlobalImage(kind, file);
            usePlanCommercial.setState({ state: next, previewBust: Date.now() });
            setToast({ message: 'Image chargée', type: 'success' });
          } catch (e: any) {
            setToast({ message: e?.message ?? 'Erreur', type: 'error' });
          }
        }}
        onClearGlobal={async (kind) => {
          const next = await api.clearGlobalImage(kind);
          usePlanCommercial.setState({ state: next, previewBust: Date.now() });
        }}
        resolveImage={api.imageUrl}
        // canal param → the ribbon follows the dropdown instantly.
        bannerPreviewSrc={`/api/preview/banner?canal=${encodeURIComponent(state.canal || '')}`}
      />
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </PageShell>
  );
}
