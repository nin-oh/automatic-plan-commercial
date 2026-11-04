import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import {
  Home, Presentation, FileText, Tags, Image as ImageIcon, Sparkles, ListOrdered, Database,
  BookOpen, FolderOpen, Plus, Copy,
} from 'lucide-react';
import { BrandedShell, type BrandConfig, type NavSection } from '@amafin/ui';

import {
  HomePage, DeckPage, ContentPage, BrandsPage, ImagesPage, GeneratePage, OrderPage, SapImportPage,
  CataloguePage,
} from './pages';
import * as api from './api';
import { usePlanCommercial } from './store/usePlanCommercial';

const BRAND: BrandConfig = {
  name: 'Plan Commercial',
  subtitle: 'Workspace',
  logoSrc: '/logo.png',
  tagline: 'PPTX Generator',
  accent: '#f97316',
  accent2: '#dc2626',
  accent3: '#ea580c',
  user: { name: 'Plan Commercial', role: 'Atelier' },
};

const SECTIONS: NavSection[] = [
  {
    items: [
      { key: '/',         label: 'Tableau de bord', icon: <Home size={17} /> },
      { key: '/deck',     label: 'Deck',            icon: <Presentation size={17} /> },
      { key: '/content',  label: 'Contenu',         icon: <FileText size={17} /> },
      { key: '/order',    label: 'Ordre',           icon: <ListOrdered size={17} /> },
      { key: '/brands',   label: 'Marques',         icon: <Tags size={17} /> },
      { key: '/images',   label: 'Images',          icon: <ImageIcon size={17} /> },
    ],
  },
  {
    title: 'Données',
    items: [
      { key: '/sap',      label: 'Vérification prix SAP', icon: <Database size={17} /> },
    ],
  },
  {
    title: 'Aperçu',
    items: [
      { key: '/catalogue', label: 'Catalogue',      icon: <BookOpen size={17} /> },
    ],
  },
  {
    title: 'Production',
    items: [
      { key: '/generate', label: 'Génération',      icon: <Sparkles size={17} /> },
    ],
  },
];

/** Project switcher — lives in the navbar so the user can jump between
 * catalogues ("Juin Gros", "Juin Détail", …) from any page. The active
 * project mirrors every edit automatically, so switching is lossless. */
function ProjectSwitcher() {
  const [projects, setProjects] = useState<api.Project[]>([]);
  const refresh = () => api.listProjects().then(setProjects).catch(() => setProjects([]));
  useEffect(() => { refresh(); }, []);

  const active = projects.find((p) => p.active);

  async function afterSwitch() {
    await usePlanCommercial.getState().refreshAll();
    usePlanCommercial.getState().setSlideIdx(0);
    usePlanCommercial.getState().bumpPreview();
    await refresh();
  }

  async function onSelect(e: React.ChangeEvent<HTMLSelectElement>) {
    const v = e.target.value;
    if (!v || Number(v) === active?.id) return;
    await api.openProject(Number(v));
    await afterSwitch();
  }

  async function onNew() {
    const name = prompt('Nom du nouveau projet (session vide) :');
    if (!name?.trim()) return;
    await api.createProject(name.trim(), true);
    await afterSwitch();
  }

  async function onSaveAs() {
    const name = prompt('Enregistrer la session actuelle comme projet :');
    if (!name?.trim()) return;
    setProjects(await api.createProject(name.trim(), false));
  }

  async function onDuplicate() {
    if (!active) return;
    const name = prompt('Nom de la copie :', `${active.name} (copie)`);
    if (!name?.trim()) return;
    setProjects(await api.duplicateProject(active.id, name.trim()));
  }

  const btn: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: 24, height: 24, borderRadius: 6, border: '1px solid #e4e4e7',
    background: '#fff', color: '#52525b', cursor: 'pointer',
  };

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <FolderOpen size={14} style={{ color: BRAND.accent }} />
      <select
        value={active?.id ?? ''}
        onChange={onSelect}
        title="Projet actif — chaque projet est un catalogue complet, sauvegardé en continu"
        style={{
          padding: '4px 8px', borderRadius: 8, border: '1px solid #e4e4e7',
          fontSize: 12, fontWeight: 600, color: '#3f3f46', background: '#fff',
          maxWidth: 190, cursor: 'pointer',
        }}
      >
        <option value="">
          {active ? active.name : 'Session libre'}
        </option>
        {projects.filter((p) => !p.active).map((p) => (
          <option key={p.id} value={p.id}>
            {p.name} · {p.products} prod. {p.canal ? `· ${p.canal}` : ''}
          </option>
        ))}
      </select>
      <button onClick={onNew} title="Nouveau projet (vide)" style={btn}>
        <Plus size={13} />
      </button>
      {!active && (
        <button
          onClick={onSaveAs}
          title="Enregistrer la session actuelle comme projet"
          style={{ ...btn, width: 'auto', padding: '0 8px', fontSize: 11, fontWeight: 600, gap: 4 }}
        >
          Enregistrer…
        </button>
      )}
      {active && (
        <button onClick={onDuplicate} title="Dupliquer le projet actif" style={btn}>
          <Copy size={12} />
        </button>
      )}
    </div>
  );
}

function WorkspacePill() {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 8,
      padding: '4px 10px', borderRadius: 999,
      border: `1px solid ${BRAND.accent}55`, background: `${BRAND.accent}14`,
      color: '#9a3412', fontSize: 11.5, fontWeight: 600,
      letterSpacing: 0.3,
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: 999,
        background: `linear-gradient(135deg, ${BRAND.accent}, ${BRAND.accent2})`,
        boxShadow: `0 0 8px ${BRAND.accent}`,
      }} />
      Workspace en ligne
    </div>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <BrandedShell
        brand={BRAND}
        sections={SECTIONS}
        navbarRight={
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
            <ProjectSwitcher />
            <WorkspacePill />
          </div>
        }
      >
        <Routes>
          <Route path="/"          element={<HomePage />} />
          <Route path="/deck"      element={<DeckPage />} />
          <Route path="/content"   element={<ContentPage />} />
          <Route path="/order"     element={<OrderPage />} />
          <Route path="/brands"    element={<BrandsPage />} />
          <Route path="/images"    element={<ImagesPage />} />
          <Route path="/sap"       element={<SapImportPage />} />
          <Route path="/catalogue" element={<CataloguePage />} />
          <Route path="/generate"  element={<GeneratePage />} />
          <Route path="*"          element={<Navigate to="/" replace />} />
        </Routes>
      </BrandedShell>
    </BrowserRouter>
  );
}
