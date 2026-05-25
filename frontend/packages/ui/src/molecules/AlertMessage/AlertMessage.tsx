import Icon from '../../atoms/Icon/Icon';

export interface AlertMessageProps {
  message?: string;
  type?: 'error' | 'success';
}

export default function AlertMessage({ message, type = 'error' }: AlertMessageProps) {
  if (!message) return null;
  return (
    <div className={`alert alert--${type}`}>
      <Icon name="emoji" emoji={type === 'error' ? '\u26a0\ufe0f' : '\u2705'} />
      <span>{message}</span>
    </div>
  );
}
