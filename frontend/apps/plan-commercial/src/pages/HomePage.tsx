import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArchiveBrowser, SectionCard, Toast, type ArchiveMonth } from '@amafin/ui';
import { Archive } from 'lucide-react';
import { PageShell, PC_ACCENT } from './PageShell';
import * as api from '../api';
import { usePlanCommercial } from '../store/usePlanCommercial';

export function PlanCommercialHomePage() {
  const navigate = useNavigate();
  const refreshAll = usePlanCommercial((s) => s.refreshAll);
  const [months, setMonths] = useState<ArchiveMonth[]>([]);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  async function reload() {
    setMonths(await api.listArchive());
  }
  useEffect(() => { reload(); }, []);

  return (
    <PageShell
      title="Tableau de bord"
      subtitle="Plans archivés par mois — chaque génération est sauvegardée dans archive/<année-mois>/. Téléchargez, dupliquez ou réouvrez un deck pour continuer à le travailler."
    >
      <SectionCard
        icon={<Archive size={16} />}
        accent={PC_ACCENT}
        title="Plans archivés"
        subtitle={`${months.reduce((s, m) => s + m.decks.length, 0)} deck(s) sur ${months.length} mois.`}
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
            navigate('/content');
          } catch (e: any) {
            setToast({ message: e?.message ?? 'Échec du chargement', type: 'error' });
          }
        }}
        onDuplicate={async (m, n) => {
          try {
            const r = await api.duplicateArchive(m, n);
            await refreshAll();
            setToast({
              message: `Dupliqué (${r.loaded} produits, mois → ${r.new_mois}).`,
              type: 'success',
            });
            navigate('/content');
          } catch (e: any) {
            setToast({ message: e?.message ?? 'Échec', type: 'error' });
          }
        }}
        onDelete={async (m, n) => {
          try {
            await api.deleteArchive(m, n);
            await reload();
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
