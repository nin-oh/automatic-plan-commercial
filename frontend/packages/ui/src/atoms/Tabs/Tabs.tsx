import { motion } from 'framer-motion';

export interface TabItem {
  key: string;
  label: string;
  icon?: React.ReactNode;
  badge?: string | number;
  disabled?: boolean;
}

export interface TabsProps {
  items: TabItem[];
  active: string;
  onChange: (key: string) => void;
  variant?: 'underline' | 'pill';
  className?: string;
}

export function Tabs({ items, active, onChange, variant = 'underline', className }: TabsProps) {
  return (
    <div
      className={className}
      style={{
        display: 'flex',
        gap: variant === 'pill' ? 6 : 0,
        borderBottom: variant === 'underline' ? '1px solid #27272a' : 'none',
        padding: variant === 'pill' ? 4 : 0,
        background: variant === 'pill' ? '#0f0f12' : 'transparent',
        borderRadius: variant === 'pill' ? 10 : 0,
        overflowX: 'auto',
      }}
      role="tablist"
    >
      {items.map((it) => {
        const isActive = it.key === active;
        return (
          <button
            key={it.key}
            role="tab"
            aria-selected={isActive}
            disabled={it.disabled}
            onClick={() => !it.disabled && onChange(it.key)}
            style={{
              position: 'relative',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: variant === 'pill' ? '8px 14px' : '10px 16px',
              border: 'none',
              background: isActive && variant === 'pill' ? '#1e1e22' : 'transparent',
              color: isActive ? '#fff' : '#a1a1aa',
              fontSize: 13,
              fontWeight: isActive ? 600 : 500,
              fontFamily: 'Inter, sans-serif',
              cursor: it.disabled ? 'not-allowed' : 'pointer',
              opacity: it.disabled ? 0.4 : 1,
              borderRadius: variant === 'pill' ? 8 : 0,
              whiteSpace: 'nowrap',
              transition: 'color 120ms, background 120ms',
            }}
          >
            {it.icon && <span style={{ display: 'flex' }}>{it.icon}</span>}
            <span>{it.label}</span>
            {it.badge !== undefined && (
              <span style={{
                fontSize: 10, fontWeight: 700, padding: '2px 6px',
                borderRadius: 999, background: '#27272a', color: '#a1a1aa',
              }}>{it.badge}</span>
            )}
            {isActive && variant === 'underline' && (
              <motion.div
                layoutId="tabs-underline"
                style={{
                  position: 'absolute', left: 0, right: 0, bottom: -1, height: 2,
                  background: 'linear-gradient(90deg, #6366f1, #8b5cf6)',
                  boxShadow: '0 0 8px #6366f1',
                  borderRadius: 2,
                }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
