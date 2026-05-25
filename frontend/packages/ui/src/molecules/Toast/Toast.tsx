import { useEffect } from 'react';
import type { ToastProps } from './Toast.types';

const colorMap: Record<string, string> = {
  success: 'var(--color-success)',
  error: 'var(--color-danger)',
  warning: 'var(--color-warning)',
  info: 'var(--color-info)',
};

export function Toast({
  message,
  type = 'info',
  onClose,
  duration = 3000,
  className = '',
}: ToastProps) {
  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(onClose, duration);
      return () => clearTimeout(timer);
    }
  }, [duration, onClose]);

  return (
    <div
      className={className}
      style={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        zIndex: 'var(--z-toast)' as string,
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-sm)',
        padding: '12px 20px',
        borderRadius: 'var(--radius-md)',
        backgroundColor: colorMap[type],
        color: 'var(--color-text-inverse)',
        fontSize: 'var(--font-size-sm)',
        fontWeight: 'var(--font-weight-medium)' as string,
        boxShadow: 'var(--shadow-lg)',
        animation: 'slideIn 0.3s ease',
      }}
    >
      {message}
      <button
        onClick={onClose}
        style={{
          background: 'none',
          border: 'none',
          color: 'inherit',
          cursor: 'pointer',
          fontSize: 18,
          padding: 0,
          marginLeft: 8,
          opacity: 0.7,
        }}
      >
        &times;
      </button>
      <style>{`@keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }`}</style>
    </div>
  );
}
