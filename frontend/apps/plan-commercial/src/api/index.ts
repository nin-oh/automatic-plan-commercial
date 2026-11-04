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
  /** Détail catalogue brand ("MIO" | "ZEN") — picks the default family order. */
  marque: string;
  banner: string | null;
  background: string | null;
  cover_photo: string | null;
  /** "Nouveau lancement" — adds the جديد / Nouveau ribbon to every slide. */
  nouveau_lancement: boolean;
  n_products: number;
}

export type ProductRow = Record<string, any>;

const pcApi = axios.create({
  baseURL: '/api',
  withCredentials: false,
});

// ---- projects (multi-catalogue) ----------------------------------------------
export interface Project {
  id: number;
  name: string;
  created_at: string;
  updated_at: string;
  products: number;
  canal: string;
  mois: string;
  active: boolean;
}
export const listProjects = () =>
  pcApi.get<Project[]>('/projects').then((r) => r.data);
export const createProject = (name: string, blank = false) =>
  pcApi.post<Project[]>('/projects', { name, blank }).then((r) => r.data);
export const openProject = (id: number) =>
  pcApi.post<{ loaded: number }>(`/projects/${id}/open`).then((r) => r.data);
export const duplicateProject = (id: number, name?: string) =>
  pcApi.post<Project[]>(`/projects/${id}/duplicate`, { name }).then((r) => r.data);
export const renameProject = (id: number, name: string) =>
  pcApi.patch<Project[]>(`/projects/${id}`, { name }).then((r) => r.data);
export const deleteProject = (id: number) =>
  pcApi.delete<Project[]>(`/projects/${id}`).then((r) => r.data);

// ---- snapshots (safety net) -------------------------------------------------
export interface Snapshot {
  id: number;
  label: string;
  created_at: string;
  products: number;
}
export const listSnapshots = () =>
  pcApi.get<Snapshot[]>('/snapshots').then((r) => r.data);
export const createSnapshot = (label?: string) =>
  pcApi.post<Snapshot | null>('/snapshots', { label }).then((r) => r.data);
export const restoreSnapshot = (id: number) =>
  pcApi.post<{ restored: number }>(`/snapshots/${id}/restore`).then((r) => r.data);
export const deleteSnapshot = (id: number) =>
  pcApi.delete(`/snapshots/${id}`).then((r) => r.data);

// ---- state -----------------------------------------------------------------
export const getState = () => pcApi.get<DeckState>('/state').then((r) => r.data);
export const updateMeta = (
  patch: Partial<Pick<DeckState, 'titre' | 'canal' | 'mois' | 'marque' | 'nouveau_lancement'>>,
) => pcApi.put<DeckState>('/state/meta', patch).then((r) => r.data);
export const applyDefaultOrder = () =>
  pcApi.post<{ ok: boolean; matched: number; total: number; marque: string }>(
    '/products/default-order',
  ).then((r) => r.data);
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

// ---- PPT image import ------------------------------------------------------
export interface PptxImportReport {
  ok: boolean;
  slides: number;
  matched: number;
  packshots_set: number;
  gratuites_set: number;
  logos_set: number;
  saved_images: number;
  unmatched: string[];
  extras: { slide: number; title: string; files: string[] }[];
}
export interface PptxProgress {
  slide: number; total: number; title: string;
  matched: number; packshots: number; saved: number;
}
/**
 * Streaming PPT import. Uses XHR (not axios/fetch) because it's the only
 * browser API that reports BOTH upload progress and incremental response
 * chunks. The server streams newline-delimited JSON: `start`, one `progress`
 * per slide, then a final `done` carrying the report.
 */
export const importPptx = (
  file: File,
  onUpload?: (pct: number) => void,
  onProgress?: (p: PptxProgress) => void,
) => new Promise<PptxImportReport>((resolve, reject) => {
  const fd = new FormData();
  fd.append('file', file);
  const xhr = new XMLHttpRequest();
  xhr.open('POST', '/api/products/import-pptx');
  xhr.upload.onprogress = (e) => {
    if (onUpload && e.lengthComputable) onUpload(Math.round((e.loaded / e.total) * 100));
  };
  let seen = 0;
  let report: PptxImportReport | null = null;
  const drain = () => {
    const text = xhr.responseText;
    const nl = text.lastIndexOf('\n');
    if (nl < seen) return;
    const chunk = text.slice(seen, nl);
    seen = nl + 1;
    for (const line of chunk.split('\n')) {
      const t = line.trim();
      if (!t) continue;
      let ev: any;
      try { ev = JSON.parse(t); } catch { continue; }
      if (ev.type === 'progress') onProgress?.(ev as PptxProgress);
      else if (ev.type === 'done') report = ev.report as PptxImportReport;
      else if (ev.type === 'error') reject(new Error(ev.message || 'Erreur import'));
    }
  };
  xhr.onprogress = drain;
  xhr.onload = () => { drain(); report ? resolve(report) : reject(new Error('Import incomplet')); };
  xhr.onerror = () => reject(new Error('Erreur réseau pendant l’import'));
  xhr.send(fd);
});

