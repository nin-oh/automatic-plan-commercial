import { useState, useEffect, useRef } from 'react';
import { motion, useMotionValue, useSpring, useInView, useTransform } from 'framer-motion';
import {
  Wallet, TrendingUp, AlertTriangle, ArrowDown, Activity,
  BarChart3, PieChart as PieIcon, Zap, Radio,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip,
  Legend, ResponsiveContainer, PieChart, Pie, Cell, Brush, LabelList,
} from 'recharts';
import { PageHeader } from '@amafin/ui';
import { api } from '../api/client';

/* ═══════════════════════════════════════════════════════════
   FUTURISTIC DASHBOARD
   Libraries: framer-motion, recharts, lucide-react
   Style: cyberpunk meets corporate — neon glow + holographic borders
   ═══════════════════════════════════════════════════════════ */

// ── Digital count-up ──
function CountUp({ value, duration = 1.8 }: { value: number; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const motionValue = useMotionValue(0);
  const spring = useSpring(motionValue, { duration: duration * 1000, bounce: 0 });
  const isInView = useInView(ref, { once: true });

  useEffect(() => { if (isInView) motionValue.set(value); }, [isInView, value, motionValue]);

  useEffect(() => {
    const unsub = spring.on('change', (latest) => {
      if (ref.current) {
        ref.current.textContent = new Intl.NumberFormat('fr-MA', {
          minimumFractionDigits: 2, maximumFractionDigits: 2,
        }).format(latest);
      }
    });
    return unsub;
  }, [spring]);

  return <span ref={ref} style={{ fontFamily: '"JetBrains Mono", "SF Mono", monospace', fontVariantNumeric: 'tabular-nums' }}>0,00</span>;
}

// ── Holographic KPI card with 3D tilt ──
function HoloKpiCard({
  title, value, icon, gradient, delay, accent,
}: {
  title: string; value: number; icon: React.ReactNode;
  gradient: string; delay: number; accent: string;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const rotateX = useTransform(mouseY, [-0.5, 0.5], ['8deg', '-8deg']);
  const rotateY = useTransform(mouseX, [-0.5, 0.5], ['-8deg', '8deg']);

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const rect = cardRef.current?.getBoundingClientRect();
    if (!rect) return;
    mouseX.set((e.clientX - rect.left) / rect.width - 0.5);
    mouseY.set((e.clientY - rect.top) / rect.height - 0.5);
  }

  function handleMouseLeave() {
    mouseX.set(0);
    mouseY.set(0);
  }

  return (
    <motion.div
      ref={cardRef}
      initial={{ opacity: 0, y: 30, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{
        position: 'relative',
        borderRadius: 18,
        padding: '1.4rem 1.5rem',
        background: gradient,
        color: '#fff',
        overflow: 'hidden',
        cursor: 'default',
        boxShadow: `0 10px 40px ${accent}50, inset 0 1px 0 rgba(255,255,255,0.15)`,
        rotateX,
        rotateY,
        transformPerspective: 800,
        transformStyle: 'preserve-3d' as const,
      }}
    >
      {/* Grid pattern overlay */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: `linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px),
                          linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)`,
        backgroundSize: '20px 20px',
        maskImage: 'radial-gradient(circle at 50% 50%, black 40%, transparent 80%)',
        pointerEvents: 'none',
      }} />

      {/* Scanning light */}
      <motion.div
        animate={{ y: ['-100%', '200%'] }}
        transition={{ duration: 3, repeat: Infinity, ease: 'linear', delay }}
        style={{
          position: 'absolute', left: 0, right: 0, height: 30,
          background: `linear-gradient(180deg, transparent, ${accent}40, transparent)`,
          pointerEvents: 'none',
        }}
      />

      {/* Glow orb */}
      <motion.div
        animate={{ scale: [1, 1.3, 1], opacity: [0.4, 0.7, 0.4] }}
        transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }}
        style={{
          position: 'absolute', top: -40, right: -40,
          width: 140, height: 140, borderRadius: '50%',
          background: accent, filter: 'blur(40px)',
        }}
      />

      {/* Corner accent — circuit lines */}
      <svg style={{ position: 'absolute', top: 0, right: 0, width: 50, height: 50, opacity: 0.3 }}>
        <path d="M 10 0 L 10 20 L 30 20 M 50 30 L 30 30 L 30 50" stroke={accent} strokeWidth="1" fill="none" />
        <circle cx="30" cy="20" r="2" fill={accent} />
      </svg>

      <div style={{ position: 'relative', zIndex: 1, transform: 'translateZ(30px)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
          <span style={{
            fontSize: 10, textTransform: 'uppercase', letterSpacing: 2,
            opacity: 0.85, fontWeight: 700,
            fontFamily: '"JetBrains Mono", monospace',
          }}>
            {title}
          </span>
          <motion.div
            animate={{ rotate: [0, 360] }}
            transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
            style={{
              width: 34, height: 34, borderRadius: 10,
              background: 'rgba(255,255,255,0.12)',
              border: `1px solid ${accent}60`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: `0 0 20px ${accent}80`,
            }}
          >
            <motion.div animate={{ rotate: [0, -360] }} transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}>
              {icon}
            </motion.div>
          </motion.div>
        </div>

        <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: -1, lineHeight: 1, marginBottom: 6 }}>
          <CountUp value={value} />
        </div>
        <div style={{ fontSize: 9, opacity: 0.6, letterSpacing: 1.5, fontFamily: '"JetBrains Mono", monospace', textTransform: 'uppercase' }}>
          DHS ◆ LIVE
        </div>

        {/* Mini sparkline placeholder */}
        <div style={{ marginTop: 14, display: 'flex', gap: 2, alignItems: 'flex-end', height: 20 }}>
          {[0.4, 0.7, 0.5, 0.9, 0.6, 1, 0.75, 0.85, 0.65, 0.95].map((h, i) => (
            <motion.div
              key={i}
              initial={{ scaleY: 0 }}
              animate={{ scaleY: h }}
              transition={{ delay: delay + 0.5 + i * 0.04, duration: 0.4 }}
              style={{
                flex: 1, background: 'rgba(255,255,255,0.6)',
                borderRadius: 1, transformOrigin: 'bottom',
              }}
            />
          ))}
        </div>
      </div>
    </motion.div>
  );
}

