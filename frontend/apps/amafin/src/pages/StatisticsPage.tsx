import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AreaChart, Area, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  ComposedChart,
} from 'recharts';
import {
  Wallet, TrendingUp, AlertTriangle, Activity,
  BarChart3, PieChart as PieIcon, Calendar, ArrowUpRight,
  Download, X, GitCompare, LineChart,
} from 'lucide-react';
import {
  BrandedPageHeader, TrendKpiCard, StatsChartCard, Tabs, BrandButton,
} from '@amafin/ui';
import { api } from '../api/client';

/* ────────────────────────────────────────────────────────────
   Statistics page.

   Features:
     - URL-persisted time range (?range=30d&compare=1&category=Achats)
     - "vs. previous period" overlay on the cash flow chart
     - Forecast (dashed projected line) at the end of the time series
     - Drill-down: click a donut slice → counterparty table filters
     - CSV export of the visible top-counterparty table
     - Demo data fallback when the API is unavailable
   ────────────────────────────────────────────────────────────*/

type Range = '7d' | '30d' | '90d' | '1y';
const RANGE_LABEL: Record<Range, string> = {
  '7d': '7 jours', '30d': '30 jours', '90d': '90 jours', '1y': '1 an',
};
const RANGES = Object.keys(RANGE_LABEL) as Range[];

const ACCENT = {
  blue: '#6366f1', green: '#10b981', orange: '#f59e0b',
  red: '#ef4444', purple: '#8b5cf6', cyan: '#06b6d4',
};

const DONUT_COLORS = [ACCENT.blue, ACCENT.green, ACCENT.orange, ACCENT.red, ACCENT.cyan, ACCENT.purple];

interface TimePoint {
  label: string;
  incoming: number;
  outgoing: number;
  net: number;
  /** Same series shifted by one period — drawn faintly when comparison on */
  prev_incoming?: number;
  prev_outgoing?: number;
  /** When non-null on a future point, drawn as a dashed projected line */
  forecast?: number | null;
  /** Marks rows that are projected, not measured */
  is_forecast?: boolean;
}

interface Counterparty {
  name: string; amount: number; share: number; trend: number;
  /** Which category buckets this counterparty contributes to (used for drill-down) */
  categories: string[];
}

interface StatsResponse {
  kpis: {
    cash_flow: { value: number; series: number[]; delta: number };
    incoming:  { value: number; series: number[]; delta: number };
    outgoing:  { value: number; series: number[]; delta: number };
    overdue:   { value: number; series: number[]; delta: number };
  };
  timeseries: TimePoint[];
  category_breakdown: { name: string; value: number }[];
  top_counterparties: Counterparty[];
}

