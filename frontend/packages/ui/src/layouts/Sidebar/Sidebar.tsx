import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { SidebarProps } from './Sidebar.types';

export function Sidebar({
  sections,
  logo,
  collapsed = false,
  onToggle,
  activePath = '/',
  onNavigate,
}: SidebarProps) {
  return (
    <aside
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        height: '100vh',
        width: collapsed ? 70 : 260,
        background: 'linear-gradient(180deg, #0f2027 0%, #142b38 40%, #1a3a4a 100%)',
        color: '#fff',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 1000,
        transition: 'width 0.3s ease',
        overflow: 'hidden',
      }}
    >
      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 16px 16px', minHeight: 90 }}>
        {!collapsed ? (
          logo || <span style={{ fontSize: '1.3rem', fontWeight: 800, color: '#fff', letterSpacing: 2, textTransform: 'uppercase' }}>AMAFIN</span>
        ) : (
          <span style={{ color: '#fff', fontSize: '1.1rem', fontWeight: 700 }}>AF</span>
        )}
      </div>

      {/* Toggle */}
      <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 12px 12px' }}>
        <button
          onClick={onToggle}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 32, height: 32, borderRadius: 8,
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
            color: 'rgba(255,255,255,0.5)', cursor: 'pointer',
          }}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      {/* Navigation */}
      <nav style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '4px 0 20px' }}>
        {sections.map((section, si) => (
          <div key={si}>
            {section.title && !collapsed && (
              <div style={{
                padding: '24px 20px 8px', fontSize: '0.65rem', fontWeight: 700,
                textTransform: 'uppercase', letterSpacing: 1.5, color: 'rgba(255,255,255,0.25)',
              }}>
                {section.title}
              </div>
            )}

            {section.items.map((item) => {
              const isActive = activePath === item.path;
              return (
                <button
                  key={item.path}
                  onClick={() => onNavigate?.(item.path)}
                  style={{
                    position: 'relative', display: 'flex', alignItems: 'center',
                    width: '100%', border: 'none', cursor: 'pointer', textAlign: 'left',
                    height: 44, margin: '1px 0',
                    padding: collapsed ? '0' : '0 12px',
                    justifyContent: collapsed ? 'center' : 'flex-start',
                    background: isActive ? 'rgba(255,255,255,0.1)' : 'transparent',
                    color: isActive ? '#fff' : 'rgba(255,255,255,0.6)',
                    transition: 'background 0.15s, color 0.15s',
                  }}
                >
                  {isActive && (
                    <div style={{
                      position: 'absolute', left: 0, top: 8, bottom: 8, width: 3,
                      background: '#467ed9', borderRadius: '0 3px 3px 0',
                    }} />
                  )}

                  {item.icon && (
                    <span style={{
                      fontSize: collapsed ? '1.6rem' : '1.25rem', minWidth: 24,
                      textAlign: 'center', flexShrink: 0,
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      opacity: isActive ? 1 : 0.7,
                    }}>
                      <i className={item.icon} />
                    </span>
                  )}

                  {!collapsed && (
                    <span style={{ marginLeft: 14, fontSize: '0.88rem', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden' }}>
                      {item.label}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
}