// ── Holographic glass card with animated border ──
function HoloCard({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
      style={{
        position: 'relative',
        borderRadius: 18,
        background: 'rgba(255,255,255,0.98)',
        overflow: 'hidden',
        boxShadow: '0 4px 30px rgba(0,0,0,0.06)',
      }}
    >
      {/* Animated gradient border */}
      <motion.div
        style={{
          position: 'absolute', inset: -1, borderRadius: 18, padding: 1,
          background: 'conic-gradient(from var(--angle), #667eea, #8b5cf6, #ec4899, #667eea)',
          WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
          WebkitMaskComposite: 'xor',
          maskComposite: 'exclude',
          opacity: 0.5,
        } as React.CSSProperties}
        animate={{ ['--angle' as string]: ['0deg', '360deg'] }}
        transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
      />
      {children}
    </motion.div>
  );
}

// ── Card header ──
function CardHeader({ icon, title, action }: { icon: React.ReactNode; title: string; action?: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '18px 22px 14px', borderBottom: '1px solid rgba(99, 102, 241, 0.08)',
      position: 'relative',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <motion.div
          whileHover={{ rotate: 360 }}
          transition={{ duration: 0.6 }}
          style={{
            width: 34, height: 34, borderRadius: 10,
            background: 'linear-gradient(135deg, #667eea, #8b5cf6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff',
            boxShadow: '0 4px 12px rgba(102, 126, 234, 0.4)',
          }}
        >
          {icon}
        </motion.div>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', margin: 0, letterSpacing: -0.2 }}>{title}</h3>
      </div>
      {action}
    </div>
  );
}

// ── Pulsing live indicator ──
function LiveIndicator() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, fontWeight: 700, color: '#10b981', letterSpacing: 1, fontFamily: '"JetBrains Mono", monospace' }}>
      <motion.div
        animate={{ scale: [1, 1.5, 1], opacity: [1, 0.4, 1] }}
        transition={{ duration: 1.5, repeat: Infinity }}
        style={{ width: 7, height: 7, borderRadius: '50%', background: '#10b981', boxShadow: '0 0 8px #10b981' }}
      />
      LIVE
    </div>
  );
}

