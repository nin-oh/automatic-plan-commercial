export interface SidebarItem {
  label: string;
  path: string;
  icon?: string;
}

export interface SidebarSection {
  title?: string;
  items: SidebarItem[];
}

export interface SidebarProps {
  sections: SidebarSection[];
  logo?: React.ReactNode;
  collapsed?: boolean;
  onToggle?: () => void;
  activePath?: string;
  onNavigate?: (path: string) => void;
  className?: string;
}
