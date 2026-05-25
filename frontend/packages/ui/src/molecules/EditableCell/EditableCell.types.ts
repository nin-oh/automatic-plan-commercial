import type { FieldType, Choice } from '../../types';

export interface EditableCellProps {
  /** Current value */
  value: string | number | boolean | null | undefined;
  /** Field type determines the input control */
  type: FieldType;
  /** For select fields */
  choices?: Choice[];
  /** Is this cell editable? */
  editable?: boolean;
  /** Number format (currency, percent, plain) */
  format?: 'currency' | 'percent' | 'plain';
  /** Locale for formatting */
  locale?: string;
  /** Called when user saves a new value */
  onSave?: (newValue: string | number | boolean) => void;
  className?: string;
}
