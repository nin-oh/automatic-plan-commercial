import { useState, useEffect } from 'react';
import { SmartTable, Heading, Toast } from '@amafin/ui';
import type { ColumnDef } from '@amafin/ui';
import { fetchIncomesMeta, fetchIncomes, createIncome, updateIncome, deleteIncome } from '../api/incomes';

export function IncomesPage() {
  const [columns, setColumns] = useState<ColumnDef[]>([]);
  const [data, setData] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Load metadata + data on mount
  useEffect(() => {
    Promise.all([fetchIncomesMeta(), fetchIncomes()])
      .then(([meta, rows]) => {
        setColumns(meta);
        setData(rows);
      })
      .catch(() => setToast({ message: 'Erreur de chargement', type: 'error' }))
      .finally(() => setLoading(false));
  }, []);

  const handleCellEdit = async (id: number | string, field: string, value: unknown) => {
    try {
      const updated = await updateIncome(id, { [field]: value });
      setData((prev) => prev.map((r) => (r.id === id ? { ...r, ...updated } : r)));
      setToast({ message: 'Modifié', type: 'success' });
    } catch {
      setToast({ message: 'Erreur de modification', type: 'error' });
    }
  };

  const handleRowAdd = async (row: Record<string, unknown>) => {
    try {
      const created = await createIncome(row);
      setData((prev) => [...prev, created]);
      setToast({ message: 'Ajouté', type: 'success' });
    } catch {
      setToast({ message: "Erreur d'ajout", type: 'error' });
    }
  };

  const handleRowDelete = async (id: number | string) => {
    try {
      await deleteIncome(id);
      setData((prev) => prev.filter((r) => r.id !== id));
      setToast({ message: 'Supprimé', type: 'success' });
    } catch {
      setToast({ message: 'Erreur de suppression', type: 'error' });
    }
  };

  return (
    <div style={{ padding: 'var(--space-lg)' }}>
      <Heading level={2} style={{ marginBottom: 'var(--space-md)' }}>
        Encaissements
      </Heading>
      <SmartTable
        columns={columns}
        data={data}
        loading={loading}
        label="Encaissements"
        headerColor="#2ecc71"
        onCellEdit={handleCellEdit}
        onRowAdd={handleRowAdd}
        onRowDelete={handleRowDelete}
      />
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}
