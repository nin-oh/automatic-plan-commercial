import type { ColumnDef, ID } from '../../types';

export interface SmartTableProps {
  /** Column definitions (from /form_options/ or manual) */
  columns: ColumnDef[];
  /** Row data from API */
  data: Record<string, unknown>[];
  /** Table title displayed above */
  label?: string;
  /** Header row background color */
  headerColor?: string;
  /** Which field is the row ID (default: "id") */
  idField?: string;
  /** Locale for number/currency formatting */
  locale?: string;

  /** Called when user edits a cell inline */
  onCellEdit?: (id: ID, field: string, value: unknown) => Promise<unknown>;
  /** Called when user adds a new row */
  onRowAdd?: (row: Record<string, unknown>) => Promise<unknown>;
  /** Called when user deletes a row */
  onRowDelete?: (id: ID) => Promise<void>;

  /** Enable search bar */
  searchable?: boolean;
  /** Enable column sorting */
  sortable?: boolean;
  /** Enable pagination */
  paginated?: boolean;
  /** Default page size */
  pageSize?: number;

  /** Loading state */
  loading?: boolean;

  className?: string;
}
