import { useEffect, useMemo, useRef, useState } from 'react';
import { ArchiveBrowser, GeneratePanel, SectionCard, Toast, type ArchiveMonth } from '@amafin/ui';
import type { GenerateProgressSnapshot } from '@amafin/ui';
import { Archive, Sparkles } from 'lucide-react';
import { PageShell, PC_ACCENT, PC_GRADIENT } from './PageShell';
import * as api from '../api';
import { usePlanCommercial } from '../store/usePlanCommercial';

export function PlanCommercialGeneratePage() {
  const { products, refreshProducts, refreshAll } = usePlanCommercial();
  const [progress, setProgress] = useState<GenerateProgressSnapshot | null>(null);
  const [months, setMonths] = useState<ArchiveMonth[]>([]);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  async function reloadArchive() {
    try { setMonths(await api.listArchive()); } catch { /* best-effort */ }
  }
  useEffect(() => { reloadArchive(); }, []);
  // Mutable handle on the active poll loop so onGenerate can clean it up
  // even if a `setProgress` is in flight when the request finishes.
  const pollTimer = useRef<number | null>(null);

  useEffect(() => { refreshProducts(); }, [refreshProducts]);

  // Clean up the timer when the page unmounts mid-generation.
  useEffect(() => () => {
    if (pollTimer.current != null) window.clearInterval(pollTimer.current);
  }, []);

  function startPolling() {
    if (pollTimer.current != null) return;
    // First poll fires immediately — otherwise the bar stays empty for
    // the first 500ms which feels broken on a fast network.
    void pollOnce();
    pollTimer.current = window.setInterval(pollOnce, 500);
  }

  function stopPolling() {
    if (pollTimer.current != null) {
      window.clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
    setProgress(null);
  }

  async function pollOnce() {
    try {
      const p = await api.getGenerateProgress();
      // Only push to UI when the server says we're actually running;
      // otherwise we'd briefly flash the previous run's "100%" state.
      if (p.running && p.total > 0) {
        setProgress({
          current: p.current, total: p.total,
          percent: p.percent, phase: p.phase,
        });
      }
    } catch {
      /* swallow — progress is best-effort */
    }
  }

  const summary = useMemo(() => {
    const groups = new Set<string>();
    const subs = new Set<string>();
    let nWithPackshot = 0;
    for (const p of products) {
      const g = (p.groupe || '').trim();
      const sg = (p.sous_groupe || '').trim();
      if (g) groups.add(g);
      if (g || sg) subs.add(`${g}::${sg}`);
      // Client-side count is "has a non-empty packshot field". The actual
      // server-side filter also requires the file to resolve on disk, so
      // the final exported deck may have FEWER slides — but this is a fast
      // upper-bound estimate that doesn't need to hit /api/images for every
      // row to be accurate.
      if ((p.packshot || '').trim()) nWithPackshot++;
    }
    return {
      n_products: products.length,
      n_groups: groups.size,
      n_subgroups: subs.size,
      n_with_packshot: nWithPackshot,
    };
  }, [products]);

  return (
    <PageShell
      title="Génération"
      subtitle="Construit le PowerPoint, archive automatiquement dans archive/<année-mois>/, et fournit les liens .pptx + .pdf."
    >
      <SectionCard
        icon={<Sparkles size={16} />}
        accent={PC_ACCENT}
        title="Construction du deck"
        subtitle="Le deck est généré côté serveur à partir de l'état actuel des produits et des images."
      >
        <GeneratePanel
          summary={summary}
          progress={progress}
          accent={PC_ACCENT}
          accentGradient={PC_GRADIENT}
          accentShadow={`0 8px 20px ${PC_ACCENT}55`}
          onGenerate={async (withDividers, withPackshotOnly) => {
            startPolling();
            try {
              const r = await api.generate(withDividers, !!withPackshotOnly);
              // The new deck lands in the archive — refresh the list below
              // so it appears without leaving the page.
              void reloadArchive();
              return r;
            } finally {
              stopPolling();
            }
          }}
        />
      </SectionCard>

      {/* Generated decks, newest first — download / re-open / duplicate
          without going back to the dashboard. */}
      <SectionCard
        icon={<Archive size={16} />}
        accent={PC_ACCENT}
        title="Générations précédentes"
        subtitle={`${months.reduce((s, m) => s + m.decks.length, 0)} deck(s) archivé(s) — téléchargez, rechargez ou dupliquez.`}
      >
        <ArchiveBrowser
          months={months}
          thumbnailUrl={api.archiveThumbnailUrl}
          pptxUrl={api.archivePptxUrl}
          pdfUrl={api.archivePdfUrl}
          accent={PC_ACCENT}
          onLoad={async (m, n) => {
            try {
              const r = await api.loadArchive(m, n);
              await refreshAll();
              setToast({ message: `${r.loaded} produits chargés. Ouvrez "Contenu" pour éditer.`, type: 'success' });
            } catch (e: any) {
              setToast({ message: e?.message ?? 'Échec du chargement', type: 'error' });
            }
          }}
          onDuplicate={async (m, n) => {
            try {
              const r = await api.duplicateArchive(m, n);
              await refreshAll();
              setToast({ message: `Dupliqué (${r.loaded} produits, mois → ${r.new_mois}).`, type: 'success' });
            } catch (e: any) {
              setToast({ message: e?.message ?? 'Échec', type: 'error' });
            }
          }}
          onDelete={async (m, n) => {
            try {
              await api.deleteArchive(m, n);
              await reloadArchive();
              setToast({ message: `Supprimé : ${n}`, type: 'success' });
            } catch (e: any) {
              setToast({ message: e?.message ?? 'Échec', type: 'error' });
            }
          }}
        />
      </SectionCard>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </PageShell>
  );
}