export function StatisticsPage() {
  // ── URL-persisted state ────────────────────────────────────────────────
  const [searchParams, setSearchParams] = useSearchParams();
  const range = (RANGES.includes(searchParams.get('range') as Range)
    ? (searchParams.get('range') as Range)
    : '30d');
  const compare  = searchParams.get('compare') === '1';
  const forecast = searchParams.get('forecast') === '1';
  const categoryFilter = searchParams.get('category') || '';

  function patchParams(patch: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === '') next.delete(k);
      else next.set(k, v);
    }
    setSearchParams(next, { replace: true });
  }

  // ── Data fetching ──────────────────────────────────────────────────────
  const [data, setData] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [demo, setDemo] = useState(false);

  useEffect(() => {
    setLoading(true);
    api.get(`/statistics/?range=${range}`)
      .then((res) => { setData(res.data); setDemo(false); })
      .catch(() => { setData(makeDemo(range)); setDemo(true); })
      .finally(() => setLoading(false));
  }, [range]);

  // ── Derived data (filtered counterparties + forecast-extended series) ──
  const filteredCounterparties = useMemo(() => {
    if (!data) return [];
    if (!categoryFilter) return data.top_counterparties;
    return data.top_counterparties.filter((c) => c.categories.includes(categoryFilter));
  }, [data, categoryFilter]);

  const eyebrow = demo ? 'Amafin · données de démo' : 'Amafin';

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <BrandedPageHeader
      eyebrow={eyebrow}
      title="Statistiques"
      subtitle="Analyse approfondie des flux de trésorerie, par période et par contrepartie."
      accent={ACCENT.blue}
      accent2={ACCENT.purple}
      actions={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <ToggleChip
            active={compare}
            label="Comparer période préc."
            icon={<GitCompare size={12} />}
            onClick={() => patchParams({ compare: compare ? null : '1' })}
          />
          <ToggleChip
            active={forecast}
            label="Prévision"
            icon={<LineChart size={12} />}
            onClick={() => patchParams({ forecast: forecast ? null : '1' })}
          />
          <Tabs
            variant="pill"
            active={range}
            onChange={(k) => patchParams({ range: k })}
            items={RANGES.map((k) => ({ key: k, label: RANGE_LABEL[k] }))}
          />
          <BrandButton
            variant="secondary"
            size="sm"
            icon={<Download size={13} />}
            onClick={() => exportCounterpartiesCsv(filteredCounterparties, range)}
            disabled={!data || filteredCounterparties.length === 0}
          >
            Export CSV
          </BrandButton>
        </div>
      }
    >
      {/* Active-filter banner */}
      {categoryFilter && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 12px', borderRadius: 10,
          background: `${ACCENT.purple}10`, border: `1px solid ${ACCENT.purple}40`,
          fontSize: 12.5, color: '#27272a', marginTop: -8,
        }}>
          <span style={{ color: '#71717a' }}>Filtre actif :</span>
          <span style={{ fontWeight: 700, color: ACCENT.purple }}>
            Catégorie · {categoryFilter}
          </span>
          <button
            onClick={() => patchParams({ category: null })}
            style={{
              marginLeft: 'auto',
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '3px 8px', borderRadius: 999,
              background: '#fff', border: `1px solid ${ACCENT.purple}40`,
              color: ACCENT.purple, fontSize: 11, fontWeight: 600,
              cursor: 'pointer',
            }}
          ><X size={11} /> Effacer</button>
        </div>
      )}

      {/* KPI row */}
      <div style={{
        display: 'grid', gap: 14,
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
      }}>
        {loading || !data ? (
          [...Array(4)].map((_, i) => <KpiSkeleton key={i} delay={i * 0.05} />)
        ) : (
          <>
            <TrendKpiCard
              label="Cash flow net" value={fmt(data.kpis.cash_flow.value)} unit="MAD"
              series={data.kpis.cash_flow.series} delta={data.kpis.cash_flow.delta}
              icon={<Wallet size={16} />} accent={ACCENT.blue} delay={0.0}
            />
            <TrendKpiCard
              label="Encaissements" value={fmt(data.kpis.incoming.value)} unit="MAD"
              series={data.kpis.incoming.series} delta={data.kpis.incoming.delta}
              icon={<TrendingUp size={16} />} accent={ACCENT.green} delay={0.08}
            />
            <TrendKpiCard
              label="Décaissements" value={fmt(data.kpis.outgoing.value)} unit="MAD"
              series={data.kpis.outgoing.series} delta={data.kpis.outgoing.delta}
              icon={<Activity size={16} />} accent={ACCENT.purple} delay={0.16}
            />
            <TrendKpiCard
              label="En retard" value={fmt(data.kpis.overdue.value)} unit="MAD"
              series={data.kpis.overdue.series} delta={data.kpis.overdue.delta}
              icon={<AlertTriangle size={16} />} accent={ACCENT.red} delay={0.24}
            />
          </>
        )}
      </div>

      {/* Charts grid */}
      <div style={{
        display: 'grid', gap: 14, marginTop: 14,
        gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)',
      }}>
        <StatsChartCard
          icon={<BarChart3 size={16} />}
          accent={ACCENT.blue}
          title="Flux de trésorerie"
          subtitle={`Encaissements vs décaissements — ${RANGE_LABEL[range]}${compare ? ' · comparaison période préc.' : ''}${forecast ? ' · prévision activée' : ''}`}
          chartHeight={300}
          delay={0.32}
        >
          {loading || !data
            ? <ChartSkeleton />
            : <CashFlowChart data={data.timeseries} compare={compare} forecast={forecast} />}
        </StatsChartCard>

        <StatsChartCard
          icon={<PieIcon size={16} />}
          accent={ACCENT.purple}
          title="Répartition par catégorie"
          subtitle="Cliquez sur une part pour filtrer la table"
          chartHeight={300}
          delay={0.40}
        >
          {loading || !data
            ? <ChartSkeleton />
            : (
              <CategoryDonut
                data={data.category_breakdown}
                activeName={categoryFilter}
                onSliceClick={(name) =>
                  patchParams({ category: name === categoryFilter ? null : name })
                }
              />
            )}
        </StatsChartCard>
      </div>

      {/* Top counterparties */}
      <StatsChartCard
        icon={<Calendar size={16} />}
        accent={ACCENT.cyan}
        title={`Top contreparties${categoryFilter ? ` · ${categoryFilter}` : ''}`}
        subtitle={`${RANGE_LABEL[range]} — ${
          loading ? '…' : `${filteredCounterparties.length} ligne(s)`
        }`}
        chartHeight="auto"
        delay={0.48}
      >
        {loading || !data ? (
          <TableSkeleton rows={6} />
        ) : filteredCounterparties.length === 0 ? (
          <EmptyTable />
        ) : (
          <CounterpartyTable rows={filteredCounterparties} />
        )}
      </StatsChartCard>
    </BrandedPageHeader>
  );
}

