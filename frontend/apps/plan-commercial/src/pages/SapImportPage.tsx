import { useEffect, useState } from 'react';
import { SectionCard, Toast } from '@amafin/ui';
import { Database, Plug, Eye, Download, ArrowDownToLine } from 'lucide-react';
import { PageShell, PC_ACCENT, pcButton } from './PageShell';
import * as api from '../api';
import { usePlanCommercial } from '../store/usePlanCommercial';

/**
 * SAP import flow: enter SQL Server credentials, optionally preview the
 * warehouse query result, then import — either replacing or appending to the
 * current product list.
 *
 * Server / database / username are remembered in localStorage so the user
 * doesn't have to retype them. The password is never persisted; it stays in
 * component state and is wiped when the page unmounts.
 */
const LS_KEY = 'pc.sap.creds.v1';

interface PersistedCreds {
  server: string;
  database: string;
  username: string;
}

function loadCreds(): PersistedCreds {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { server: '192.168.1.240', database: 'DATAWAREHOUSE', username: '' };
}

function saveCreds(c: PersistedCreds) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(c)); } catch { /* ignore */ }
}

export function PlanCommercialSapImportPage() {
  const { refreshProducts, bumpPreview } = usePlanCommercial();
  const persisted = loadCreds();
  const [server, setServer] = useState(persisted.server);
  const [database, setDatabase] = useState(persisted.database);
  const [username, setUsername] = useState(persisted.username);
  const [password, setPassword] = useState('');
  const [replace, setReplace] = useState(true);

  const [busy, setBusy] = useState<'test' | 'preview' | 'import' | null>(null);
  const [columns, setColumns] = useState<string[]>([]);
  const [rows, setRows] = useState<any[][]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [driver, setDriver] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    saveCreds({ server, database, username });
  }, [server, database, username]);

  const creds = { server, database, username, password };
  const canCall = !!(server.trim() && database.trim() && username.trim() && password);

  async function handleTest() {
    setBusy('test');
    try {
      const r = await api.sapTest(creds);
      setDriver(r.driver);
      setToast({ message: `Connexion OK · pilote: ${r.driver}`, type: 'success' });
    } catch (e: any) {
      setToast({ message: e?.response?.data?.detail ?? 'Connexion échouée', type: 'error' });
    } finally {
      setBusy(null);
    }
  }

  async function handlePreview() {
    setBusy('preview');
    try {
      const r = await api.sapPreview(creds, 25);
      setColumns(r.columns);
      setRows(r.rows);
      setTotal(r.total);
      setToast({ message: `${r.total} ligne(s) — aperçu : ${r.rows.length}`, type: 'success' });
    } catch (e: any) {
      setToast({ message: e?.response?.data?.detail ?? 'Échec de l\'aperçu', type: 'error' });
    } finally {
      setBusy(null);
    }
  }

  async function handleImport() {
    if (replace && !confirm('Remplacer tous les produits du plan actuel ?')) return;
    setBusy('import');
    try {
      const r = await api.sapImport(creds, { replace });
      await refreshProducts();
      bumpPreview();
      setToast({ message: `${r.loaded} produit(s) importé(s) depuis SAP`, type: 'success' });
    } catch (e: any) {
      setToast({ message: e?.response?.data?.detail ?? 'Échec de l\'import', type: 'error' });
    } finally {
      setBusy(null);
    }
  }

  function handleDownloadXlsx() {
    // Plain anchor download requires creds in the URL or a form-post — easiest
    // is to POST via fetch and stream the response blob.
    setBusy('preview');
    fetch(api.sapExportXlsxUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(creds),
    })
      .then(async (resp) => {
        if (!resp.ok) {
          const text = await resp.text();
          throw new Error(text || `HTTP ${resp.status}`);
        }
        return resp.blob();
      })
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'sap_export.xlsx';
        a.click();
        URL.revokeObjectURL(url);
        setToast({ message: 'Fichier téléchargé', type: 'success' });
      })
      .catch((e: any) => setToast({ message: e?.message ?? 'Échec du téléchargement', type: 'error' }))
      .finally(() => setBusy(null));
  }

  return (
    <PageShell
      title="Import SAP"
      subtitle="Connexion directe à la base SQL Server (DATAWAREHOUSE) — chaque clic demande le mot de passe. La requête SQL est modifiable dans api/sap_query.py."
    >
      <SectionCard
        icon={<Database size={16} />}
        accent={PC_ACCENT}
        title="Connexion"
        subtitle="Le serveur, la base et le nom d'utilisateur sont mémorisés dans ce navigateur. Le mot de passe n'est jamais enregistré."
      >
        <div style={{
          display: 'grid', gap: 10,
          gridTemplateColumns: '1fr 1fr', maxWidth: 720,
        }}>
          <Field label="Serveur"      value={server}   onChange={setServer} />
          <Field label="Base"         value={database} onChange={setDatabase} />
          <Field label="Utilisateur"  value={username} onChange={setUsername} />
          <Field label="Mot de passe" value={password} onChange={setPassword} type="password" />
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
          <button
            onClick={handleTest}
            disabled={!canCall || busy !== null}
            style={{
              ...pcButton.base, ...pcButton.secondary,
              opacity: !canCall || busy ? 0.5 : 1,
            }}
          >
            <Plug size={13} /> {busy === 'test' ? 'Connexion…' : 'Tester la connexion'}
          </button>
          <button
            onClick={handlePreview}
            disabled={!canCall || busy !== null}
            style={{
              ...pcButton.base, ...pcButton.secondary,
              opacity: !canCall || busy ? 0.5 : 1,
            }}
          >
            <Eye size={13} /> {busy === 'preview' ? 'Requête…' : 'Aperçu'}
          </button>
          <button
            onClick={handleDownloadXlsx}
            disabled={!canCall || busy !== null}
            style={{
              ...pcButton.base, ...pcButton.secondary,
              opacity: !canCall || busy ? 0.5 : 1,
            }}
          >
            <Download size={13} /> Télécharger .xlsx (brut)
          </button>
          <button
            onClick={handleImport}
            disabled={!canCall || busy !== null}
            style={{
              ...pcButton.base, ...pcButton.primary,
              opacity: !canCall || busy ? 0.5 : 1,
            }}
          >
            <ArrowDownToLine size={13} /> {busy === 'import' ? 'Import…' : 'Importer dans le plan'}
          </button>
          <label style={{
            display: 'flex', alignItems: 'center', gap: 6,
            fontSize: 12, color: '#52525b', marginLeft: 4,
          }}>
            <input
              type="checkbox"
              checked={replace}
              onChange={(e) => setReplace(e.target.checked)}
            />
            Remplacer les produits existants
          </label>
        </div>

        {driver && (
          <div style={{ marginTop: 10, fontSize: 11.5, color: '#71717a' }}>
            Pilote ODBC : <code>{driver}</code>
          </div>
        )}
      </SectionCard>

      {columns.length > 0 && (
        <SectionCard
          icon={<Eye size={16} />}
          accent={PC_ACCENT}
          title={`Aperçu — ${total ?? rows.length} ligne(s)`}
          subtitle={`Affichage des ${rows.length} premières lignes. ${columns.length} colonne(s).`}
        >
          <div style={{
            border: '1px solid #e4e4e7', borderRadius: 8,
            background: '#fff', overflow: 'auto', maxHeight: 460,
          }}>
            <table style={{
              borderCollapse: 'separate', borderSpacing: 0,
              fontSize: 11.5, fontFamily: 'Inter, sans-serif',
              minWidth: '100%', tableLayout: 'auto',
            }}>
              <thead>
                <tr>
                  {columns.map((c) => (
                    <th key={c} style={{
                      position: 'sticky', top: 0,
                      background: '#fafafa', borderBottom: '1px solid #e4e4e7',
                      padding: '8px 12px', textAlign: 'left',
                      color: '#52525b', fontWeight: 700,
                      whiteSpace: 'nowrap',
                    }}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} style={{
                    background: i % 2 === 0 ? '#fff' : '#fafafa',
                  }}>
                    {r.map((cell, j) => (
                      <td key={j} style={{
                        padding: '6px 12px',
                        borderBottom: '1px solid #f4f4f5',
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
          </div>
        </SectionCard>
      )}

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </PageShell>
  );
}

function Field({
  label, value, onChange, type,
}: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: '#71717a', textTransform: 'uppercase', letterSpacing: 0.3 }}>
        {label}
      </span>
      <input
        type={type ?? 'text'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={type === 'password' ? 'current-password' : 'off'}
        style={{
          padding: '8px 10px', border: '1px solid #e4e4e7', borderRadius: 6,
          fontSize: 12.5, color: '#18181b', background: '#fff',
          fontFamily: 'Inter, sans-serif',
        }}
      />
    </label>
  );
}
