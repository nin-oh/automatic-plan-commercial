/**
 * SmartTablePage — Generic CRUD page matching old Django editability.
 *
 * Uses intern components: PageHeader, TableCard, FormTemplate, FormGroup, FormRow, Button, Icon, AlertMessage
 * Uses Amafin components: CurrencyDisplay, DateDisplay, PercentDisplay, EditableNumberCell, CommentEditor,
 *                         SearchInput, Pagination, PageSizeSelector, Spinner, Toast, Badge
 *
 * Per-endpoint config controls: inline edit, add row, excel export/import
 */
import { useState, useEffect, useMemo, Fragment } from 'react';
import {
  PageHeader, TableCard, AlertMessage, Button, Icon,
  FormTemplate, FormGroup, FormRow,
  CurrencyDisplay, DateDisplay, PercentDisplay,
  SearchInput, Pagination, PageSizeSelector,
  Spinner, Toast, Badge, EditableNumberCell, CommentEditor,
} from '@amafin/ui';
import type { ColumnDef } from '@amafin/ui';
import Input from '@amafin/ui/atoms/Input/Input';
import Select from '@amafin/ui/atoms/Select/Select';
import { api } from '../api/client';
import { exportToExcel } from '../utils/exportExcel';

interface PageConfig {
  inlineEdit: boolean;
  addRow: boolean;
  excelExport: boolean;
}

// Matches old Django: which pages had which features
const PAGE_CONFIGS: Record<string, PageConfig> = {
  factures:           { inlineEdit: true,  addRow: true,  excelExport: true },
  payments:           { inlineEdit: true,  addRow: true,  excelExport: true },
  'payments-courant': { inlineEdit: true,  addRow: false, excelExport: false },
  'payments-effet':   { inlineEdit: true,  addRow: false, excelExport: false },
  'payments-finex':   { inlineEdit: true,  addRow: false, excelExport: true },
  incomes:            { inlineEdit: true,  addRow: true,  excelExport: true },
  impots:             { inlineEdit: true,  addRow: true,  excelExport: true },
  salaires:           { inlineEdit: true,  addRow: true,  excelExport: true },
  financements:       { inlineEdit: true,  addRow: true,  excelExport: true },
  escomptes:          { inlineEdit: true,  addRow: true,  excelExport: true },
  fx_hist:            { inlineEdit: true,  addRow: true,  excelExport: true },
};

const isMoneyField = (k: string) => /montant|amount|solde|interet|limit|cout|prix/i.test(k);
const isDateField = (k: string) => /date|echeance|ech|created|enregistrement/i.test(k);
const isPercentField = (k: string) => /taux|percent|vol/i.test(k);