/* ─── Toggle chip (used for compare / forecast) ─────────── */

function ToggleChip({
  active, label, icon, onClick,
}: { active: boolean; label: string; icon: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '6px 11px', borderRadius: 999,
        border: `1px solid ${active ? ACCENT.blue : '#e4e4e7'}`,
        background: active ? `${ACCENT.blue}12` : '#ffffff',
        color: active ? ACCENT.blue : '#52525b',
        fontSize: 11.5, fontWeight: 600, cursor: 'pointer',
        fontFamily: 'Inter, sans-serif',
        transition: 'all 140ms',
      }}
    >
      {icon}
      {label}
    </button>
  );
}

/* ─── Charts ──────────────────────────────────────────────── */

function CashFlowChart({
  data, compare, forecast,
}: { data: TimePoint[]; compare: boolean; forecast: boolean }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="g-incoming" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={ACCENT.green} stopOpacity={0.4} />
            <stop offset="100%" stopColor={ACCENT.green} stopOpacity={0} />
          </linearGradient>
          <linearGradient id="g-outgoing" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={ACCENT.purple} stopOpacity={0.4} />
            <stop offset="100%" stopColor={ACCENT.purple} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" />
        <XAxis dataKey="label" stroke="#a1a1aa" fontSize={11} tickLine={false} />
        <YAxis stroke="#a1a1aa" fontSize={11} tickLine={false} tickFormatter={fmtCompact} />
        <Tooltip
          contentStyle={{
            background: '#ffffff', border: '1px solid #e4e4e7',
            borderRadius: 8, fontSize: 12, padding: 10,
            boxShadow: '0 4px 14px rgba(0,0,0,0.08)',
          }}
          formatter={(v: number, n) => [`${fmt(v)} MAD`, n]}
        />
        <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />

        <Area
          type="monotone" dataKey="incoming" name="Encaissements"
          stroke={ACCENT.green} strokeWidth={2}
          fill="url(#g-incoming)"
        />
        <Area
          type="monotone" dataKey="outgoing" name="Décaissements"
          stroke={ACCENT.purple} strokeWidth={2}
          fill="url(#g-outgoing)"
        />

        {compare && (
          <>
            <Line
              type="monotone" dataKey="prev_incoming" name="Encaiss. (préc.)"
              stroke={ACCENT.green} strokeWidth={1.5} strokeDasharray="4 3"
              dot={false} legendType="line"
            />
            <Line
              type="monotone" dataKey="prev_outgoing" name="Décaiss. (préc.)"
              stroke={ACCENT.purple} strokeWidth={1.5} strokeDasharray="4 3"
              dot={false} legendType="line"
            />
          </>
        )}

        {forecast && (
          <Line
            type="monotone" dataKey="forecast" name="Prévision"
            stroke={ACCENT.blue} strokeWidth={2} strokeDasharray="6 4"
            dot={{ r: 3, fill: '#fff', stroke: ACCENT.blue, strokeWidth: 2 }}
            legendType="line"
            connectNulls
          />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

function CategoryDonut({
  data, activeName, onSliceClick,
}: {
  data: StatsResponse['category_breakdown'];
  activeName: string;
  onSliceClick: (name: string) => void;
}) {
  const total = useMemo(() => data.reduce((s, d) => s + d.value, 0), [data]);
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={data} dataKey="value" nameKey="name"
          innerRadius={60} outerRadius={92}
          paddingAngle={2}
          isAnimationActive={false}
          onClick={(slice: any) => onSliceClick(slice?.name)}
          cursor="pointer"
        >
          {data.map((d, i) => {
            const isActive = activeName === d.name;
            const isDimmed = activeName && !isActive;
            return (
              <Cell
                key={i}
                fill={DONUT_COLORS[i % DONUT_COLORS.length]}
                stroke={isActive ? '#18181b' : '#fff'}
                strokeWidth={isActive ? 2 : 1}
                opacity={isDimmed ? 0.35 : 1}
              />
            );
          })}
        </Pie>
        <Tooltip
          contentStyle={{
            background: '#ffffff', border: '1px solid #e4e4e7',
            borderRadius: 8, fontSize: 12, padding: 10,
          }}
          formatter={(v: number, n) => [
            `${fmt(v)} MAD (${((v / total) * 100).toFixed(1)}%)`,
            n,
          ]}
        />
        <Legend
          verticalAlign="bottom" iconType="circle" iconSize={8}
          wrapperStyle={{ fontSize: 11, paddingTop: 8, cursor: 'pointer' }}
          onClick={(payload: any) => onSliceClick(payload?.value || payload?.payload?.name)}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

/* ─── Top counterparties table ───────────────────────────── */

function CounterpartyTable({ rows }: { rows: Counterparty[] }) {
  const max = Math.max(1, ...rows.map((r) => r.amount));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{
        display: 'grid', gridTemplateColumns: '2fr 3fr 1fr 1fr',
        gap: 12, padding: '8px 10px',
        fontSize: 10.5, fontWeight: 700, color: '#71717a',
        textTransform: 'uppercase', letterSpacing: 0.6,
      }}>
        <div>Contrepartie</div>
        <div>Montant</div>
        <div style={{ textAlign: 'right' }}>Part</div>
        <div style={{ textAlign: 'right' }}>Tendance</div>
      </div>
      {rows.map((r) => {
        const pct = (r.amount / max) * 100;
        const trendUp = r.trend >= 0;
        return (
          <div
            key={r.name}
            style={{
              display: 'grid', gridTemplateColumns: '2fr 3fr 1fr 1fr',
              gap: 12, padding: '10px 10px',
              border: '1px solid #f4f4f5', borderRadius: 8, alignItems: 'center',
              background: '#fafafa',
              transition: 'background 120ms, border-color 120ms',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#ffffff';
              e.currentTarget.style.borderColor = '#e4e4e7';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = '#fafafa';
              e.currentTarget.style.borderColor = '#f4f4f5';
            }}
          >
            <div style={{
              fontSize: 13, fontWeight: 600, color: '#18181b',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {r.name}
            </div>
            <div>
              <div style={{
                fontSize: 12, fontWeight: 600, color: '#27272a',
                fontFamily: '"JetBrains Mono", monospace', marginBottom: 4,
              }}>
                {fmt(r.amount)} <span style={{ color: '#a1a1aa' }}>MAD</span>
              </div>
              <div style={{
                width: '100%', height: 4, background: '#e4e4e7',
                borderRadius: 2, overflow: 'hidden',
              }}>
                <div style={{
                  width: `${pct}%`, height: '100%',
                  background: `linear-gradient(90deg, ${ACCENT.blue}, ${ACCENT.purple})`,
                  borderRadius: 2,
                  transition: 'width 600ms cubic-bezier(0.16, 1, 0.3, 1)',
                }} />
              </div>
            </div>
            <div style={{
              textAlign: 'right',
              fontSize: 12, fontWeight: 600,
              fontFamily: '"JetBrains Mono", monospace', color: '#52525b',
            }}>
              {r.share.toFixed(1)}%
            </div>
            <div style={{ textAlign: 'right' }}>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 3,
                padding: '2px 7px', borderRadius: 999,
                background: trendUp ? '#dcfce7' : '#fee2e2',
                color: trendUp ? '#166534' : '#991b1b',
                fontSize: 11, fontWeight: 700,
                fontFamily: '"JetBrains Mono", monospace',
              }}>
                <ArrowUpRight
                  size={11}
                  style={{ transform: trendUp ? 'none' : 'rotate(90deg)' }}
                />
                {trendUp ? '+' : ''}{r.trend.toFixed(1)}%
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function EmptyTable() {
  return (
    <div style={{
      padding: '48px 16px', textAlign: 'center', color: '#71717a',
      fontSize: 13, background: '#fafafa', borderRadius: 10,
      border: '1px dashed #e4e4e7',
    }}>
      Aucune contrepartie pour ce filtre.
    </div>
  );
}

/* ─── CSV export ─────────────────────────────────────────── */

function exportCounterpartiesCsv(rows: Counterparty[], range: Range) {
  const headers = ['Contrepartie', 'Montant (MAD)', 'Part (%)', 'Tendance (%)', 'Catégories'];
  const lines = [headers.join(';'), ...rows.map((r) => [
    csvEscape(r.name),
    r.amount.toFixed(2),
    r.share.toFixed(2),
    r.trend.toFixed(2),
    csvEscape(r.categories.join('|')),
  ].join(';'))];
  // BOM for Excel-fr-MA so accents render correctly
  const blob = new Blob(['﻿', lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `amafin-statistiques-${range}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function csvEscape(v: string): string {
  if (v.includes(';') || v.includes('"') || v.includes('\n')) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

/* ─── Skeletons (loading states) ─────────────────────────── */

function KpiSkeleton({ delay }: { delay: number }) {
  return (
    <div style={{
      background: '#ffffff', border: '1px solid #e4e4e7', borderRadius: 14,
      padding: 16, height: 152,
      animation: `pulse 1.5s ease-in-out ${delay}s infinite`,
    }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12 }}>
        <div style={{ width: 32, height: 32, borderRadius: 9, background: '#f4f4f5' }} />
        <div style={{ width: '60%', height: 10, background: '#f4f4f5', borderRadius: 4 }} />
      </div>
      <div style={{ width: '70%', height: 24, background: '#f4f4f5', borderRadius: 6, marginBottom: 14 }} />
      <div style={{ width: '40%', height: 18, background: '#f4f4f5', borderRadius: 999 }} />
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.55}}`}</style>
    </div>
  );
}

function ChartSkeleton() {
  return (
    <div style={{
      width: '100%', height: '100%',
      background: 'linear-gradient(180deg, #fafafa, #f4f4f5)',
      borderRadius: 8, display: 'flex', alignItems: 'flex-end', padding: 12,
      gap: 6, animation: 'pulse 1.6s ease-in-out infinite',
    }}>
      {[...Array(20)].map((_, i) => (
        <div key={i} style={{
          flex: 1,
          height: `${30 + Math.sin(i * 0.7) * 30 + 25}%`,
          background: '#e4e4e7', borderRadius: 4,
        }} />
      ))}
    </div>
  );
}

function TableSkeleton({ rows }: { rows: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {[...Array(rows)].map((_, i) => (
        <div key={i} style={{
          height: 44, background: '#fafafa', border: '1px solid #f4f4f5',
          borderRadius: 8,
          animation: `pulse 1.6s ease-in-out ${i * 0.05}s infinite`,
        }} />
      ))}
    </div>
  );
}

/* ─── Helpers ────────────────────────────────────────────── */

function fmt(v: number): string {
  return new Intl.NumberFormat('fr-MA', {
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(v);
}

function fmtCompact(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(0)}k`;
  return String(v);
}

/* ─── Demo data fallback ─────────────────────────────────── */

function makeDemo(range: Range): StatsResponse {
  const points = range === '7d' ? 7 : range === '30d' ? 30 : range === '90d' ? 12 : 12;
  const labelFmt = range === '7d' || range === '30d'
    ? (i: number, total: number) => `J-${total - i}`
    : (i: number, total: number) => `M-${total - i}`;

  // Reproducible pseudo-random
  let seed = range.charCodeAt(0) * 1000 + range.charCodeAt(1);
  const rand = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };

  const N_FORECAST = Math.max(2, Math.round(points * 0.2));
  const totalLen = points + N_FORECAST;

  const incomingSeries: number[] = [];
  const outgoingSeries: number[] = [];
  const timeseries: TimePoint[] = [];

  // Real (measured) points
  for (let i = 0; i < points; i++) {
    const inc = 80_000 + Math.floor(rand() * 90_000);
    const out = 60_000 + Math.floor(rand() * 70_000);
    const prevInc = inc - Math.floor(rand() * 30_000) - 5_000;
    const prevOut = out - Math.floor(rand() * 25_000) + 2_000;
    incomingSeries.push(inc);
    outgoingSeries.push(out);
    timeseries.push({
      label: labelFmt(i, totalLen),
      incoming: inc, outgoing: out, net: inc - out,
      prev_incoming: Math.max(0, prevInc),
      prev_outgoing: Math.max(0, prevOut),
      // forecast is null on real points so the dashed line only appears on
      // the projected ones — except for the last real point which we set to
      // the same value so the dashed line connects smoothly
      forecast: null,
    });
  }

  // Forecast points — extrapolate trend with noise
  const lastNet = timeseries[timeseries.length - 1].net;
  const trend = (lastNet - timeseries[0].net) / Math.max(1, points - 1);

  // Make the last real point also carry the forecast value so the dashed
  // segment starts from there
  timeseries[timeseries.length - 1].forecast = lastNet;
  for (let i = 0; i < N_FORECAST; i++) {
    const projected = lastNet + trend * (i + 1) + (rand() - 0.5) * 25_000;
    timeseries.push({
      label: labelFmt(points + i, totalLen),
      incoming: 0, outgoing: 0, net: 0,
      forecast: Math.round(projected),
      is_forecast: true,
    });
  }

  const incomingTotal = incomingSeries.reduce((a, b) => a + b, 0);
  const outgoingTotal = outgoingSeries.reduce((a, b) => a + b, 0);

  return {
    kpis: {
      cash_flow: { value: incomingTotal - outgoingTotal,
        series: timeseries.filter((p) => !p.is_forecast).map((p) => p.net), delta: 12.4 },
      incoming:  { value: incomingTotal,  series: incomingSeries, delta: 8.1 },
      outgoing:  { value: outgoingTotal,  series: outgoingSeries, delta: 5.6 },
      overdue:   { value: Math.floor(rand() * 200_000) + 50_000,
        series: incomingSeries.map((v) => Math.floor(v * (0.05 + rand() * 0.1))), delta: -3.2 },
    },
    timeseries,
    category_breakdown: [
      { name: 'Achats',   value: 420_000 },
      { name: 'Salaires', value: 280_000 },
      { name: 'Impôts',   value: 180_000 },
      { name: 'Loyers',   value:  95_000 },
      { name: 'Autres',   value:  75_000 },
    ],
    top_counterparties: [
      { name: 'Société Alpha SARL',     amount: 1_240_000, share: 24.5, trend:  8.2, categories: ['Achats', 'Loyers'] },
      { name: 'Beta Industries',         amount:   980_000, share: 19.4, trend: -4.1, categories: ['Achats'] },
      { name: 'Gamma Logistique',        amount:   720_000, share: 14.2, trend: 12.8, categories: ['Achats', 'Autres'] },
      { name: 'Delta Trading SA',        amount:   540_000, share: 10.7, trend:  3.0, categories: ['Salaires'] },
      { name: 'Epsilon Distribution',    amount:   430_000, share:  8.5, trend: -1.5, categories: ['Achats'] },
      { name: 'Zeta Group',              amount:   310_000, share:  6.1, trend:  6.7, categories: ['Impôts'] },
      { name: 'État - DGI',              amount:   180_000, share:  3.6, trend:  0.2, categories: ['Impôts'] },
      { name: 'Personnel - Salaires',    amount:   280_000, share:  5.5, trend:  1.8, categories: ['Salaires'] },
    ],
  };
}
