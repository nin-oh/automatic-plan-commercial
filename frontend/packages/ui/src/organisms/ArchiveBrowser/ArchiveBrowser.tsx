import { useState } from 'react';
import { Calendar, Download, Edit, Copy, Trash2, ChevronDown, ChevronRight } from 'lucide-react';

export interface ArchiveDeck {
  name: string;
  pptx_name: string;
  size_kb: number;
  has_xlsx: boolean;
  has_thumb: boolean;
  modified: string;
}

export interface ArchiveMonth {
  month: string;
  decks: ArchiveDeck[];
  total_size_kb: number;
}

export interface ArchiveBrowserProps {
  months: ArchiveMonth[];
  thumbnailUrl: (month: string, name: string) => string;
  pptxUrl: (month: string, pptxName: string) => string;
  pdfUrl: (month: string, name: string) => string;
  onLoad: (month: string, name: string) => void;
  onDuplicate: (month: string, name: string) => void;
  onDelete: (month: string, pptxName: string) => void;
  /** Brand accent for highlights. */
  accent?: string;
}

export function ArchiveBrowser({
  months, thumbnailUrl, pptxUrl, pdfUrl, onLoad, onDuplicate, onDelete,
  accent = '#6366f1',
}: ArchiveBrowserProps) {
  if (months.length === 0) {
    return (
      <div style={{
        border: '1px dashed #e4e4e7', borderRadius: 12, padding: 40,
        color: '#71717a', textAlign: 'center', fontSize: 13,
        background: '#fafafa',
      }}>
        Aucun plan archivé pour le moment. Générez-en un dans l'onglet
        <b style={{ color: '#3f3f46' }}> Génération</b> — il apparaîtra ici.
      </div>
    );
  }
  const totalDecks = months.reduce((sum, m) => sum + m.decks.length, 0);
  const totalKb = months.reduce((sum, m) => sum + m.total_size_kb, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ color: '#71717a', fontSize: 12 }}>
        <b style={{ color: '#3f3f46' }}>{totalDecks}</b> deck(s) sur
        <b style={{ color: '#3f3f46' }}> {months.length}</b> mois —
        <b style={{ color: '#3f3f46' }}> {(totalKb / 1024).toFixed(1)} MB</b>
      </div>
      {months.map((m) => (
        <MonthBlock
          key={m.month} month={m} accent={accent}
          thumbnailUrl={thumbnailUrl} pptxUrl={pptxUrl} pdfUrl={pdfUrl}
          onLoad={onLoad} onDuplicate={onDuplicate} onDelete={onDelete}
        />
      ))}
    </div>
  );
}

function MonthBlock({
  month, accent, thumbnailUrl, pptxUrl, pdfUrl, onLoad, onDuplicate, onDelete,
}: { month: ArchiveMonth; accent: string } & Omit<ArchiveBrowserProps, 'months' | 'accent'>) {
  const [open, setOpen] = useState(true);
  return (
    <div style={{
      border: '1px solid #e4e4e7', borderRadius: 12, overflow: 'hidden',
      background: '#ffffff',
    }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 8,
          padding: '12px 14px', background: '#fafafa', border: 'none',
          color: '#18181b', fontSize: 13, fontWeight: 600, cursor: 'pointer',
          borderBottom: open ? '1px solid #e4e4e7' : 'none',
        }}
      >
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <Calendar size={14} style={{ color: accent }} />
        <span>{month.month}</span>
        <span style={{ color: '#71717a', fontWeight: 500 }}>
          — {month.decks.length} deck(s), {(month.total_size_kb / 1024).toFixed(1)} MB
        </span>
      </button>
      {open && (
        <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {month.decks.map((d) => (
            <DeckRow
              key={d.pptx_name}
              month={month.month} deck={d} accent={accent}
              thumbnailUrl={thumbnailUrl} pptxUrl={pptxUrl} pdfUrl={pdfUrl}
              onLoad={onLoad} onDuplicate={onDuplicate} onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function DeckRow({
  month, deck, accent, thumbnailUrl, pptxUrl, pdfUrl, onLoad, onDuplicate, onDelete,
}: {
  month: string; deck: ArchiveDeck; accent: string;
} & Omit<ArchiveBrowserProps, 'months' | 'accent'>) {
  const [confirming, setConfirming] = useState(false);
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '160px 1fr auto', gap: 12,
      padding: 12, border: '1px solid #e4e4e7', borderRadius: 10,
      background: '#ffffff',
    }}>
      <div style={{
        height: 92, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#fafafa', borderRadius: 6, overflow: 'hidden',
        border: '1px solid #f4f4f5',
      }}>
        <img
          src={thumbnailUrl(month, deck.name)}
          alt={deck.name}
          style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
        <div style={{
          color: '#18181b', fontSize: 13, fontWeight: 600,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {deck.name}
        </div>
        <div style={{ color: '#71717a', fontSize: 11.5 }}>
          {deck.size_kb} KB · modifié {deck.modified}
        </div>
        <div style={{
          color: '#a1a1aa', fontSize: 10.5, fontFamily: '"JetBrains Mono", monospace',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {deck.pptx_name}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'stretch', minWidth: 130 }}>
        <a href={pptxUrl(month, deck.pptx_name)} download
          style={{ ...miniBtn, textDecoration: 'none', color: accent, borderColor: `${accent}55` }}>
          <Download size={11} /> .pptx
        </a>
        {deck.has_xlsx && (
          <a href={pdfUrl(month, deck.name)} download
            title="Première fois : rendu PDF ~30 s (200 DPI). Ensuite instantané."
            style={{ ...miniBtn, textDecoration: 'none', color: accent, borderColor: `${accent}55` }}>
            <Download size={11} /> .pdf
          </a>
        )}
        {deck.has_xlsx && (
          <button onClick={() => onLoad(month, deck.name)} style={miniBtn}>
            <Edit size={11} /> Éditer
          </button>
        )}
        {deck.has_xlsx && (
          <button onClick={() => onDuplicate(month, deck.name)} style={miniBtn}>
            <Copy size={11} /> Dupliquer
          </button>
        )}
        {confirming ? (
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={() => { onDelete(month, deck.pptx_name); setConfirming(false); }}
              style={{
                ...miniBtn, background: '#fef2f2', color: '#b91c1c',
                borderColor: '#fecaca', flex: 1,
              }}>
              Confirmer
            </button>
            <button onClick={() => setConfirming(false)} style={{ ...miniBtn, flex: 1 }}>
              Annuler
            </button>
          </div>
        ) : (
          <button onClick={() => setConfirming(true)}
            style={{ ...miniBtn, color: '#dc2626', borderColor: '#fecaca' }}>
            <Trash2 size={11} /> Supprimer
          </button>
        )}
      </div>
    </div>
  );
}

const miniBtn: React.CSSProperties = {
  padding: '6px 9px', border: '1px solid #e4e4e7', background: '#ffffff',
  color: '#27272a', borderRadius: 6, fontSize: 11.5, cursor: 'pointer',
  fontWeight: 500,
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
};
