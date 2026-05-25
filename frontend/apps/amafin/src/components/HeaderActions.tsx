import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Bell, Search, Camera, LogOut, Sparkles, Shield, RefreshCw, Check,
} from 'lucide-react';
import html2canvas from 'html2canvas';
import { useIsMobile } from '@amafin/ui';
import { api } from '../api/client';

/** Amafin-specific search input — slotted into the BrandedShell navbar's left side. */
export function HeaderSearch() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, flex: 1, maxWidth: 480 }}>
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '7px 14px',
          background: '#f4f4f5',
          border: '1px solid transparent',
          borderRadius: 10,
          color: '#71717a',
          flex: 1,
          transition: 'all 120ms',
          cursor: 'text',
        }}
        onClick={(e) => (e.currentTarget.querySelector('input') as HTMLInputElement)?.focus()}
      >
        <Search size={14} />
        <input
          type="text"
          placeholder="Rechercher..."
          style={{
            flex: 1, border: 'none', outline: 'none', background: 'transparent',
            fontSize: 13, color: '#18181b', fontFamily: 'Inter, sans-serif',
          }}
        />
        <kbd style={{
          padding: '2px 6px', borderRadius: 4, background: '#fff',
          border: '1px solid #e4e4e7', fontSize: 10, color: '#71717a',
          fontFamily: 'JetBrains Mono, monospace',
        }}>⌘K</kbd>
      </div>
    </div>
  );
}

/** All Amafin header actions on the right: date chip, sync, screenshot,
 * notifications, admin link, user chip, logout. Slotted into BrandedShell
 * via `navbarRight`. */
export function HeaderActions({ onLogout }: { onLogout: () => void }) {
  const isMobile = useIsMobile();
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ show: boolean; new: number } | null>(null);

  const today = new Date().toLocaleDateString('fr-FR', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  });

  async function handleScreenshot() {
    const main = document.querySelector('main');
    if (!main) return;
    try {
      const canvas = await html2canvas(main as HTMLElement, {
        backgroundColor: '#fafafa', scale: 2, useCORS: true,
      });
      const link = document.createElement('a');
      const date = new Date().toISOString().split('T')[0];
      link.download = `Amafin_Dashboard_${date}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (err) {
      console.error('Screenshot failed:', err);
    }
  }

  async function handleSync() {
    setSyncing(true);
    try {
      const res = await api.post('/sync/factures/');
      setSyncResult({ show: true, new: res.data.new_rows ?? 0 });
      setTimeout(() => setSyncResult(null), 3000);
    } catch (err) {
      console.error('Sync failed:', err);
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 2 : 6 }}>
      {!isMobile && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '5px 10px', borderRadius: 999,
          background: '#f4f4f5', border: '1px solid #e4e4e7',
          fontSize: 11, fontWeight: 600, color: '#52525b',
          fontFamily: 'JetBrains Mono, monospace',
          marginRight: 4,
        }}>
          <Sparkles size={11} style={{ color: '#6366f1' }} />
          {today}
        </div>
      )}

      <motion.button
        whileHover={{ backgroundColor: syncing ? undefined : '#f4f4f5' }}
        whileTap={{ scale: 0.92 }}
        onClick={handleSync}
        disabled={syncing}
        title={syncResult?.show ? `${syncResult.new} nouvelles factures` : 'Synchroniser SAP'}
        style={{
          position: 'relative',
          display: 'flex', alignItems: 'center', gap: 5,
          padding: '6px 10px', borderRadius: 8,
          background: syncResult?.show ? '#dcfce7' : 'transparent',
          border: 'none', cursor: syncing ? 'wait' : 'pointer',
          color: syncResult?.show ? '#15803d' : '#52525b',
          fontSize: 12, fontWeight: 600,
          fontFamily: 'Inter, sans-serif',
          transition: 'all 150ms',
        }}
      >
        {syncResult?.show ? (
          <><Check size={14} />+{syncResult.new}</>
        ) : (
          <>
            <motion.span
              animate={syncing ? { rotate: 360 } : { rotate: 0 }}
              transition={syncing ? { duration: 1, repeat: Infinity, ease: 'linear' } : {}}
              style={{ display: 'flex' }}
            ><RefreshCw size={14} /></motion.span>
            Sync
          </>
        )}
      </motion.button>

      {!isMobile && (
        <IconButton icon={<Camera size={16} />} tooltip="Capture d'écran" onClick={handleScreenshot} />
      )}
      <IconButton icon={<Bell size={16} />} tooltip="Notifications" badge={3} />
      {!isMobile && (
        <IconButton
          icon={<Shield size={16} />}
          tooltip="Django Admin"
          onClick={() => window.open('/admin/', '_blank')}
        />
      )}

      {!isMobile && <div style={{ width: 1, height: 24, background: '#e4e4e7', margin: '0 6px' }} />}

      {!isMobile && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '4px 12px 4px 4px', borderRadius: 999,
          background: '#f4f4f5', border: '1px solid #e4e4e7',
          cursor: 'pointer',
        }}>
          <div style={{
            width: 26, height: 26, borderRadius: 999,
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: 10, fontWeight: 700,
          }}>AF</div>
          <div style={{ lineHeight: 1.2 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#18181b' }}>Amafin</div>
            <div style={{ fontSize: 10, color: '#71717a', fontWeight: 500 }}>Admin</div>
          </div>
        </div>
      )}

      <motion.button
        whileHover={{ backgroundColor: '#fef2f2' }}
        onClick={onLogout}
        title="Déconnexion"
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: isMobile ? '6px' : '6px 12px',
          width: isMobile ? 34 : 'auto',
          height: isMobile ? 34 : 'auto',
          justifyContent: 'center',
          borderRadius: 8,
          background: 'transparent', border: '1px solid #fecaca',
          color: '#dc2626', fontSize: 12, fontWeight: 600,
          cursor: 'pointer', fontFamily: 'Inter, sans-serif',
        }}
      >
        <LogOut size={13} />
        {!isMobile && 'Déconnexion'}
      </motion.button>
    </div>
  );
}

function IconButton({ icon, tooltip, badge, onClick }: {
  icon: React.ReactNode; tooltip: string; badge?: number; onClick?: () => void;
}) {
  return (
    <motion.button
      whileHover={{ backgroundColor: '#f4f4f5' }}
      whileTap={{ scale: 0.92 }}
      onClick={onClick}
      title={tooltip}
      style={{
        position: 'relative',
        width: 34, height: 34, borderRadius: 8,
        background: 'transparent', border: 'none',
        color: '#52525b', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      {icon}
      {badge && badge > 0 && (
        <motion.span
          animate={{ scale: [1, 1.1, 1] }}
          transition={{ duration: 2, repeat: Infinity }}
          style={{
            position: 'absolute', top: 4, right: 4,
            minWidth: 15, height: 15, padding: '0 4px',
            background: '#ef4444', color: '#fff',
            borderRadius: 999, fontSize: 9, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 8px rgba(239, 68, 68, 0.5)',
            fontFamily: 'Inter, sans-serif',
          }}
        >{badge}</motion.span>
      )}
    </motion.button>
  );
}
