import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import {
  Home, Presentation, FileText, Tags, Image as ImageIcon, Sparkles, ListOrdered, Database,
} from 'lucide-react';
import { BrandedShell, type BrandConfig, type NavSection } from '@amafin/ui';

import {
  HomePage, DeckPage, ContentPage, BrandsPage, ImagesPage, GeneratePage, OrderPage, SapImportPage,
} from './pages';

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
      { key: '/sap',      label: 'Import SAP',      icon: <Database size={17} /> },
    ],
  },
  {
    title: 'Production',
    items: [
      { key: '/generate', label: 'Génération',      icon: <Sparkles size={17} /> },
    ],
  },
];

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
        navbarRight={<WorkspacePill />}
      >
        <Routes>
          <Route path="/"          element={<HomePage />} />
          <Route path="/deck"      element={<DeckPage />} />
          <Route path="/content"   element={<ContentPage />} />
          <Route path="/order"     element={<OrderPage />} />
          <Route path="/brands"    element={<BrandsPage />} />
          <Route path="/images"    element={<ImagesPage />} />
          <Route path="/sap"       element={<SapImportPage />} />
          <Route path="/generate"  element={<GeneratePage />} />
          <Route path="*"          element={<Navigate to="/" replace />} />
        </Routes>
      </BrandedShell>
    </BrowserRouter>
  );
}
