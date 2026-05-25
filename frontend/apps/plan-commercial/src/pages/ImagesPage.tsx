import { useEffect, useState } from 'react';
import { ImageLibrary, SectionCard, Toast } from '@amafin/ui';
import { ImagePlus } from 'lucide-react';
import { PageShell, PC_ACCENT } from './PageShell';
import * as api from '../api';
import { usePlanCommercial } from '../store/usePlanCommercial';

export function PlanCommercialImagesPage() {
  const { images, refreshImages } = usePlanCommercial();
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => { refreshImages(); }, [refreshImages]);

  return (
    <PageShell
      title="Bibliothèque d'images"
      subtitle="Tous les packshots, logos et badges. Sauvegardés de façon permanente, réutilisables sur n'importe quel plan."
    >
     <SectionCard
       icon={<ImagePlus size={16} />}
       accent={PC_ACCENT}
       title="Bibliothèque"
       subtitle={`${images.length} image(s) — filtrez par marque, type ou nom de fichier.`}
     >
      <ImageLibrary
        assets={images}
        resolveUrl={api.imageUrl}
        accent={PC_ACCENT}
        onUpload={async (files) => {
          try {
            await api.uploadImages(files);
            await refreshImages();
            setToast({ message: `${files.length} image(s) ajoutée(s).`, type: 'success' });
          } catch (e: any) {
            setToast({ message: e?.message ?? 'Erreur', type: 'error' });
          }
        }}
        onUpdateMeta={async (filename, brand, type) => {
          try {
            await api.patchImage(filename, { brand, type });
            await refreshImages();
          } catch (e: any) {
            setToast({ message: e?.message ?? 'Erreur', type: 'error' });
          }
        }}
        onDelete={async (filename) => {
          try {
            await api.deleteImage(filename);
            await refreshImages();
            setToast({ message: 'Supprimé', type: 'success' });
          } catch (e: any) {
            setToast({ message: e?.message ?? 'Erreur', type: 'error' });
          }
        }}
      />
     </SectionCard>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </PageShell>
  );
}
