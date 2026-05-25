export interface AvatarProps {
  initials?: string;
  variant?: 'chip' | 'sidebar';
  accent?: boolean;
}

export default function Avatar({ initials = '?', variant = 'chip', accent = false }: AvatarProps) {
  return (
    <div className={`avatar avatar--${variant}${accent ? ' avatar--accent' : ''}`}>
      {initials}
    </div>
  );
}
