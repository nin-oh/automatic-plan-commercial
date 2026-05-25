import { useEffect, useMemo } from 'react';
import { GeneratePanel, SectionCard } from '@amafin/ui';
import { Sparkles } from 'lucide-react';
import { PageShell, PC_ACCENT, PC_GRADIENT } from './PageShell';
import * as api from '../api';
import { usePlanCommercial } from '../store/usePlanCommercial';

export function PlanCommercialGeneratePage() {
  const { products, refreshProducts } = usePlanCommercial();

  useEffect(() => { refreshProducts(); }, [refreshProducts]);

  const summary = useMemo(() => {
    const groups = new Set<string>();
    const subs = new Set<string>();
    for (const p of products) {
      const g = (p.groupe || '').trim();
      const sg = (p.sous_groupe || '').trim();
      if (g) groups.add(g);
      if (g || sg) subs.add(`${g}::${sg}`);
    }
    return {
      n_products: products.length,
      n_groups: groups.size,
      n_subgroups: subs.size,
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
          accent={PC_ACCENT}
          accentGradient={PC_GRADIENT}
          accentShadow={`0 8px 20px ${PC_ACCENT}55`}
          onGenerate={async (withDividers) => {
            const r = await api.generate(withDividers);
            return r;
          }}
        />
      </SectionCard>
    </PageShell>
  );
}
