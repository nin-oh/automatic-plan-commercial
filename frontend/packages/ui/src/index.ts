// Styles (intern's styles.css + theme injection)
import './styles.css';

// Theme tokens + CSS variable injection
export { theme, injectThemeVars } from './tokens/theme';

// ── Atoms ──
export * from './atoms';

// ── Molecules ──
export * from './molecules';

// ── Organisms ──
export * from './organisms';

// ── Templates ──
export * from './templates';

// ── Layouts (Amafin-specific: AppShell, Sidebar, Navbar) ──
export * from './layouts';

// ── Hooks ──
export * from './hooks';

// ── Types ──
export * from './types';
