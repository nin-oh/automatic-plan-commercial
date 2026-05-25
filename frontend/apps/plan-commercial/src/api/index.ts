/**
 * Typed client for the Plan Commercial FastAPI backend.
 *
 * Single Axios instance for the entire app. In dev Vite proxies /api → :8000;
 * in prod FastAPI serves both the API and this React app from the same origin
 * so /api is local.
 */
import axios from 'axios';
import type { ImageAsset } from '@amafin/ui';
import type { ArchiveMonth } from '@amafin/ui';
import type { GenerateResult } from '@amafin/ui';

export interface DeckState {
  titre: string;
  canal: string;
  mois: string;
  banner: string | null;
  background: string | null;
  cover_photo: string | null;
  n_products: number;
}

export type ProductRow = Record<string, any>;

const pcApi = axios.create({
  baseURL: '/api',
  withCredentials: false,
});

// ---- state -----------------------------------------------------------------
export const getState = () => pcApi.get<DeckState>('/state').then((r) => r.data);
export const updateMeta = (patch: Partial<Pick<DeckState, 'titre' | 'canal' | 'mois'>>) =>
  pcApi.put<DeckState>('/state/meta', patch).then((r) => r.data);
export const uploadGlobalImage = (kind: 'banner' | 'background' | 'cover', file: File) => {
  const fd = new FormData();
  fd.append('file', file);
  return pcApi.post<DeckState>(`/state/global-image/${kind}`, fd).then((r) => r.data);
};
export const clearGlobalImage = (kind: 'banner' | 'background' | 'cover') =>
  pcApi.delete<DeckState>(`/state/global-image/${kind}`).then((r) => r.data);

// ---- products --------------------------------------------------------------
export const listProducts = () =>
  pcApi.get<{ items: ProductRow[]; total: number }>('/products').then((r) => r.data);

export const createProduct = (row?: Partial<ProductRow>) =>
  pcApi.post<{ index: number; item: ProductRow }>('/products', row ?? {}).then((r) => r.data);

export const patchProduct = (idx: number, payload: Partial<ProductRow>) =>
  pcApi.patch<{ index: number; item: ProductRow }>(`/products/${idx}`, payload).then((r) => r.data);

export const deleteProduct = (idx: number) =>
  pcApi.delete(`/products/${idx}`).then((r) => r.data);

/** Move product at array index `idx` to the 1-indexed `position`. The server
 *  pops then inserts, so other rows shift naturally. Position is clamped to
 *  [1, total]. */
export const moveProduct = (idx: number, position: number) =>
  pcApi.post<{ ok: boolean; from: number; to: number; total: number }>(
    `/products/${idx}/move`, { position },
  ).then((r) => r.data);

export const clearProducts = () =>
  pcApi.delete('/products').then((r) => r.data);

export const applyBrandLogo = (
  brand: string,
  brand_field: 'groupe' | 'sous_groupe',
  logo_filename: string,
) =>
  pcApi.post<{ updated: number }>('/products/bulk/apply-logo', {
    brand, brand_field, logo_filename,
  }).then((r) => r.data);

export const importExcel = (file: File) => {
  const fd = new FormData();
  fd.append('file', file);
  return pcApi.post<{ ok: boolean; loaded: number; kind: string }>('/products/import', fd)
    .then((r) => r.data);
};

export const downloadTemplateUrl = '/api/products/template';
export const exportXlsxUrl = '/api/products/export';

// ---- images ----------------------------------------------------------------
export const listImages = (params?: { brand?: string; type?: string; search?: string }) =>
  pcApi.get<ImageAsset[]>('/images', { params }).then((r) => r.data);

export const uploadImages = (files: File[], brand?: string, type?: string) => {
  const fd = new FormData();
  for (const f of files) fd.append('files', f);
  return pcApi.post<ImageAsset[]>('/images', fd, {
    params: { ...(brand ? { brand } : {}), ...(type ? { type } : {}) },
  }).then((r) => r.data);
};

// `filename` may include `/` for files inside brand subfolders. Encode each
// segment so the path separator survives the URL.
const encodePath = (s: string) => s.split('/').map(encodeURIComponent).join('/');

export const patchImage = (filename: string, payload: { brand?: string; type?: string }) =>
  pcApi.patch<ImageAsset>(`/images/${encodePath(filename)}`, payload).then((r) => r.data);

