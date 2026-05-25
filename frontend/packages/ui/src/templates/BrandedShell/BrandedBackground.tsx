import type { BrandConfig } from './types';

/** Subtle accent-tinted radial mesh. Identical visual structure for every app
 * — only the accent colors change. */
export function BrandedBackground({ brand }: { brand: BrandConfig }) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 0,
        background: `
          radial-gradient(circle at 15% 15%, ${brand.accent}1a 0%, transparent 35%),
          radial-gradient(circle at 85% 20%, ${brand.accent2}10 0%, transparent 35%),
          radial-gradient(circle at 50% 90%, ${brand.accent}0d 0%, transparent 35%),
          #fafafa
        `,
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `radial-gradient(circle, ${brand.accent}1a 1px, transparent 1px)`,
          backgroundSize: '28px 28px',
          maskImage: 'radial-gradient(ellipse at top, black 20%, transparent 70%)',
          WebkitMaskImage: 'radial-gradient(ellipse at top, black 20%, transparent 70%)',
        }}
      />
    </div>
  );
}
