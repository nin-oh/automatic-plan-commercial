export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'success' | 'danger' | 'login' | 'ghost-danger';
  size?: 'md' | 'sm';
  block?: boolean;
  icon?: React.ReactNode;
}

export default function Button({
  variant = 'primary',
  size = 'md',
  block = false,
  type = 'button',
  icon,
  children,
  className = '',
  ...props
}: ButtonProps) {
  const classes = [
    'button',
    `button--${variant}`,
    size === 'sm' ? 'button--sm' : '',
    block ? 'button--block' : '',
    className,
  ].filter(Boolean).join(' ');

  return (
    <button type={type} className={classes} {...props}>
      {icon}
      {children}
    </button>
  );
}
