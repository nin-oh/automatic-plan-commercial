export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  className?: string;
}

export default function Select({ className = '', children, ...props }: SelectProps) {
  return (
    <select className={`select-base ${className}`.trim()} {...props}>
      {children}
    </select>
  );
}
