import type { TextProps } from './Text.types';

const sizeMap: Record<string, string> = {
  xs: 'var(--font-size-xs)',
  sm: 'var(--font-size-sm)',
  md: 'var(--font-size-md)',
  lg: 'var(--font-size-lg)',
  xl: 'var(--font-size-xl)',
};

const weightMap: Record<string, string> = {
  normal: 'var(--font-weight-normal)',
  medium: 'var(--font-weight-medium)',
  semibold: 'var(--font-weight-semibold)',
  bold: 'var(--font-weight-bold)',
};

export function Text({
  children,
  size = 'md',
  weight = 'normal',
  color,
  muted = false,
  as: Tag = 'span',
  className = '',
  style,
}: TextProps) {
  return (
    <Tag
      className={className}
      style={{
        fontSize: sizeMap[size],
        fontWeight: weightMap[weight],
        color: muted ? 'var(--color-text-muted)' : color || 'inherit',
        ...style,
      }}
    >
      {children}
    </Tag>
  );
}
