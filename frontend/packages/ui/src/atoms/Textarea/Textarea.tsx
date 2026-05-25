export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  className?: string;
}

export default function Textarea({ className = '', ...props }: TextareaProps) {
  return <textarea className={`textarea-base ${className}`.trim()} {...props} />;
}
