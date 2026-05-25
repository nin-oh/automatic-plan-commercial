import { useState, useEffect } from 'react';
import {
  PageHeader, TableCard, MatrixGrid, DataTable, Spinner, CurrencyDisplay, Badge, Toast,
} from '@amafin/ui';
import type { MatrixGridRow, MatrixGridColumn, DataTableRow } from '@amafin/ui';
import { api } from '../api/client';

function fmtCurrency(v: number): React.ReactNode {
  return <CurrencyDisplay value={v} colorize />;
}

interface SoldeEntry { solde_id: string; bank_id: string; bank_name: string; montant: number; }
interface HistEntry { custom_id: string; Solde_date: string; societe__code: string; banque__banque: string; montant_dhs: number; }

export function SoldesPage() {
  const [loading, setLoading] = useState(true);
  const [soldeData, setSoldeData] = useState<Record<string, SoldeEntry[]>>({});
  const [historiques, setHistoriques] = useState<HistEntry[]>([]);
  const [soldeDate, setSoldeDate] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  function loadData() {
    setLoading(true);
    api.get('/soldes/today/')
      .then(r => {
        setSoldeData(r.data.solde_data);
        setHistoriques(r.data.historiques || []);
        setSoldeDate(r.data.date);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadData(); }, []);

  // Build MatrixGrid props
  const societes = Object.keys(soldeData);
  const banks: MatrixGridColumn[] = societes.length > 0
    ? soldeData[societes[0]].map(b => ({ id: b.bank_id, label: b.bank_name }))
    : [];

  const rows: MatrixGridRow[] = societes.map(s => ({ id: s, label: s }));

  const values: Record<string, number> = {};
  for (const soc of societes) {
    for (const b of soldeData[soc]) {
      values[`${soc}:${b.bank_id}`] = b.montant;
    }
  }

  async function handleCellSave(rowId: string, colId: string, value: number) {
    try {
      await api.post('/solde/update/', { societe: rowId, bank_id: colId, montant: value });
      setToast({ message: 'Solde mis à jour', type: 'success' });
      loadData();
    } catch {
      setToast({ message: 'Erreur', type: 'error' });
    }
  }

  // History rows
  const histRows: DataTableRow[] = historiques.slice(0, 20).map((h, i) => ({
    key: i,
    cells: [
      { content: h.custom_id, className: 'cell-muted' },
      { content: h.Solde_date },
      { content: <Badge label={h.societe__code} tone="warning" /> },
      { content: h.banque__banque },
      { content: <CurrencyDisplay value={h.montant_dhs} colorize />, className: 'cell-money' },
    ],
  }));

  return (
    <>
      <PageHeader title="Soldes" breadcrumb={`Accueil / Soldes — ${soldeDate}`} />

      <TableCard icon="💵" title={`Matrice des Soldes — ${soldeDate}`}>
        {loading ? (
          <div className="empty-state"><Spinner size="lg" /></div>
        ) : (
          <MatrixGrid
            rows={rows}
            columns={banks}
            values={values}
            editable
            onCellSave={handleCellSave}
            formatValue={fmtCurrency}
            showRowTotals
            showColumnTotals
            colorize
          />
        )}
      </TableCard>

      <TableCard icon="📜" title="Historique récent">
        <DataTable
          headers={['ID', 'Date', 'Société', 'Banque', 'Montant']}
          rows={histRows}
          emptyState={{ icon: '📜', title: 'Aucun historique', text: '' }}
        />
      </TableCard>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </>
  );
}
