import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import {
  LayoutDashboard, Calendar, TrendingUp, Receipt, CreditCard, Coins,
  Users, Building2, Wallet, Banknote, DollarSign, BarChart3,
} from 'lucide-react';
import { BrandedShell, type BrandConfig, type NavSection } from '@amafin/ui';

import { HomePage } from './pages/Home';
import { BalanceAgeePage } from './pages/BalanceAgeePage';
import { SoldesPage } from './pages/SoldesPage';
import { PlanificationPage } from './pages/PlanificationPage';
import { SmartTablePage } from './pages/SmartTablePage';
import { BanksPage } from './pages/BanksPage';
import { StatisticsPage } from './pages/StatisticsPage';
import { HeaderSearch, HeaderActions } from './components/HeaderActions';

const BRAND: BrandConfig = {
  name: 'Amafin',
  subtitle: 'Treasury',
  logoSrc: '/react/images/amafin-blanc.png',
  tagline: 'Treasury Management System',
  accent: '#6366f1',
  accent2: '#8b5cf6',
  accent3: '#ec4899',
  user: { name: 'Amafin', role: 'Admin' },
};

const SECTIONS: NavSection[] = [
  {
    title: 'Dashboard',
    items: [
      { key: '/', label: 'Tableau de bord', icon: <LayoutDashboard size={17} /> },
      { key: '/statistics', label: 'Statistiques', icon: <BarChart3 size={17} /> },
      { key: '/planification', label: 'Planification', icon: <Calendar size={17} /> },
      { key: '/balance-agee', label: 'Balance Âgée', icon: <TrendingUp size={17} /> },
    ],
  },
  {
    title: 'Décaissement',
    items: [
      { key: '/factures', label: 'Factures', icon: <Receipt size={17} /> },
      { key: '/payments', label: 'Paiements', icon: <CreditCard size={17} /> },
      { key: '/impots', label: 'Impôts', icon: <Coins size={17} /> },
      { key: '/salaires', label: 'Salaires', icon: <Users size={17} /> },
    ],
  },
  {
    title: 'Financements',
    items: [{ key: '/financement', label: 'Financements', icon: <Building2 size={17} /> }],
  },
  {
    title: 'Encaissement',
    items: [
      { key: '/incomes', label: 'Encaissements', icon: <DollarSign size={17} /> },
      { key: '/escomptes', label: 'Escomptes', icon: <Receipt size={17} /> },
    ],
  },
  {
    title: 'Managements',
    items: [
      { key: '/soldes', label: 'Soldes', icon: <Wallet size={17} /> },
      { key: '/fx', label: 'FX', icon: <TrendingUp size={17} /> },
      { key: '/banks', label: 'Banques', icon: <Banknote size={17} /> },
    ],
  },
];

function handleLogout() {
  const csrf = document.cookie.match(/csrftoken=([^;]+)/)?.[1] ?? '';
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = '/logout/';
  const token = document.createElement('input');
  token.type = 'hidden';
  token.name = 'csrfmiddlewaretoken';
  token.value = csrf;
  form.appendChild(token);
  document.body.appendChild(form);
  form.submit();
}

export function App() {
  return (
    <BrowserRouter basename="/react">
      <BrandedShell
        brand={BRAND}
        sections={SECTIONS}
        navbarLeft={<HeaderSearch />}
        navbarRight={<HeaderActions onLogout={handleLogout} />}
      >
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/statistics" element={<StatisticsPage />} />
          <Route path="/factures" element={<SmartTablePage title="Factures" apiEndpoint="factures" headerColor="#467ed9" />} />
          <Route path="/payments" element={<SmartTablePage title="Paiements" apiEndpoint="payments" headerColor="#dfddba" />} />
          <Route path="/impots" element={<SmartTablePage title="Impôts" apiEndpoint="impots" headerColor="#467ed9" />} />
          <Route path="/salaires" element={<SmartTablePage title="Salaires" apiEndpoint="salaires" headerColor="#467ed9" />} />
          <Route path="/financement" element={<SmartTablePage title="Financements" apiEndpoint="financements" headerColor="#467ed9" />} />
          <Route path="/incomes" element={<SmartTablePage title="Encaissements" apiEndpoint="incomes" headerColor="#2ed8b6" />} />
          <Route path="/escomptes" element={<SmartTablePage title="Escomptes" apiEndpoint="escomptes" headerColor="#467ed9" />} />
          <Route path="/fx" element={<SmartTablePage title="Historique FX" apiEndpoint="fx_hist" headerColor="#467ed9" />} />
          <Route path="/banks" element={<BanksPage />} />
          <Route path="/planification" element={<PlanificationPage />} />
          <Route path="/balance-agee" element={<BalanceAgeePage />} />
          <Route path="/soldes" element={<SoldesPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrandedShell>
    </BrowserRouter>
  );
}
