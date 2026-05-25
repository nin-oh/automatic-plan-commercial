interface DividerProps {
  vertical?: boolean;
  color?: string;
  spacing?: string;
  className?: string;
}

export function Divider({
  vertical = false,
  color = 'var(--color-border)',
  spacing = 'var(--space-md)',
  className = '',
}: DividerProps) {
  return (
    <div
      className={className}
      style={
        vertical
          ? { width: 1, backgroundColor: color, alignSelf: 'stretch', margin: `0 ${spacing}` }
          : { height: 1, backgroundColor: color, width: '100%', margin: `${spacing} 0` }
      }
    />
  );
}
