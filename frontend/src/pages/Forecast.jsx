'use client';
import { useState, useEffect, useMemo, useCallback } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import api from '../lib/api';
import {
  ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Legend, Bar
} from 'recharts';
import {
  Brain, Zap, Activity, AlertCircle, RefreshCw, Info,
  TrendingUp, ChevronDown, BarChart2, Droplets, CheckCircle2
} from 'lucide-react';
import {
  CHART_COLORS, AXIS_TEXT, GRID_COLOR, TOOLTIP_BG, TOOLTIP_BORDER
} from '../lib/chartColors';
import toast from 'react-hot-toast';

// ─── Custom Tooltip ─────────────────────────────────────────────────────────
function ForecastTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#E6F4F2]/95 border border-[#2F9E9A] rounded-xl p-4 shadow-xl backdrop-blur-sm text-sm min-w-[220px]">
      <p className="font-extrabold text-[#0B2545] mb-3 uppercase tracking-wider">{label}</p>
      {payload.map((entry) => (
        <div key={entry.dataKey} className="flex justify-between gap-5 mb-2 last:mb-0">
          <span className="flex items-center gap-2 font-semibold text-[#143552]">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: entry.color }} />
            {entry.name}
          </span>
          <span className="text-[#0B2545] font-bold">
            {entry.value != null ? `${Number(entry.value).toFixed(2)} MW` : '—'}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Metric Card ─────────────────────────────────────────────────────────────
function MetricCard({ label, value, unit, icon: Icon, color = 'text-pedo-accent', sub }) {
  return (
    <div className="bg-card border border-subtle rounded-xl p-4 shadow-lg flex items-start gap-3 relative overflow-hidden">
      <div className="absolute right-0 top-0 w-24 h-24 rounded-full bg-pedo-accent/5 pointer-events-none translate-x-8 -translate-y-8" />
      <div className={`w-9 h-9 rounded-lg bg-hull border border-subtle flex items-center justify-center shrink-0 ${color}`}>
        <Icon size={18} />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-bold text-muted uppercase tracking-widest leading-none mb-1.5">{label}</p>
        <p className="text-lg font-black text-navy leading-none">
          {value != null ? value : <span className="text-navy-muted">—</span>}
          {unit && <span className="text-xs font-semibold text-muted ml-1">{unit}</span>}
        </p>
        {sub && <p className="text-[9px] text-muted mt-1">{sub}</p>}
      </div>
    </div>
  );
}

// ─── Horizon Row ─────────────────────────────────────────────────────────────
function HorizonRow({ fc, capacity }) {
  const pct = capacity ? Math.min(100, (fc.forecast_mw / capacity) * 100) : 0;
  const confidence = Math.round(fc.p_online * 100);
  const isLow = fc.p_online < 0.35;
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-subtle last:border-none">
      <div className="w-16 shrink-0 text-center">
        <p className="text-[9px] font-bold text-muted uppercase tracking-wider">Day +{fc.horizon}</p>
        <p className="text-[10px] font-extrabold text-navy mt-0.5">
          {new Date(fc.target_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </p>
      </div>
      <div className="flex-1">
        <div className="flex justify-between text-[10px] mb-1">
          <span className="font-bold text-navy">{fc.forecast_mw.toFixed(2)} MW</span>
          <span className="text-muted">{fc.pi80_lower_mw.toFixed(1)} – {fc.pi80_upper_mw.toFixed(1)}</span>
        </div>
        <div className="h-1.5 bg-hull rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${isLow ? 'bg-red-500' : 'bg-pedo-accent'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
      <div className={`w-14 text-center shrink-0 text-[10px] font-extrabold px-2 py-0.5 rounded-md border ${
        isLow
          ? 'bg-red-500/15 text-red-400 border-red-500/30'
          : confidence >= 80
            ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
            : 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30'
      }`}>
        {confidence}%
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────
export default function Forecast() {
  const [powerhouses, setPowerhouses] = useState([]);
  const [selectedPh, setSelectedPh] = useState(null); // { id, name, installed_capacity_mw }
  const [forecastData, setForecastData] = useState(null); // { history, forecast, origin_date, error }
  const [loading, setLoading] = useState(false);
  const [phLoading, setPhLoading] = useState(true);

  // ── Load powerhouse list on mount ─────────────────────────────────────────
  useEffect(() => {
    async function loadPowerhouses() {
      try {
        const res = await api.get('/powerhouses');
        const arr = Array.isArray(res.data) ? res.data : (res.data?.data || []);
        setPowerhouses(arr);
        if (arr.length > 0) setSelectedPh(arr[0]);
      } catch (err) {
        console.error('Failed to load powerhouses:', err);
        toast.error('Failed to load powerhouses.');
      } finally {
        setPhLoading(false);
      }
    }
    loadPowerhouses();
  }, []);

  // ── Fetch forecast whenever selected plant changes ────────────────────────
  const fetchForecast = useCallback(async (ph) => {
    if (!ph) return;
    setLoading(true);
    setForecastData(null);
    try {
      const res = await api.get(`/forecasts/live/${ph.id}`);
      const data = res.data?.data || res.data;
      setForecastData(data);
      if (data?.error) {
        toast.error(data.error);
      }
    } catch (err) {
      console.error('Forecast fetch error:', err);
      toast.error('Failed to load forecast. Check if backend is running.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedPh) fetchForecast(selectedPh);
  }, [selectedPh, fetchForecast]);

  // ── Build chart data: history + forecast ─────────────────────────────────
  const chartData = useMemo(() => {
    if (!forecastData) return [];
    const hist = (forecastData.history || []).map(h => ({
      date: new Date(h.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      actual: h.actual_mw,
      forecast: null,
      lower: null,
      upper: null,
      isFuture: false,
    }));

    // Connect: last actual point bridges to forecast
    const fc = forecastData.forecast || [];
    const fcPoints = fc.map((f, idx) => ({
      date: new Date(f.target_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      actual: null,
      forecast: f.forecast_mw,
      lower: f.pi80_lower_mw,
      upper: f.pi80_upper_mw,
      isFuture: true,
    }));

    // Bridge: last historical point gets forecast value too for line continuity
    if (hist.length > 0 && fcPoints.length > 0) {
      hist[hist.length - 1].forecast = hist[hist.length - 1].actual;
    }

    return [...hist, ...fcPoints];
  }, [forecastData]);

  // ── Derived stats ─────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    if (!forecastData?.forecast?.length) return null;
    const fc = forecastData.forecast;
    const avgFc = fc.reduce((s, f) => s + f.forecast_mw, 0) / fc.length;
    const maxFc = Math.max(...fc.map(f => f.forecast_mw));
    const avgConf = fc.reduce((s, f) => s + f.p_online, 0) / fc.length;
    const cap = selectedPh?.installed_capacity_mw || 1;
    const avgUtil = (avgFc / cap) * 100;
    return { avgFc, maxFc, avgConf, avgUtil };
  }, [forecastData, selectedPh]);

  const originLabel = forecastData?.origin_date
    ? new Date(forecastData.origin_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : null;

  const todayLabel = useMemo(() => {
    const hist = chartData.filter(d => !d.isFuture);
    return hist[hist.length - 1]?.date || '';
  }, [chartData]);

  return (
    <DashboardLayout title="Generation Forecast">
      <div className="flex flex-col gap-6">

        {/* ── Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <p className="text-xs text-pedo-accent font-bold uppercase tracking-widest flex items-center gap-1.5">
              <Activity size={13} className="animate-pulse" />
              SHPMFS Hybrid ML Model · DecoupledFleetForecaster
            </p>
            <h2 className="text-xl font-extrabold text-navy mt-1">7-Day Generation Forecast</h2>
            {originLabel && (
              <p className="text-[10px] text-muted mt-0.5">
                Forecasting from last observed entry: <b className="text-navy">{originLabel}</b>
              </p>
            )}
          </div>

          <div className="flex items-center gap-3">
            {/* Plant Selector */}
            <div className="relative">
              <select
                value={selectedPh?.id || ''}
                onChange={e => {
                  const ph = powerhouses.find(p => p.id === e.target.value);
                  setSelectedPh(ph || null);
                }}
                disabled={phLoading}
                className="bg-dropdown border border-[#2F9E9A] text-navy text-xs font-semibold rounded-lg px-3 py-2 pr-8 outline-none cursor-pointer focus:ring-2 focus:ring-pedo-accent appearance-none disabled:opacity-50"
              >
                {powerhouses.map(ph => (
                  <option key={ph.id} value={ph.id} className="bg-dropdown text-navy">
                    {ph.name}
                  </option>
                ))}
              </select>
              <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
            </div>

            {/* Refresh Button */}
            <button
              onClick={() => fetchForecast(selectedPh)}
              disabled={loading || !selectedPh}
              className="flex items-center gap-1.5 bg-hull border border-subtle hover:border-pedo-accent text-pedo-accent text-xs font-bold px-3 py-2 rounded-lg transition disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              {loading ? 'Running...' : 'Refresh'}
            </button>
          </div>
        </div>

        {/* ── Metric Cards ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            label="Avg 7-Day Forecast"
            value={stats ? stats.avgFc.toFixed(2) : null}
            unit="MW"
            icon={TrendingUp}
            sub={stats ? `${stats.avgUtil.toFixed(1)}% of capacity` : 'Select a plant'}
          />
          <MetricCard
            label="Peak Forecast"
            value={stats ? stats.maxFc.toFixed(2) : null}
            unit="MW"
            icon={Zap}
            color="text-yellow-400"
            sub="Highest predicted day"
          />
          <MetricCard
            label="Avg Confidence"
            value={stats ? `${Math.round(stats.avgConf * 100)}%` : null}
            icon={CheckCircle2}
            color="text-emerald-400"
            sub="Model p_online score"
          />
          <MetricCard
            label="Plant Capacity"
            value={selectedPh ? Number(selectedPh.installed_capacity_mw).toFixed(1) : null}
            unit="MW"
            icon={BarChart2}
            color="text-pedo-accent"
            sub={selectedPh?.name || '—'}
          />
        </div>

        {/* ── Main Chart ── */}
        <div className="bg-card border border-subtle rounded-xl p-5 shadow-xl">
          <div className="flex items-center justify-between mb-5 border-b border-subtle pb-3">
            <div>
              <h3 className="text-xs font-extrabold tracking-wider text-pedo-accent uppercase flex items-center gap-1.5">
                <Brain size={13} />
                Historical Actuals vs 7-Day ML Forecast
              </h3>
              <p className="text-[9px] text-muted mt-0.5">
                Shaded band = 80% prediction interval · Dashed line = forecast · Solid line = actual
              </p>
            </div>
            {forecastData?.origin_date && (
              <span className="text-[9px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-lg uppercase tracking-wider flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-ping" />
                Live
              </span>
            )}
          </div>

          {loading ? (
            <div className="h-[380px] flex flex-col gap-3 p-4">
              <div className="skeleton h-6 rounded w-1/3" />
              <div className="skeleton flex-1 rounded" />
            </div>
          ) : forecastData?.error && !forecastData?.forecast?.length ? (
            <div className="h-[380px] flex items-center justify-center">
              <div className="text-center">
                <AlertCircle size={32} className="text-red-400 mx-auto mb-3" />
                <p className="text-sm font-bold text-navy">{forecastData.error}</p>
                <p className="text-xs text-muted mt-1">This plant may not be supported by the current model.</p>
              </div>
            </div>
          ) : (
            <div className="h-[380px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ left: 0, right: 16, top: 8, bottom: 0 }}>
                  <defs>
                    <linearGradient id="piGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={CHART_COLORS[1]} stopOpacity={0.25} />
                      <stop offset="95%" stopColor={CHART_COLORS[1]} stopOpacity={0.03} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} strokeOpacity={1.4} vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fontWeight: 600, fill: '#0B2545' }}
                    tickLine={{ stroke: AXIS_TEXT, strokeOpacity: 0.55 }}
                    axisLine={{ stroke: AXIS_TEXT, strokeOpacity: 0.65 }}
                    interval="preserveStartEnd"
                    minTickGap={28}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fontWeight: 600, fill: '#0B2545' }}
                    tickLine={{ stroke: AXIS_TEXT, strokeOpacity: 0.55 }}
                    axisLine={{ stroke: AXIS_TEXT, strokeOpacity: 0.65 }}
                    width={50}
                    tickFormatter={v => `${v}MW`}
                  />
                  <Tooltip content={<ForecastTooltip />} />
                  <Legend
                    wrapperStyle={{ fontSize: 11, fontWeight: 600, paddingTop: 8, color: AXIS_TEXT }}
                    verticalAlign="bottom"
                    height={28}
                  />

                  {/* Today vertical marker */}
                  {todayLabel && (
                    <ReferenceLine
                      x={todayLabel}
                      stroke="#EF4444"
                      strokeWidth={1.5}
                      strokeDasharray="5 4"
                      label={{ value: 'LAST ACTUAL', position: 'top', fill: '#EF4444', fontSize: 8, fontWeight: 'bold' }}
                    />
                  )}

                  {/* 80% PI band (area between lower and upper) */}
                  <Area
                    type="monotone"
                    dataKey="upper"
                    stroke="none"
                    fill="url(#piGradient)"
                    name="PI80 Upper"
                    legendType="none"
                    isAnimationActive={false}
                    dot={false}
                  />
                  <Area
                    type="monotone"
                    dataKey="lower"
                    stroke="none"
                    fill={CHART_COLORS[1]}
                    fillOpacity={0.08}
                    name="PI80 Lower"
                    legendType="none"
                    isAnimationActive={false}
                    dot={false}
                  />

                  {/* Actual generation (solid line) */}
                  <Line
                    type="monotone"
                    dataKey="actual"
                    stroke={CHART_COLORS[0]}
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={{ r: 4 }}
                    name="Actual (MW)"
                    connectNulls={false}
                  />

                  {/* Forecast (dashed line) */}
                  <Line
                    type="monotone"
                    dataKey="forecast"
                    stroke={CHART_COLORS[1]}
                    strokeWidth={2}
                    strokeDasharray="5 4"
                    dot={{ r: 3, fill: CHART_COLORS[1], strokeWidth: 0 }}
                    activeDot={{ r: 5 }}
                    name="Forecast MW"
                    connectNulls={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}

          <p className="estimate-note mt-2 flex items-center gap-1 text-[10px] text-muted">
            <Info size={11} aria-hidden="true" />
            Predictions generated by SHPMFS DecoupledFleetForecaster (HistGradientBoosting Hybrid Hurdle model). 
            PI80 band = 80% prediction interval.
          </p>
        </div>

        {/* ── Day-by-Day Breakdown + Model Info ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

          {/* Horizon Table */}
          <div className="bg-card border border-subtle rounded-xl p-5 shadow-xl">
            <h3 className="text-xs font-extrabold tracking-wider text-pedo-accent uppercase mb-4 flex items-center gap-1.5">
              <BarChart2 size={13} />
              Day-by-Day Forecast Breakdown
            </h3>

            {loading ? (
              [...Array(7)].map((_, i) => (
                <div key={i} className="skeleton h-8 rounded mb-2" />
              ))
            ) : forecastData?.forecast?.length ? (
              <div>
                {forecastData.forecast.map(fc => (
                  <HorizonRow
                    key={fc.horizon}
                    fc={fc}
                    capacity={Number(selectedPh?.installed_capacity_mw || 1)}
                  />
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-navy-muted">
                <Brain size={24} className="mx-auto mb-2 opacity-40" />
                <p className="text-xs">No forecast data available.</p>
              </div>
            )}
          </div>

          {/* Model Info + Inflow Context */}
          <div className="flex flex-col gap-4">

            {/* Model Architecture Card */}
            <div className="bg-card border border-subtle rounded-xl p-5 shadow-lg">
              <h3 className="text-xs font-extrabold tracking-wider text-pedo-accent uppercase mb-3 flex items-center gap-1.5">
                <Brain size={13} />
                Model Architecture
              </h3>
              <div className="space-y-2.5 text-xs">
                {[
                  ['Model Type', 'DecoupledFleetForecaster (Hybrid Hurdle)'],
                  ['Legacy Plants (A)', 'Daral Khwar, Karora, Koto, Jabori, Reshun'],
                  ['Solo Plant (S)', 'Malakand-3 HPS (81 MW, isolated GBDT)'],
                  ['Hurdle Plants (B)', 'Machai HPS · Pehur HPS'],
                  ['Horizon', '7-day (h=1 through h=7)'],
                  ['PI Band', '80% calibrated prediction interval'],
                  ['Base Algorithm', 'HistGradientBoosting (Regressor + Classifier)'],
                  ['Features', '19 features incl. lags, rolling stats, seasonality'],
                ].map(([label, val]) => (
                  <div key={label} className="flex justify-between gap-2">
                    <span className="text-muted font-semibold shrink-0">{label}</span>
                    <span className="text-navy text-right text-[10px]">{val}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Last Actual Reading */}
            {forecastData?.history?.length > 0 && (() => {
              const last = forecastData.history[forecastData.history.length - 1];
              return (
                <div className="bg-card border border-subtle rounded-xl p-5 shadow-lg">
                  <h3 className="text-xs font-extrabold tracking-wider text-pedo-accent uppercase mb-3 flex items-center gap-1.5">
                    <Droplets size={13} />
                    Last Observed Reading
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-hull rounded-lg p-3 text-center">
                      <p className="text-[9px] text-muted font-bold uppercase tracking-wider mb-1">Date</p>
                      <p className="text-xs font-extrabold text-navy">
                        {new Date(last.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </p>
                    </div>
                    <div className="bg-hull rounded-lg p-3 text-center">
                      <p className="text-[9px] text-muted font-bold uppercase tracking-wider mb-1">Generation</p>
                      <p className="text-xs font-extrabold text-navy">{last.actual_mw.toFixed(2)} MW</p>
                    </div>
                    <div className="bg-hull rounded-lg p-3 text-center col-span-2">
                      <p className="text-[9px] text-muted font-bold uppercase tracking-wider mb-1">Inflow</p>
                      <p className="text-xs font-extrabold text-navy">{last.inflow_m3s.toFixed(2)} m³/s</p>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Info Banner */}
            <div className="bg-card border border-subtle rounded-xl p-4 flex items-start gap-3 shadow-lg">
              <div className="p-2 bg-pedo-accent/10 border border-pedo-accent/30 rounded-lg shrink-0 text-pedo-accent">
                <AlertCircle size={16} />
              </div>
              <div>
                <h4 className="text-[10px] font-bold text-navy uppercase tracking-wider mb-1">Live Updates</h4>
                <p className="text-[10px] text-muted leading-relaxed">
                  Forecast recalculates automatically from the <b className="text-navy">last actual reading</b> in 
                  the database. Add new Data Entry records to advance the forecast origin date. 
                  The model uses the last 28 days of generation and inflow history.
                </p>
              </div>
            </div>

          </div>
        </div>

      </div>
    </DashboardLayout>
  );
}
