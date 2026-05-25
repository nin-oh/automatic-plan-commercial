import Label from '../../atoms/Label/Label';

export interface FormGroupProps {
  label?: string;
  required?: boolean;
  hint?: React.ReactNode;
  children: React.ReactNode;
}

export default function FormGroup({ label, required = false, hint = null, children }: FormGroupProps) {
  return (
    <div className="field-group">
      {label ? <Label required={required}>{label}</Label> : null}
      {children}
      {hint}
    </div>
  );
}
