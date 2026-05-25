export interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
  required?: boolean;
}

export default function Label({ children, required = false, htmlFor, ...props }: LabelProps) {
  return (
    <label className="field-label" htmlFor={htmlFor} {...props}>
      {children}
      {required && <span className="field-label__required">*</span>}
    </label>
  );
}
