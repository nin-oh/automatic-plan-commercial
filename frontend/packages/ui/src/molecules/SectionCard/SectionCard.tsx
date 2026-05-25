import type { ReactNode } from 'react';

export interface SectionCardProps {
  /** Optional small icon shown left of the title in a tinted square */
  icon?: ReactNode;
  /** Section title — e.g. "Métadonnées du deck" */
  title: string;
  /** Helper text underneath the title */
  subtitle?: string;
  /** Right-aligned action buttons in the header */
  actions?: ReactNode;
  /** Accent color for the icon square. Defaults to indigo (Amafin).
   * Pass the Plan Commercial orange for Plan Commercial pages. */
  accent?: string;
  /** Strip default padding from the body — useful when wrapping a table */
  flush?: boolean;
  className?: string;
  children: ReactNode;
}

/** Light-surface panel wrapper used across pages. White card, subtle border,
 * gentle shadow — matches the Amafin design language. The accent only shows
 * up in the icon tint so the surface itself stays neutral. */
export function SectionCard({
  icon, title, subtitle, actions, accent, flush, className, children,
}: SectionCardProps) {
  const accentColor = accent || '#6366f1';
  return (
    <section
      className={className}
      style={{
        background: '#ffffff',
        border: '1px solid #e4e4e7',
        borderRadius: 14,
        boxShadow: '0 1px 2px rgba(0, 0, 0, 0.03), 0 8px 24px rgba(0, 0, 0, 0.04)',
        overflow: 'hidden',
      }}
    >
      <header
        style={{
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
          gap: 12, padding: '16px 20px',
          borderBottom: subtitle ? '1px solid #f4f4f5' : 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          {icon && (
            <div
              style={{
                width: 36, height: 36, borderRadius: 10,
                background: `linear-gradient(135deg, ${accentColor}1f, ${accentColor}0a)`,
                color: accentColor,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
                border: `1px solid ${accentColor}26`,
              }}
            >
              {icon}
            </div>
          )}
          <div style={{ minWidth: 0 }}>
            <h3
              style={{
                margin: 0, color: '#18181b',
                fontSize: 14.5, fontWeight: 700,
                fontFamily: 'Inter, sans-serif', letterSpacing: -0.1,
              }}
            >
              {title}
            </h3>
            {subtitle && (
              <p
                style={{
                  margin: '3px 0 0', color: '#71717a',
                  fontSize: 12.5, fontWeight: 400, lineHeight: 1.45,
                }}
              >
                {subtitle}
              </p>
            )}
          </div>
        </div>
        {actions && (
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>{actions}</div>
        )}
      </header>
      <div style={{ padding: flush ? 0 : '18px 20px 20px' }}>{children}</div>
    </section>
  );
}
