'use client';
import { useState, useEffect, useMemo, useCallback } from 'react';
import DashboardLayout, { SearchProvider, useSearch } from '../components/DashboardLayout';
import api from '../lib/api';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, ReferenceLine, ComposedChart,
  Cell,
} from 'recharts';
import {
  Zap, Calendar, Activity, Waves,
  ChevronUp, ChevronDown, RefreshCw, InboxIcon,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  CHART_COLORS, GRADIENT_START, GRADIENT_END,
  REFERENCE_LINE_COLOR, TOOLTIP_BG, TOOLTIP_BORDER,
  AXIS_TEXT, GRID_COLOR, TOOLTIP_TEXT
} from '../lib/chartColors';

/* ── Count-up animation ── */
function CountUpNumber({ endValue, duration = 800, decimals = 0 }) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    let startTime = null;
    const end = parseFloat(endValue) || 0;
    if (end === 0) { setValue(0); return; }
    const animate = (timestamp) => {
      if (!startTime) startTime = timestamp;
      const rate = Math.min((timestamp - startTime) / duration, 1);
      setValue(rate * end);
      if (rate < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }, [endValue, duration]);
  return <span>{value.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}</span>;
}

const CHART_TOOLTIP_STYLE = {
  backgroundColor: TOOLTIP_BG,
  borderColor: TOOLTIP_BORDER,
  borderRadius: '8px',
  color: TOOLTIP_TEXT,
  fontSize: 11,
  padding: '6px 10px',
  boxShadow: '0 6px 18px rgba(20, 50, 110, 0.20)',
};

const AXIS_TICK = {
  fontSize: 12,
  fill: AXIS_TEXT,
  fontVariantNumeric: 'tabular-nums',
};

const LEGEND_STYLE = {
  fontSize: 11,
  height: 22,
  lineHeight: '22px',
  whiteSpace: 'nowrap',
  overflowX: 'auto',
  color: AXIS_TEXT,
};