/** Move product at array index `idx` to the 1-indexed `position`. The server
 *  pops then inserts, so other rows shift naturally. Position is clamped to
 *  [1, total]. */
export const moveProduct = (idx: number, position: number) =>
  pcApi.post<{ ok: boolean; from: number; to: number; total: number }>(
    `/products/${idx}/move`, { position },
  ).then((r) => r.data);

/** Move the SKU at array index `idx` to position N **within its own brand**
 *  block. Other brands stay where they are. Position is 1-indexed relative
 *  to siblings. */
export const moveProductInBrand = (idx: number, position: number) =>
  pcApi.post<{
    ok: boolean; brand: string; from: number; to: number; total_in_brand: number;
  }>(`/products/${idx}/move-in-brand`, { position }).then((r) => r.data);

/** Move every product belonging to `brand` to the Nth brand-slot (1-indexed),
 *  preserving each brand's internal SKU order. */
export const moveBrand = (brand: string, position: number) =>
  pcApi.post<{
    ok: boolean; from: number; to: number; total_brands: number;
  }>(`/products/brand/${encodeURIComponent(brand)}/move`, { position }).then((r) => r.data);

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
  return pcApi.post<{ ok: boolean; loaded: number; kind: string; enriched?: number }>('/products/import', fd)
    .then((r) => r.data);
};