// ── Custom tooltip ──
function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((sum, p) => sum + (p.value || 0), 0);
  const fmtExact = (v: number) => new Intl.NumberFormat('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v * 1_000_000);

  return (
    <motion.div
      initial={{ opacity: 0, y: 5, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.15 }}
      style={{
        background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.98), rgba(30, 41, 59, 0.98))',
        backdropFilter: 'blur(12px)',
        color: '#fff', padding: '14px 18px', borderRadius: 14,
        fontSize: 12,
        border: '1px solid rgba(139, 92, 246, 0.3)',
        boxShadow: '0 10px 40px rgba(0,0,0,0.4), 0 0 20px rgba(139, 92, 246, 0.2)',
        minWidth: 240,
      }}
    >
      {label && (
        <div style={{
          fontWeight: 700, marginBottom: 10, fontSize: 11, letterSpacing: 1,
          color: '#a78bfa', textTransform: 'uppercase',
          fontFamily: '"JetBrains Mono", monospace',
          borderBottom: '1px solid rgba(139, 92, 246, 0.2)', paddingBottom: 8,
        }}>
          ◆ Semaine {label}
        </div>
      )}
      {payload.map((p, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: i === 0 ? 0 : 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 10, height: 10, background: p.color, borderRadius: 2, boxShadow: `0 0 8px ${p.color}` }} />
            <span style={{ opacity: 0.9 }}>{p.name}</span>
          </div>
          <div style={{ textAlign: 'right', fontFamily: '"JetBrains Mono", monospace' }}>
            <div style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmtExact(p.value)}</div>
            <div style={{ fontSize: 10, opacity: 0.5 }}>{p.value.toFixed(3)} M DHS</div>
          </div>
        </div>
      ))}
      {payload.length > 1 && (
        <div style={{
          marginTop: 10, paddingTop: 10,
          borderTop: '1px solid rgba(139, 92, 246, 0.2)',
          display: 'flex', justifyContent: 'space-between',
          fontWeight: 700, color: '#fbbf24',
          fontFamily: '"JetBrains Mono", monospace',
        }}>
          <span>Σ TOTAL</span>
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtExact(total)}</span>
        </div>
      )}
    </motion.div>
  );
}

// ── Background grid ──
function FuturisticBackground() {
  return (
    <div style={{
      position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0,
      background: `
        radial-gradient(circle at 20% 30%, rgba(102, 126, 234, 0.08) 0%, transparent 40%),
        radial-gradient(circle at 80% 70%, rgba(236, 72, 153, 0.06) 0%, transparent 40%),
        linear-gradient(rgba(99, 102, 241, 0.03) 1px, transparent 1px),
        linear-gradient(90deg, rgba(99, 102, 241, 0.03) 1px, transparent 1px)
      `,
      backgroundSize: '100% 100%, 100% 100%, 40px 40px, 40px 40px',
    }} />
  );
}

const GRADIENTS = {
  blue: 'linear-gradient(135deg, #4338ca 0%, #6366f1 50%, #8b5cf6 100%)',
  green: 'linear-gradient(135deg, #065f46 0%, #10b981 50%, #34d399 100%)',
  orange: 'linear-gradient(135deg, #9a3412 0%, #f97316 50%, #fb923c 100%)',
  purple: 'linear-gradient(135deg, #0c4a6e 0%, #0891b2 50%, #06b6d4 100%)',
  red: 'linear-gradient(135deg, #9f1239 0%, #e11d48 50%, #f43f5e 100%)',
};

const ACCENTS = {
  blue: '#8b5cf6', green: '#34d399', orange: '#fb923c', purple: '#06b6d4', red: '#f43f5e',
};

const CHART_COLORS = ['#6366f1', '#10b981', '#f59e0b'];
const ESCOMPTE_COLORS = ['#ef4444', '#f59e0b', '#10b981'];
const FINEX_COLORS = ['#ef4444', '#fb923c', '#3b82f6'];

