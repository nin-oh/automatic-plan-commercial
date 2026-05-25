import type { SidebarSection } from '@amafin/ui';

export const sidebarSections: SidebarSection[] = [
  {
    items: [
      { label: 'Dashboard', path: '/', icon: 'bi bi-speedometer2' },
      { label: 'Planification', path: '/planification', icon: 'bi bi-calendar-check' },
      { label: 'Balance Âgée', path: '/balance-agee', icon: 'bi bi-graph-up-arrow' },
    ],
  },
  {
    title: 'Décaissement',
    items: [
      { label: 'Factures', path: '/factures', icon: 'bi bi-receipt' },
      { label: 'Paiements', path: '/payments', icon: 'bi bi-credit-card' },
      { label: 'Impôts', path: '/impots', icon: 'bi bi-cash-stack' },
      { label: 'Salaires', path: '/salaires', icon: 'bi bi-people-fill' },
    ],
  },
  {
    title: 'Financements',
    items: [
      { label: 'Financements', path: '/financement', icon: 'bi bi-bank2' },
    ],
  },
  {
    title: 'Encaissement',
    items: [
      { label: 'Payments', path: '/incomes', icon: 'bi bi-credit-card' },
      { label: 'Escomptes', path: '/escomptes', icon: 'bi bi-receipt-cutoff' },
    ],
  },
  {
    title: 'Managements',
    items: [
      { label: 'Soldes', path: '/soldes', icon: 'bi bi-wallet2' },
      { label: 'FX', path: '/fx', icon: 'bi bi-currency-exchange' },
      { label: 'Banks', path: '/banks', icon: 'bi bi-building' },
    ],
  },
];
