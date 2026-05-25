import { Camera, Mail, Bell, LogOut } from 'lucide-react';
import type { NavbarProps } from './Navbar.types';

function getTodayFormatted(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

const navLinks = ['Home', 'Achats', 'Financements', 'Escomptes', 'Payments'];

export function Navbar({
  onLogout,
  sidebarCollapsed = false,
}: NavbarProps) {
  return (
    <header
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        left: sidebarCollapsed ? 70 : 260,
        height: 54,
        background: 'linear-gradient(135deg, #dc3545 0%, #c82333 100%)',
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 20px',
        zIndex: 999,
        boxShadow: '0 2px 12px rgba(220, 53, 69, 0.3)',
        transition: 'left 0.3s ease',
      }}
    >
      {/* Left: Nav links */}
      <div style={{ display: 'flex', alignItems: 'center' }}>
        {navLinks.map((link) => (
          <button
            key={link}
            style={{
              background: 'none',
              border: 'none',
              color: 'rgba(255,255,255,0.85)',
              fontSize: 14,
              fontWeight: 500,
              cursor: 'pointer',
              padding: '8px 0',
              marginRight: 28,
              transition: 'color 0.2s',
            }}
          >
            {link}
          </button>
        ))}
      </div>

      {/* Right: Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <button
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: 'rgba(255,255,255,0.15)',
            border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: 8,
            color: '#fff',
            padding: '6px 14px',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            marginRight: 8,
          }}
        >
          <Camera size={14} />
          Capture
        </button>

        <span style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.8)', padding: '6px 10px' }}>
          {getTodayFormatted()}
        </span>

        <button style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.8)', fontSize: 17, cursor: 'pointer', padding: 6, borderRadius: 6 }}>
          <Mail size={17} />
        </button>
        <button style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.8)', fontSize: 17, cursor: 'pointer', padding: 6, borderRadius: 6 }}>
          <Bell size={17} />
        </button>

        {onLogout && (
          <button
            onClick={onLogout}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              background: 'rgba(0,0,0,0.12)',
              border: 'none',
              borderRadius: 8,
              color: 'rgba(255,255,255,0.9)',
              padding: '6px 14px',
              fontSize: 12.5,
              fontWeight: 600,
              cursor: 'pointer',
              marginLeft: 4,
            }}
          >
            <LogOut size={14} />
            Logout
          </button>
        )}
      </div>
    </header>
  );
}
