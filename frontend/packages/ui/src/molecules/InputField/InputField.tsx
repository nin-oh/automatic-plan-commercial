import Input from '../../atoms/Input/Input';
import Label from '../../atoms/Label/Label';

export interface InputFieldProps {
  label: string;
  leftIcon?: React.ReactNode;
  rightSlot?: React.ReactNode;
  inputProps?: React.InputHTMLAttributes<HTMLInputElement>;
}

export default function InputField({ label, leftIcon, rightSlot, inputProps }: InputFieldProps) {
  return (
    <div className="input-field">
      <Label>{label}</Label>
      <div className="input-field__wrap">
        {leftIcon ? <span className="input-field__icon">{leftIcon}</span> : null}
        <Input className="input-field__control" {...inputProps} />
        {rightSlot ? <span className="input-field__right">{rightSlot}</span> : null}
      </div>
    </div>
  );
}
