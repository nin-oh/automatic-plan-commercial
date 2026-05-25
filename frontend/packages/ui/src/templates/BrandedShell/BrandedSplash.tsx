import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { BrandConfig } from './types';

/** Animated splash shown once per session. Same choreography for every app —
 * grid fade, particles, orbit rings, glow orb, spring-up logo, letter-by-letter
 * brand name, progress bar. Colors and text come from `brand`. */
export function BrandedSplash({
  brand, onComplete,
}: { brand: BrandConfig; onComplete: () => void }) {
  const [visible, setVisible] = useState(true);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const start = Date.now();
    const duration = 2200;
    const tick = () => {
      const pct = Math.min(((Date.now() - start) / duration) * 100, 100);
      setProgress(pct);
      if (pct < 100) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    const exitTimer = setTimeout(() => setVisible(false), 2400);
    const completeTimer = setTimeout(() => onComplete(), 2700);
    return () => { clearTimeout(exitTimer); clearTimeout(completeTimer); };
  }, [onComplete]);

  const accent3 = brand.accent3 ?? brand.accent2;
  // Default radial: dark warm/cool tone derived from accent — apps can override.
  const splashBg = brand.splashBackground
    ?? `radial-gradient(circle at 50% 50%, ${darken(brand.accent, 0.65)} 0%, ${darken(brand.accent2, 0.85)} 50%, #09090b 100%)`;
  const logoGradient = `linear-gradient(135deg, ${brand.accent}, ${darken(brand.accent, 0.1)}, ${accent3})`;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          exit={{ opacity: 0, scale: 1.05 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          style={{
            position: 'fixed', inset: 0, zIndex: 99999,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexDirection: 'column',
            background: splashBg,
            overflow: 'hidden',
          }}
        >
          {/* Grid pattern */}
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8 }}
            style={{
              position: 'absolute', inset: 0,
              backgroundImage: `linear-gradient(${brand.accent}1a 1px, transparent 1px),
                                linear-gradient(90deg, ${brand.accent}1a 1px, transparent 1px)`,
              backgroundSize: '40px 40px',
              maskImage: 'radial-gradient(circle at 50% 50%, black 30%, transparent 70%)',
              WebkitMaskImage: 'radial-gradient(circle at 50% 50%, black 30%, transparent 70%)',
            }}
          />

          {/* Floating particles */}
          {[...Array(20)].map((_, i) => (
            <motion.div
              key={i}
              initial={{ x: `${Math.random() * 100}vw`, y: `${Math.random() * 100}vh`, opacity: 0 }}
              animate={{ x: `${Math.random() * 100}vw`, y: `${Math.random() * 100}vh`, opacity: [0, 0.8, 0] }}
              transition={{ duration: 3 + Math.random() * 2, repeat: Infinity, delay: Math.random() * 2 }}
              style={{
                position: 'absolute', width: 3, height: 3, borderRadius: '50%',
                background: brand.accent,
                boxShadow: `0 0 8px ${brand.accent}`,
              }}
            />
          ))}

          {/* Orbit rings */}
          <div style={{
            position: 'absolute', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
          }}>
            {[220, 280, 340].map((size, i) => (
              <motion.div
                key={i}
                animate={{ rotate: 360 }}
                transition={{ duration: 8 + i * 2, repeat: Infinity, ease: 'linear' }}
                style={{
                  position: 'absolute',
                  width: size, height: size, borderRadius: '50%',
                  border: `1px solid ${brand.accent}30`,
                  borderTopColor: `${brand.accent2}a6`,
                  borderRightColor: `${accent3}66`,
                }}
              />
            ))}
          </div>

          {/* Glow orb behind logo */}
          <motion.div
            animate={{ scale: [1, 1.3, 1], opacity: [0.4, 0.85, 0.4] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            style={{
              position: 'absolute',
              width: 220, height: 220, borderRadius: '50%',
              background: `radial-gradient(circle, ${brand.accent} 0%, transparent 70%)`,
              filter: 'blur(40px)',
            }}
          />

          {/* Logo */}
          <motion.div
            initial={{ scale: 0, opacity: 0, rotate: -180 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            transition={{
              duration: 1.2, ease: [0.22, 1, 0.36, 1],
              scale: { type: 'spring', damping: 10, stiffness: 100 },
            }}
            style={{
              position: 'relative', zIndex: 2,
              width: 130, height: 130, borderRadius: 26,
              background: logoGradient,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: `0 0 60px ${brand.accent}a6, 0 0 120px ${brand.accent2}66`,
              overflow: 'hidden',
            }}
          >
            <motion.div
              animate={{ x: ['-100%', '200%'] }}
              transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
              style={{
                position: 'absolute', top: 0, left: 0, width: '50%', height: '100%',
                background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)',
                transform: 'skewX(-20deg)',
              }}
            />
            <img
              src={brand.logoSrc}
              alt={brand.name}
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              style={{
                width: '78%', height: '78%', objectFit: 'contain',
                filter: 'drop-shadow(0 0 12px rgba(255,255,255,0.5))',
                position: 'relative', zIndex: 1,
              }}
            />
          </motion.div>

          {/* Brand name */}
          <motion.div
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6, duration: 0.6 }}
            style={{
              marginTop: 32,
              display: 'flex', gap: 2,
              fontSize: 36, fontWeight: 800,
              letterSpacing: 5,
              fontFamily: 'Inter, sans-serif',
            }}
          >
            {brand.name.toUpperCase().split('').map((letter, i) => (
              <motion.span
                key={i}
                initial={{ opacity: 0, y: 20, filter: 'blur(10px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                transition={{ delay: 0.8 + i * 0.05, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                style={{
                  background: `linear-gradient(135deg, #fff 0%, ${lighten(brand.accent, 0.6)} 50%, ${lighten(brand.accent2, 0.6)} 100%)`,
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                  display: 'inline-block',
                  width: letter === ' ' ? '0.4em' : 'auto',
                }}
              >
                {letter === ' ' ? ' ' : letter}
              </motion.span>
            ))}
          </motion.div>

          {/* Tagline */}
          {brand.tagline && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              transition={{ delay: 1.4, duration: 0.6 }}
              style={{
                marginTop: 10,
                fontSize: 11,
                letterSpacing: 4,
                color: `${lighten(brand.accent, 0.5)}bf`,
                fontFamily: 'JetBrains Mono, monospace',
                fontWeight: 500,
                textTransform: 'uppercase',
              }}
            >
              ◆ {brand.tagline} ◆
            </motion.div>
          )}

          {/* Progress bar */}
          <motion.div
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.6, duration: 0.5 }}
            style={{
              marginTop: 48,
              width: 240, height: 2,
              background: `${brand.accent}26`,
              borderRadius: 2, overflow: 'hidden', position: 'relative',
            }}
          >
            <motion.div
              style={{
                height: '100%',
                background: `linear-gradient(90deg, ${brand.accent}, ${brand.accent2})`,
                width: `${progress}%`,
                boxShadow: `0 0 10px ${brand.accent}`,
              }}
            />
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            transition={{ delay: 1.7, duration: 0.4 }}
            style={{
              marginTop: 10, fontSize: 10, letterSpacing: 2,
              color: `${lighten(brand.accent, 0.6)}8c`,
              fontFamily: 'JetBrains Mono, monospace',
            }}
          >
            Initialisation… {Math.round(progress)}%
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// Tiny color helpers — simple HSL-ish blend with black/white. Good enough
// for accent-tinted backgrounds without pulling in a color library.
function darken(hex: string, amount: number): string {
  return mix(hex, '#000000', amount);
}
function lighten(hex: string, amount: number): string {
  return mix(hex, '#ffffff', amount);
}
function mix(a: string, b: string, t: number): string {
  const ar = parseInt(a.slice(1, 3), 16);
  const ag = parseInt(a.slice(3, 5), 16);
  const ab = parseInt(a.slice(5, 7), 16);
  const br = parseInt(b.slice(1, 3), 16);
  const bg = parseInt(b.slice(3, 5), 16);
  const bb = parseInt(b.slice(5, 7), 16);
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return '#' + [r, g, bl].map((v) => v.toString(16).padStart(2, '0')).join('');
}
