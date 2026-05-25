import { useState, useEffect } from 'react';
import {
  PageHeader, TableCard, Spinner, Toast,
  CurrencyDisplay, PercentDisplay, EditableNumberCell,
} from '@amafin/ui';
import { api } from '../api/client';

interface BankData {
  id: string;
  banque: string;
  limit_finex: number;
  taux_interet_finex: number;
  interet_fix: number;
}

export function BanksPage() {
  const [banks, setBanks] = useState<BankData[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  function loadBanks() {
    setLoading(true);
    api.get('/banks/list/').then(r => setBanks(r.data)).finally(() => setLoading(false));
  }

  useEffect(() => { loadBanks(); }, []);

  async function handleSave(bankId: string, field: string, value: number | null) {
    try {
      await api.patch('/banks/list/', { id: bankId, field, value: value ?? 0 });
      setBanks(prev => prev.map(b => b.id === bankId ? { ...b, [field]: value ?? 0 } : b));
      setToast({ message: 'Mis à jour', type: 'success' });
    } catch {
      setToast({ message: 'Erreur de mise à jour', type: 'error' });
    }
  }

  return (
    <>
      <PageHeader title="Banques" breadcrumb="Accueil / Banques" />
      <TableCard icon="🏦" title={`Banques (${banks.length})`}>
        {loading ? (
          <div className="empty-state"><Spinner size="lg" /></div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Banque</th>
                <th>Limite Finex</th>
                <th>Taux Intérêt Finex</th>
                <th>Intérêt Fixe</th>
              </tr>
            </thead>
            <tbody>
              {banks.map(b => (
                <tr key={b.id}>
                  <td className="cell-muted">{b.id}</td>
                  <td className="cell-strong">{b.banque}</td>
                  <td className="cell-money">
                    <EditableNumberCell
                      value={b.limit_finex}
                      onSave={(val) => handleSave(b.id, 'limit_finex', val)}
                    />
                  </td>
                  <td>
                    <EditableNumberCell
                      value={b.taux_interet_finex}
                      onSave={(val) => handleSave(b.id, 'taux_interet_finex', val)}
                    />
                  </td>
                  <td>
                    <EditableNumberCell
                      value={b.interet_fix}
                      onSave={(val) => handleSave(b.id, 'interet_fix', val)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </TableCard>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </>
  );
}
