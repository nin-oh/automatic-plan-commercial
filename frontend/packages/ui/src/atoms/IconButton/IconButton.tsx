import { forwardRef } from 'react';
import type { IconButtonProps } from './IconButton.types';
import type { Size } from '../../types';

const sizeMap: Record<Size, number> = { xs: 24, sm: 28, md: 36, lg: 44, xl: 52 };

const variantBg: Record<string, string> = {
  primary: 'var(--color-primary)',
  secondary: 'var(--color-secondary)',
  success: 'var(--color-success)',
  danger: 'var(--color-danger)',
  warning: 'var(--color-warning)',
  info: 'var(--color-info)',
  ghost: 'transparent',
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ icon, variant = 'ghost', size = 'md', className = '', ...rest }, ref) => {
    const px = sizeMap[size];
    return (
      <button
        ref={ref}
        type="button"
        className={className}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: px,
          height: px,
          borderRadius: 'var(--radius-md)',
          backgroundColor: variantBg[variant],
          color: variant === 'ghost' ? 'var(--color-text)' : 'var(--color-text-inverse)',
          border: variant === 'ghost' ? '1px solid var(--color-border)' : 'none',
          cursor: 'pointer',
          transition: 'opacity var(--transition-fast)',
        }}
        {...rest}
      >
        {icon}
      </button>
    );
  },
);

IconButton.displayName = 'IconButton';
