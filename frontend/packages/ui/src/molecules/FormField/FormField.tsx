import type { FormFieldProps } from './FormField.types';

export function FormField({
  label,
  htmlFor,
  error,
  helpText,
  required = false,
  children,
  className = '',
}: FormFieldProps) {
  return (
    <div className={className} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label
        htmlFor={htmlFor}
        style={{
          fontSize: 'var(--font-size-sm)',
          fontWeight: 'var(--font-weight-semibold)' as string,
          color: 'var(--color-text)',
        }}
      >
        {label}
        {required && <span style={{ color: 'var(--color-danger)', marginLeft: 2 }}>*</span>}
      </label>
      {children}
      {error && (
        <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-danger)' }}>
          {error}
        </span>
      )}
      {!error && helpText && (
        <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
          {helpText}
        </span>
      )}
    </div>
  );
}
