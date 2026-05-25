export interface DataTableCell {
  content: React.ReactNode;
  className?: string;
}
export interface DataTableRow {
  key: string | number;
  className?: string;
  cells: DataTableCell[];
}
export interface DataTableEmptyState {
  icon: React.ReactNode;
  title: string;
  text: string;
}
export interface DataTableProps {
  headers: string[];
  rows: DataTableRow[];
  emptyState: DataTableEmptyState;
}
export default function DataTable({ headers, rows, emptyState }: DataTableProps) {
  return (
    <table className="data-table">
      <thead>
        <tr>{headers.map((h) => <th key={h}>{h}</th>)}</tr>
      </thead>
      <tbody>
        {!rows.length ? (
          <tr><td colSpan={headers.length}>
            <div className="empty-state">
              <div className="empty-state__icon">{emptyState.icon}</div>
              <div className="empty-state__title">{emptyState.title}</div>
              <div className="empty-state__text">{emptyState.text}</div>
            </div>
          </td></tr>
        ) : rows.map((row) => (
          <tr key={row.key} className={row.className}>
            {row.cells.map((cell, i) => <td key={`${row.key}-${i}`} className={cell.className || ''}>{cell.content}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
