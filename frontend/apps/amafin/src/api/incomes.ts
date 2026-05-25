import { api } from './client';
import type { ColumnDef } from '@amafin/ui';

/** Fetch field metadata for incomes table */
export async function fetchIncomesMeta(): Promise<ColumnDef[]> {
  const res = await api.get('/incomes/form_options/');
  return res.data;
}

/** Fetch all income rows */
export async function fetchIncomes(): Promise<Record<string, unknown>[]> {
  const res = await api.get('/incomes/');
  return res.data;
}

/** Create a new income */
export async function createIncome(data: Record<string, unknown>) {
  const res = await api.post('/incomes/', data);
  return res.data;
}

/** Update an income field */
export async function updateIncome(id: number | string, data: Record<string, unknown>) {
  const res = await api.patch(`/incomes/${id}/`, data);
  return res.data;
}

/** Delete an income */
export async function deleteIncome(id: number | string) {
  await api.delete(`/incomes/${id}/`);
}