export function SmartTablePage({ title, apiEndpoint }: { title: string; apiEndpoint: string; headerColor?: string }) {
  const cfg = PAGE_CONFIGS[apiEndpoint] ?? { inlineEdit: true, addRow: true, excelExport: true };

  const [columns, setColumns] = useState<ColumnDef[]>([]);
  const [data, setData] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [formLoading, setFormLoading] = useState(false);

  // Multi-select + column visibility
  const [selected, setSelected] = useState<Set<number | string>>(new Set());
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(new Set());
  const [showColMenu, setShowColMenu] = useState(false);
  const [expandedRow, setExpandedRow] = useState<number | string | null>(null);

  // Load
  useEffect(() => {
    setLoading(true);
    setError('');
    Promise.all([
      api.get(`/${apiEndpoint}/form_options/`).then(r => r.data),
      api.get(`/${apiEndpoint}/`).then(r => r.data.results ?? r.data),
    ]).then(([meta, rows]) => {
      setColumns((meta as Record<string, unknown>[]).map((m: Record<string, unknown>) => ({ ...m, key: m.name || m.key } as ColumnDef)));
      setData(rows);
    }).catch(() => setError('Erreur de chargement'))
      .finally(() => setLoading(false));
  }, [apiEndpoint]);

  const allVisCols = useMemo(() => columns.filter(c => c.visible !== false), [columns]);
  const visCols = useMemo(() => allVisCols.filter(c => !hiddenCols.has(c.key)), [allVisCols, hiddenCols]);
  const editCols = useMemo(() => columns.filter(c => c.editable !== false && c.visible !== false), [columns]);

  // Filter + paginate
  const filtered = useMemo(() => {
    if (!search.trim()) return data;
    const t = search.toLowerCase();
    return data.filter(row => visCols.some(c => { const v = row[c.key]; return v != null && String(v).toLowerCase().includes(t); }));
  }, [data, search, visCols]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  // Inline edit → PATCH
  async function patchField(rowId: number | string, field: string, value: unknown) {
    try {
      const res = await api.patch(`/${apiEndpoint}/${rowId}/`, { [field]: value });
      setData(prev => prev.map(r => r.id === rowId ? { ...r, ...res.data } : r));
      setToast({ message: 'Modifié', type: 'success' });
    } catch { setToast({ message: 'Erreur', type: 'error' }); }
  }

  // Display value (read-only)
  function display(col: ColumnDef, val: unknown): React.ReactNode {
    if (val == null || val === '') return <span className="cell-muted">—</span>;
    if (isMoneyField(col.key)) { const n = parseFloat(String(val)); if (!isNaN(n)) return <CurrencyDisplay value={n} />; }
    if (isPercentField(col.key)) { const n = parseFloat(String(val)); if (!isNaN(n)) return <PercentDisplay value={n} />; }
    if ((col.type === 'date' || isDateField(col.key)) && /^\d{4}-\d{2}-\d{2}/.test(String(val))) return <DateDisplay value={String(val)} />;
    if (col.type === 'select' && col.choices?.length) {
      const label = col.choices.find(ch => String(ch.value) === String(val))?.label ?? String(val);
      if (['Courant', 'Effet', 'Finex'].includes(label)) return <Badge label={label} tone={label === 'Courant' ? 'warning' : label === 'Finex' ? 'danger' : 'success'} />;
      return label;
    }
    if (col.type === 'checkbox') return val ? <Badge label="Oui" tone="success" /> : <Badge label="Non" tone="warning" />;
    return String(val);
  }

  // Render cell: editable (inline) or read-only
  function cell(col: ColumnDef, row: Record<string, unknown>): React.ReactNode {
    const val = row[col.key];
    const id = row.id as number;

    if (!cfg.inlineEdit || !col.editable) return display(col, val);

    // Editable number (money, percent, plain number)
    if (col.type === 'number' || isMoneyField(col.key) || isPercentField(col.key)) {
      const n = val != null ? parseFloat(String(val)) : null;
      return <EditableNumberCell value={isNaN(n as number) ? null : n} onSave={(v) => patchField(id, col.key, v)} />;
    }

    // Editable text (click-to-edit)
    if (col.type === 'text') {
      return <CommentEditor value={val ? String(val) : undefined} onSave={(v) => patchField(id, col.key, v)} />;
    }

    return display(col, val);
  }

  // Create
  async function handleCreate() {
    setFormLoading(true);
    try {
      const res = await api.post(`/${apiEndpoint}/`, formData);
      setData(prev => [...prev, res.data]);
      setShowForm(false); setFormData({});
      setToast({ message: 'Ajouté', type: 'success' });
    } catch { setToast({ message: "Erreur d'ajout", type: 'error' }); }
    finally { setFormLoading(false); }
  }

  // Excel export with formatting
  async function handleExport() {
    try {
      await exportToExcel({
        filename: `Amafin_${title.replace(/\s+/g, '_')}`,
        sheetName: title.slice(0, 30), // Excel sheet name max 31 chars
        title,
        columns: visCols,
        data: filtered, // export filtered (respects search), all pages
      });
      setToast({ message: '✓ Fichier Excel téléchargé', type: 'success' });
    } catch (err) {
      console.error('Export failed:', err);
      setToast({ message: "Erreur d'export", type: 'error' });
    }
  }

  // Multi-select handlers
  function toggleRowSelect(id: number | string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selected.size === paged.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(paged.map((r, i) => (r.id as number) ?? i)));
    }
  }

  async function handleBulkDelete() {
    if (!confirm(`Supprimer ${selected.size} enregistrement(s) ?`)) return;
    try {
      await Promise.all(Array.from(selected).map(id => api.delete(`/${apiEndpoint}/${id}/`)));
      setData(prev => prev.filter(r => !selected.has(r.id as number)));
      setSelected(new Set());
      setToast({ message: `${selected.size} supprimé(s)`, type: 'success' });
    } catch {
      setToast({ message: 'Erreur de suppression', type: 'error' });
    }
  }

  function toggleColVisibility(key: string) {
    setHiddenCols(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <>
      <PageHeader title={title} breadcrumb={`Accueil / ${title}`} />
      <AlertMessage message={error} type="error" />

      <TableCard icon="📋" title={`${title} (${filtered.length})`} actions={
        <div className="table-card__actions">
          <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} />
          <PageSizeSelector value={pageSize} onChange={(s) => { setPageSize(s); setPage(1); }} />
          {/* Column toggle menu */}
          <div style={{ position: 'relative' }}>
            <Button variant="secondary" size="sm" onClick={() => setShowColMenu(s => !s)}>⚙ Colonnes</Button>
            {showColMenu && (
              <div style={{
                position: 'absolute', top: '100%', right: 0, marginTop: 4,
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 10, padding: 8, boxShadow: 'var(--shadow-lg)',
                zIndex: 10, minWidth: 200,
              }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', padding: '4px 8px', letterSpacing: 0.5 }}>
                  Afficher/Masquer
                </div>
                {allVisCols.map(c => (
                  <label key={c.key} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '6px 8px', borderRadius: 6, cursor: 'pointer',
                    fontSize: 13, color: 'var(--text)',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-muted)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <input
                      type="checkbox"
                      checked={!hiddenCols.has(c.key)}
                      onChange={() => toggleColVisibility(c.key)}
                      style={{ cursor: 'pointer' }}
                    />
                    {c.label}
                  </label>
                ))}
              </div>
            )}
          </div>
          {cfg.excelExport && <Button variant="secondary" size="sm" onClick={handleExport}>📊 Excel</Button>}
          {cfg.addRow && <Button variant="primary" size="sm" icon={<Icon name="plus" size={14} />} onClick={() => setShowForm(true)}>Ajouter</Button>}
        </div>
      }>
        {/* Bulk action bar */}
        {selected.size > 0 && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 20px', background: 'var(--primary-light)',
            borderBottom: '1px solid var(--border)',
          }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--primary-dark)' }}>
              {selected.size} sélectionné(s)
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              <Button variant="secondary" size="sm" onClick={() => setSelected(new Set())}>Désélectionner</Button>
              <Button variant="danger" size="sm" onClick={handleBulkDelete}>🗑 Supprimer</Button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="empty-state"><Spinner size="lg" /></div>
        ) : (
          <>
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: 40 }}>
                    <input
                      type="checkbox"
                      checked={paged.length > 0 && selected.size === paged.length}
                      onChange={toggleSelectAll}
                      style={{ cursor: 'pointer' }}
                    />
                  </th>
                  <th style={{ width: 30 }}></th>
                  {visCols.map(c => <th key={c.key}>{c.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {paged.length === 0 ? (
                  <tr><td colSpan={visCols.length + 2}>
                    <div className="empty-state">
                      <div className="empty-state__icon">📭</div>
                      <div className="empty-state__title">Aucune donnée</div>
                      <div className="empty-state__text">Aucun enregistrement pour {title}.</div>
                    </div>
                  </td></tr>
                ) : paged.map((row, i) => {
                  const rowId = (row.id as number) ?? i;
                  const isSelected = selected.has(rowId);
                  const isExpanded = expandedRow === rowId;
                  return (
                    <Fragment key={rowId}>
                      <tr className={isSelected ? 'is-selected' : ''}>
                        <td>
                          <input type="checkbox" checked={isSelected} onChange={() => toggleRowSelect(rowId)} style={{ cursor: 'pointer' }} />
                        </td>
                        <td>
                          <button
                            onClick={() => setExpandedRow(e => e === rowId ? null : rowId)}
                            style={{
                              background: 'transparent', border: 'none', cursor: 'pointer',
                              color: 'var(--text-muted)', padding: 4, borderRadius: 4,
                              display: 'inline-flex', alignItems: 'center',
                              transform: isExpanded ? 'rotate(90deg)' : 'rotate(0)',
                              transition: 'transform 150ms',
                            }}
                            title="Détails"
                          >▸</button>
                        </td>
                        {visCols.map(c => <td key={c.key} className={isMoneyField(c.key) ? 'cell-money' : ''}>{cell(c, row)}</td>)}
                      </tr>
                      {isExpanded && (
                        <tr>
                          <td colSpan={visCols.length + 2} style={{
                            background: 'var(--bg-muted)', padding: 20,
                            borderBottom: '1px solid var(--border)',
                          }}>
                            <div style={{
                              display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                              gap: 12, fontSize: 12,
                            }}>
                              {columns.map(c => (
                                <div key={c.key}>
                                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>
                                    {c.label}
                                  </div>
                                  <div style={{ color: 'var(--text)', fontWeight: 500 }}>
                                    {cell(c, row)}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
            {totalPages > 1 && (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 20px', borderTop: '1px solid var(--border)',
                background: 'var(--bg-muted)',
              }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }}>
                  {filtered.length} résultat{filtered.length > 1 ? 's' : ''}
                </span>
                <Pagination page={page} totalPages={totalPages} onChange={setPage} />
              </div>
            )}
          </>
        )}
      </TableCard>

      {showForm && (
        <FormTemplate
          title={<><Icon name="plus" size={18} /> Nouveau {title}</>}
          onClose={() => { setShowForm(false); setFormData({}); }}
          footer={<>
            <Button variant="secondary" onClick={() => { setShowForm(false); setFormData({}); }}>Annuler</Button>
            <Button variant="primary" onClick={handleCreate} disabled={formLoading}>{formLoading ? 'Enregistrement...' : 'Enregistrer'}</Button>
          </>}
        >
          {editCols.reduce<React.ReactNode[][]>((pairs, col, i) => {
            if (i % 2 === 0) pairs.push([]);
            pairs[pairs.length - 1].push(
              <FormGroup key={col.key} label={col.label} required={col.required}>
                {col.type === 'select' && col.choices ? (
                  <Select value={formData[col.key] ?? ''} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFormData(p => ({ ...p, [col.key]: e.target.value }))}>
                    <option value="">— Sélectionner —</option>
                    {col.choices.map(ch => <option key={ch.value} value={ch.value}>{ch.label}</option>)}
                  </Select>
                ) : isDateField(col.key) ? (
                  <Input type="date" value={formData[col.key] ?? ''} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData(p => ({ ...p, [col.key]: e.target.value }))} />
                ) : isMoneyField(col.key) || col.type === 'number' ? (
                  <Input type="number" step="0.01" value={formData[col.key] ?? ''} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData(p => ({ ...p, [col.key]: e.target.value }))} placeholder={col.label} />
                ) : (
                  <Input type="text" value={formData[col.key] ?? ''} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData(p => ({ ...p, [col.key]: e.target.value }))} placeholder={col.label} />
                )}
              </FormGroup>
            );
            return pairs;
          }, []).map((pair, i) => <FormRow key={i}>{pair}</FormRow>)}
        </FormTemplate>
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </>
  );
}