function DashboardContent() {
  const {
    debouncedSearch,
    setTotalCount,
    setFilteredCount,
    setPowerhouseList,
    setOnSelectPlant,
  } = useSearch();

  const [loadingState, setLoadingState] = useState('loading');
  const [loadError, setLoadError] = useState('');
  const [powerhouses, setPowerhouses] = useState([]);
  const [selectedPlant, setSelectedPlant] = useState('all');
  const [startDate, setStartDate] = useState('2025-01-01');
  const [endDate, setEndDate] = useState('2026-09-19');

  const [kpis, setKpis] = useState({
    avgGenMW: 0, installedCapacityMW: 0, avgDailyKwh: 0, totalKwh: 0,
    totalGwh: 0, avgHistHydrology: 0, avgActualHydrology: 0, tariff: 4.671,
  });
  const [linechartData, setLinechartData] = useState([]);
  const [inflowData, setInflowData] = useState([]);
  const [statusTableData, setStatusTableData] = useState([]);
  const [monthlyData, setMonthlyData] = useState([]);
  const [efficiencyData, setEfficiencyData] = useState([]);
  const [sortField, setSortField] = useState('efficiency');
  const [sortAsc, setSortAsc] = useState(false);

  useEffect(() => {
    api.get('/powerhouses').then(r => {
      const arr = Array.isArray(r.data) ? r.data : (r.data?.data || []);
      setPowerhouses(arr);
    }).catch(console.error);
  }, []);

  const fetchDashboardData = useCallback(async (isManual = false) => {
    setLoadingState('loading');
    setLoadError('');
    try {
      const params = { plant: selectedPlant, startDate, endDate };
      const [kpiRes, lineRes, inflowRes, statusRes, monthlyRes, effRes] = await Promise.all([
        api.get('/dashboard/kpis', { params }),
        api.get('/dashboard/linechart', { params }),
        api.get('/dashboard/inflow', { params }),
        api.get('/dashboard/status', { params }),
        api.get('/dashboard/monthly', { params }),
        api.get('/dashboard/efficiency'),
      ]);

      setKpis(kpiRes.data?.data || kpiRes.data || {});

      const lineArr = Array.isArray(lineRes.data) ? lineRes.data : (lineRes.data?.data || []);
      setLinechartData(lineArr);

      const inflowArr = Array.isArray(inflowRes.data) ? inflowRes.data : (inflowRes.data?.data || []);
      setInflowData(inflowArr);

      const statusRaw = statusRes.data?.data || statusRes.data;
      const statusArr = Array.isArray(statusRaw) ? statusRaw : (statusRaw?.powerhouse_statuses || []);
      setStatusTableData(statusArr);

      const monthlyArr = Array.isArray(monthlyRes.data) ? monthlyRes.data : (monthlyRes.data?.data || []);
      setMonthlyData(monthlyArr);

      const effArr = Array.isArray(effRes.data) ? effRes.data : (effRes.data?.data || []);
      setEfficiencyData(effArr);

      if (isManual) {
        toast.success('Dashboard updated!');
      }
      setLoadingState('ok');
    } catch (err) {
      console.error(err);
      const status = err.response?.status;
      if (status === 401) return;
      setLoadError(
        status === 403
          ? 'Your session is invalid or expired. Please sign in again.'
          : err.response?.data?.detail || 'Could not reach the dashboard API. Check that the backend is running on http://localhost:8000.'
      );
      toast.error('Failed to load dashboard metrics.');
      setLoadingState('error');
    }
  }, [selectedPlant, startDate, endDate]);

  useEffect(() => {
    fetchDashboardData(false);
  }, [fetchDashboardData]);

  // Sync powerhouse list with search context
  useEffect(() => {
    const phArr = Array.isArray(powerhouses) ? powerhouses : (powerhouses?.data || []);
    if (phArr.length > 0 && setPowerhouseList) {
      const allNames = phArr.map(p => p.name).filter(Boolean);
      setPowerhouseList(allNames);
    }
  }, [powerhouses, setPowerhouseList]);

  // Connect powerhouse selection from top-bar search dropdown
  useEffect(() => {
    if (setOnSelectPlant) {
      setOnSelectPlant((plantName) => {
        setSelectedPlant(plantName);
      });
    }
  }, [setOnSelectPlant]);

  const handleApplyFilters = () => fetchDashboardData(true);
  const handleResetFilters = (e) => {
    e.preventDefault();
    setSelectedPlant('all');
    setStartDate('2025-01-01');
    setEndDate('2026-09-19');
  };

  const handleSort = (field) => {
    if (sortField === field) setSortAsc(!sortAsc);
    else { setSortField(field); setSortAsc(false); }
  };

  // Live filter status table by plant name (200ms debounce, case-insensitive)
  const filteredStatusTable = useMemo(() => {
    const stArr = Array.isArray(statusTableData) ? statusTableData : [];
    if (!stArr.length) return [];
    const query = (debouncedSearch || '').trim().toLowerCase();
    if (!query) return stArr;
    return stArr.filter(row =>
      (row.plant || row.name || '').toLowerCase().includes(query)
    );
  }, [statusTableData, debouncedSearch]);

  // Update counts in search context ("3 of 9")
  useEffect(() => {
    const stArr = Array.isArray(statusTableData) ? statusTableData : [];
    setTotalCount(stArr.length);
    setFilteredCount(filteredStatusTable.length);
  }, [statusTableData, filteredStatusTable, setTotalCount, setFilteredCount]);

  const sortedStatusTable = useMemo(() => {
    const data = [...filteredStatusTable];
    if (!data.length) return [];
    return data.sort((a, b) => {
      const av = a[sortField], bv = b[sortField];
      if (typeof av === 'string') return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortAsc ? (av || 0) - (bv || 0) : (bv || 0) - (av || 0);
    });
  }, [filteredStatusTable, sortField, sortAsc]);

  const fmtDate = (d) => {
    if (!d) return '';
    try {
      const dateObj = new Date(d);
      return dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch {
      return d;
    }
  };

  /* ── Filter bar JSX ── */
  const filterBar = (
    <div className="card !p-3 shadow-md border border-white/40 mb-4 bg-white/40 backdrop-blur-md">
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 font-bold text-[#0B2545]">
            <Calendar size={14} className="text-[#23807F]" aria-hidden="true" />
            <span>Power Plant:</span>
            <select
              value={selectedPlant}
              onChange={(e) => setSelectedPlant(e.target.value)}
              className="bg-white/70 border border-white/80 rounded-md px-2 py-1 font-semibold text-[#0B2545] outline-none focus:border-[#2F9E9A]"
            >
              <option value="all">All Power Plants (Fleet)</option>
              {powerhouses.map(p => (
                <option key={p.id || p.name} value={p.name}>{p.name}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5 font-bold text-[#0B2545]">
            <span>From:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-white/70 border border-white/80 rounded-md px-2 py-1 font-semibold text-[#0B2545] outline-none focus:border-[#2F9E9A]"
            />
            <span>To:</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="bg-white/70 border border-white/80 rounded-md px-2 py-1 font-semibold text-[#0B2545] outline-none focus:border-[#2F9E9A]"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleApplyFilters}
            className="btn-primary py-1 px-3 text-xs font-bold text-white flex items-center gap-1 shadow-sm"
          >
            <RefreshCw size={12} className="animate-spin-hover" />
            Apply Filters
          </button>
          <button
            type="button"
            onClick={handleResetFilters}
            className="text-xs font-bold text-[#143552] hover:text-[#0B2545] underline px-1"
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  );

  const KpiTopCard = ({ label, value, decimals = 0, unit = '' }) => (
    <div className="card !p-4 flex flex-col justify-between border border-white/50 bg-white/40 shadow-sm hover:shadow-md transition-shadow">
      <div className="text-[11px] font-bold uppercase tracking-wider text-[#23807F] mb-1">{label}</div>
      <div className="text-2xl font-black text-[#0B2545] tracking-tight flex items-baseline gap-1">
        <CountUpNumber endValue={value} decimals={decimals} />
        {unit && <span className="text-xs font-bold text-[#143552]">{unit}</span>}
      </div>
    </div>
  );

  const KpiBottomCard = ({ label, value, decimals = 0, unit = '' }) => (
    <div className="card !p-3.5 flex flex-col justify-between border border-white/40 bg-white/30 shadow-sm">
      <div className="text-[10px] font-bold uppercase tracking-wider text-[#143552] mb-1">{label}</div>
      <div className="text-lg font-extrabold text-[#0B2545] flex items-baseline gap-1">
        <CountUpNumber endValue={value} decimals={decimals} />
        {unit && <span className="text-[10px] font-semibold text-[#1B4360]">{unit}</span>}
      </div>
    </div>
  );

  return (
    <DashboardLayout title="Analytics Dashboard">
      <div className="space-y-4">
        {filterBar}

        {loadingState === 'loading' && (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-[#0B2545]">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#2F9E9A] border-t-transparent" />
            <p className="text-xs font-bold tracking-wide text-[#143552]">Loading Authentic Metrics from Supabase...</p>
          </div>
        )}

        {loadingState === 'error' && (
          <div className="card !p-8 flex flex-col items-center justify-center gap-3 text-center border border-red-500/30 bg-red-500/10">
            <InboxIcon size={36} className="text-danger" />
            <h3 className="text-base font-bold text-danger">Failed to Load Dashboard Data</h3>
            <p className="text-xs text-[#143552] max-w-sm">
              {loadError}
            </p>
            <button
              onClick={() => fetchDashboardData(true)}
              className="btn-primary text-xs py-1.5 px-4 font-bold"
            >
              Retry Connection
            </button>
          </div>
        )}

        {loadingState === 'ok' && (
          <>
            {/* Top KPI row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
              <KpiTopCard label="Avg Generation (MW)" value={kpis.avgGenMW || kpis.avg_daily_generation_mw} decimals={2} />
              <KpiTopCard label="Installed Capacity (MW)" value={kpis.installedCapacityMW || kpis.installed_capacity_mw} decimals={1} />
              <KpiTopCard label="Avg Daily Generation (kWh)" value={kpis.avgDailyKwh || kpis.avg_daily_kwh} decimals={0} />
              <KpiTopCard label="Tariff Rate" value={kpis.tariff} decimals={3} unit="PKR" />
            </div>

            {/* Bottom KPI row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
              <KpiBottomCard label="Total Generation (kWh)" value={kpis.totalKwh || kpis.total_generation_kwh} decimals={0} />
              <KpiBottomCard label="Total Generation (GWh)" value={kpis.totalGwh || kpis.total_generation_gwh} decimals={3} />
              <KpiBottomCard label="Avg Historical Hydrology" value={kpis.avgHistHydrology || kpis.avg_historical_hydrology} decimals={2} unit="cfs" />
              <KpiBottomCard label="Avg Actual Inflow" value={kpis.avgActualHydrology || kpis.avg_actual_inflow_cumecs} decimals={2} unit="cumecs" />
            </div>

            {/* Charts Row 1: Linechart & Inflow Chart */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2 card !p-4 border border-white/50 bg-white/40 shadow-sm flex flex-col">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Zap size={16} className="text-[#23807F]" />
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[#0B2545]">
                      Daily Generation Trend (MW)
                    </h3>
                  </div>
                  <span className="text-[10px] font-bold text-[#143552] bg-white/50 px-2 py-0.5 rounded border border-white/70">
                    {linechartData.length} Days Recorded
                  </span>
                </div>

                <div className="h-[260px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={linechartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
                      <XAxis dataKey="date" tickFormatter={fmtDate} tick={AXIS_TICK} />
                      <YAxis tick={AXIS_TICK} />
                      <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                      <Line type="monotone" dataKey="avg_mw" name="Avg Load (MW)" stroke={CHART_COLORS[0]} strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Inflow vs Generation Line Chart */}
              <div className="card !p-4 border border-white/50 bg-white/40 shadow-sm flex flex-col">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Waves size={16} className="text-[#23807F]" />
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[#0B2545]">
                      Inflow vs Generation
                    </h3>
                  </div>
                  <div className="flex items-center gap-2.5 text-[10px] font-bold">
                    <span className="flex items-center gap-1 text-[#23807F]">
                      <span className="w-2.5 h-0.5 bg-[#23807F] inline-block rounded" /> Inflow (cumecs)
                    </span>
                    <span className="flex items-center gap-1 text-[#0B2545]">
                      <span className="w-2.5 h-0.5 bg-[#0B2545] inline-block rounded" /> Gen (MW)
                    </span>
                  </div>
                </div>

                <div className="h-[260px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={inflowData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
                      <XAxis dataKey="date" tickFormatter={fmtDate} tick={AXIS_TICK} />
                      <YAxis yAxisId="left" tick={AXIS_TICK} />
                      <YAxis yAxisId="right" orientation="right" tick={AXIS_TICK} />
                      <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                      <Line yAxisId="left" type="monotone" dataKey="inflow_cumecs" name="Inflow (cumecs)" stroke="#23807F" strokeWidth={4} dot={false} />
                      <Line yAxisId="right" type="monotone" dataKey="avg_generation_mw" name="Generation (MW)" stroke="#0B2545" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Charts Row 2: Monthly Production & Fleet Efficiency */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="card !p-4 border border-white/50 bg-white/40 shadow-sm">
                <div className="flex items-center gap-2 mb-3">
                  <Activity size={16} className="text-[#23807F]" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[#0B2545]">
                    Monthly Generation Summary (GWh)
                  </h3>
                </div>

                <div className="h-[240px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={monthlyData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
                      <XAxis dataKey="month" tick={AXIS_TICK} />
                      <YAxis tick={AXIS_TICK} />
                      <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                      <Bar dataKey="total_gwh" name="Total (GWh)" fill={CHART_COLORS[0]} radius={[4, 4, 0, 0]}>
                        {monthlyData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Status Table */}
              <div className="card !p-4 border border-white/50 bg-white/40 shadow-sm flex flex-col">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[#0B2545]">
                    Fleet Powerhouse Operational Status
                  </h3>
                  <span className="text-[10px] text-[#0B2545] font-bold bg-white/50 px-2 py-0.5 rounded border border-white/70">
                    {debouncedSearch?.trim()
                      ? `${sortedStatusTable.length} of ${statusTableData.length}`
                      : `${sortedStatusTable.length} Plants`}
                  </span>
                </div>

                <div className="overflow-x-auto thin-scrollbar flex-1">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-white/60 text-[10px] uppercase tracking-wider text-[#23807F] font-bold">
                        <th className="py-2 px-2.5 cursor-pointer" onClick={() => handleSort('plant')}>
                          Plant {sortField === 'plant' && (sortAsc ? '▲' : '▼')}
                        </th>
                        <th className="py-2 px-2 text-right cursor-pointer" onClick={() => handleSort('installed')}>
                          Capacity {sortField === 'installed' && (sortAsc ? '▲' : '▼')}
                        </th>
                        <th className="py-2 px-2 text-right cursor-pointer" onClick={() => handleSort('avgGen')}>
                          Avg Load {sortField === 'avgGen' && (sortAsc ? '▲' : '▼')}
                        </th>
                        <th className="py-2 px-2 text-right cursor-pointer" onClick={() => handleSort('efficiency')}>
                          Plant Factor {sortField === 'efficiency' && (sortAsc ? '▲' : '▼')}
                        </th>
                        <th className="py-2 px-2.5 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/40 text-xs">
                      {sortedStatusTable.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-6 text-center text-xs text-[#143552] italic">
                            No powerhouse records found.
                          </td>
                        </tr>
                      ) : (
                        sortedStatusTable.map((row, idx) => (
                          <tr key={row.plant || idx} className="hover:bg-white/40 transition-colors">
                            <td className="py-2.5 px-2.5 font-bold text-[#0B2545] whitespace-nowrap">
                              {row.plant}
                            </td>
                            <td className="text-right text-[#143552] font-semibold py-2.5 px-2 text-[13px] whitespace-nowrap">
                              {(row.installed || row.installed_capacity_mw || 0).toFixed(1)} MW
                            </td>
                            <td className="text-right py-2.5 px-2 text-[13px] whitespace-nowrap">
                              <div className="flex items-center gap-1.5 justify-end">
                                <span className="text-[#0B2545] font-bold">{(row.avgGen || row.avg_generation_mw || 0).toFixed(1)} MW</span>
                              </div>
                            </td>
                            <td className="text-right text-[#0B2545] font-bold py-2.5 px-2 text-[13px] whitespace-nowrap">
                              <div className="flex items-center justify-end gap-2">
                                <span>{(row.efficiency || row.avg_plant_factor_pct || 0).toFixed(1)}%</span>
                                <div
                                  className="h-1.5 w-14 overflow-hidden rounded-full bg-white/70"
                                  role="meter"
                                  aria-label={`${row.plant} plant factor`}
                                  aria-valuemin={0}
                                  aria-valuemax={100}
                                  aria-valuenow={Math.min(Math.max(row.efficiency || row.avg_plant_factor_pct || 0, 0), 100)}
                                >
                                  <div
                                    className="h-full rounded-full bg-[#23807F]"
                                    style={{ width: `${Math.min(Math.max(row.efficiency || row.avg_plant_factor_pct || 0, 0), 100)}%` }}
                                  />
                                </div>
                              </div>
                            </td>
                            <td className="py-2.5 px-2.5 text-center whitespace-nowrap">
                              {row.status === 'RUNNING' && (
                                <span className="badge-running inline-flex items-center gap-1 text-[9px] py-0.5 px-1 tracking-normal whitespace-nowrap">
                                  <span className="w-1.5 h-1.5 rounded-full bg-[#0B3D1E] animate-pulse" aria-hidden="true" />
                                  RUNNING
                                </span>
                              )}
                              {row.status === 'PARTIAL' && (
                                <span className="badge-partial inline-flex items-center gap-1 text-[9px] py-0.5 px-1 tracking-normal whitespace-nowrap">
                                  <span className="w-1.5 h-1.5 rounded-full bg-[#4A2503]" aria-hidden="true" />
                                  PARTIAL
                                </span>
                              )}
                              {row.status === 'SHUTDOWN' && (
                                <span className="badge-shutdown inline-flex items-center gap-1 text-[9px] py-0.5 px-1 tracking-normal whitespace-nowrap">
                                  <span className="w-1.5 h-1.5 rounded-full bg-[#5A0F0F]" aria-hidden="true" />
                                  SHUTDOWN
                                </span>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}

export default function Dashboard() {
  return (
    <SearchProvider>
      <DashboardContent />
    </SearchProvider>
  );
}
