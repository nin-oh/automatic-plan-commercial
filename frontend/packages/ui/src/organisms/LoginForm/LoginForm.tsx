import Button from '../../atoms/Button/Button';
import Icon from '../../atoms/Icon/Icon';
import { AlertMessage } from '../../molecules/AlertMessage';
import { InputField } from '../../molecules/InputField';
export interface LoginFormProps {
  email: string;
  password: string;
  loading: boolean;
  error?: string;
  showPassword: boolean;
  title: string;
  subtitle: string;
  emailLabel: string;
  emailPlaceholder: string;
  passwordLabel: string;
  passwordPlaceholder: string;
  submitLabel: string;
  loadingLabel: string;
  supportPrefix: string;
  supportLinkLabel: string;
  logoSrc: string;
  logoAlt: string;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onTogglePassword: () => void;
  onSubmit: () => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
}
export default function LoginForm(props: LoginFormProps) {
  return (
    <div className="login-card">
      <div className="login-card-header">
        <div className="brand-logo"><img src={props.logoSrc} alt={props.logoAlt} /></div>
        <h1 className="login-title">{props.title}</h1>
        <p className="login-subtitle">{props.subtitle}</p>
      </div>
      <AlertMessage message={props.error} />
      <InputField label={props.emailLabel} leftIcon={<Icon name="mail" size={15} />} inputProps={{ type: 'email', value: props.email, onChange: (e) => props.onEmailChange(e.target.value), placeholder: props.emailPlaceholder, onKeyDown: props.onKeyDown }} />
      <InputField label={props.passwordLabel} leftIcon={<Icon name="lock" size={15} />} rightSlot={<button type="button" className="icon-button" onClick={props.onTogglePassword} aria-label="Toggle password"><Icon name={props.showPassword ? 'eye' : 'eyeOff'} /></button>} inputProps={{ type: props.showPassword ? 'text' : 'password', value: props.password, onChange: (e) => props.onPasswordChange(e.target.value), placeholder: props.passwordPlaceholder, onKeyDown: props.onKeyDown }} />
      <Button variant="login" onClick={props.onSubmit} disabled={props.loading}>{props.loading ? props.loadingLabel : props.submitLabel}</Button>
      <p className="support-text">{props.supportPrefix} <a href="#">{props.supportLinkLabel}</a></p>
    </div>
  );
}
