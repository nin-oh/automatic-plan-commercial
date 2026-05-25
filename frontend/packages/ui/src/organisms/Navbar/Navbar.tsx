export interface NavbarProps {
  brand: React.ReactNode;
  children?: React.ReactNode;
}
export default function Navbar({ brand, children }: NavbarProps) {
  return (
    <header className="app-header">
      <div className="app-logo">{brand}</div>
      <div className="header-right">{children}</div>
    </header>
  );
}
