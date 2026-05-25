export const theme = {
  colors: {
    background: '#F5F7FA',
    surface: '#FFFFFF',
    surfaceAlt: '#F8F9FA',
    text: '#2C3E50',
    textMuted: '#6C757D',
    textSoft: '#95A5A6',
    border: '#E0E0E0',
    borderSoft: '#ECF0F1',
    primary: '#467ed9',       // Amafin blue (intern uses #1788FF)
    primaryDark: '#3568bf',
    primaryLight: '#E3F2FD',
    secondary: '#FEAC00',
    info: '#1565C0',
    success: '#27AE60',
    successDark: '#1E8449',
    successLight: '#D4EDDA',
    warning: '#F39C12',
    warningDark: '#B7770D',
    warningLight: '#FFF3CD',
    danger: '#E74C3C',
    dangerDark: '#C0392B',
    dangerLight: '#F8D7DA',
    manager: '#7C3AED',
    managerLight: '#F3E8FF',
    hover: '#F0F8FF',
    overlay: 'rgba(0, 0, 0, 0.45)',
    // Amafin-specific
    navbar: '#dc3545',
    navbarDark: '#c82333',
    sidebar: '#142b38',
    cardBlue: '#007bff',
    cardGrey: '#6c757d',
    cardYellow: '#ffa600',
    cardPurple: '#6f42c1',
    cardRed: '#ef4444',
    cardGreen: '#2ed8b6',
  },
  typography: {
    family: "'Quicksand', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
    titleLg: '1.7rem',
    titleMd: '1.5rem',
    titleSm: '1.2rem',
    body: '0.9rem',
    bodySm: '0.85rem',
    caption: '0.82rem',
    captionXs: '0.75rem',
    weightRegular: '400',
    weightMedium: '500',
    weightSemibold: '600',
    weightBold: '700',
  },
  spacing: {
    xs: '0.25rem',
    sm: '0.5rem',
    md: '0.75rem',
    lg: '1rem',
    xl: '1.5rem',
    xxl: '2rem',
    xxxl: '2.5rem',
  },
  radius: {
    sm: '6px',
    md: '8px',
    lg: '10px',
    xl: '12px',
    xxl: '16px',
    pill: '20px',
    round: '999px',
  },
  shadow: {
    header: '0 2px 8px rgba(0, 0, 0, 0.08)',
    sidebar: '2px 0 8px rgba(0, 0, 0, 0.05)',
    card: '0 2px 8px rgba(0, 0, 0, 0.07)',
    modal: '0 8px 32px rgba(0, 0, 0, 0.25)',
    focus: '0 0 0 3px rgba(70, 126, 217, 0.12)',
    button: '0 4px 18px rgba(70, 126, 217, 0.35)',
  },
  layout: {
    headerHeight: '54px',
    sidebarWidth: '260px',
    sidebarCollapsed: '70px',
    loginCardWidth: '400px',
    modalWidth: '660px',
    accentHeight: '4px',
  },
  motion: {
    fast: '0.2s ease',
    normal: '0.25s ease',
  },
  zIndex: {
    header: '100',
    sidebar: '200',
    modal: '9000',
  },
} as const;

export const themeCssVars = `
:root {
  --font-family-base: ${theme.typography.family};
  --font-size-title-lg: ${theme.typography.titleLg};
  --font-size-title-md: ${theme.typography.titleMd};
  --font-size-title-sm: ${theme.typography.titleSm};
  --font-size-body: ${theme.typography.body};
  --font-size-body-sm: ${theme.typography.bodySm};
  --font-size-caption: ${theme.typography.caption};
  --font-size-caption-xs: ${theme.typography.captionXs};
  --font-weight-regular: ${theme.typography.weightRegular};
  --font-weight-medium: ${theme.typography.weightMedium};
  --font-weight-semibold: ${theme.typography.weightSemibold};
  --font-weight-bold: ${theme.typography.weightBold};
  --space-xs: ${theme.spacing.xs};
  --space-sm: ${theme.spacing.sm};
  --space-md: ${theme.spacing.md};
  --space-lg: ${theme.spacing.lg};
  --space-xl: ${theme.spacing.xl};
  --space-xxl: ${theme.spacing.xxl};
  --space-xxxl: ${theme.spacing.xxxl};
  --radius-sm: ${theme.radius.sm};
  --radius-md: ${theme.radius.md};
  --radius-lg: ${theme.radius.lg};
  --radius-xl: ${theme.radius.xl};
  --radius-xxl: ${theme.radius.xxl};
  --radius-pill: ${theme.radius.pill};
  --radius-round: ${theme.radius.round};
  --shadow-header: ${theme.shadow.header};
  --shadow-sidebar: ${theme.shadow.sidebar};
  --shadow-card: ${theme.shadow.card};
  --shadow-modal: ${theme.shadow.modal};
  --shadow-focus: ${theme.shadow.focus};
  --shadow-button: ${theme.shadow.button};
  --color-background: ${theme.colors.background};
  --color-surface: ${theme.colors.surface};
  --color-surface-alt: ${theme.colors.surfaceAlt};
  --color-text: ${theme.colors.text};
  --color-text-muted: ${theme.colors.textMuted};
  --color-text-soft: ${theme.colors.textSoft};
  --color-border: ${theme.colors.border};
  --color-border-soft: ${theme.colors.borderSoft};
  --color-primary: ${theme.colors.primary};
  --color-primary-dark: ${theme.colors.primaryDark};
  --color-primary-light: ${theme.colors.primaryLight};
  --color-secondary: ${theme.colors.secondary};
  --color-info: ${theme.colors.info};
  --color-success: ${theme.colors.success};
  --color-success-dark: ${theme.colors.successDark};
  --color-success-light: ${theme.colors.successLight};
  --color-warning: ${theme.colors.warning};
  --color-warning-dark: ${theme.colors.warningDark};
  --color-warning-light: ${theme.colors.warningLight};
  --color-danger: ${theme.colors.danger};
  --color-danger-dark: ${theme.colors.dangerDark};
  --color-danger-light: ${theme.colors.dangerLight};
  --color-manager: ${theme.colors.manager};
  --color-manager-light: ${theme.colors.managerLight};
  --color-hover: ${theme.colors.hover};
  --color-overlay: ${theme.colors.overlay};
  --layout-header-height: ${theme.layout.headerHeight};
  --layout-sidebar-width: ${theme.layout.sidebarWidth};
  --layout-sidebar-collapsed: ${theme.layout.sidebarCollapsed};
  --layout-login-card-width: ${theme.layout.loginCardWidth};
  --layout-modal-width: ${theme.layout.modalWidth};
  --layout-accent-height: ${theme.layout.accentHeight};
  --motion-fast: ${theme.motion.fast};
  --motion-normal: ${theme.motion.normal};
  --z-header: ${theme.zIndex.header};
  --z-sidebar: ${theme.zIndex.sidebar};
  --z-modal: ${theme.zIndex.modal};
}
`;

export function injectThemeVars(): void {
  if (typeof document === 'undefined') return;
  if (document.getElementById('amafin-theme-vars')) return;
  const styleTag = document.createElement('style');
  styleTag.id = 'amafin-theme-vars';
  styleTag.textContent = themeCssVars;
  document.head.appendChild(styleTag);
}
