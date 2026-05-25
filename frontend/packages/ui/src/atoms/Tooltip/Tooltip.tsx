import { useState } from 'react';
import type { TooltipProps } from './Tooltip.types';

export function Tooltip({ children, content, position = 'top', className = '' }: TooltipProps) {
  const [visible, setVisible] = useState(false);

  const positionStyles: Record<string, React.CSSProperties> = {
    top: { bottom: '100%', left: '50%', transform: 'translateX(-50%)', marginBottom: 6 },
    bottom: { top: '100%', left: '50%', transform: 'translateX(-50%)', marginTop: 6 },
    left: { right: '100%', top: '50%', transform: 'translateY(-50%)', marginRight: 6 },
    right: { left: '100%', top: '50%', transform: 'translateY(-50%)', marginLeft: 6 },
  };

  return (
    <span
      className={className}
      style={{ position: 'relative', display: 'inline-flex' }}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {children}
      {visible && (
        <span
          style={{
            position: 'absolute',
            ...positionStyles[position],
            backgroundColor: '#333',
            color: '#fff',
            padding: '4px 8px',
            borderRadius: 'var(--radius-sm)',
            fontSize: 'var(--font-size-xs)',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            zIndex: 'var(--z-tooltip, 600)' as string,
          }}
        >
          {content}
        </span>
      )}
    </span>
  );
}
