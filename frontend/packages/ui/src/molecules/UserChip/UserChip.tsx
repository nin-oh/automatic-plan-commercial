import Avatar from '../../atoms/Avatar/Avatar';

export interface UserChipProps {
  initials?: string;
  primaryText?: string;
  secondaryText?: string;
  variant?: 'header' | 'sidebar';
  accent?: boolean;
}

export default function UserChip({
  initials = '?',
  primaryText = '',
  secondaryText = '',
  variant = 'header',
  accent = false,
}: UserChipProps) {
  if (variant === 'sidebar') {
    return (
      <div className="sidebar-user">
        <Avatar initials={initials} variant="sidebar" accent={accent} />
        <div>
          <div className="sidebar-user__name">{primaryText}</div>
        </div>
      </div>
    );
  }
  return (
    <div className={`user-chip${accent ? ' user-chip--accent' : ''}`}>
      <Avatar initials={initials} variant="chip" accent={accent} />
      <div>
        <div className="user-chip__name">{primaryText}</div>
        <div className={`user-chip__meta${accent ? ' user-chip__meta--accent' : ''}`}>
          {secondaryText}
        </div>
      </div>
    </div>
  );
}
