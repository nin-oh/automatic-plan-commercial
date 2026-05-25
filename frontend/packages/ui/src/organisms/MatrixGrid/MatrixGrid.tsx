import MatrixCell from '../../molecules/MatrixCell/MatrixCell';

export interface MatrixGridRow {
  id: string;
  label: string;
}

export interface MatrixGridColumn {
  id: string;
  label: string;
}

export interface MatrixGridProps {
  rows: MatrixGridRow[];
  columns: MatrixGridColumn[];
  /** Values keyed as "rowId:colId" → number */
  values: Record<string, number>;
  editable?: boolean;
  onCellSave?: (rowId: string, colId: string, value: number) => Promise<void> | void;
  formatValue?: (value: number) => React.ReactNode;
  showRowTotals?: boolean;
  showColumnTotals?: boolean;
  colorize?: boolean;
}

export default function MatrixGrid({
  rows,
  columns,
  values,
  editable = true,
  onCellSave,
  formatValue,
  showRowTotals = true,
  showColumnTotals = true,
  colorize = true,
}: MatrixGridProps) {
  function getValue(rowId: string, colId: string): number {
    return values[`${rowId}:${colId}`] ?? 0;
  }

  function getRowTotal(rowId: string): number {
    return columns.reduce((sum, col) => sum + getValue(rowId, col.id), 0);
  }

  function getColTotal(colId: string): number {
    return rows.reduce((sum, row) => sum + getValue(row.id, colId), 0);
  }

  const grandTotal = rows.reduce((sum, row) => sum + getRowTotal(row.id), 0);

  return (
    <div className="matrix-grid">
      <table className="data-table">
        <thead>
          <tr>
            <th></th>
            {columns.map(col => <th key={col.id}>{col.label}</th>)}
            {showRowTotals && <th>Total</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.id}>
              <td className="cell-strong">{row.label}</td>
              {columns.map(col => (
                <td key={col.id}>
                  <MatrixCell
                    value={getValue(row.id, col.id)}
                    editable={editable}
                    onSave={(val) => onCellSave?.(row.id, col.id, val)}
                    formatValue={formatValue}
                    colorize={colorize}
                  />
                </td>
              ))}
              {showRowTotals && (
                <td className="cell-strong">
                  <MatrixCell value={getRowTotal(row.id)} editable={false} formatValue={formatValue} colorize={colorize} />
                </td>
              )}
            </tr>
          ))}
          {showColumnTotals && (
            <tr className="is-pending">
              <td className="cell-strong">TOTAL</td>
              {columns.map(col => (
                <td key={col.id} className="cell-strong">
                  <MatrixCell value={getColTotal(col.id)} editable={false} formatValue={formatValue} colorize={colorize} />
                </td>
              ))}
              {showRowTotals && (
                <td className="cell-strong">
                  <MatrixCell value={grandTotal} editable={false} formatValue={formatValue} colorize={colorize} />
                </td>
              )}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
