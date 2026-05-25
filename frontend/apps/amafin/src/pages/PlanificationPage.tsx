/**
 * PlanificationPage — Futuristic cash-flow planning board
 *
 * Replicates old Django /static/js/planification.js logic:
 * - Kanban drag-drop between Courant / Effet / Finex columns (→ payment_type op)
 * - Priority, bank, montant, date edits (→ single-field ops)
 * - Solde movements between societe×banque (→ mvt op)
 * - Undo / Discard / Commit flow
 * - KPI computation from draft state
 *
 * Style: dark futuristic with neon glow
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  DndContext, closestCorners, PointerSensor, useSensor, useSensors,
  DragOverlay, type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core';
import { useSortable, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import {
  Zap, Activity, AlertTriangle, TrendingUp, Wallet, ArrowRight,
  Undo2, Trash2, Check, Calendar, Edit3,
} from 'lucide-react';
import { PageHeader, Toast, AlertMessage } from '@amafin/ui';
import { api } from '../api/client';

// ═══════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════

interface Payment {
  id: number;
  fournisseur: string;
  payment_type: string;
  montant_dhs: string;
  priority: string;
  date_debit: string;
  banque: number;
  echeance?: string;
}

interface Solde {
  id: number;
  societe: number;
  banque: number;
  montant_dhs: number;
  societe_code?: string;
  banque_name?: string;
}

interface BankOption { value: number; label: string }

// ═══════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════

const fmtCurrency = (v: number) => new Intl.NumberFormat('fr-MA', {
  minimumFractionDigits: 2, maximumFractionDigits: 2,
}).format(v);

function extractPriority(raw: string): string {
  if (!raw) return 'P0';
  if (raw.startsWith('P0') || raw === '0') return 'P0';
  if (raw.startsWith('P1') || raw === '1') return 'P1';
  if (raw.startsWith('P2') || raw === '2') return 'P2';
  return 'P0';
}

const COLUMN_COLORS = {
  Courant: { main: '#f59e0b', glow: '#fbbf24', bg: 'rgba(245, 158, 11, 0.1)' },
  Effet:   { main: '#10b981', glow: '#34d399', bg: 'rgba(16, 185, 129, 0.1)' },
  Finex:   { main: '#6366f1', glow: '#818cf8', bg: 'rgba(99, 102, 241, 0.1)' },
};

const PRIORITY_COLORS = {
  P0: '#ef4444', P1: '#f59e0b', P2: '#10b981',
};

// ═══════════════════════════════════════════════
// Live indicator
// ═══════════════════════════════════════════════

function LiveDot({ color = '#10b981' }: { color?: string }) {
  return (
    <motion.div
      animate={{ scale: [1, 1.4, 1], opacity: [1, 0.5, 1] }}
      transition={{ duration: 1.5, repeat: Infinity }}
      style={{
        width: 7, height: 7, borderRadius: '50%',
        background: color, boxShadow: `0 0 8px ${color}`,
      }}
    />
  );
}

// ═══════════════════════════════════════════════
// Futuristic KPI Card
// ═══════════════════════════════════════════════

function FutureKpiCard({
  label, value, icon, gradient, accent, delay,
}: {
  label: string; value: number; icon: React.ReactNode;
  gradient: string; accent: string; delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay }}
      whileHover={{ y: -4 }}
      style={{
        position: 'relative',
        borderRadius: 14,
        padding: '1.1rem 1.2rem',
        background: gradient,
        color: '#fff',
        overflow: 'hidden',
        boxShadow: `0 8px 25px ${accent}40`,
      }}
    >
      {/* Grid pattern */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: `linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px),
                          linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)`,
        backgroundSize: '16px 16px',
        maskImage: 'radial-gradient(circle at 50% 50%, black 50%, transparent)',
      }} />

      <motion.div
        animate={{ scale: [1, 1.2, 1] }}
        transition={{ duration: 3, repeat: Infinity }}
        style={{
          position: 'absolute', top: -20, right: -20,
          width: 80, height: 80, borderRadius: '50%',
          background: accent, filter: 'blur(25px)', opacity: 0.5,
        }}
      />

      <div style={{ position: 'relative', zIndex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.5, opacity: 0.9, fontWeight: 700, fontFamily: '"JetBrains Mono", monospace' }}>
            {label}
          </span>
          <div style={{
            width: 28, height: 28, borderRadius: 8,
            background: 'rgba(255,255,255,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {icon}
          </div>
        </div>
        <div style={{
          fontSize: 22, fontWeight: 800, lineHeight: 1,
          fontFamily: '"JetBrains Mono", monospace',
          fontVariantNumeric: 'tabular-nums',
        }}>
          {fmtCurrency(value)}
        </div>
        <div style={{ fontSize: 9, opacity: 0.65, marginTop: 4, letterSpacing: 1, fontFamily: '"JetBrains Mono", monospace' }}>
          DHS ◆ LIVE
        </div>
      </div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════
// Payment Kanban Card (draggable)
// ═══════════════════════════════════════════════

function PaymentKanbanCard({
  payment, banks, onFieldChange,
}: {
  payment: Payment;
  banks: BankOption[];
  onFieldChange: (field: string, newValue: unknown, oldValue: unknown) => void;
}) {
  const [editField, setEditField] = useState<'priority' | 'banque' | 'montant' | 'date' | null>(null);
  const [tempValue, setTempValue] = useState('');

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: payment.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  };

  const colors = COLUMN_COLORS[payment.payment_type as keyof typeof COLUMN_COLORS] || COLUMN_COLORS.Courant;
  const priority = extractPriority(payment.priority);
  const bankLabel = banks.find(b => b.value === payment.banque)?.label || '—';
  const montant = parseFloat(payment.montant_dhs || '0');

  function handleFieldSave(field: string) {
    const oldValue = field === 'priority' ? payment.priority
                   : field === 'banque' ? payment.banque
                   : field === 'montant' ? montant
                   : payment.date_debit;
    let newVal: unknown = tempValue;
    if (field === 'banque') newVal = parseInt(tempValue);
    if (field === 'montant') newVal = parseFloat(tempValue);
    if (field === 'priority') newVal = tempValue.replace('P', '');

    onFieldChange(field === 'priority' ? 'priority'
                : field === 'banque' ? 'banque'
                : field === 'montant' ? 'montant_dhs'
                : 'date_debit', newVal, oldValue);
    setEditField(null);
  }

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        position: 'relative',
        background: 'rgba(255,255,255,0.98)',
        borderRadius: 12,
        padding: '0.9rem',
        marginBottom: 8,
        border: `1px solid ${colors.main}30`,
        boxShadow: isDragging ? `0 10px 30px ${colors.main}40` : `0 2px 10px rgba(0,0,0,0.06)`,
        cursor: 'grab',
      }}
    >
      {/* Glowing left stripe */}
      <div style={{
        position: 'absolute', left: 0, top: 8, bottom: 8, width: 3,
        background: colors.main, borderRadius: 2,
        boxShadow: `0 0 8px ${colors.glow}`,
      }} />

      <div {...attributes} {...listeners} style={{ marginLeft: 8 }}>
        {/* Header: fournisseur + priority */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8, gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {payment.fournisseur || `Payment #${payment.id}`}
            </div>
            <div style={{ fontSize: 9, color: '#94a3b8', fontFamily: '"JetBrains Mono", monospace', letterSpacing: 1, marginTop: 2 }}>
              #{String(payment.id).padStart(4, '0')}
            </div>
          </div>

          {/* Priority badge (clickable for Courant) */}
          {payment.payment_type === 'Courant' && (
            <div style={{ position: 'relative' }} onPointerDown={(e) => e.stopPropagation()}>
              {editField === 'priority' ? (
                <div style={{ display: 'flex', gap: 2 }}>
                  {['P0', 'P1', 'P2'].map(p => (
                    <button
                      key={p}
                      onClick={() => { setTempValue(p); handleFieldSave('priority'); }}
                      style={{
                        padding: '3px 8px', borderRadius: 6, border: 'none',
                        background: PRIORITY_COLORS[p as keyof typeof PRIORITY_COLORS],
                        color: '#fff', fontSize: 10, fontWeight: 700, cursor: 'pointer',
                      }}
                    >{p}</button>
                  ))}
                </div>
              ) : (
                <button
                  onClick={() => setEditField('priority')}
                  style={{
                    padding: '3px 10px', borderRadius: 6, border: 'none',
                    background: `linear-gradient(135deg, ${PRIORITY_COLORS[priority as keyof typeof PRIORITY_COLORS]}, ${PRIORITY_COLORS[priority as keyof typeof PRIORITY_COLORS]}cc)`,
                    color: '#fff', fontSize: 10, fontWeight: 700, cursor: 'pointer',
                    boxShadow: `0 0 8px ${PRIORITY_COLORS[priority as keyof typeof PRIORITY_COLORS]}60`,
                    fontFamily: '"JetBrains Mono", monospace',
                  }}
                >
                  {priority}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Amount */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}
             onPointerDown={(e) => e.stopPropagation()}>
          {editField === 'montant' ? (
            <input
              autoFocus type="number" className="input-base" value={tempValue}
              onChange={(e) => setTempValue(e.target.value)}
              onBlur={() => handleFieldSave('montant')}
              onKeyDown={(e) => { if (e.key === 'Enter') handleFieldSave('montant'); if (e.key === 'Escape') setEditField(null); }}
              style={{ fontSize: 12, padding: '4px 8px', width: '100%' }}
            />
          ) : (
            <button
              onClick={() => { setTempValue(String(montant)); setEditField('montant'); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer',
                background: 'transparent', border: 'none', padding: 0,
                fontSize: 16, fontWeight: 700, color: colors.main,
                fontFamily: '"JetBrains Mono", monospace',
              }}
            >
              {fmtCurrency(montant)}
              <Edit3 size={11} style={{ opacity: 0.5 }} />
            </button>
          )}
        </div>

        {/* Bank + Date row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}
             onPointerDown={(e) => e.stopPropagation()}>
          {/* Bank */}
          {editField === 'banque' ? (
            <select
              className="select-base" autoFocus value={tempValue}
              onChange={(e) => { setTempValue(e.target.value); handleFieldSave('banque'); }}
              onBlur={() => setEditField(null)}
              style={{ fontSize: 10, padding: '2px 6px', flex: 1 }}
            >
              {banks.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
            </select>
          ) : (
            <button
              onClick={() => { setTempValue(String(payment.banque)); setEditField('banque'); }}
              style={{
                padding: '3px 8px', borderRadius: 6, border: `1px solid ${colors.main}40`,
                background: colors.bg, color: colors.main,
                fontSize: 10, fontWeight: 700, cursor: 'pointer',
                fontFamily: '"JetBrains Mono", monospace',
              }}
            >
              🏦 {bankLabel}
            </button>
          )}

          {/* Date */}
          <div style={{ fontSize: 10, color: '#64748b', fontFamily: '"JetBrains Mono", monospace', display: 'flex', alignItems: 'center', gap: 4 }}>
            <Calendar size={11} />
            {payment.date_debit || '—'}
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════
// Kanban Column (drop zone)
// ═══════════════════════════════════════════════

function KanbanColumn({
  columnId, title, color, payments, banks, onFieldChange,
}: {
  columnId: string;
  title: string;
  color: { main: string; glow: string; bg: string };
  payments: Payment[];
  banks: BankOption[];
  onFieldChange: (paymentId: number, field: string, newValue: unknown, oldValue: unknown) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: columnId });
  const total = payments.reduce((s, p) => s + parseFloat(p.montant_dhs || '0'), 0);

  return (
    <div
      ref={setNodeRef}
      style={{
        flex: 1, minWidth: 280,
        background: isOver ? color.bg : 'rgba(248, 250, 252, 0.5)',
        borderRadius: 14,
        border: `1px dashed ${isOver ? color.main : 'rgba(99, 102, 241, 0.15)'}`,
        padding: 12,
        transition: 'all 0.2s',
      }}
    >
      {/* Column Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '10px 14px', marginBottom: 12, borderRadius: 10,
        background: `linear-gradient(135deg, ${color.main}, ${color.glow})`,
        color: '#fff',
        boxShadow: `0 4px 15px ${color.main}40`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: 0.5 }}>{title}</span>
          <span style={{
            padding: '1px 8px', borderRadius: 10, background: 'rgba(255,255,255,0.25)',
            fontSize: 10, fontWeight: 700, fontFamily: '"JetBrains Mono", monospace',
          }}>
            {payments.length}
          </span>
        </div>
        <LiveDot color="#fff" />
      </div>

      {/* Total */}
      <div style={{
        textAlign: 'center', padding: '6px 0 10px',
        fontSize: 11, color: '#64748b', fontFamily: '"JetBrains Mono", monospace',
      }}>
        Σ {fmtCurrency(total)} DHS
      </div>

      {/* Cards */}
      <SortableContext items={payments.map(p => p.id)} strategy={verticalListSortingStrategy}>
        <div style={{ maxHeight: 560, overflowY: 'auto', paddingRight: 4 }}>
          {payments.length === 0 ? (
            <div style={{
              textAlign: 'center', padding: '3rem 1rem',
              color: '#cbd5e1', fontSize: 12,
              border: '1px dashed #e2e8f0', borderRadius: 10,
            }}>
              ◆ Empty ◆
            </div>
          ) : (
            payments.map(p => (
              <PaymentKanbanCard
                key={p.id}
                payment={p}
                banks={banks}
                onFieldChange={(field, newVal, oldVal) => onFieldChange(p.id, field, newVal, oldVal)}
              />
            ))
          )}
        </div>
      </SortableContext>
    </div>
  );
}

// ═══════════════════════════════════════════════
// Main Page
// ═══════════════════════════════════════════════

export function PlanificationPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Date range
  const today = new Date();
  const [startDate, setStartDate] = useState(today.toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date(today.getTime() + 30 * 86400000).toISOString().split('T')[0]);

  // Data
  const [payments, setPayments] = useState<Payment[]>([]);
  const [soldes, setSoldes] = useState<Solde[]>([]);
  const [banks, setBanks] = useState<BankOption[]>([]);
  const [kpiData, setKpiData] = useState<Record<string, unknown>>({});
  const [opCount, setOpCount] = useState(0);
  const [activeDrag, setActiveDrag] = useState<Payment | null>(null);

  // MVT (solde transfer) form
  const [mvtFrom, setMvtFrom] = useState<{ societe: number; banque: number } | null>(null);
  const [mvtTo, setMvtTo] = useState<{ societe: number; banque: number } | null>(null);
  const [mvtAmount, setMvtAmount] = useState('');

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  // Load all data
  const loadInit = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [initRes, kpiRes, payOpts] = await Promise.all([
        api.get(`/plan/init/?start=${startDate}&end=${endDate}`),
        api.get(`/plan/data/?start_date=${startDate}&end_date=${endDate}`),
        api.get('/payments/form_options/'),
      ]);
      setPayments(initRes.data.payments || []);
      setSoldes(initRes.data.soldes || []);
      setKpiData(kpiRes.data || {});
      const ops = initRes.data.draft?.data?.operations;
      setOpCount(Array.isArray(ops) ? ops.length : 0);

      // Extract bank options from form_options
      const bankField = (payOpts.data as Array<{ name: string; choices?: BankOption[] }>).find(f => f.name === 'banque');
      setBanks(bankField?.choices ?? []);
    } catch {
      setError('Erreur de chargement de la planification');
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => { loadInit(); }, [loadInit]);

  // ── Drag-drop handlers ──
  function handleDragStart(e: DragStartEvent) {
    const p = payments.find(x => x.id === e.active.id);
    if (p) setActiveDrag(p);
  }

  async function handleDragEnd(e: DragEndEvent) {
    setActiveDrag(null);
    const { active, over } = e;
    if (!over) return;

    const activeId = active.id as number;
    const activePayment = payments.find(p => p.id === activeId);
    if (!activePayment) return;

    const overId = over.id;
    // Dropped on a column
    const targetColumn = ['Courant', 'Effet', 'Finex'].includes(String(overId))
      ? String(overId)
      : payments.find(p => p.id === overId)?.payment_type;

    if (!targetColumn || targetColumn === activePayment.payment_type) return;

    // Payment moved to new column → change payment_type
    await postOp({
      table: 'payments',
      id: activeId,
      field: 'payment_type',
      old: activePayment.payment_type,
      new: targetColumn,
    });
    setPayments(prev => prev.map(p => p.id === activeId ? { ...p, payment_type: targetColumn } : p));
    setToast({ message: `Déplacé vers ${targetColumn}`, type: 'success' });
  }

  // ── Field change handler ──
  async function handleFieldChange(paymentId: number, field: string, newValue: unknown, oldValue: unknown) {
    await postOp({ table: 'payments', id: paymentId, field, old: oldValue, new: newValue });
    setPayments(prev => prev.map(p => p.id === paymentId ? { ...p, [field]: newValue } : p));
    setToast({ message: 'Modifié', type: 'success' });
  }

  // ── Solde movement handler ──
  async function handleAddMvt() {
    if (!mvtFrom || !mvtTo || !mvtAmount) return;
    const amount = parseFloat(mvtAmount);
    if (isNaN(amount) || amount <= 0) {
      setToast({ message: 'Montant invalide', type: 'error' });
      return;
    }
    await postOp({
      table: 'mvts',
      mvt: {
        from_societe: mvtFrom.societe, from_banque: mvtFrom.banque,
        to_societe: mvtTo.societe, to_banque: mvtTo.banque,
        montant: amount,
      },
    });
    setToast({ message: 'Mouvement enregistré', type: 'success' });
    setMvtAmount('');
    loadInit();
  }

  // ── Operation API wrapper ──
  async function postOp(op: Record<string, unknown>) {
    try {
      await api.post('/plan/op/', op);
      setOpCount(c => c + 1);
    } catch {
      setToast({ message: "Erreur d'opération", type: 'error' });
    }
  }

  // ── Undo / Discard / Commit ──
  async function handleUndo() {
    try { await api.post('/plan/undo/'); setToast({ message: 'Annulé', type: 'success' }); loadInit(); }
    catch { setToast({ message: 'Rien à annuler', type: 'error' }); }
  }
  async function handleDiscard() {
    if (!confirm('Supprimer tous les changements ?')) return;
    try { await api.post('/plan/discard/'); setToast({ message: 'Brouillon supprimé', type: 'success' }); loadInit(); }
    catch { setToast({ message: 'Erreur', type: 'error' }); }
  }
  async function handleCommit() {
    if (!confirm('Appliquer tous les changements à la base de données ?')) return;
    try { await api.post('/plan/commit/'); setToast({ message: '✓ Changements validés !', type: 'success' }); loadInit(); }
    catch { setToast({ message: 'Erreur de validation', type: 'error' }); }
  }

  // ── Group payments by type ──
  const byColumn = useMemo(() => ({
    Courant: payments.filter(p => p.payment_type === 'Courant'),
    Effet: payments.filter(p => p.payment_type === 'Effet'),
    Finex: payments.filter(p => p.payment_type === 'Finex'),
  }), [payments]);

  // ── KPIs ──
  const kpis = {
    solde: (kpiData.solde as number) ?? 0,
    encaissement: (kpiData.encaissement as number) ?? 0,
    p0: (kpiData.achat_urgent as { courant: number })?.courant ?? 0,
    autres: ((kpiData.achat_urgent as { effet?: number })?.effet ?? 0) + ((kpiData.achat_urgent as { finex?: number })?.finex ?? 0),
    net_balance: (kpiData.net_balance as number) ?? 0,
  };

  return (
    <div style={{ position: 'relative' }}>
      {/* Futuristic background */}
      <div style={{
        position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0,
        background: `
          radial-gradient(circle at 10% 20%, rgba(99, 102, 241, 0.06) 0%, transparent 40%),
          radial-gradient(circle at 90% 80%, rgba(245, 158, 11, 0.05) 0%, transparent 40%)
        `,
      }} />

      <div style={{ position: 'relative', zIndex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <PageHeader title="◆ Planification" breadcrumb="Cash Flow Management System" />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, fontWeight: 700, color: '#10b981', letterSpacing: 1, fontFamily: '"JetBrains Mono", monospace' }}>
            <LiveDot /> LIVE
          </div>
        </div>

        <AlertMessage message={error} type="error" />

        {/* Control panel */}
        <motion.div
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
            padding: '14px 20px', marginBottom: 16, borderRadius: 14,
            background: 'linear-gradient(135deg, rgba(255,255,255,0.98), rgba(248,250,252,0.98))',
            border: '1px solid rgba(99, 102, 241, 0.15)',
            boxShadow: '0 4px 20px rgba(0,0,0,0.05)',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div>
              <label style={{ fontSize: 9, fontWeight: 700, color: '#64748b', letterSpacing: 1, fontFamily: '"JetBrains Mono", monospace', display: 'block', marginBottom: 4 }}>DÉBUT</label>
              <input className="input-base" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={{ fontSize: 12, padding: '6px 10px' }} />
            </div>
            <ArrowRight size={16} style={{ color: '#94a3b8', marginTop: 16 }} />
            <div>
              <label style={{ fontSize: 9, fontWeight: 700, color: '#64748b', letterSpacing: 1, fontFamily: '"JetBrains Mono", monospace', display: 'block', marginBottom: 4 }}>FIN</label>
              <input className="input-base" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={{ fontSize: 12, padding: '6px 10px' }} />
            </div>
            {opCount > 0 && (
              <motion.span
                initial={{ scale: 0 }} animate={{ scale: 1 }}
                style={{
                  padding: '4px 10px', borderRadius: 12,
                  background: 'linear-gradient(135deg, #f59e0b, #fbbf24)', color: '#fff',
                  fontSize: 10, fontWeight: 800, letterSpacing: 0.5,
                  fontFamily: '"JetBrains Mono", monospace',
                  boxShadow: '0 0 12px #fbbf2480', marginTop: 16,
                }}
              >
                ◆ {opCount} OP EN ATTENTE
              </motion.span>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <motion.button whileTap={{ scale: 0.95 }} onClick={handleUndo} disabled={opCount === 0}
              style={{
                display: 'flex', alignItems: 'center', gap: 5, padding: '8px 14px', borderRadius: 8,
                border: '1px solid #94a3b8', background: '#fff', color: '#475569',
                fontSize: 11, fontWeight: 700, cursor: opCount === 0 ? 'not-allowed' : 'pointer',
                opacity: opCount === 0 ? 0.5 : 1, fontFamily: '"JetBrains Mono", monospace',
              }}
            >
              <Undo2 size={13} /> UNDO
            </motion.button>
            <motion.button whileTap={{ scale: 0.95 }} onClick={handleDiscard} disabled={opCount === 0}
              style={{
                display: 'flex', alignItems: 'center', gap: 5, padding: '8px 14px', borderRadius: 8,
                border: '1px solid #ef4444', background: '#fef2f2', color: '#dc2626',
                fontSize: 11, fontWeight: 700, cursor: opCount === 0 ? 'not-allowed' : 'pointer',
                opacity: opCount === 0 ? 0.5 : 1, fontFamily: '"JetBrains Mono", monospace',
              }}
            >
              <Trash2 size={13} /> DISCARD
            </motion.button>
            <motion.button whileTap={{ scale: 0.95 }} onClick={handleCommit} disabled={opCount === 0}
              style={{
                display: 'flex', alignItems: 'center', gap: 5, padding: '8px 14px', borderRadius: 8,
                border: 'none', background: 'linear-gradient(135deg, #10b981, #059669)', color: '#fff',
                fontSize: 11, fontWeight: 700, cursor: opCount === 0 ? 'not-allowed' : 'pointer',
                opacity: opCount === 0 ? 0.5 : 1, fontFamily: '"JetBrains Mono", monospace',
                boxShadow: opCount > 0 ? '0 0 15px rgba(16, 185, 129, 0.4)' : 'none',
              }}
            >
              <Check size={13} /> COMMIT
            </motion.button>
          </div>
        </motion.div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '4rem', color: '#64748b' }}>
            <motion.div animate={{ opacity: [0.4, 1, 0.4] }} transition={{ duration: 1.5, repeat: Infinity }}>
              ◆ Chargement des données... ◆
            </motion.div>
          </div>
        ) : (
          <>
            {/* KPI row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 20 }}>
              <FutureKpiCard label="Solde" value={kpis.solde} icon={<Wallet size={14} />}
                gradient="linear-gradient(135deg, #4338ca 0%, #6366f1 100%)" accent="#6366f1" delay={0} />
              <FutureKpiCard label="Encaissement" value={kpis.encaissement} icon={<TrendingUp size={14} />}
                gradient="linear-gradient(135deg, #065f46 0%, #10b981 100%)" accent="#10b981" delay={0.08} />
              <FutureKpiCard label="P0 Courant" value={kpis.p0} icon={<AlertTriangle size={14} />}
                gradient="linear-gradient(135deg, #9a3412 0%, #f97316 100%)" accent="#fb923c" delay={0.16} />
              <FutureKpiCard label="Autres P0" value={kpis.autres} icon={<Activity size={14} />}
                gradient="linear-gradient(135deg, #0c4a6e 0%, #0891b2 100%)" accent="#06b6d4" delay={0.24} />
              <FutureKpiCard label="Net Balance" value={kpis.net_balance}
                icon={<Zap size={14} />}
                gradient={kpis.net_balance >= 0 ? 'linear-gradient(135deg, #065f46 0%, #10b981 100%)' : 'linear-gradient(135deg, #9f1239 0%, #e11d48 100%)'}
                accent={kpis.net_balance >= 0 ? '#34d399' : '#f43f5e'}
                delay={0.32} />
            </div>

            {/* Kanban Board */}
            <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 16 }}>
                <KanbanColumn columnId="Courant" title="Courant" color={COLUMN_COLORS.Courant} payments={byColumn.Courant} banks={banks} onFieldChange={handleFieldChange} />
                <KanbanColumn columnId="Effet" title="Effet" color={COLUMN_COLORS.Effet} payments={byColumn.Effet} banks={banks} onFieldChange={handleFieldChange} />
                <KanbanColumn columnId="Finex" title="Finex" color={COLUMN_COLORS.Finex} payments={byColumn.Finex} banks={banks} onFieldChange={handleFieldChange} />
              </div>

              <DragOverlay>
                {activeDrag ? <PaymentKanbanCard payment={activeDrag} banks={banks} onFieldChange={() => {}} /> : null}
              </DragOverlay>
            </DndContext>

            {/* Solde Movement panel */}
            <motion.div
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
              style={{
                padding: '16px 20px', borderRadius: 14,
                background: 'linear-gradient(135deg, rgba(255,255,255,0.98), rgba(248,250,252,0.98))',
                border: '1px solid rgba(99, 102, 241, 0.15)',
                boxShadow: '0 4px 20px rgba(0,0,0,0.05)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <div style={{ width: 28, height: 28, borderRadius: 8, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <ArrowRight size={14} color="#fff" />
                </div>
                <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#1e293b' }}>Mouvements de Soldes</h3>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr auto auto', gap: 10, alignItems: 'end' }}>
                <div>
                  <label style={{ fontSize: 9, fontWeight: 700, color: '#64748b', letterSpacing: 1, fontFamily: '"JetBrains Mono", monospace', display: 'block', marginBottom: 4 }}>DEPUIS</label>
                  <select className="select-base" style={{ fontSize: 11, padding: '6px 8px', width: '100%' }}
                    onChange={e => {
                      const [s, b] = e.target.value.split(':').map(Number);
                      setMvtFrom({ societe: s, banque: b });
                    }}
                    value={mvtFrom ? `${mvtFrom.societe}:${mvtFrom.banque}` : ''}>
                    <option value="">— Sélectionner —</option>
                    {soldes.map(s => (
                      <option key={`${s.societe}-${s.banque}`} value={`${s.societe}:${s.banque}`}>
                        {s.societe_code ?? s.societe} / {s.banque_name ?? s.banque} — {fmtCurrency(s.montant_dhs)}
                      </option>
                    ))}
                  </select>
                </div>
                <ArrowRight size={20} style={{ color: '#6366f1', marginBottom: 8 }} />
                <div>
                  <label style={{ fontSize: 9, fontWeight: 700, color: '#64748b', letterSpacing: 1, fontFamily: '"JetBrains Mono", monospace', display: 'block', marginBottom: 4 }}>VERS</label>
                  <select className="select-base" style={{ fontSize: 11, padding: '6px 8px', width: '100%' }}
                    onChange={e => {
                      const [s, b] = e.target.value.split(':').map(Number);
                      setMvtTo({ societe: s, banque: b });
                    }}
                    value={mvtTo ? `${mvtTo.societe}:${mvtTo.banque}` : ''}>
                    <option value="">— Sélectionner —</option>
                    {soldes.map(s => (
                      <option key={`${s.societe}-${s.banque}`} value={`${s.societe}:${s.banque}`}>
                        {s.societe_code ?? s.societe} / {s.banque_name ?? s.banque} — {fmtCurrency(s.montant_dhs)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 9, fontWeight: 700, color: '#64748b', letterSpacing: 1, fontFamily: '"JetBrains Mono", monospace', display: 'block', marginBottom: 4 }}>MONTANT</label>
                  <input className="input-base" type="number" value={mvtAmount} onChange={e => setMvtAmount(e.target.value)} placeholder="0.00" style={{ fontSize: 11, padding: '6px 8px', width: 140 }} />
                </div>
                <motion.button whileTap={{ scale: 0.95 }} onClick={handleAddMvt}
                  disabled={!mvtFrom || !mvtTo || !mvtAmount}
                  style={{
                    padding: '8px 16px', borderRadius: 8, border: 'none',
                    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                    color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                    fontFamily: '"JetBrains Mono", monospace',
                    boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)',
                  }}
                >
                  + TRANSFER
                </motion.button>
              </div>
            </motion.div>
          </>
        )}

        <AnimatePresence>
          {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
        </AnimatePresence>
      </div>
    </div>
  );
}