export const downloadTemplateUrl = '/api/products/template';
export const exportXlsxUrl = '/api/products/export';
/** Master price list across ALL projects (deduped, latest détail + gros). */
export const priceListUrl = '/api/products/price-list.xlsx';

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
export const previewProductUrl = (idx: number, bust?: number | string, promo?: number, w?: number) => {
  const params: string[] = [];
  if (bust) params.push(`v=${bust}`);
  if (promo && promo > 0) params.push(`promo=${promo}`);
  if (w && w > 0) params.push(`w=${w}`);
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

// ---- catalogue (flipbook) --------------------------------------------------
export interface CatalogueSlide {
  url: string;                 // PNG fallback URL (used only for complex promos)
  label: string;
  group: string;
  subgroup: string;
  row_idx: number;
  promo_idx: number;
  // Rich data — flipbook renders pages from these instead of the PNG.
  nom: string;
  is_promo: boolean;
  type_promo: string;
  promo_texte: string;
  promo_achat_qte: number;
  promo_gratuit_qte: number;
  promo_remise_pct: number;
  prix_gros: number;
  prix_gros_net: number;
  colisage: string;
  colisage_prix_gros: number;
  colisage_prix_gros_net: number;
  packshot_file_url: string | null;
  logo_file_url: string | null;
  promo_gratuite_image_url: string | null;
  promo_remise_image_url: string | null;
}
export interface CatalogueManifest {
  cover_url: string;
  slides: CatalogueSlide[];
  title: string;
  canal: string;
  mois: string;
  total_pages: number;
}
export const getCatalogueManifest = () =>
  pcApi.get<CatalogueManifest>('/preview/manifest').then((r) => r.data);

// Direct URL to the Excel export of SKUs without a packshot. Used as an
// `<a href>` so the browser handles the file download instead of going
// through axios + blob shuffling.
export const missingPackshotsXlsxUrl = '/api/products/missing-packshots/export.xlsx';

// ---- generate / archive ----------------------------------------------------
export const generate = (with_dividers: boolean, with_packshot_only = false) =>
  pcApi.post<GenerateResult>('/generate', null, {
    params: { with_dividers, with_packshot_only },
  }).then((r) => r.data);

export interface GenerateProgress {
  running: boolean;
  current: number;
  total: number;
  percent: number;
  phase: string;
  started_at: string | null;
  finished_at: string | null;
  error: string | null;
}

export const getGenerateProgress = () =>
  pcApi.get<GenerateProgress>('/generate/progress').then((r) => r.data);

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

// ---- SAP verification ------------------------------------------------------
// Credentials moved to env vars (SAP_USERNAME / SAP_PASSWORD on the server).
// The UI no longer collects them — see /api/sap/status to know whether the
// container is configured, and /api/sap/sync to refresh the cache.

export interface SapDiscrepancy {
  item_code: string;
  nom: string;
  // Keys are local field names (`prix_gros`, `prix_gros_net`, `prix_detail`,
  // `prix_detail_net`). Each value is { local, sap }.
  differences: Record<string, { local: number; sap: number }>;
}

export interface SapSkippedProduct {
  nom: string;
  position: number;
}

export interface SapVerifyResult {
  checked: number;
  matched: number;
  discrepancies: SapDiscrepancy[];
  not_in_sap: string[];
  no_code_count: number;
  no_code_items: SapSkippedProduct[];
  duplicate_codes: Record<string, string[]>;
  skipped_no_code: number;
  sap_total: number;
}

export interface SapStatus {
  configured: boolean;
  cached: boolean;
  fetched_at: string | null;
  rows: number;
  driver: string | null;
  last_error: string | null;
  server: string;
  database: string;
}

export const sapStatus = () =>
  pcApi.get<SapStatus>('/sap/status').then((r) => r.data);

export const sapSync = () =>
  pcApi.post<{ rows: number; fetched_at: string; driver: string }>(
    '/sap/sync',
  ).then((r) => r.data);

export const sapPreview = (limit = 0) =>
  pcApi.get<{ columns: string[]; rows: any[][]; total: number }>(
    '/sap/preview', { params: { limit } },
  ).then((r) => r.data);

export const sapVerify = () =>
  pcApi.post<SapVerifyResult>('/sap/verify').then((r) => r.data);

export interface SapFormulaViolation {
  formula_id: string;
  label: string;
  expected: number;
  actual: number;
  delta: number;
}

export interface SapRowViolations {
  item_code: string;
  item_name: string;
  gros_net: number;
  tarifs_ama: number;
  prix_standard: number;
  violations: SapFormulaViolation[];
}

export interface SapZeroPriceRow {
  item_code: string;
  item_name: string;
  gros: number;
  gros_net: number;
  tarifs_ama: number;
  prix_standard: number;
  detail: number;
  detail_net: number;
  zero_fields: string[];
}

export interface SapFormulaCheckResult {
  checked: number;
  valid: number;
  skipped_zero_base: number;
  rows_with_violations: SapRowViolations[];
  zero_price_rows: SapZeroPriceRow[];
  ama_factor: number;
  standard_factor: number;
}

/** Walk every cached SAP row and verify the documented pricing formulas. */
export const sapCheckFormulas = (
  factors?: { ama_factor?: number; standard_factor?: number },
) =>
  pcApi.post<SapFormulaCheckResult>('/sap/check-formulas', {
    ...(factors?.ama_factor != null ? { ama_factor: factors.ama_factor } : {}),
    ...(factors?.standard_factor != null ? { standard_factor: factors.standard_factor } : {}),
  }).then((r) => r.data);

/** Overwrite specific price fields with SAP values, scoped to a list of
 *  item codes (typically the ones that came back as discrepancies). */
export const sapApplyPrices = (
  item_codes: string[],
  fields?: string[],
) =>
  pcApi.post<{ updated: number; skipped: string[] }>(
    '/sap/apply-prices',
    { item_codes, ...(fields ? { fields } : {}) },
  ).then((r) => r.data);

export const sapExportXlsxUrl = '/api/sap/export.xlsx';

// The verify + check-formulas exports are POSTs (so they can re-run the
// underlying logic with the current session / factors), so we can't use a
// plain <a href download>. These helpers fetch the workbook as a blob and
// trigger the browser save dialog — no axios body parsing.
export async function downloadSapVerifyXlsx(): Promise<void> {
  const r = await pcApi.post('/sap/verify/export.xlsx', null, { responseType: 'blob' });
  triggerBlobDownload(r.data, 'sap_comparaison.xlsx');
}

export async function downloadSapCheckFormulasXlsx(
  factors?: { ama_factor?: number; standard_factor?: number },
): Promise<void> {
  const body = {
    ...(factors?.ama_factor != null ? { ama_factor: factors.ama_factor } : {}),
    ...(factors?.standard_factor != null ? { standard_factor: factors.standard_factor } : {}),
  };
  const r = await pcApi.post('/sap/check-formulas/export.xlsx', body, { responseType: 'blob' });
  triggerBlobDownload(r.data, 'sap_audit_formules.xlsx');
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
