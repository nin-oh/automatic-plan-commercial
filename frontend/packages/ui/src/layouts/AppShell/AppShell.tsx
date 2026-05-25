import { useState } from 'react';
import { Sidebar } from '../Sidebar';
import { Navbar } from '../Navbar';
import type { AppShellProps } from './AppShell.types';

export function AppShell({
  children,
  sidebarSections,
  sidebarLogo,
  onLogout,
  activePath = '/',
  onNavigate,
}: AppShellProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <>
      <Sidebar
        sections={sidebarSections}
        logo={sidebarLogo}
        collapsed={collapsed}
        onToggle={() => setCollapsed(!collapsed)}
        activePath={activePath}
        onNavigate={onNavigate}
      />
      <Navbar
        onLogout={onLogout}
        sidebarCollapsed={collapsed}
      />
      <main
        style={{
          marginLeft: collapsed ? 70 : 260,
          paddingTop: 78,
          paddingLeft: 24,
          paddingRight: 24,
          paddingBottom: 24,
          minHeight: '100vh',
          backgroundColor: 'var(--color-bg, #F5F7FA)',
          transition: 'margin-left 0.3s ease',
        }}
      >
        {children}
      </main>
    </>
  );
}