export function HomePage() {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/dashboard/')
      .then((res) => setData(res.data))
      .catch(() => {
        // Django unavailable — fall back to demo data so the dashboard is
        // never blank during development / showcasing.
        setData(makeDashboardDemo());
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <>
        <FuturisticBackground />
        <PageHeader title="◆ Tableau de bord" breadcrumb="System Online" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 16, position: 'relative' }}>
          {[...Array(5)].map((_, i) => (
            <motion.div
              key={i}
              animate={{ opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.15 }}
              style={{ height: 160, borderRadius: 18, background: 'linear-gradient(135deg, #1e293b, #334155)' }}
            />
          ))}
        </div>
      </>
    );
  }

  const kpis = (data?.kpis ?? {}) as Record<string, number>;
  const charts = (data?.charts ?? {}) as Record<string, unknown[]>;
  const topAchats = (data?.top_achats ?? []) as Record<string, unknown>[];
  const escompteStatus = (data?.escompte_status ?? {}) as Record<string, { name: string; value: number }[]>;
  const finexStatus = (data?.finex_status ?? {}) as Record<string, { name: string; value: number }[]>;

  const weeklyCategories = (charts?.weekly_categories ?? []) as string[];
  const weeklySeries = (charts?.weekly_series ?? []) as { name: string; data: number[] }[];
  const barChartData = weeklyCategories.map((cat, i) => ({
    week: cat.slice(5),
    ...Object.fromEntries(weeklySeries.map((s) => [s.name, s.data[i] ?? 0])),
  }));

  const escomptePie = Object.entries(escompteStatus).map(([key, items]) => ({
    name: key, value: items.reduce((sum, item) => sum + item.value, 0),
  }));
  const finexPie = Object.entries(finexStatus).map(([key, items]) => ({
    name: key, value: items.reduce((sum, item) => sum + item.value, 0),
  }));

  return (
    <div style={{ position: 'relative' }}>
      <FuturisticBackground />

      <div style={{ position: 'relative', zIndex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <PageHeader title="◆ Tableau de bord" breadcrumb="⚡ System Online — All Systems Operational" />
          <LiveIndicator />
        </div>

        {/* KPI Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 16, marginBottom: 20 }}>
          <HoloKpiCard title="Solde Courant" value={kpis.total_solde ?? 0} icon={<Wallet size={16} />} gradient={GRADIENTS.blue} accent={ACCENTS.blue} delay={0} />
          <HoloKpiCard title="Encaissement" value={kpis.encaissement ?? 0} icon={<TrendingUp size={16} />} gradient={GRADIENTS.green} accent={ACCENTS.green} delay={0.08} />
          <HoloKpiCard title="Total P0" value={kpis.achat_urgent_total ?? 0} icon={<AlertTriangle size={16} />} gradient={GRADIENTS.orange} accent={ACCENTS.orange} delay={0.16} />
          <HoloKpiCard title="Finex & Autres" value={(kpis.finex_execute ?? 0) + (kpis.total_autre ?? 0)} icon={<Activity size={16} />} gradient={GRADIENTS.purple} accent={ACCENTS.purple} delay={0.24} />
          <HoloKpiCard title="Gap P0" value={kpis.gap_p0 ?? 0} icon={<ArrowDown size={16} />} gradient={GRADIENTS.red} accent={ACCENTS.red} delay={0.32} />
        </div>

        {/* Main Chart + Priority List */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, marginBottom: 20 }}>
          <HoloCard delay={0.4}>
            <CardHeader
              icon={<BarChart3 size={15} />}
              title="18 Week Commitments (MDH)"
              action={
                <div style={{ display: 'flex', gap: 6 }}>
                  {weeklySeries.map((s, i) => (
                    <motion.div
                      key={s.name}
                      initial={{ opacity: 0, scale: 0 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.6 + i * 0.1 }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 5,
                        padding: '5px 10px',
                        background: 'linear-gradient(135deg, #f1f5f9, #e2e8f0)',
                        borderRadius: 8, fontSize: 11, fontWeight: 700,
                        color: '#475569',
                        fontFamily: '"JetBrains Mono", monospace',
                      }}
                    >
                      <motion.span
                        animate={{ opacity: [1, 0.5, 1] }}
                        transition={{ duration: 2, repeat: Infinity, delay: i * 0.3 }}
                        style={{ width: 8, height: 8, borderRadius: 2, background: CHART_COLORS[i], boxShadow: `0 0 6px ${CHART_COLORS[i]}` }}
                      />
                      {s.name}
                    </motion.div>
                  ))}
                </div>
              }
            />
            <div style={{ padding: 20, height: 420 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barChartData} barCategoryGap="15%" barGap={4}>
                  <defs>
                    {weeklySeries.map((_, i) => (
                      <linearGradient key={i} id={`bar-grad-${i}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={CHART_COLORS[i]} stopOpacity={1} />
                        <stop offset="100%" stopColor={CHART_COLORS[i]} stopOpacity={0.5} />
                      </linearGradient>
                    ))}
                    <filter id="barGlow" x="-50%" y="-50%" width="200%" height="200%">
                      <feGaussianBlur stdDeviation="2" result="coloredBlur" />
                      <feMerge>
                        <feMergeNode in="coloredBlur" />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>
                  </defs>
                  <CartesianGrid strokeDasharray="2 6" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="week" tick={{ fontSize: 11, fill: '#64748b', fontWeight: 600 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={(v) => `${v.toFixed(2)}M`} axisLine={false} tickLine={false} width={55} />
                  <RTooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(99, 102, 241, 0.08)' }} />

                  {weeklySeries.map((s, i) => (
                    <Bar
                      key={`bar-${s.name}`}
                      dataKey={s.name}
                      fill={`url(#bar-grad-${i})`}
                      radius={[10, 10, 0, 0]}
                      animationDuration={1200}
                      animationBegin={i * 150}
                      maxBarSize={38}
                      filter="url(#barGlow)"
                    >
                      <LabelList
                        dataKey={s.name}
                        position="top"
                        formatter={(v: number) => (v > 0 ? v.toFixed(2) : '')}
                        style={{ fontSize: 9, fill: '#475569', fontWeight: 700, fontFamily: '"JetBrains Mono", monospace' }}
                      />
                    </Bar>
                  ))}

                  <Brush dataKey="week" height={28} stroke="#6366f1" fill="#f8fafc" travellerWidth={10} startIndex={Math.max(0, barChartData.length - 10)} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </HoloCard>

          <HoloCard delay={0.5}>
            <CardHeader icon={<Zap size={15} />} title="Priority Queue" action={<LiveIndicator />} />
            <div style={{ padding: 12, maxHeight: 420, overflowY: 'auto' }}>
              {topAchats.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8' }}>Aucun engagement</div>
              ) : (
                topAchats.slice(0, 8).map((a, i) => {
                  const priority = a.priority as number;
                  const color = priority === 0 ? '#ef4444' : priority === 1 ? '#f59e0b' : '#10b981';
                  return (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.6 + i * 0.05 }}
                      whileHover={{ x: 4, backgroundColor: '#f8fafc' }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '10px 12px', borderRadius: 10, cursor: 'pointer',
                        marginBottom: 4,
                        position: 'relative',
                        overflow: 'hidden',
                      }}
                    >
                      <div style={{
                        width: 28, height: 28, borderRadius: 8,
                        background: `linear-gradient(135deg, ${color}, ${color}80)`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: '#fff', fontSize: 10, fontWeight: 800,
                        boxShadow: `0 0 12px ${color}60`,
                        fontFamily: '"JetBrains Mono", monospace',
                      }}>
                        P{priority}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {a.fournisseurs as string}
                        </div>
                        <div style={{ fontSize: 10, color: '#94a3b8', fontFamily: '"JetBrains Mono", monospace' }}>#{String(i + 1).padStart(4, '0')}</div>
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#1e293b', fontVariantNumeric: 'tabular-nums', fontFamily: '"JetBrains Mono", monospace' }}>
                        {new Intl.NumberFormat('fr-MA', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(a.montant_dhs as number)}
                      </div>
                    </motion.div>
                  );
                })
              )}
            </div>
          </HoloCard>
        </div>

        {/* Bottom row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
          <HoloCard delay={0.6}>
            <CardHeader icon={<BarChart3 size={15} />} title="7 Days Overview" action={<Radio size={14} style={{ color: '#6366f1' }} />} />
            <div style={{ padding: 16, height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  layout="vertical"
                  data={(charts?.daily_categories as string[] ?? []).map((cat, i) => ({
                    day: cat.slice(5),
                    ...Object.fromEntries(
                      (charts?.daily_series as { name: string; data: number[] }[] ?? []).map((s) => [s.name, s.data[i] ?? 0])
                    ),
                  }))}
                >
                  <CartesianGrid strokeDasharray="2 6" stroke="#e2e8f0" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} />
                  <YAxis type="category" dataKey="day" tick={{ fontSize: 10, fill: '#64748b', fontWeight: 600 }} axisLine={false} tickLine={false} width={45} />
                  <RTooltip content={<CustomTooltip />} />
                  {(charts?.daily_series as { name: string }[] ?? []).map((s, i) => (
                    <Bar key={s.name} dataKey={s.name} stackId="a" fill={CHART_COLORS[i]} radius={[0, 6, 6, 0]} animationDuration={1200} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </HoloCard>

          <HoloCard delay={0.7}>
            <CardHeader icon={<PieIcon size={15} />} title="Escompte" action={<LiveIndicator />} />
            <div style={{ padding: 16, height: 300 }}>
              {escomptePie.every(p => p.value === 0) ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#94a3b8' }}>Aucune donnée</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <defs>
                      {ESCOMPTE_COLORS.map((c, i) => (
                        <radialGradient key={i} id={`esc-grad-${i}`}>
                          <stop offset="0%" stopColor={c} stopOpacity={1} />
                          <stop offset="100%" stopColor={c} stopOpacity={0.7} />
                        </radialGradient>
                      ))}
                    </defs>
                    <Pie data={escomptePie} cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={4} dataKey="value" animationDuration={1500}>
                      {escomptePie.map((_, i) => <Cell key={i} fill={`url(#esc-grad-${i})`} stroke="#fff" strokeWidth={2} />)}
                    </Pie>
                    <RTooltip content={<CustomTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 11, fontWeight: 600 }} iconType="circle" />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </HoloCard>

          <HoloCard delay={0.8}>
            <CardHeader icon={<PieIcon size={15} />} title="Finex" action={<LiveIndicator />} />
            <div style={{ padding: 16, height: 300 }}>
              {finexPie.every(p => p.value === 0) ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#94a3b8' }}>Aucune donnée</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <defs>
                      {FINEX_COLORS.map((c, i) => (
                        <radialGradient key={i} id={`fin-grad-${i}`}>
                          <stop offset="0%" stopColor={c} stopOpacity={1} />
                          <stop offset="100%" stopColor={c} stopOpacity={0.7} />
                        </radialGradient>
                      ))}
                    </defs>
                    <Pie data={finexPie} cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={4} dataKey="value" animationDuration={1500}>
                      {finexPie.map((_, i) => <Cell key={i} fill={`url(#fin-grad-${i})`} stroke="#fff" strokeWidth={2} />)}
                    </Pie>
                    <RTooltip content={<CustomTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 11, fontWeight: 600 }} iconType="circle" />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </HoloCard>
        </div>
      </div>
    </div>
  );
}

/** Reproducible demo data used when the Django backend isn't running. Lets
 * the dashboard render with realistic numbers + curves so the visual design
 * is reviewable in isolation. */
function makeDashboardDemo() {
  const weeks = 18;
  const weeklyCategories = Array.from({ length: weeks }, (_, i) => `2026-W${String(i + 1).padStart(2, '0')}`);

  let seed = 42;
  const rand = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };

  const series = (base: number, jitter: number) =>
    Array.from({ length: weeks }, () => Math.round(base + (rand() - 0.5) * jitter));

  return {
    kpis: {
      total_solde:        12_450_000,
      encaissement:          980_000,
      achat_urgent_total:    640_000,
      finex_execute:         420_000,
      total_autre:           180_000,
      gap_p0:               -260_000,
    },
    charts: {
      weekly_categories: weeklyCategories,
      weekly_series: [
        { name: 'P0',     data: series(180_000, 200_000) },
        { name: 'Finex',  data: series(120_000, 140_000) },
        { name: 'Autres', data: series( 80_000, 100_000) },
      ],
    },
    top_achats: [
      { fournisseur: 'Société Alpha SARL',   achat: 'Matières premières', montant: 240_000, statut: 'P0' },
      { fournisseur: 'Beta Industries',      achat: 'Équipement',         montant: 180_000, statut: 'P1' },
      { fournisseur: 'Gamma Logistique',     achat: 'Transport',          montant: 120_000, statut: 'P0' },
      { fournisseur: 'Delta Trading SA',     achat: 'Services',           montant:  85_000, statut: 'P2' },
      { fournisseur: 'Epsilon Distribution', achat: 'Consommables',       montant:  62_000, statut: 'P1' },
    ],
    escompte_status: {
      'Banque A': [{ name: 'En attente', value: 240_000 }, { name: 'Validé', value: 180_000 }, { name: 'Rejeté', value: 30_000 }],
      'Banque B': [{ name: 'En attente', value: 120_000 }, { name: 'Validé', value: 220_000 }, { name: 'Rejeté', value: 18_000 }],
    },
    finex_status: {
      'Banque A': [{ name: 'En cours', value: 320_000 }, { name: 'Approuvé', value: 280_000 }, { name: 'Refusé', value: 40_000 }],
      'Banque B': [{ name: 'En cours', value: 180_000 }, { name: 'Approuvé', value: 240_000 }, { name: 'Refusé', value: 20_000 }],
    },
  };
}
