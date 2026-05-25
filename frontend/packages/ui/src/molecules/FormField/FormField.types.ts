import type { Size } from '../../types';

export interface FormFieldProps {
  /** Field label */
  label: string;
  /** HTML for/id attribute */
  htmlFor?: string;
  /** Error message (shown in red below input) */
  error?: string;
  /** Help text (shown in grey below input) */
  helpText?: string;
  /** Mark as required (shows *) */
  required?: boolean;
  /** Size variant */
  size?: Size;
  /** The input/select/datepicker element */
  children: React.ReactNode;
  className?: string;
}
