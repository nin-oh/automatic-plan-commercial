import type { SidebarSection } from '../Sidebar';
import type { NavbarAction } from '../Navbar';

export interface AppShellProps {
  children: React.ReactNode;
  sidebarSections: SidebarSection[];
  sidebarLogo?: React.ReactNode;
  navbarActions?: NavbarAction[];
  userName?: string;
  onLogout?: () => void;
  activePath?: string;
  onNavigate?: (path: string) => void;
  className?: string;
}
