export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  className?: string;
}

export default function Input({ className = '', ...props }: InputProps) {
  return <input className={`input-base ${className}`.trim()} {...props} />;
}
