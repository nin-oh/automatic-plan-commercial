import { forwardRef } from 'react';
import type { CheckboxProps } from './Checkbox.types';

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, size = 'md', className = '', ...rest }, ref) => {
    const scale = size === 'sm' ? 0.85 : size === 'lg' ? 1.3 : 1;
    return (
      <label
        className={className}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 'var(--space-sm)',
          cursor: rest.disabled ? 'not-allowed' : 'pointer',
          opacity: rest.disabled ? 0.5 : 1,
        }}
      >
        <input
          ref={ref}
          type="checkbox"
          style={{ transform: `scale(${scale})`, cursor: 'inherit' }}
          {...rest}
        />
        {label && <span>{label}</span>}
      </label>
    );
  },
);

Checkbox.displayName = 'Checkbox';
