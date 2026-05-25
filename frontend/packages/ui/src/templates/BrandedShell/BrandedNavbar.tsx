import { Menu } from 'lucide-react';
import type { ReactNode } from 'react';

export interface BrandedNavbarProps {
  /** Sidebar's current width (so the navbar lines up with the content area) */
  sidebarCollapsed: boolean;
  mobileMode?: boolean;
  onMobileMenuToggle?: () => void;
  /** Slots — each app fills these with whatever it needs (sync, search, user
   * chip, logout, status pill, …). Default left slot is the date. */
  leftSlot?: ReactNode;
  rightSlot?: ReactNode;
}

/** Top bar — pure layout container. The actions (sync, search, user chip,
 * etc.) are app-specific and passed via slots. */
export function BrandedNavbar({
  sidebarCollapsed, mobileMode, onMobileMenuToggle,
  leftSlot, rightSlot,
}: BrandedNavbarProps) {
  const today = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  return (
    <header style={{
      position: 'fixed',
      top: 0,
      left: mobileMode ? 0 : (sidebarCollapsed ? 64 : 256),
      right: 0,
      height: 56,
      background: 'rgba(255, 255, 255, 0.78)',
      backdropFilter: 'blur(18px)',
      WebkitBackdropFilter: 'blur(18px)',
      borderBottom: '1px solid #e4e4e7',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 24px',
      gap: 12,
      zIndex: 100,
      transition: 'left 250ms cubic-bezier(0.16, 1, 0.3, 1)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
        {mobileMode && (
          <button
            onClick={onMobileMenuToggle}
            aria-label="Menu"
            style={{
              border: '1px solid #e4e4e7', background: '#fff',
              borderRadius: 8, padding: 6, color: '#52525b',
              display: 'flex', alignItems: 'center', cursor: 'pointer',
            }}
          ><Menu size={16} /></button>
        )}
        {leftSlot ?? (
          <div style={{
            fontSize: 13, fontWeight: 600, color: '#52525b',
            textTransform: 'capitalize',
          }}>{today}</div>
        )}
      </div>
      {rightSlot && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {rightSlot}
        </div>
      )}
    </header>
  );
}
