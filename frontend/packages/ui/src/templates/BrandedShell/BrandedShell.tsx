import { useEffect, useState, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocation, useNavigate } from 'react-router-dom';

import { PageTransition } from '../../atoms/PageTransition';
import { useIsMobile } from '../../hooks';
import { BrandedBackground } from './BrandedBackground';
import { BrandedSidebar } from './BrandedSidebar';
import { BrandedNavbar } from './BrandedNavbar';
import { BrandedSplash } from './BrandedSplash';
import type { BrandConfig, NavSection } from './types';

export interface BrandedShellProps {
  brand: BrandConfig;
  sections: NavSection[];
  /** Routes / page tree — rendered inside the page-transition wrapper */
  children: ReactNode;
  /** Optional custom slots for the navbar */
  navbarLeft?: ReactNode;
  navbarRight?: ReactNode;
  /** Strip a known prefix from the URL before matching against section item
   * keys — useful when the BrowserRouter uses a basename like "/react". */
  stripPathPrefix?: string;
  /** Storage key for persisting the sidebar collapse state. Different per app
   * so they don't share a localStorage value. Defaults to brand.name. */
  storagePrefix?: string;
  /** Set to false to skip the splash entirely (e.g. during dev). */
  showSplash?: boolean;
}

/**
 * The full app shell — splash → background → sidebar → navbar → animated
 * routes. Mount inside an existing `<BrowserRouter>`. The shell handles:
 *
 *  - splash gating (one-shot per session)
 *  - sidebar collapse state (persisted in localStorage)
 *  - mobile drawer with overlay
 *  - smooth route transitions via PageTransition
 *  - lining up the main content's left margin with the sidebar width
 */
export function BrandedShell({
  brand, sections, children,
  navbarLeft, navbarRight,
  stripPathPrefix = '', storagePrefix,
  showSplash = true,
}: BrandedShellProps) {
  const prefix = storagePrefix ?? slug(brand.name);
  const collapseKey = `${prefix}-sidebar-collapsed`;
  const splashKey = `${prefix}-splash-seen`;

  const [splashDone, setSplashDone] = useState(() =>
    !showSplash || sessionStorage.getItem(splashKey) === '1'
  );
  function handleSplashComplete() {
    sessionStorage.setItem(splashKey, '1');
    setSplashDone(true);
  }

  return (
    <>
      {!splashDone && showSplash && (
        <BrandedSplash brand={brand} onComplete={handleSplashComplete} />
      )}
      <ShellInner
        brand={brand} sections={sections}
        collapseKey={collapseKey} stripPathPrefix={stripPathPrefix}
        navbarLeft={navbarLeft} navbarRight={navbarRight}
      >
        {children}
      </ShellInner>
    </>
  );
}

function ShellInner({
  brand, sections, collapseKey, stripPathPrefix,
  navbarLeft, navbarRight, children,
}: {
  brand: BrandConfig;
  sections: NavSection[];
  collapseKey: string;
  stripPathPrefix: string;
  navbarLeft?: ReactNode;
  navbarRight?: ReactNode;
  children: ReactNode;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const activePath =
    (stripPathPrefix
      ? location.pathname.replace(stripPathPrefix, '')
      : location.pathname) || '/';

  const [collapsed, setCollapsed] = useState(() =>
    localStorage.getItem(collapseKey) === '1'
  );
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem(collapseKey, collapsed ? '1' : '0');
  }, [collapsed, collapseKey]);

  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  return (
    <>
      <BrandedBackground brand={brand} />

      <AnimatePresence>
        {isMobile && mobileOpen && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setMobileOpen(false)}
            style={{
              position: 'fixed', inset: 0, zIndex: 85,
              background: 'rgba(0, 0, 0, 0.5)',
              backdropFilter: 'blur(4px)',
            }}
          />
        )}
      </AnimatePresence>

      <motion.div
        animate={{ x: isMobile ? (mobileOpen ? 0 : -300) : 0 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        style={{ position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 95 }}
      >
        <BrandedSidebar
          brand={brand}
          sections={sections}
          activePath={activePath}
          onNavigate={(view) => navigate(view)}
          collapsed={!isMobile && collapsed}
          onToggleCollapse={() => {
            if (isMobile) setMobileOpen(false);
            else setCollapsed((c) => !c);
          }}
          layoutId={`sidebar-active-${slug(brand.name)}`}
        />
      </motion.div>

      <BrandedNavbar
        sidebarCollapsed={isMobile ? true : collapsed}
        mobileMode={isMobile}
        onMobileMenuToggle={() => setMobileOpen((o) => !o)}
        leftSlot={navbarLeft}
        rightSlot={navbarRight}
      />

      <motion.main
        animate={{ marginLeft: isMobile ? 0 : (collapsed ? 64 : 256) }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        style={{
          marginTop: 56,
          padding: isMobile ? 16 : 24,
          minHeight: 'calc(100vh - 56px)',
          position: 'relative', zIndex: 1,
          overflow: 'hidden',
        }}
      >
        <AnimatePresence mode="wait">
          <PageTransition>
            {children}
          </PageTransition>
        </AnimatePresence>
      </motion.main>
    </>
  );
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'app';
}
