import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type BrandButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type BrandButtonSize = 'sm' | 'md';

export interface BrandButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'style'> {
  variant?: BrandButtonVariant;
  size?: BrandButtonSize;
  /** Icon node placed left of the label */
  icon?: ReactNode;
  /** Make the gradient/colors override the per-app `--accent` CSS variable */
  accent?: string;
  accent2?: string;
  /** Render as a non-button element while keeping the styling — e.g. `as="a"`
   * to make a download link look like the primary button. */
  as?: 'button' | 'a';
  /** When `as="a"`, this becomes the link target */
  href?: string;
  download?: string | boolean;
  /** Allow extra CSS overrides for one-off cases */
  style?: React.CSSProperties;
}

/** Brand-aware button — picks its colors from the `--accent` / `--accent2`
 * CSS variables (set per app in their `index.css`). Drop-in replacement for
 * the `pcButton` style helpers. */
export function BrandButton({
  variant = 'primary',
  size = 'md',
  icon,
  accent,
  accent2,
  as = 'button',
  children,
  style,
  ...rest
}: BrandButtonProps) {
  // We keep the actual color values in CSS variables so each app's index.css
  // can override them (Plan Commercial → orange, Amafin → indigo). Inline
  // overrides via the `accent` prop win for one-off cases.
  const cssVars: Record<string, string> = {};
  if (accent) cssVars['--bb-accent'] = accent;
  if (accent2) cssVars['--bb-accent-2'] = accent2;

  const sizeStyles: React.CSSProperties = size === 'sm'
    ? { padding: '6px 10px', fontSize: 11.5, gap: 5 }
    : { padding: '8px 12px', fontSize: 12.5, gap: 6 };

  const variantStyles = VARIANTS[variant];

  const merged: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    borderRadius: 8, fontWeight: 600,
    fontFamily: 'Inter, sans-serif', cursor: 'pointer', textDecoration: 'none',
    transition: 'all 140ms', whiteSpace: 'nowrap',
    ...sizeStyles,
    ...variantStyles,
    ...cssVars,
    ...style,
  };

  const content = (<>{icon}{children}</>);

  if (as === 'a') {
    const { href, download, ...buttonRest } = rest as any;
    return <a href={href} download={download} style={merged} {...buttonRest}>{content}</a>;
  }
  return <button style={merged} {...rest}>{content}</button>;
}

// CSS-variable-driven palette. Falls back to the `--accent` page-level var, or
// hardcoded indigo as the very last resort (so a `<BrandButton>` outside of a
// themed app still renders something visible).
const ACCENT  = 'var(--bb-accent, var(--accent, #6366f1))';
const ACCENT2 = 'var(--bb-accent-2, var(--accent2, #8b5cf6))';

const VARIANTS: Record<BrandButtonVariant, React.CSSProperties> = {
  primary: {
    border: 'none',
    background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT2})`,
    color: '#fff',
    boxShadow: `0 4px 12px color-mix(in srgb, ${ACCENT} 40%, transparent)`,
  },
  secondary: {
    border: '1px solid #e4e4e7',
    background: '#ffffff',
    color: '#27272a',
    boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
  },
  ghost: {
    border: '1px solid transparent',
    background: 'transparent',
    color: '#52525b',
  },
  danger: {
    border: '1px solid #fecaca',
    background: '#fef2f2',
    color: '#b91c1c',
  },
};
