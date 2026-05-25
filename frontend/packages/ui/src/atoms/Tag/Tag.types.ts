export interface TagProps {
  children: React.ReactNode;
  /** Background color (hex or CSS variable) */
  color?: string;
  /** Text color */
  textColor?: string;
  /** Show remove button */
  onRemove?: () => void;
  className?: string;
}
