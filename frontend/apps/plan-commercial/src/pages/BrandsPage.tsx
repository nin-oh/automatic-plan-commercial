import { useEffect, useState } from 'react';
import { BrandWorkflow, SectionCard, Toast, type BrandRow } from '@amafin/ui';
import { Tags } from 'lucide-react';
import { PageShell, PC_ACCENT } from './PageShell';
import * as api from '../api';
import { usePlanCommercial } from '../store/usePlanCommercial';

export function PlanCommercialBrandsPage() {
  const { products, images, refreshProducts, refreshImages, bumpPreview } = usePlanCommercial();
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => { refreshProducts(); refreshImages(); }, [refreshProducts, refreshImages]);

  const rows: BrandRow[] = products.map((p, i) => ({
    index: i,
    groupe: p.groupe || '',
    sous_groupe: p.sous_groupe || '',
    nom: p.nom || '',
    packshot: p.packshot || '',
    logo_groupe: p.logo_groupe || '',
    is_promo: !!p.is_promo,
    prix_gros: Number(p.prix_gros || 0),
    prix_gros_net: Number(p.prix_gros_net || 0),
  }));

  return (
    <PageShell
      title="Travail par marque"
      subtitle="Choisissez une marque et déposez plusieurs packshots d'un coup. L'app les associe aux SKUs existants ou crée de nouvelles slides."
    >
     <SectionCard
       icon={<Tags size={16} />}
       accent={PC_ACCENT}
       title="Workflow par marque"
       subtitle="Sélecteur de marque, KPIs, dépôt en masse et grille des SKUs."
     >
      <BrandWorkflow
        rows={rows}
        images={images}
        resolveImageUrl={api.imageUrl}
        accent={PC_ACCENT}
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
        onUploadBrandLogo={async (brand, field, file) => {
          try {
            const target = `${slugify(brand)}.png`;
            const renamed = new File([file], target, { type: file.type });
            await api.uploadImages([renamed], brand, 'logo');
            await api.applyBrandLogo(brand, field, target);
            await refreshProducts();
            await refreshImages();
            bumpPreview();
            setToast({ message: `Logo appliqué à ${brand}`, type: 'success' });
          } catch (e: any) {
            setToast({ message: e?.message ?? 'Erreur', type: 'error' });
          }
        }}
        onUploadSkuPackshot={async (skuIndex, brand, file) => {
          try {
            // 1) Persist the file under the brand subfolder
            const uploaded = await api.uploadImages([file], brand, 'packshot');
            // 2) The API returns the canonical filename (incl. subfolder prefix
            //    like "PAPI/foo.png") — use it as the packshot field so the
            //    resolver picks it up without falling back to basename lookup.
            const fname = uploaded[0]?.filename || file.name;
            await api.patchProduct(skuIndex, { packshot: fname });
            await refreshProducts();
            await refreshImages();
            bumpPreview();
            setToast({ message: `Packshot mis à jour`, type: 'success' });
          } catch (e: any) {
            setToast({ message: e?.message ?? 'Erreur', type: 'error' });
          }
        }}
        onBulkPackshots={async (brand, field, files, mode) => {
          try {
            // 1) save all images first
            await api.uploadImages(files, brand, 'packshot');
            // 2) match-or-create against the products in this brand
            let matched = 0, missed = 0, created = 0;
            const brandRows = products
              .map((p, i) => ({ p, i }))
              .filter(({ p }) => ((p as any)[field] || '').trim() === brand);
            for (const f of files) {
              const fname = f.name;
              const stem = fname.replace(/\.[^.]+$/, '').toLowerCase();
              if (mode === 'match') {
                let target = brandRows.find(({ p }) => (p.packshot || '') === fname);
                if (!target) {
                  target = brandRows.find(({ p }) => {
                    const sku = (p.nom || '').toLowerCase();
                    return sku && (sku.includes(stem) || stem.includes(sku));
                  });
                }
                if (target) {
                  await api.patchProduct(target.i, { packshot: fname });
                  matched++;
                } else {
                  missed++;
                }
              } else {
                const seedRow = brandRows[0]?.p;
                await api.createProduct({
                  groupe: field === 'sous_groupe' ? (seedRow?.groupe || '') : brand,
                  sous_groupe: field === 'sous_groupe' ? brand : (seedRow?.sous_groupe || ''),
                  nom: stem,
                  packshot: fname,
                });
                created++;
              }
            }
            await refreshProducts();
            await refreshImages();
            bumpPreview();
            setToast({
              message: `${matched} matché(s), ${created} créé(s)${missed ? `, ${missed} non matché(s)` : ''}.`,
              type: 'success',
            });
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

function slugify(s: string): string {
  return (s || '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'logo';
}
