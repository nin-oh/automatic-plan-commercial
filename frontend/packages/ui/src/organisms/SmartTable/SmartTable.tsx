import { useState, useMemo, useCallback } from 'react';
import { SearchInput } from '../../molecules/SearchInput';
import { SortHeader } from '../../molecules/SortHeader';
import { EditableCell } from '../../molecules/EditableCell';
import { Pagination } from '../../molecules/Pagination';
import { PageSizeSelector } from '../../molecules/PageSizeSelector';
import { Button } from '../../atoms/Button';
import { Spinner } from '../../atoms/Spinner';
import { EmptyState } from '../../atoms/EmptyState';
import { Text } from '../../atoms/Text';
import type { SmartTableProps } from './SmartTable.types';
import type { SortDirection } from '../../types';
import styles from './SmartTable.module.css';

export function SmartTable({
  columns,
  data,
  label,
  headerColor = 'var(--color-primary)',
  idField = 'id',
  locale = 'fr-MA',
  onCellEdit,
  onRowAdd,
  onRowDelete,
  searchable = true,
  sortable = true,
  paginated = true,
  pageSize: defaultPageSize = 25,
  loading = false,
  className = '',
}: SmartTableProps) {
  // ── State ──
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDirection>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);
  const [showNewRow, setShowNewRow] = useState(false);
  const [newRowData, setNewRowData] = useState<Record<string, unknown>>({});

  // ── Visible columns ──
  const visibleColumns = useMemo(
    () => columns.filter((c) => c.visible !== false),
    [columns],
  );

  // ── Search filter ──
  const filtered = useMemo(() => {
    if (!search.trim()) return data;
    const term = search.toLowerCase();
    return data.filter((row) =>
      visibleColumns.some((col) => {
        const val = row[col.key];
        return val != null && String(val).toLowerCase().includes(term);
      }),
    );
  }, [data, search, visibleColumns]);

  // ── Sort ──
  const sorted = useMemo(() => {
    if (!sortKey || !sortDir) return filtered;
    return [...filtered].sort((a, b) => {
      const av = a[sortKey] ?? '';
      const bv = b[sortKey] ?? '';
      const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true });
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir]);

  // ── Pagination ──
  const totalPages = paginated ? Math.max(1, Math.ceil(sorted.length / pageSize)) : 1;
  const pageData = paginated ? sorted.slice((page - 1) * pageSize, page * pageSize) : sorted;

  // Reset page when search changes
  const handleSearch = useCallback((val: string) => {
    setSearch(val);
    setPage(1);
  }, []);

  // ── Sort toggle ──
  const toggleSort = useCallback((key: string) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : d === 'desc' ? null : 'asc'));
      if (sortDir === 'desc') setSortKey(null);
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }, [sortKey, sortDir]);

  // ── Cell edit handler ──
  const handleCellEdit = useCallback(
    async (rowId: unknown, field: string, value: unknown) => {
      if (onCellEdit) {
        await onCellEdit(rowId as string | number, field, value);
      }
    },
    [onCellEdit],
  );

  // ── New row ──
  const handleNewRowSave = useCallback(async () => {
    if (onRowAdd) {
      await onRowAdd(newRowData);
      setNewRowData({});
      setShowNewRow(false);
    }
  }, [onRowAdd, newRowData]);

  // ── Loading ──
  if (loading) {
    return (
      <div className={styles.loading}>
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className={`${styles.container} ${className}`}>
      {/* ── Toolbar ── */}
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          {label && <Text size="lg" weight="bold">{label}</Text>}
          <PageSizeSelector value={pageSize} onChange={(s) => { setPageSize(s); setPage(1); }} />
        </div>
        <div className={styles.toolbarRight}>
          {searchable && <SearchInput value={search} onChange={handleSearch} />}
          {onRowAdd && (
            <Button size="sm" onClick={() => setShowNewRow(!showNewRow)}>
              {showNewRow ? 'Annuler' : '+ Ajouter'}
            </Button>
          )}
        </div>
      </div>

      {/* ── Table ── */}
      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr style={{ backgroundColor: headerColor }}>
              {visibleColumns.map((col) =>
                sortable ? (
                  <SortHeader
                    key={col.key}
                    label={col.label}
                    active={sortKey === col.key}
                    direction={sortKey === col.key ? sortDir : null}
                    onClick={() => toggleSort(col.key)}
                  />
                ) : (
                  <th key={col.key} className={styles.th}>
                    {col.label}
                  </th>
                ),
              )}
              {onRowDelete && <th className={styles.th} style={{ backgroundColor: headerColor, width: 50 }} />}
            </tr>
          </thead>
          <tbody>
            {/* New row form */}
            {showNewRow && (
              <tr className={styles.newRow}>
                {visibleColumns.map((col) => (
                  <td key={col.key} className={styles.td}>
                    <EditableCell
                      value={newRowData[col.key] as string ?? col.defaultValue ?? ''}
                      type={col.type}
                      choices={col.choices}
                      editable
                      format={col.format}
                      locale={locale}
                      onSave={(val) => setNewRowData((prev) => ({ ...prev, [col.key]: val }))}
                    />
                  </td>
                ))}
                {onRowDelete && <td />}
                <td>
                  <Button size="sm" onClick={handleNewRowSave}>Enregistrer</Button>
                </td>
              </tr>
            )}

            {/* Data rows */}
            {pageData.length === 0 ? (
              <tr>
                <td colSpan={visibleColumns.length + (onRowDelete ? 1 : 0)}>
                  <EmptyState message="Aucune donnée trouvée" />
                </td>
              </tr>
            ) : (
              pageData.map((row) => {
                const rowId = row[idField];
                return (
                  <tr key={String(rowId)} className={styles.row}>
                    {visibleColumns.map((col) => (
                      <td
                        key={col.key}
                        className={`${styles.td} ${col.editable ? styles.editable : styles.readOnly}`}
                      >
                        <EditableCell
                          value={row[col.key] as string | number | boolean}
                          type={col.type}
                          choices={col.choices}
                          editable={col.editable ?? false}
                          format={col.format}
                          locale={locale}
                          onSave={(val) => handleCellEdit(rowId, col.key, val)}
                        />
                      </td>
                    ))}
                    {onRowDelete && (
                      <td className={styles.td}>
                        <button
                          className={styles.deleteBtn}
                          onClick={() => onRowDelete(rowId as string | number)}
                          title="Supprimer"
                        >
                          &times;
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ── Footer ── */}
      {paginated && (
        <div className={styles.footer}>
          <Text size="sm" muted>
            {sorted.length} résultat{sorted.length !== 1 ? 's' : ''}
          </Text>
          <Pagination page={page} totalPages={totalPages} onChange={setPage} />
        </div>
      )}
    </div>
  );
}
