import { forwardRef } from 'react';

export interface DatePickerProps extends React.InputHTMLAttributes<HTMLInputElement> {
  className?: string;
}

export const DatePicker = forwardRef<HTMLInputElement, DatePickerProps>(
  ({ className = '', ...rest }, ref) => {
    return <input ref={ref} type="date" className={`input-base ${className}`.trim()} {...rest} />;
  },
);

DatePicker.displayName = 'DatePicker';
