import type { ReactNode } from 'react';

/** Per-app brand identity consumed by every shell component. Keeping it as a
 * single object means the apps only construct it once and pass it down — no
 * scattered color literals. */
export interface BrandConfig {
  /** Long display name — sidebar header + splash text */
  name: string;
  /** Short subtitle under the name in the sidebar (e.g. "Workspace") */
  subtitle?: string;
  /** Logo image URL — placed inside the gradient square in sidebar + splash */
  logoSrc: string;
  /** Tagline shown below the brand name in the splash screen */
  tagline?: string;
  /** Primary accent color */
  accent: string;
  /** Gradient stop — accent + accent2 form the brand gradient */
  accent2: string;
  /** Optional third stop for the splash logo gradient (defaults to accent2) */
  accent3?: string;
  /** Optional override for the splash background radial gradient */
  splashBackground?: string;
  /** Footer user card */
  user?: { name: string; role: string };
}

export interface NavItem {
  key: string;
  label: string;
  icon: ReactNode;
}

export interface NavSection {
  title?: string;
  items: NavItem[];
}
