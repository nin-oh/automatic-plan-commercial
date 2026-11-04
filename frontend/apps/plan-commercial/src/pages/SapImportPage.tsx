import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { SectionCard, Toast } from '@amafin/ui';
import {
  Database, RefreshCw, AlertTriangle, CheckCircle2,
  ArrowDownToLine, Calculator, Search, GitCompareArrows, X, Download,
} from 'lucide-react';
import { PageShell, PC_ACCENT, pcButton } from './PageShell';
import * as api from '../api';
import type {
  SapStatus, SapVerifyResult, SapFormulaCheckResult,
} from '../api';
import { usePlanCommercial } from '../store/usePlanCommercial';

/**
 * SAP page — raw query result is the primary table; the local-vs-SAP
 * comparison and the formula audit live in popup modals triggered from
 * the page header. Every modal (and the main table) has its own
 * "Télécharger .xlsx" button so the user can hand sheets to colleagues.
 */
const PRICE_FIELDS: Array<{ key: string; label: string }> = [
  { key: 'prix_gros',       label: 'Gros' },
  { key: 'prix_gros_net',   label: 'Gros Net' },
  { key: 'prix_detail',     label: 'Détail' },
  { key: 'prix_detail_net', label: 'Détail Net' },
];

export function PlanCommercialSapImportPage() {
  const { refreshProducts, bumpPreview } = usePlanCommercial();

  const [status, setStatus] = useState<SapStatus | null>(null);
  const [busy, setBusy] = useState<'sync' | 'verify' | 'apply' | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Raw SAP — the principal table. Loaded automatically once the cache
  // is populated; refreshed on each successful sync.
  const [sapCols, setSapCols] = useState<string[]>([]);
  const [sapRows, setSapRows] = useState<any[][]>([]);
  const [sapSearch, setSapSearch] = useState('');
  const [loadingRaw, setLoadingRaw] = useState(false);

  // Modals
  const [showCompare, setShowCompare] = useState(false);
  const [showFormulas, setShowFormulas] = useState(false);

  async function refreshStatus() {
    try { setStatus(await api.sapStatus()); }
    catch { /* swallow — status is best-effort */ }
  }

  async function loadRawSap() {
    setLoadingRaw(true);
    try {
      const r = await api.sapPreview(0);
      setSapCols(r.columns);
      setSapRows(r.rows);
    } catch (e: any) {
      // Don't toast on initial load when the cache is just empty — the
      // status banner already explains what to do.
      if (status?.cached) {
        setToast({ message: e?.response?.data?.detail ?? 'Échec du chargement', type: 'error' });
      }
    } finally {
      setLoadingRaw(false);
    }
  }

  useEffect(() => { refreshStatus(); }, []);
  useEffect(() => {
    if (status?.cached) loadRawSap();
    else { setSapCols([]); setSapRows([]); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status?.cached, status?.fetched_at]);

  async function handleSync() {
    setBusy('sync');
    try {
      const r = await api.sapSync();
      await refreshStatus();
      setToast({ message: `${r.rows} ligne(s) synchronisées depuis SAP.`, type: 'success' });
    } catch (e: any) {
      setToast({ message: e?.response?.data?.detail ?? 'Échec de la synchronisation', type: 'error' });
    } finally {
      setBusy(null);
    }
  }

  // Pre-compute search indices once per load so 1000+ row filtering stays snappy.
  const itemCodeIdx = sapCols.indexOf('ItemCode');
  const itemNameIdx = sapCols.indexOf('ItemName');
  const filteredRows = useMemo(() => {
    const q = sapSearch.trim().toLowerCase();
    if (!q) return sapRows;
    return sapRows.filter((r) => {
      const code = String(r[itemCodeIdx] ?? '').toLowerCase();
      const name = String(r[itemNameIdx] ?? '').toLowerCase();
      return code.includes(q) || name.includes(q);
    });
  }, [sapRows, sapSearch, itemCodeIdx, itemNameIdx]);

  const cached = !!status?.cached;
  const configured = !!status?.configured;

  return (
    <PageShell
      title="Données SAP"
      subtitle="Vue principale : le résultat brut de la requête SAP, recherche en direct. Boutons en haut pour la comparaison Excel ↔ SAP, l'audit des formules et le téléchargement Excel."
    >
      <SectionCard
        icon={<Database size={16} />}
        accent={PC_ACCENT}
        title="État de la synchronisation"
        subtitle={statusSubtitle(status)}
        actions={
          <button
            onClick={handleSync}
            disabled={busy !== null || !configured}
            title={configured
              ? 'Re-télécharge toutes les lignes SAP dans le cache du serveur.'
              : 'Configurez SAP_USERNAME et SAP_PASSWORD dans le .env du conteneur.'}
            style={{
              ...pcButton.base, ...pcButton.primary,
              opacity: busy || !configured ? 0.5 : 1,
            }}
          >
            <RefreshCw size={13} className={busy === 'sync' ? 'spin' : ''} />
            {busy === 'sync' ? 'Synchro…' : 'Synchroniser SAP'}
          </button>
        }
      >
        {!configured && (
          <div style={{
            padding: '10px 12px', borderRadius: 8,
            background: '#FFF7ED', border: '1px solid #FED7AA',
            color: '#7C2D12', fontSize: 12.5,
          }}>
            <b>Identifiants SAP non configurés.</b> Ouvrez le fichier <code>.env</code> à
            côté du <code>docker-compose.yml</code>, définissez <code>SAP_USERNAME</code> et
            {' '}<code>SAP_PASSWORD</code>, puis <code>docker compose down &amp;&amp; up -d</code>.
          </div>
        )}
        {configured && status?.last_error && !cached && (
          <div style={{
            padding: '10px 12px', borderRadius: 8,
            background: '#FEF2F2', border: '1px solid #FECACA',
            color: '#7F1D1D', fontSize: 12.5,
          }}>
            <b>Dernière tentative de synchronisation échouée :</b><br/>
            <code style={{ fontSize: 11 }}>{status.last_error}</code>
          </div>
        )}
      </SectionCard>

      {/* ─── Main table: raw SAP, with search + toolbar ─────────────── */}
      <SectionCard
        icon={<Database size={16} />}
        accent={PC_ACCENT}
        title="Résultat de la requête SAP"
        subtitle={cached
          ? `${filteredRows.length} / ${sapRows.length} ligne(s) — recherche par ItemCode ou ItemName.`
          : 'Le cache est vide. Synchronisez d\'abord SAP.'}
        actions={
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              onClick={() => setShowCompare(true)}
              disabled={!cached}
              title="Compare les prix locaux à ceux de SAP via la colonne item_code (modal)."
              style={{
                ...pcButton.base, ...pcButton.secondary,
                opacity: cached ? 1 : 0.5,
              }}
            >
              <GitCompareArrows size={13} /> Comparaison Excel ↔ SAP
            </button>
            <button
              onClick={() => setShowFormulas(true)}
              disabled={!cached}
              title="Audite Tarifs AMA = GROS NET × facteur, PRIX STANDARD = AMA ÷ diviseur."
              style={{
                ...pcButton.base, ...pcButton.secondary,
                opacity: cached ? 1 : 0.5,
              }}
            >
              <Calculator size={13} /> Vérifier les formules
            </button>
            <a
              href={api.sapExportXlsxUrl}
              download
              title="Télécharge le résultat SAP brut au format Excel stylisé."
              style={{
                ...pcButton.base, ...pcButton.primary,
                opacity: cached ? 1 : 0.5,
                textDecoration: 'none',
                pointerEvents: cached ? 'auto' : 'none',
              }}
            >
              <Download size={13} /> Excel
            </a>
          </div>
        }
      >
        {!cached ? (
          <div style={{
            padding: 30, textAlign: 'center', color: '#71717a', fontSize: 13,
            background: '#fafafa', border: '1px dashed #e4e4e7', borderRadius: 10,
          }}>
            Cliquez sur <b>Synchroniser SAP</b> en haut pour remplir le cache.
          </div>
        ) : (
          <>
            <div style={{ position: 'relative', marginBottom: 12, maxWidth: 420 }}>
              <Search size={14} style={{
                position: 'absolute', left: 11, top: '50%',
                transform: 'translateY(-50%)', color: '#a1a1aa',
              }} />
              <input
                value={sapSearch}
                onChange={(e) => setSapSearch(e.target.value)}
                placeholder="Filtrer par ItemCode ou ItemName…"
                style={{
                  width: '100%', padding: '9px 12px 9px 34px', borderRadius: 8,
                  border: '1px solid #e4e4e7', background: '#fafafa', color: '#18181b',
                  fontSize: 13, outline: 'none',
                }}
              />
            </div>
            <div style={{
              border: '1px solid #e4e4e7', borderRadius: 8, background: '#fff',
              overflow: 'auto', maxHeight: '60vh',
            }}>
              {loadingRaw ? (
                <div style={{ padding: 40, textAlign: 'center', color: '#71717a' }}>
                  Chargement…
                </div>
              ) : (
                <table style={{
                  borderCollapse: 'separate', borderSpacing: 0, minWidth: '100%',
                  fontSize: 11.5, fontFamily: 'Inter, sans-serif',
                }}>
                  <thead>
                    <tr>
                      {sapCols.map((c) => (
                        <th key={c} style={{
                          position: 'sticky', top: 0, background: '#fafafa',
                          borderBottom: '1px solid #e4e4e7',
                          padding: '8px 12px', textAlign: 'left',
                          color: '#52525b', fontWeight: 700, whiteSpace: 'nowrap',
                        }}>{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map((r, i) => (
                      <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                        {r.map((cell, j) => (
                          <td key={j} style={{
                            padding: '6px 12px', borderBottom: '1px solid #f4f4f5',
                            whiteSpace: 'nowrap',
                            color: cell == null ? '#a1a1aa' : '#18181b',
                          }}>
                            {cell == null ? '—' : String(cell)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </SectionCard>

      <ComparisonModal
        open={showCompare}
        onClose={() => setShowCompare(false)}
        afterApply={async () => { await refreshProducts(); bumpPreview(); }}
        setToast={setToast}
        outerBusy={busy}
        setOuterBusy={setBusy}
      />
      <FormulasModal open={showFormulas} onClose={() => setShowFormulas(false)} />

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}

      <style>{`
        @keyframes pcm-spin { to { transform: rotate(360deg); } }
        .spin { animation: pcm-spin 1s linear infinite; }
      `}</style>
    </PageShell>
  );
}

function statusSubtitle(status: SapStatus | null): string {
  if (!status) return 'Chargement…';
  if (!status.configured) {
    return `Cible : ${status.server} / ${status.database} — identifiants à définir dans le .env`;
  }
  if (!status.cached) {
    return `Cible : ${status.server} / ${status.database} · cache vide — cliquez sur Synchroniser`;
  }
  const when = status.fetched_at
    ? new Date(status.fetched_at).toLocaleString('fr-FR')
    : '—';
  return `Cible : ${status.server} / ${status.database} · ${status.rows} ligne(s) en cache · dernière synchro ${when}`;
}

/* ─────────────────────────  Modals  ───────────────────────── */

function ModalShell({
  title, subtitle, actions, onClose, children,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
}) {
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 8900,
        background: 'rgba(15, 15, 18, 0.55)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(1180px, 100%)', maxHeight: '88vh',
          background: '#ffffff', border: '1px solid #e4e4e7', borderRadius: 14,
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.22)',
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
          padding: '14px 18px', borderBottom: '1px solid #f4f4f5', gap: 12,
        }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ color: '#18181b', fontWeight: 700, fontSize: 14 }}>{title}</div>
            {subtitle && (
              <div style={{ color: '#71717a', fontSize: 12, marginTop: 2 }}>{subtitle}</div>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            {actions}
            <button
              onClick={onClose}
              aria-label="Fermer"
              style={{
                background: 'transparent', border: 'none', color: '#71717a',
                cursor: 'pointer', display: 'flex', padding: 6, borderRadius: 6,
              }}
            ><X size={18} /></button>
          </div>
        </div>
        <div style={{ overflow: 'auto', padding: '14px 18px 18px' }}>
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function ComparisonModal({
  open, onClose, afterApply, setToast, outerBusy, setOuterBusy,
}: {
  open: boolean;
  onClose: () => void;
  afterApply: () => Promise<void>;
  setToast: (t: { message: string; type: 'success' | 'error' } | null) => void;
  outerBusy: 'sync' | 'verify' | 'apply' | null;
  setOuterBusy: (b: 'sync' | 'verify' | 'apply' | null) => void;
}) {
  const [result, setResult] = useState<SapVerifyResult | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Auto-run the comparison the first time the modal opens. Subsequent
  // re-opens preserve the last result so users can pick up where they
  // left off; the toolbar always has a "Relancer" button.
  useEffect(() => {
    if (open && !result && outerBusy !== 'verify') run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (result) setSelected(new Set(result.discrepancies.map((d) => d.item_code)));
  }, [result]);

  async function run() {
    setOuterBusy('verify');
    setResult(null);
    try {
      const r = await api.sapVerify();
      setResult(r);
    } catch (e: any) {
      setToast({ message: e?.response?.data?.detail ?? 'Échec de la vérification', type: 'error' });
    } finally {
      setOuterBusy(null);
    }
  }

  async function handleApply() {
    if (!result || selected.size === 0) return;
    if (!confirm(`Écraser les prix locaux pour ${selected.size} SKU(s) avec les valeurs SAP ?`)) return;
    setOuterBusy('apply');
    try {
      const r = await api.sapApplyPrices(Array.from(selected));
      await afterApply();
      setToast({ message: `${r.updated} produit(s) mis à jour depuis SAP.`, type: 'success' });
      const r2 = await api.sapVerify();
      setResult(r2);
    } catch (e: any) {
      setToast({ message: e?.response?.data?.detail ?? 'Échec de la mise à jour', type: 'error' });
    } finally {
      setOuterBusy(null);
    }
  }

  function toggleSelect(itemCode: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(itemCode)) next.delete(itemCode);
      else next.add(itemCode);
      return next;
    });
  }

  async function handleExport() {
    try { await api.downloadSapVerifyXlsx(); }
    catch (e: any) {
      setToast({ message: e?.response?.data?.detail ?? 'Échec du téléchargement', type: 'error' });
    }
  }

  if (!open) return null;
  return (
    <ModalShell
      title="Comparaison Excel ↔ SAP"
      subtitle={comparisonSubtitle(result)}
      onClose={onClose}
      actions={
        <>
          <button
            onClick={handleExport}
            disabled={!result || result.discrepancies.length === 0}
            title="Télécharge la liste des écarts au format Excel stylisé."
            style={{
              ...pcButton.base, ...pcButton.secondary,
              opacity: result && result.discrepancies.length > 0 ? 1 : 0.5,
            }}
          >
            <Download size={13} /> Excel
          </button>
          <button
            onClick={run}
            disabled={outerBusy === 'verify'}
            style={{
              ...pcButton.base, ...pcButton.primary,
              opacity: outerBusy === 'verify' ? 0.5 : 1,
            }}
          >
            <RefreshCw size={13} className={outerBusy === 'verify' ? 'spin' : ''} />
            {outerBusy === 'verify' ? 'Vérification…' : 'Relancer'}
          </button>
        </>
      }
    >
      {!result ? (
        <div style={{
          padding: 30, textAlign: 'center', color: '#71717a', fontSize: 13,
          background: '#fafafa', border: '1px dashed #e4e4e7', borderRadius: 10,
        }}>
          {outerBusy === 'verify' ? 'Vérification en cours…' : 'En attente de résultats.'}
        </div>
      ) : result.discrepancies.length === 0 ? (
        <div style={{
          padding: 16, borderRadius: 10,
          background: '#F0FDF4', border: '1px solid #BBF7D0',
          color: '#166534', fontSize: 13,
        }}>
          ✓ Tous les prix locaux sont à jour ({result.matched}/{result.checked} alignés).
        </div>
      ) : (
        <>
          <DiscrepancyTable
            discrepancies={result.discrepancies}
            selected={selected}
            onToggle={toggleSelect}
          />
          <div style={{
            display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap', alignItems: 'center',
          }}>
            <button
              onClick={handleApply}
              disabled={outerBusy !== null || selected.size === 0}
              style={{
                ...pcButton.base, ...pcButton.primary,
                opacity: outerBusy || selected.size === 0 ? 0.5 : 1,
              }}
            >
              <ArrowDownToLine size={13} />
              {outerBusy === 'apply'
                ? 'Mise à jour…'
                : `Écraser les prix de ${selected.size} SKU(s) avec SAP`}
            </button>
            <button
              onClick={() => setSelected(new Set(result.discrepancies.map((d) => d.item_code)))}
              style={{ ...pcButton.base, ...pcButton.secondary }}
            >
              Tout sélectionner
            </button>
            <button
              onClick={() => setSelected(new Set())}
              style={{ ...pcButton.base, ...pcButton.secondary }}
            >
              Tout désélectionner
            </button>
          </div>
        </>
      )}

      {result && result.not_in_sap.length > 0 && (
        <div style={{
          marginTop: 18, padding: 12, borderRadius: 8,
          background: '#FFF7ED', border: '1px solid #FED7AA',
          color: '#7C2D12', fontSize: 12.5,
        }}>
          <b>{result.not_in_sap.length} SKU(s) absent(s) de SAP :</b><br/>
          <code style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 11 }}>
            {result.not_in_sap.join(', ')}
          </code>
        </div>
      )}
    </ModalShell>
  );
}

function comparisonSubtitle(result: SapVerifyResult | null): string {
  if (!result) {
    return 'Compare les prix Gros / Gros Net / Détail / Détail Net par item_code.';
  }
  return [
    `${result.checked} SKU(s) vérifié(s)`,
    `${result.matched} OK`,
    result.discrepancies.length > 0 ? `${result.discrepancies.length} écart(s)` : '',
    result.not_in_sap.length > 0 ? `${result.not_in_sap.length} absent(s) de SAP` : '',
    (result.no_code_count ?? result.skipped_no_code) > 0
      ? `${result.no_code_count ?? result.skipped_no_code} sans item_code`
      : '',
    Object.keys(result.duplicate_codes ?? {}).length > 0
      ? `${Object.keys(result.duplicate_codes).length} item_code(s) en doublon`
      : '',
  ].filter(Boolean).join(' · ');
}

function FormulasModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [amaFactor, setAmaFactor] = useState(0.84);
  const [standardFactor, setStandardFactor] = useState(1.20);
  const [data, setData] = useState<SapFormulaCheckResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function run() {
    setBusy(true); setErr(null); setData(null);
    try {
      const r = await api.sapCheckFormulas({
        ama_factor: amaFactor, standard_factor: standardFactor,
      });
      setData(r);
    } catch (e: any) {
      setErr(e?.response?.data?.detail ?? 'Échec de la vérification');
    } finally {
      setBusy(false);
    }
  }

  async function handleExport() {
    try {
      await api.downloadSapCheckFormulasXlsx({
        ama_factor: amaFactor, standard_factor: standardFactor,
      });
    } catch (e: any) {
      setErr(e?.response?.data?.detail ?? 'Échec du téléchargement');
    }
  }

  useEffect(() => { if (open && !data && !busy) run(); /* eslint-disable-next-line */ }, [open]);

  if (!open) return null;
  const violationCount = data?.rows_with_violations.length ?? 0;

  return (
    <ModalShell
      title="Vérification des formules SAP"
      subtitle="Tarifs AMA = GROS NET × facteur AMA · PRIX STANDARD = Tarifs AMA ÷ diviseur."
      onClose={onClose}
      actions={
        <button
          onClick={handleExport}
          disabled={!data}
          title="Télécharge les erreurs de formule + lignes à prix manquants au format Excel stylisé."
          style={{
            ...pcButton.base, ...pcButton.secondary,
            opacity: data ? 1 : 0.5,
          }}
        >
          <Download size={13} /> Excel
        </button>
      }
    >
      <div style={{
        display: 'grid', gap: 10, gridTemplateColumns: '1fr 1fr 1fr',
        maxWidth: 540, marginBottom: 12,
      }}>
        <FactorField label="Facteur AMA" value={amaFactor} onChange={setAmaFactor} />
        <FactorField label="Diviseur Standard" value={standardFactor} onChange={setStandardFactor} />
        <button
          onClick={run}
          disabled={busy}
          style={{
            ...pcButton.base, ...pcButton.primary,
            opacity: busy ? 0.5 : 1, alignSelf: 'end', height: 36,
          }}
        >
          <Calculator size={13} /> {busy ? 'Audit…' : 'Relancer'}
        </button>
      </div>

      {err && (
        <div style={{
          padding: 12, borderRadius: 8, marginBottom: 12,
          background: '#FEF2F2', border: '1px solid #FECACA', color: '#7F1D1D', fontSize: 12.5,
        }}>{err}</div>
      )}

      {data && (
        <>
          <div style={{
            padding: '8px 12px', borderRadius: 8,
            background: violationCount === 0 ? '#F0FDF4' : '#FFF7ED',
            border: `1px solid ${violationCount === 0 ? '#BBF7D0' : '#FED7AA'}`,
            fontSize: 12.5,
            color: violationCount === 0 ? '#166534' : '#7C2D12',
            marginBottom: 12,
          }}>
            <b>{data.checked}</b> testée(s) · <b>{data.valid}</b> OK · <b>{violationCount}</b> avec erreur
            {data.skipped_zero_base > 0 && <> · {data.skipped_zero_base} sans base (GROS NET = 0)</>}
          </div>

          {violationCount > 0 && (
            <div style={{
              border: '1px solid #e4e4e7', borderRadius: 8, background: '#fff',
              overflow: 'auto', maxHeight: '40vh', marginBottom: 18,
            }}>
              <table style={{ borderCollapse: 'separate', borderSpacing: 0, minWidth: '100%', fontSize: 11.5 }}>
                <thead>
                  <tr style={{ background: '#fafafa' }}>
                    {['ItemCode', 'Nom', 'GROS NET', 'Tarifs AMA', 'PRIX STANDARD', 'Formule', 'Attendu', 'Réel', 'Écart'].map((h) => (
                      <th key={h} style={{
                        position: 'sticky', top: 0, background: '#fafafa',
                        borderBottom: '1px solid #e4e4e7',
                        padding: '8px 12px', textAlign: 'left',
                        color: '#52525b', fontWeight: 700, whiteSpace: 'nowrap',
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.rows_with_violations.flatMap((row, ri) => (
                    row.violations.map((v, vi) => (
                      <tr key={`${ri}-${vi}`} style={{
                        background: ri % 2 === 0 ? '#fff' : '#fafafa',
                        borderTop: vi === 0 ? '1px solid #e4e4e7' : undefined,
                      }}>
                        {vi === 0 ? (
                          <>
                            <td style={tdStyle} rowSpan={row.violations.length}>
                              <code style={{ fontFamily: '"JetBrains Mono", monospace' }}>{row.item_code}</code>
                            </td>
                            <td style={tdStyle} rowSpan={row.violations.length}>{row.item_name}</td>
                            <td style={tdNum} rowSpan={row.violations.length}>{row.gros_net.toFixed(2)}</td>
                            <td style={tdNum} rowSpan={row.violations.length}>{row.tarifs_ama.toFixed(2)}</td>
                            <td style={tdNum} rowSpan={row.violations.length}>{row.prix_standard.toFixed(2)}</td>
                          </>
                        ) : null}
                        <td style={tdStyle}>{v.label}</td>
                        <td style={{ ...tdNum, color: '#15803d', fontWeight: 600 }}>{v.expected.toFixed(2)}</td>
                        <td style={{ ...tdNum, color: '#b91c1c', fontWeight: 600 }}>{v.actual.toFixed(2)}</td>
                        <td style={{ ...tdNum, color: '#b91c1c' }}>{v.delta > 0 ? `+${v.delta.toFixed(2)}` : v.delta.toFixed(2)}</td>
                      </tr>
                    ))
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {data.zero_price_rows.length > 0 && (
            <>
              <div style={{
                padding: '8px 12px', borderRadius: 8,
                background: '#FFF7ED', border: '1px solid #FED7AA',
                fontSize: 12.5, color: '#7C2D12', marginBottom: 8,
              }}>
                <b>{data.zero_price_rows.length} ligne(s) avec prix manquants</b> — SAP renvoie 0 pour au moins une colonne. Ces lignes ne peuvent pas être auditées mais méritent d'être corrigées dans SAP.
              </div>
              <div style={{
                border: '1px solid #e4e4e7', borderRadius: 8, background: '#fff',
                overflow: 'auto', maxHeight: '35vh',
              }}>
                <table style={{ borderCollapse: 'separate', borderSpacing: 0, minWidth: '100%', fontSize: 11.5 }}>
                  <thead>
                    <tr style={{ background: '#fafafa' }}>
                      {['ItemCode', 'Nom', 'GROS', 'GROS NET', 'Tarifs AMA', 'PRIX STANDARD', 'DETAIL', 'DETAIL NET', 'Champs à 0'].map((h) => (
                        <th key={h} style={{
                          position: 'sticky', top: 0, background: '#fafafa',
                          borderBottom: '1px solid #e4e4e7',
                          padding: '8px 12px', textAlign: 'left',
                          color: '#52525b', fontWeight: 700, whiteSpace: 'nowrap',
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.zero_price_rows.map((row, i) => {
                      const isZero = (label: string) => row.zero_fields.includes(label);
                      const cellColor = (label: string) => isZero(label) ? '#b91c1c' : '#18181b';
                      return (
                        <tr key={row.item_code + ':' + i} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                          <td style={tdStyle}>
                            <code style={{ fontFamily: '"JetBrains Mono", monospace' }}>{row.item_code}</code>
                          </td>
                          <td style={tdStyle}>{row.item_name}</td>
                          <td style={{ ...tdNum, color: cellColor('GROS') }}>{row.gros.toFixed(2)}</td>
                          <td style={{ ...tdNum, color: cellColor('GROS NET') }}>{row.gros_net.toFixed(2)}</td>
                          <td style={{ ...tdNum, color: cellColor('Tarifs AMA') }}>{row.tarifs_ama.toFixed(2)}</td>
                          <td style={{ ...tdNum, color: cellColor('PRIX STANDARD') }}>{row.prix_standard.toFixed(2)}</td>
                          <td style={{ ...tdNum, color: cellColor('DETAIL') }}>{row.detail.toFixed(2)}</td>
                          <td style={{ ...tdNum, color: cellColor('DETAIL NET') }}>{row.detail_net.toFixed(2)}</td>
                          <td style={{ ...tdStyle, color: '#7C2D12', fontWeight: 600 }}>
                            {row.zero_fields.join(', ')}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </ModalShell>
  );
}

function FactorField({
  label, value, onChange,
}: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: '#71717a', textTransform: 'uppercase', letterSpacing: 0.3 }}>
        {label}
      </span>
      <input
        type="number"
        step="0.01"
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        style={{
          padding: '8px 10px', border: '1px solid #e4e4e7', borderRadius: 6,
          fontSize: 12.5, color: '#18181b', background: '#fff',
        }}
      />
    </label>
  );
}

/* ─────────────────────── Comparison table ────────────────────── */

function DiscrepancyTable({
  discrepancies, selected, onToggle,
}: {
  discrepancies: SapVerifyResult['discrepancies'];
  selected: Set<string>;
  onToggle: (itemCode: string) => void;
}) {
  const cellStyle: React.CSSProperties = {
    padding: '6px 10px', borderBottom: '1px solid #f4f4f5',
    fontSize: 11.5, color: '#18181b', whiteSpace: 'nowrap',
  };
  const numStyle: React.CSSProperties = {
    ...cellStyle, fontFamily: '"JetBrains Mono", monospace', textAlign: 'right',
  };
  return (
    <div style={{
      border: '1px solid #e4e4e7', borderRadius: 8, background: '#fff',
      overflow: 'auto', maxHeight: '50vh',
    }}>
      <table style={{ borderCollapse: 'separate', borderSpacing: 0, minWidth: '100%' }}>
        <thead>
          <tr style={{ background: '#fafafa' }}>
            <th style={{ ...cellStyle, position: 'sticky', top: 0, background: '#fafafa', width: 32 }}></th>
            <th style={{ ...cellStyle, position: 'sticky', top: 0, background: '#fafafa', textAlign: 'left' }}>
              ItemCode
            </th>
            <th style={{ ...cellStyle, position: 'sticky', top: 0, background: '#fafafa', textAlign: 'left' }}>
              Nom
            </th>
            {PRICE_FIELDS.map((f) => (
              <th key={f.key}
                colSpan={2}
                style={{
                  ...cellStyle, position: 'sticky', top: 0,
                  background: '#fafafa', textAlign: 'center',
                  borderLeft: '1px solid #e4e4e7',
                }}>
                {f.label}
              </th>
            ))}
          </tr>
          <tr style={{ background: '#fafafa' }}>
            <th style={cellStyle}></th>
            <th style={cellStyle}></th>
            <th style={cellStyle}></th>
            {PRICE_FIELDS.map((f) => (
              <React.Fragment key={f.key}>
                <th style={{ ...cellStyle, borderLeft: '1px solid #e4e4e7', color: '#71717a', textAlign: 'right' }}>
                  Local
                </th>
                <th style={{ ...cellStyle, color: '#71717a', textAlign: 'right' }}>
                  SAP
                </th>
              </React.Fragment>
            ))}
          </tr>
        </thead>
        <tbody>
          {discrepancies.map((d, i) => (
            <tr key={d.item_code}
              style={{ background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
              <td style={{ ...cellStyle, textAlign: 'center' }}>
                <input
                  type="checkbox"
                  checked={selected.has(d.item_code)}
                  onChange={() => onToggle(d.item_code)}
                />
              </td>
              <td style={{ ...cellStyle, fontFamily: '"JetBrains Mono", monospace' }}>
                {d.item_code}
              </td>
              <td style={cellStyle}>{d.nom || <span style={{ color: '#d4d4d8' }}>—</span>}</td>
              {PRICE_FIELDS.map((f) => {
                const diff = d.differences[f.key];
                const drift = !!diff;
                return (
                  <React.Fragment key={f.key}>
                    <td style={{ ...numStyle, borderLeft: '1px solid #e4e4e7', color: drift ? '#b91c1c' : '#a1a1aa' }}>
                      {drift ? diff.local.toFixed(2) : '—'}
                    </td>
                    <td style={{ ...numStyle, color: drift ? '#15803d' : '#a1a1aa', fontWeight: drift ? 600 : 400 }}>
                      {drift ? diff.sap.toFixed(2) : '—'}
                    </td>
                  </React.Fragment>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Shared styles for the formula tables.
const tdStyle: React.CSSProperties = {
  padding: '6px 10px',
  borderBottom: '1px solid #f4f4f5',
  fontSize: 11.5,
  color: '#18181b',
  whiteSpace: 'nowrap',
  verticalAlign: 'top',
};
const tdNum: React.CSSProperties = {
  ...tdStyle,
  fontFamily: '"JetBrains Mono", monospace',
  textAlign: 'right',
};
