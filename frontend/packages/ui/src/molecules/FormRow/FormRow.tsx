export interface FormRowProps {
  columns?: number;
  children: React.ReactNode;
}

export default function FormRow({ columns = 2, children }: FormRowProps) {
  return (
    <div
      className="field-row"
      style={
        columns === 2
          ? undefined
          : { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }
      }
    >
      {children}
    </div>
  );
}
