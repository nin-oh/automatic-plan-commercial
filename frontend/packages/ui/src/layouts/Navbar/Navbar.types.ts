export interface NavbarAction {
  label: string;
  icon?: string;
  onClick?: () => void;
}

export interface NavbarProps {
  title?: string;
  actions?: NavbarAction[];
  userName?: string;
  onLogout?: () => void;
  sidebarCollapsed?: boolean;
  className?: string;
}
