/** A choice option for select dropdowns — matches Django DRF form_options output */
export interface Choice {
  value: string | number;
  label: string;
}

/** Field types supported by the component library */
export type FieldType = 'text' | 'number' | 'date' | 'select' | 'checkbox';

/** Display format for number fields */
export type NumberFormat = 'currency' | 'percent' | 'plain';

/**
 * Column definition for SmartTable.
 * Matches the shape returned by Django form_options endpoints.
 */
export interface ColumnDef {
  /** Field name from API (e.g. "Doc_num", "montant_dhs") */
  key: string;
  /** Display label (e.g. "Document", "Montant DHS") */
  label: string;
  /** Input type for editing */
  type: FieldType;
  /** Can the user edit this field inline? */
  editable?: boolean;
  /** Dropdown options (for type: 'select') */
  choices?: Choice[];
  /** Number display format */
  format?: NumberFormat;
  /** Default value when creating a new row */
  defaultValue?: string | number | boolean;
  /** Whether the column is visible (default: true) */
  visible?: boolean;
  /** Minimum column width in px */
  minWidth?: number;
  /** Is this field required? */
  required?: boolean;
}

/**
 * Field metadata for MetaForm.
 * Extended column definition with validation rules.
 */
export interface FieldMeta extends ColumnDef {
  /** Is this field required? */
  required?: boolean;
  /** Placeholder text */
  placeholder?: string;
  /** Help text shown below the field */
  helpText?: string;
}
