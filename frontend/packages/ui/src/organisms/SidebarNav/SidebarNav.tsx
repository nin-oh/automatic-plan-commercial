export interface SidebarNavItem {
  key: string;
  label: string;
}
export interface SidebarNavSection {
  title: string;
  items: SidebarNavItem[];
}
export interface SidebarNavProps {
  sections: SidebarNavSection[];
  activeView: string;
  onNavigate: (view: string) => void;
  footer?: React.ReactNode;
}
export default function SidebarNav({ sections, activeView, onNavigate, footer = null }: SidebarNavProps) {
  return (
    <aside className="sidebar">
      <div>
        {sections.map((section) => (
          <div className="sidebar-section" key={section.title}>
            <div className="sidebar-section-title">{section.title}</div>
            <ul className="sidebar-menu">
              {section.items.map((item) => (
                <li key={item.key}>
                  <button type="button" className={`sidebar-item${activeView === item.key ? ' is-active' : ''}`} onClick={() => onNavigate(item.key)}>
                    {item.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="sidebar-footer">{footer}</div>
    </aside>
  );
}
