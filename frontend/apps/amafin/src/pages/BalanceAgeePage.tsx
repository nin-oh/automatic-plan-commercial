import { useState, useEffect, useMemo } from 'react';
import { PageHeader, TableCard, DataTable, Spinner, CurrencyDisplay, SearchInput } from '@amafin/ui';
import type { DataTableRow } from '@amafin/ui';
import { api } from '../api/client';

interface BalanceRow {
  fournisseur: string;
  '< 0j': number;
  '0-30j': number;
  '30-60j': number;
  '> 60j': number;
}

function fmtOrDash(val: number): React.ReactNode {
  return val ? <CurrencyDisplay value={val} /> : <span className="cell-muted">—</span>;
}

export function BalanceAgeePage() {
  const [data, setData] = useState<BalanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    api.get('/balance-agee/').then(r => setData(r.data)).finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return data;
    return data.filter(r => r.fournisseur.toLowerCase().includes(search.toLowerCase()));
  }, [data, search]);

  const totals = useMemo(() => ({
    '< 0j': filtered.reduce((s, r) => s + r['< 0j'], 0),
    '0-30j': filtered.reduce((s, r) => s + r['0-30j'], 0),
    '30-60j': filtered.reduce((s, r) => s + r['30-60j'], 0),
    '> 60j': filtered.reduce((s, r) => s + r['> 60j'], 0),
  }), [filtered]);

  const grandTotal = totals['< 0j'] + totals['0-30j'] + totals['30-60j'] + totals['> 60j'];

  const rows: DataTableRow[] = [
    ...filtered.map((r, i) => ({
      key: i,
      cells: [
        { content: r.fournisseur, className: 'cell-strong' },
        { content: fmtOrDash(r['< 0j']), className: 'cell-money' },
        { content: fmtOrDash(r['0-30j']), className: 'cell-money' },
        { content: fmtOrDash(r['30-60j']), className: 'cell-money' },
        { content: fmtOrDash(r['> 60j']), className: 'cell-money' },
        { content: <CurrencyDisplay value={r['< 0j'] + r['0-30j'] + r['30-60j'] + r['> 60j']} />, className: 'cell-strong cell-money' },
      ],
    })),
    {
      key: 'totals',
      className: 'is-pending',
      cells: [
        { content: <strong>TOTAL</strong>, className: 'cell-strong' },
        { content: <strong><CurrencyDisplay value={totals['< 0j']} /></strong>, className: 'cell-money' },
        { content: <strong><CurrencyDisplay value={totals['0-30j']} /></strong>, className: 'cell-money' },
        { content: <strong><CurrencyDisplay value={totals['30-60j']} /></strong>, className: 'cell-money' },
        { content: <strong><CurrencyDisplay value={totals['> 60j']} /></strong>, className: 'cell-money' },
        { content: <strong><CurrencyDisplay value={grandTotal} /></strong>, className: 'cell-strong cell-money' },
      ],
    },
  ];

  return (
    <>
      <PageHeader title="Balance Âgée" breadcrumb="Accueil / Balance Âgée" />
      <TableCard
        icon="⏳"
        title={`Balance Âgée (${filtered.length} fournisseurs)`}
        actions={<SearchInput value={search} onChange={setSearch} />}
      >
        {loading ? (
          <div className="empty-state"><Spinner size="lg" /></div>
        ) : (
          <DataTable
            headers={['Fournisseur', '< 0 jours', '0-30 jours', '30-60 jours', '> 60 jours', 'Total']}
            rows={rows}
            emptyState={{ icon: '⏳', title: 'Aucune donnée', text: 'Aucun solde fournisseur.' }}
          />
        )}
      </TableCard>
    </>
  );
}
