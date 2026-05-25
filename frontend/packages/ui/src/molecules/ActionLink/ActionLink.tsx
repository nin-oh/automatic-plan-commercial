import Icon from '../../atoms/Icon/Icon';

export interface ActionLinkProps {
  disabled?: boolean;
  loading?: boolean;
  onClick?: () => void;
  label?: string;
  loadingLabel?: string;
  disabledLabel?: string;
  iconName?: string;
}

export default function ActionLink({
  disabled = false,
  loading = false,
  onClick,
  label = 'Ouvrir',
  loadingLabel = 'Chargement...',
  disabledLabel = 'Indisponible',
  iconName,
}: ActionLinkProps) {
  const classes = ['action-link', disabled ? 'is-disabled' : '', loading ? 'is-loading' : '']
    .filter(Boolean)
    .join(' ');
  return (
    <button
      type="button"
      className={classes}
      onClick={disabled ? undefined : onClick}
      disabled={disabled || loading}
    >
      {iconName ? <Icon name={iconName} size={14} /> : null}
      {disabled ? disabledLabel : loading ? loadingLabel : label}
    </button>
  );
}