export const deleteImage = (filename: string) =>
  pcApi.delete(`/images/${encodePath(filename)}`).then((r) => r.data);

export const imageUrl = (filename: string) =>
  // Routed through `/api/images/by-name/...` so a bare filename (legacy Excel
  // refs) still resolves after the file is moved into a subfolder. Subfolder
  // paths (`MIO/foo.png`) are encoded segment-by-segment so the `/` survives.
  filename
    ? `/api/images/by-name/${filename.split('/').map(encodeURIComponent).join('/')}`
    : '';

// ---- preview ---------------------------------------------------------------
export const previewProductUrl = (idx: number, bust?: number | string, promo?: number) => {
  const params: string[] = [];
  if (bust) params.push(`v=${bust}`);
  if (promo && promo > 0) params.push(`promo=${promo}`);
  return `/api/preview/product/${idx}${params.length ? `?${params.join('&')}` : ''}`;
};
export const previewCoverUrl = (bust?: number | string) =>
  `/api/preview/cover${bust ? `?v=${bust}` : ''}`;

export const getProductPromoCount = (idx: number) =>
  pcApi.get<{ count: number }>(`/preview/product/${idx}/promo-count`).then((r) => r.data.count);

export const placePackshot = (idx: number, x_norm: number, y_norm: number) =>
  pcApi.post<{
    packshot_left: number; packshot_top: number;
    packshot_width: number; packshot_height: number;
  }>(`/preview/product/${idx}/place`, { x_norm, y_norm }).then((r) => r.data);

export interface PackshotRect {
  left: number; top: number; width: number; height: number;
  slide_width: number; slide_height: number;
}

export const getPackshotRect = (idx: number) =>
  pcApi.get<PackshotRect>(`/preview/product/${idx}/rect`).then((r) => r.data);

// ---- generate / archive ----------------------------------------------------
export const generate = (with_dividers: boolean) =>
  pcApi.post<GenerateResult>('/generate', null, {
    params: { with_dividers },
  }).then((r) => r.data);

export const listArchive = () =>
  pcApi.get<ArchiveMonth[]>('/archive').then((r) => r.data);

export const archiveThumbnailUrl = (month: string, name: string) =>
  `/api/archive/${encodeURIComponent(month)}/${encodeURIComponent(name)}/thumbnail.png`;
export const archivePptxUrl = (month: string, pptx_name: string) =>
  `/api/archive/${encodeURIComponent(month)}/${encodeURIComponent(pptx_name)}/download`;
export const archivePdfUrl = (month: string, name: string) =>
  `/api/archive/${encodeURIComponent(month)}/${encodeURIComponent(name)}/download.pdf`;

export const loadArchive = (month: string, name: string) =>
  pcApi.post<{ loaded: number }>(
    `/archive/${encodeURIComponent(month)}/${encodeURIComponent(name)}/load`,
  ).then((r) => r.data);

export const duplicateArchive = (month: string, name: string) =>
  pcApi.post<{ loaded: number; new_mois: string }>(
    `/archive/${encodeURIComponent(month)}/${encodeURIComponent(name)}/duplicate`,
  ).then((r) => r.data);

export const deleteArchive = (month: string, pptx_name: string) =>
  pcApi.delete(`/archive/${encodeURIComponent(month)}/${encodeURIComponent(pptx_name)}`)
    .then((r) => r.data);

// ---- SAP import ------------------------------------------------------------

export interface SapCreds {
  server: string;
  database: string;
  username: string;
  password: string;
}

export const sapTest = (c: SapCreds) =>
  pcApi.post<{ ok: boolean; driver: string }>('/sap/test', c).then((r) => r.data);

export const sapPreview = (c: SapCreds, limit = 25) =>
  pcApi.post<{ columns: string[]; rows: any[][]; total: number }>(
    '/sap/preview', { ...c, limit },
  ).then((r) => r.data);

export const sapImport = (
  c: SapCreds,
  opts?: { mapping?: Record<string, string>; replace?: boolean },
) =>
  pcApi.post<{ loaded: number; columns: string[] }>(
    '/sap/import',
    { ...c, mapping: opts?.mapping, replace: opts?.replace ?? true },
  ).then((r) => r.data);

export const sapExportXlsxUrl = '/api/sap/export.xlsx';
