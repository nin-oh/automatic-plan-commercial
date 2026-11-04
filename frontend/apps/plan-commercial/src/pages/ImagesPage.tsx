import { useEffect, useMemo, useState } from 'react';
import {
  ImageLibrary, MissingPackshotsModal, SectionCard, Toast,
  type BrandRow,
} from '@amafin/ui';
import { ImageOff, ImagePlus } from 'lucide-react';
import { PageShell, PC_ACCENT } from './PageShell';
import * as api from '../api';
import { usePlanCommercial } from '../store/usePlanCommercial';

export function PlanCommercialImagesPage() {
  const {
    products, images, refreshProducts, refreshImages, bumpPreview,
  } = usePlanCommercial();
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [showMissing, setShowMissing] = useState(false);

  useEffect(() => { refreshProducts(); refreshImages(); }, [refreshProducts, refreshImages]);

  // Build the rows the modal needs. Filter to those with NO packshot at
  // all (empty/whitespace string) — the renderer's resolver also gates on
  // file-exists, but checking that for every row would mean hitting disk
  // per request. The bound is small enough that any false positives (rows
  // whose packshot is set but file is gone) show up as the user works.
  const missing: BrandRow[] = useMemo(
    () => products
      .map((p, i): BrandRow => ({
        index: i,
        groupe: p.groupe || '',
        sous_groupe: p.sous_groupe || '',
        nom: p.nom || '',
        packshot: p.packshot || '',
        logo_groupe: p.logo_groupe || '',
        is_promo: !!p.is_promo,
        prix_gros: Number(p.prix_gros || 0),
        prix_gros_net: Number(p.prix_gros_net || 0),
        packshot_status: (p as any).packshot_status || '',
      }))
      .filter((r) => !r.packshot.trim()),
    [products],
  );

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
       actions={
         <button
           onClick={() => setShowMissing(true)}
           disabled={products.length === 0}
           title={missing.length === 0 && products.length > 0
             ? 'Tous les SKUs ont déjà un packshot'
             : `Lister les ${missing.length} SKU(s) sans packshot et leur attribuer une image`}
           style={{
             display: 'inline-flex', alignItems: 'center', gap: 6,
             padding: '8px 12px', borderRadius: 8,
             border: `1px solid ${missing.length > 0 ? PC_ACCENT : '#e4e4e7'}`,
             background: missing.length > 0 ? `${PC_ACCENT}0a` : '#fafafa',
             color: missing.length > 0 ? PC_ACCENT : '#a1a1aa',
             fontSize: 12.5, fontWeight: 600,
             cursor: products.length === 0 ? 'not-allowed' : 'pointer',
             transition: 'all 140ms',
           }}
         >
           <ImageOff size={13} />
           SKUs sans packshot ({missing.length})
         </button>
       }
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

      <MissingPackshotsModal
        open={showMissing}
        rows={missing}
        images={images}
        resolveImageUrl={api.imageUrl}
        accent={PC_ACCENT}
        exportXlsxUrl={api.missingPackshotsXlsxUrl}
        onClose={() => setShowMissing(false)}
        onPickSkuPackshot={async (skuIndex, filename) => {
          try {
            await api.patchProduct(skuIndex, { packshot: filename });
            await refreshProducts();
            bumpPreview();
            setToast({ message: `Packshot mis à jour`, type: 'success' });
          } catch (e: any) {
            setToast({ message: e?.message ?? 'Erreur', type: 'error' });
          }
        }}
        onUploadSkuPackshot={async (skuIndex, brand, file) => {
          try {
            const uploaded = await api.uploadImages([file], brand, 'packshot');
            const fname = uploaded[0]?.filename || file.name;
            await api.patchProduct(skuIndex, { packshot: fname });
            await refreshProducts();
            await refreshImages();
            bumpPreview();
            setToast({ message: `Packshot téléversé`, type: 'success' });
          } catch (e: any) {
            setToast({ message: e?.message ?? 'Erreur', type: 'error' });
          }
        }}
        onCategorize={async (skuIndex, status) => {
          try {
            // Patch only — refresh is local-first via the store, so the
            // dropdown updates instantly. No need to bumpPreview() since
            // the field doesn't affect slide rendering.
            await api.patchProduct(skuIndex, {
              packshot_status: status,
            } as any);
            await refreshProducts();
          } catch (e: any) {
            setToast({ message: e?.message ?? 'Erreur', type: 'error' });
          }
        }}
      />

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </PageShell>
  );
}
