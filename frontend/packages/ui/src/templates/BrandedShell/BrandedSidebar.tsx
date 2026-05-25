import { motion, AnimatePresence } from 'framer-motion';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import type { BrandConfig, NavSection } from './types';

export interface BrandedSidebarProps {
  brand: BrandConfig;
  sections: NavSection[];
  activePath: string;
  onNavigate: (path: string) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  /** Used for the framer-motion `layoutId` so each app's active-pill stays
   * isolated when both apps are mounted in the same DOM during dev. */
  layoutId?: string;
}

/** Generic dark sidebar — same animations and structure across apps; only
 * brand colors and nav items differ. */
export function BrandedSidebar({
  brand, sections, activePath, onNavigate, collapsed, onToggleCollapse,
  layoutId = 'branded-sidebar-active',
}: BrandedSidebarProps) {
  const gradient = `linear-gradient(135deg, ${brand.accent}, ${brand.accent2})`;
  const glow = `0 0 14px ${brand.accent}73`;

  return (
    <motion.aside
      animate={{ width: collapsed ? 64 : 256 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      style={{
        position: 'fixed', top: 0, left: 0, bottom: 0,
        background: '#09090b',
        borderRight: '1px solid #27272a',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden', zIndex: 90,
      }}
    >
      {/* Brand */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 14px', borderBottom: '1px solid #27272a', minHeight: 56,
      }}>
        <AnimatePresence mode="wait">
          {!collapsed ? (
            <motion.div
              key="logo-full"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}
            >
              <BrandSquare brand={brand} gradient={gradient} glow={glow} size={36} />
              <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <span style={{
                  color: '#fff', fontSize: 13.5, fontWeight: 700,
                  fontFamily: 'Inter, sans-serif', letterSpacing: 0.2,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {brand.name}
                </span>
                {brand.subtitle && (
                  <span style={{
                    color: '#52525b', fontSize: 10, fontWeight: 600,
                    textTransform: 'uppercase', letterSpacing: 1,
                  }}>
                    {brand.subtitle}
                  </span>
                )}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="logo-mini"
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.5 }}
              style={{ margin: '0 auto' }}
            >
              <BrandSquare brand={brand} gradient={gradient} glow={glow} size={36} />
            </motion.div>
          )}
        </AnimatePresence>

        {!collapsed && (
          <motion.button
            whileHover={{ backgroundColor: '#27272a' }}
            onClick={onToggleCollapse}
            style={iconBtn}
            title="Replier"
          ><PanelLeftClose size={16} /></motion.button>
        )}
      </div>

      {collapsed && (
        <button onClick={onToggleCollapse} style={{ ...iconBtn, margin: '8px auto 0' }} title="Ouvrir">
          <PanelLeftOpen size={16} />
        </button>
      )}

      <nav style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '8px 0' }}>
        {sections.map((section, si) => (
          <div key={si} style={{ padding: '8px 0 2px' }}>
            <AnimatePresence>
              {section.title && !collapsed && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  style={{
                    padding: '8px 18px 4px',
                    fontSize: 10, fontWeight: 700,
                    color: '#52525b', textTransform: 'uppercase',
                    letterSpacing: 1, fontFamily: 'Inter, sans-serif',
                  }}
                >{section.title}</motion.div>
              )}
            </AnimatePresence>

            <div style={{ padding: '0 10px' }}>
              {section.items.map((item) => {
                const isActive = activePath === item.key;
                return (
                  <motion.button
                    key={item.key}
                    whileHover={{ backgroundColor: '#1e1e22' }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => onNavigate(item.key)}
                    title={collapsed ? item.label : undefined}
                    style={{
                      display: 'flex', alignItems: 'center',
                      gap: 10, width: '100%',
                      padding: collapsed ? '9px 0' : '8px 10px',
                      marginBottom: 2, border: 'none', borderRadius: 8,
                      background: isActive ? '#1e1e22' : 'transparent',
                      color: isActive ? '#fff' : '#a1a1aa',
                      fontSize: 13,
                      fontWeight: isActive ? 600 : 500,
                      fontFamily: 'Inter, sans-serif',
                      cursor: 'pointer', transition: 'color 120ms',
                      textAlign: 'left',
                      justifyContent: collapsed ? 'center' : 'flex-start',
                      position: 'relative',
                      boxShadow: isActive ? 'inset 0 0 0 1px #27272a' : 'none',
                    }}
                  >
                    {isActive && (
                      <motion.div
                        layoutId={layoutId}
                        style={{
                          position: 'absolute',
                          left: collapsed ? 4 : -6,
                          top: '50%', transform: 'translateY(-50%)',
                          width: 3, height: 16, borderRadius: 2,
                          background: gradient, boxShadow: glow,
                        }}
                      />
                    )}
                    <span style={{ flexShrink: 0, display: 'flex' }}>{item.icon}</span>
                    <AnimatePresence>
                      {!collapsed && (
                        <motion.span
                          initial={{ opacity: 0, width: 0 }}
                          animate={{ opacity: 1, width: 'auto' }}
                          exit={{ opacity: 0, width: 0 }}
                          transition={{ duration: 0.15 }}
                          style={{ whiteSpace: 'nowrap', overflow: 'hidden' }}
                        >{item.label}</motion.span>
                      )}
                    </AnimatePresence>
                  </motion.button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* User footer */}
      {brand.user && (
        <div style={{ borderTop: '1px solid #27272a', padding: collapsed ? 8 : 12 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: collapsed ? 4 : 8, borderRadius: 8,
            justifyContent: collapsed ? 'center' : 'flex-start',
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: 999,
              background: gradient,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontWeight: 700, fontSize: 12, flexShrink: 0,
            }}>{initials(brand.user.name)}</div>
            <AnimatePresence>
              {!collapsed && (
                <motion.div
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: 'auto' }}
                  exit={{ opacity: 0, width: 0 }}
                  style={{ overflow: 'hidden' }}
                >
                  <div style={{ color: '#fff', fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {brand.user.name}
                  </div>
                  <div style={{ color: '#71717a', fontSize: 11, whiteSpace: 'nowrap' }}>
                    {brand.user.role}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      )}
    </motion.aside>
  );
}

function BrandSquare({
  brand, gradient, glow, size,
}: { brand: BrandConfig; gradient: string; glow: string; size: number }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: 10,
      background: gradient, boxShadow: glow,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0, overflow: 'hidden',
    }}>
      <img
        src={brand.logoSrc}
        alt={brand.name}
        style={{ width: '78%', height: '78%', objectFit: 'contain' }}
        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
      />
    </div>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || '?';
}

const iconBtn: React.CSSProperties = {
  background: 'transparent', border: 'none',
  color: '#71717a', cursor: 'pointer',
  width: 28, height: 28, borderRadius: 6,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  flexShrink: 0,
};
