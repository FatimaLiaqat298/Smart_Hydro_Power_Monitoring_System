'use client';
import { useState, useEffect, useMemo, useCallback } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import api from '../lib/api';
import toast from 'react-hot-toast';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, LineChart, Line, Cell
} from 'recharts';
import { Target, Search, ArrowUpRight, ArrowDownRight, Activity, Calendar, Zap, CheckCircle2, XCircle } from 'lucide-react';
import { AXIS_TEXT, GRID_COLOR } from '../lib/chartColors';

// Default initial powerhouses to guarantee dropdowns are never empty
const DEFAULT_POWERHOUSES = [
  { id: '4fe5f127-7fe3-44d8-b4db-0e06d74196e8', name: 'Daral Khwar HPS', installed_capacity_mw: 36.6 },
  { id: 'aad654f0-8942-4e18-9585-490da5abfd72', name: 'Jabori HPS', installed_capacity_mw: 10.2 },
  { id: '8cc07f79-ae72-4cec-911a-34e685f70073', name: 'Karora HPS', installed_capacity_mw: 11.8 },
  { id: '63fc0e95-c0e8-4307-9640-dfb29dfd965d', name: 'Koto HPS', installed_capacity_mw: 40.8 },
  { id: '90825a9d-aec2-4867-9ae7-6fba48803026', name: 'Machai HPS', installed_capacity_mw: 2.6 },
  { id: '752ffd99-c6dd-4e03-9c73-2785873bc5aa', name: 'Malakand-3 HPS', installed_capacity_mw: 81.0 },
  { id: 'adf51971-e192-4fa6-9c57-a5f7d66cb753', name: 'Pehur HPS', installed_capacity_mw: 18.0 },
  { id: '48ce566d-da46-4080-a83c-63136f284854', name: 'Reshun HPS', installed_capacity_mw: 4.2 },
  { id: '0b4c02fc-c0f3-45d2-928b-f1147f3c951e', name: 'Shishi HPS', installed_capacity_mw: 1.88 },
];

function getMonthDateRange(monthValue) {
  const [year, month] = monthValue.split('-').map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  return {
    startDate: `${monthValue}-01`,
    endDate: `${monthValue}-${String(lastDay).padStart(2, '0')}`,
  };
}

function getCurrentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function targetMatchesMonth(target, monthValue) {
  const { startDate, endDate } = getMonthDateRange(monthValue);
  return target.period_start <= endDate && target.period_end >= startDate;
}

function normalizeTargets(items) {
  return items.map(item => ({
    ...item,
    target_mw: Number.isFinite(Number(item.target_mw)) ? Number(item.target_mw) : 0,
  }));
}

function normalizePerformance(items) {
  return items.map(item => ({
    ...item,
    target_mw: item.target_mw == null ? null : Number(item.target_mw),
    actual_avg_mw: item.actual_avg_mw == null ? null : Number(item.actual_avg_mw),
    variance_mw: item.variance_mw == null ? null : Number(item.variance_mw),
  }));
}

export default function Targets() {
  const [powerhouses, setPowerhouses] = useState(DEFAULT_POWERHOUSES);
  const [targets, setTargets] = useState([]);
  const [performance, setPerformance] = useState([]);
  const [genData, setGenData] = useState([]);
  const [historyGenData, setHistoryGenData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // SECTION 1 — Live Target Form State
  const [liveForm, setLiveForm] = useState({
    powerhouse_id: DEFAULT_POWERHOUSES[0].id,
    month: getCurrentMonth(),
    target_mw: '',
  });
  const [liveFormErrors, setLiveFormErrors] = useState({});

  // SECTION 2 — Past Target Form State
  const [historyForm, setHistoryForm] = useState({
    powerhouse_id: DEFAULT_POWERHOUSES[0].id,
    period_start: `${getCurrentMonth()}-01`,
    period_end: new Date().toISOString().slice(0, 10),
    target_mw: '',
  });
  const [historyFormErrors, setHistoryFormErrors] = useState({});
  const [selectedHistoryTargetId, setSelectedHistoryTargetId] = useState('');

  // SECTION 3 — Table Search State
  const [tableSearch, setTableSearch] = useState('');

  // ── Load Powerhouses & Targets ───────────────────────────────────────────
  const loadMetadata = useCallback(async () => {
    try {
      const phRes = await api.get('/powerhouses');
      const phData = phRes.data;
      const phArr = Array.isArray(phData) ? phData : (phData?.data || []);
      if (phArr.length > 0) {
        setPowerhouses(phArr);
      }
    } catch (err) {
      console.error('Failed to load dynamic powerhouses, using fallback:', err);
    }

    try {
      const [targetsRes, perfRes] = await Promise.allSettled([
        api.get('/targets', { params: { page_size: 100 } }),
        api.get('/targets/performance'),
      ]);

      if (targetsRes.status === 'fulfilled') {
        const tData = targetsRes.value.data;
        const tArr = Array.isArray(tData) ? tData : (tData?.data || []);
        const normalized = normalizeTargets(tArr);
        setTargets(normalized);
        if (normalized.length > 0) {
          setSelectedHistoryTargetId(prev => prev || normalized[0].id);
        }
      }

      if (perfRes.status === 'fulfilled') {
        const rows = perfRes.value.data?.data || [];
        setPerformance(normalizePerformance(rows));
      }
    } catch (err) {
      console.error('Failed to load targets metadata:', err);
    }
  }, []);

  useEffect(() => {
    loadMetadata();
  }, [loadMetadata]);

  // ── Live Monthly Generation Data (Refreshes every 60s) ───────────────────
  const loadMonthlyGenData = useCallback(async () => {
    if (!liveForm.month) return;
    setLoading(true);
    try {
      const { startDate, endDate } = getMonthDateRange(liveForm.month);
      const gRes = await api.get('/generation', {
        params: { date_from: startDate, date_to: endDate, page_size: 500 }
      });
      const gArr = Array.isArray(gRes.data) ? gRes.data : (gRes.data?.data || []);
      setGenData(gArr);
    } catch (err) {
      console.error('Failed to load monthly generation data:', err);
    } finally {
      setLoading(false);
    }
  }, [liveForm.month]);

  useEffect(() => {
    loadMonthlyGenData();
    const timer = setInterval(loadMonthlyGenData, 60000);
    return () => clearInterval(timer);
  }, [loadMonthlyGenData]);

  // ── Active Live Target for Selected Plant/Month ──────────────────────────
  const selectedLiveTarget = useMemo(() => {
    if (!liveForm.powerhouse_id) return null;
    return targets.find(target => (
      target.powerhouse_id === liveForm.powerhouse_id &&
      targetMatchesMonth(target, liveForm.month)
    )) || null;
  }, [targets, liveForm.powerhouse_id, liveForm.month]);

  // Sync target input value if target already saved
  useEffect(() => {
    if (selectedLiveTarget) {
      setLiveForm(prev => ({ ...prev, target_mw: String(selectedLiveTarget.target_mw) }));
    }
  }, [selectedLiveTarget]);

  // ── 75% Width: Live Monthly Line Chart Data ──────────────────────────────
  const dailyPerformanceData = useMemo(() => {
    if (!liveForm.powerhouse_id) return [];

    const [year, month] = liveForm.month.split('-').map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();
    const dailyTotals = new Map();

    genData
      .filter(record => record.powerhouse_id === liveForm.powerhouse_id)
      .forEach(record => {
        const readingDate = String(record.reading_date || '').slice(0, 10);
        if (!readingDate) return;
        const current = dailyTotals.get(readingDate) || { total: 0, count: 0 };
        current.total += parseFloat(record.avg_station_load_mw || 0);
        current.count += 1;
        dailyTotals.set(readingDate, current);
      });

    const now = new Date();
    const currentYMD = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    return Array.from({ length: daysInMonth }, (_, index) => {
      const dayNum = index + 1;
      const dayStr = String(dayNum).padStart(2, '0');
      const readingDate = `${liveForm.month}-${dayStr}`;
      const daily = dailyTotals.get(readingDate);

      // Plot actuals ONLY up to and including today's date
      const isFuture = readingDate > currentYMD;

      return {
        day: String(dayNum),
        date: readingDate,
        actual_mw: !isFuture && daily && daily.count > 0 ? Number((daily.total / daily.count).toFixed(2)) : null,
        target_mw: selectedLiveTarget ? Number(selectedLiveTarget.target_mw) : null,
      };
    });
  }, [genData, liveForm.month, liveForm.powerhouse_id, selectedLiveTarget]);

  // ── 25% Width: Selected Past Target & Comparison ──────────────────────────
  const selectedHistoryTarget = useMemo(
    () => targets.find(target => target.id === selectedHistoryTargetId) || null,
    [targets, selectedHistoryTargetId]
  );

  useEffect(() => {
    if (!selectedHistoryTarget) {
      setHistoryGenData([]);
      return;
    }
    let cancelled = false;
    async function loadHistoryData() {
      setHistoryLoading(true);
      try {
        const response = await api.get('/generation', {
          params: {
            powerhouse_id: selectedHistoryTarget.powerhouse_id,
            date_from: selectedHistoryTarget.period_start,
            date_to: selectedHistoryTarget.period_end,
            page_size: 500,
          }
        });
        const rows = Array.isArray(response.data) ? response.data : (response.data?.data || []);
        if (!cancelled) setHistoryGenData(rows);
      } catch (error) {
        console.error('Failed to load historical target generation:', error);
        if (!cancelled) setHistoryGenData([]);
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    }
    loadHistoryData();
    return () => { cancelled = true; };
  }, [selectedHistoryTarget]);

  // Group readings per day in past target range
  const historicalComparisonData = useMemo(() => {
    if (!selectedHistoryTarget) return [];
    const daily = new Map();
    historyGenData.forEach(record => {
      const day = String(record.reading_date || '').slice(0, 10);
      if (!day) return;
      const row = daily.get(day) || { total: 0, count: 0 };
      row.total += Number(record.avg_station_load_mw || 0);
      row.count += 1;
      daily.set(day, row);
    });
    return Array.from(daily, ([date, values]) => ({
      date: date.slice(5),
      fullDate: date,
      target_mw: selectedHistoryTarget.target_mw,
      actual_mw: values.count ? Number((values.total / values.count).toFixed(2)) : null,
    })).sort((left, right) => left.fullDate.localeCompare(right.fullDate));
  }, [historyGenData, selectedHistoryTarget]);

  // Overall TOTAL and AVERAGE actual across the period
  const historicalTotalActual = useMemo(() => {
    const validDays = historicalComparisonData.filter(d => d.actual_mw !== null);
    return validDays.length ? validDays.reduce((sum, day) => sum + day.actual_mw, 0) : null;
  }, [historicalComparisonData]);

  const historicalAverageActual = useMemo(() => {
    const validDays = historicalComparisonData.filter(d => d.actual_mw !== null);
    return validDays.length && historicalTotalActual !== null ? historicalTotalActual / validDays.length : null;
  }, [historicalComparisonData, historicalTotalActual]);

  const historicalVariance = useMemo(() => {
    if (historicalTotalActual === null || !selectedHistoryTarget) return null;
    return historicalTotalActual - selectedHistoryTarget.target_mw;
  }, [historicalTotalActual, selectedHistoryTarget]);

  const isHistoricalAchieved = useMemo(() => {
    if (historicalTotalActual === null || !selectedHistoryTarget) return false;
    return historicalTotalActual >= selectedHistoryTarget.target_mw;
  }, [historicalTotalActual, selectedHistoryTarget]);

  // Summary bar chart data (Target vs Actual comparison)
  const pastTargetSummaryChartData = useMemo(() => {
    if (!selectedHistoryTarget) return [];
    return [
      {
        name: 'Target vs Actual',
        Target: selectedHistoryTarget.target_mw,
        Actual: historicalTotalActual !== null ? Number(historicalTotalActual.toFixed(2)) : 0,
      }
    ];
  }, [selectedHistoryTarget, historicalTotalActual]);

  // ── Form Handlers ─────────────────────────────────────────────────────────
  const validateLiveField = (name, value) => {
    let error = '';
    const floatVal = parseFloat(value);

    if (name === 'powerhouse_id' && !value) {
      error = 'Powerhouse selection is required';
    }
    if (name === 'target_mw') {
      if (value === '') {
        error = 'Target load is required';
      } else if (isNaN(floatVal) || floatVal <= 0) {
        error = 'Target MW must be a positive number';
      }
    }
    setLiveFormErrors(prev => ({ ...prev, [name]: error }));
    return error;
  };

  const handleLiveTargetSubmit = async (e) => {
    e.preventDefault();
    const errs = {
      powerhouse_id: validateLiveField('powerhouse_id', liveForm.powerhouse_id),
      target_mw: validateLiveField('target_mw', liveForm.target_mw)
    };
    if (Object.values(errs).some(err => err !== '')) {
      toast.error('Please fix validation errors.');
      return;
    }

    setIsSubmitting(true);
    try {
      const { startDate, endDate } = getMonthDateRange(liveForm.month);
      await api.post('/targets', {
        powerhouse_id: liveForm.powerhouse_id,
        period_type: 'monthly',
        period_start: startDate,
        period_end: endDate,
        target_mw: parseFloat(liveForm.target_mw)
      });

      toast.success('Live monthly target saved successfully!');
      setLiveFormErrors({});
      loadMetadata();
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.message || 'Failed to save live target.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleHistoricalFormSubmit = async (e) => {
    e.preventDefault();
    const targetValue = Number(historyForm.target_mw);
    const errors = {
      powerhouse_id: historyForm.powerhouse_id ? '' : 'Powerhouse is required',
      period_start: historyForm.period_start ? '' : 'Start date is required',
      period_end: historyForm.period_end ? '' : 'End date is required',
      target_mw: !historyForm.target_mw || !Number.isFinite(targetValue) || targetValue <= 0
        ? 'Target MW must be a positive number'
        : '',
    };
    if (historyForm.period_start && historyForm.period_end && historyForm.period_start > historyForm.period_end) {
      errors.period_end = 'End date must be on or after start date';
    }
    setHistoryFormErrors(errors);
    if (Object.values(errors).some(Boolean)) {
      toast.error('Please fix target inputs.');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await api.post('/targets', {
        powerhouse_id: historyForm.powerhouse_id,
        period_type: 'custom',
        period_start: historyForm.period_start,
        period_end: historyForm.period_end,
        target_mw: targetValue,
      });
      const created = response.data?.data || response.data;
      toast.success('Past date-range target saved successfully!');
      setHistoryFormErrors({});
      await loadMetadata();
      if (created?.id) setSelectedHistoryTargetId(created.id);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to save past target.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── History Table Data (Latest 20 Targets) ────────────────────────────────
  const filteredTargetsForTable = useMemo(() => {
    return targets
      .filter(t => {
        const phName = powerhouses.find(ph => ph.id === t.powerhouse_id)?.name || '';
        return phName.toLowerCase().includes(tableSearch.toLowerCase());
      })
      .slice(0, 20);
  }, [targets, powerhouses, tableSearch]);

  const selectedPhLive = useMemo(() => {
    return powerhouses.find(p => p.id === liveForm.powerhouse_id);
  }, [powerhouses, liveForm.powerhouse_id]);

  const selectedPhPast = useMemo(() => {
    return powerhouses.find(p => p.id === selectedHistoryTarget?.powerhouse_id);
  }, [powerhouses, selectedHistoryTarget]);

  return (
    <DashboardLayout title="Targets & Performance Comparison">
      <div className="flex flex-col gap-6">

        {/* ================================================================= */}
        {/* TOP FORMS: Live Monthly Target & Past Date-Range Target Forms     */}
        {/* ================================================================= */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          
          {/* Form 1: Live Monthly Target Input Card */}
          <form onSubmit={handleLiveTargetSubmit} noValidate className="card !p-5 shadow-xl space-y-4">
            <div>
              <div className="flex items-center gap-2.5 mb-1">
                <span className="w-1.5 h-5 bg-[#2F9E9A] rounded-full inline-block" />
                <h2 className="text-sm font-bold tracking-wider text-[#0B2545] uppercase">Live Monthly Target</h2>
              </div>
              <p className="text-xs text-[#143552]">Set a benchmark target (MW) for live daily monitoring.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              <div className="field-group">
                <label className="label" htmlFor="live-ph">Powerhouse *</label>
                <select
                  id="live-ph"
                  value={liveForm.powerhouse_id}
                  onChange={e => {
                    const val = e.target.value;
                    setLiveForm(prev => ({ ...prev, powerhouse_id: val }));
                    validateLiveField('powerhouse_id', val);
                  }}
                  className={`input-field ${liveFormErrors.powerhouse_id ? 'error' : ''}`}
                >
                  {powerhouses.map(ph => (
                    <option key={ph.id} value={ph.id}>{ph.name}</option>
                  ))}
                </select>
                {liveFormErrors.powerhouse_id && <p className="field-error">{liveFormErrors.powerhouse_id}</p>}
              </div>

              <div className="field-group">
                <label className="label" htmlFor="live-month">Month *</label>
                <input
                  id="live-month"
                  type="month"
                  value={liveForm.month}
                  onChange={e => setLiveForm(prev => ({ ...prev, month: e.target.value }))}
                  className="input-field"
                />
              </div>

              <div className="field-group">
                <label className="label" htmlFor="live-target">Target load (MW) *</label>
                <input
                  id="live-target"
                  type="number"
                  step="0.1"
                  min="0"
                  value={liveForm.target_mw}
                  onChange={e => {
                    const val = e.target.value;
                    setLiveForm(prev => ({ ...prev, target_mw: val }));
                    validateLiveField('target_mw', val);
                  }}
                  placeholder="e.g. 15.0"
                  className={`input-field ${liveFormErrors.target_mw ? 'error' : ''}`}
                />
                {liveFormErrors.target_mw && <p className="field-error">{liveFormErrors.target_mw}</p>}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-white/40 pt-3">
              <p className="text-[11px] font-semibold text-secondary">
                {selectedPhLive ? `Capacity: ${selectedPhLive.installed_capacity_mw} MW · Refreshes every minute` : 'Select powerhouse to monitor.'}
              </p>
              <button
                type="submit"
                disabled={isSubmitting || !liveForm.powerhouse_id || !liveForm.target_mw}
                className="btn-primary shrink-0"
              >
                {isSubmitting ? 'Saving…' : 'Save live target'}
              </button>
            </div>
          </form>

          {/* Form 2: Past Date-Range Target Input Card */}
          <form onSubmit={handleHistoricalFormSubmit} noValidate className="card !p-5 shadow-xl space-y-4">
            <div>
              <div className="flex items-center gap-2.5 mb-1">
                <span className="w-1.5 h-5 bg-[#2B6CB0] rounded-full inline-block" />
                <h2 className="text-sm font-bold tracking-wider text-[#0B2545] uppercase">Past Date-Range Target</h2>
              </div>
              <p className="text-xs text-[#143552]">Set a target between two dates to calculate actual vs target variance.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="field-group">
                <label className="label" htmlFor="past-ph">Powerhouse *</label>
                <select
                  id="past-ph"
                  value={historyForm.powerhouse_id}
                  onChange={e => setHistoryForm(prev => ({ ...prev, powerhouse_id: e.target.value }))}
                  className={`input-field ${historyFormErrors.powerhouse_id ? 'error' : ''}`}
                >
                  {powerhouses.map(ph => (
                    <option key={ph.id} value={ph.id}>{ph.name}</option>
                  ))}
                </select>
                {historyFormErrors.powerhouse_id && <p className="field-error">{historyFormErrors.powerhouse_id}</p>}
              </div>

              <div className="field-group">
                <label className="label" htmlFor="past-target">Target (MW) *</label>
                <input
                  id="past-target"
                  type="number"
                  step="0.1"
                  min="0"
                  value={historyForm.target_mw}
                  onChange={e => setHistoryForm(prev => ({ ...prev, target_mw: e.target.value }))}
                  placeholder="e.g. 100"
                  className={`input-field ${historyFormErrors.target_mw ? 'error' : ''}`}
                />
                {historyFormErrors.target_mw && <p className="field-error">{historyFormErrors.target_mw}</p>}
              </div>

              <div className="field-group">
                <label className="label" htmlFor="past-start">Start Date *</label>
                <input
                  id="past-start"
                  type="date"
                  value={historyForm.period_start}
                  onChange={e => setHistoryForm(prev => ({ ...prev, period_start: e.target.value }))}
                  className={`input-field ${historyFormErrors.period_start ? 'error' : ''}`}
                />
                {historyFormErrors.period_start && <p className="field-error">{historyFormErrors.period_start}</p>}
              </div>

              <div className="field-group">
                <label className="label" htmlFor="past-end">End Date *</label>
                <input
                  id="past-end"
                  type="date"
                  value={historyForm.period_end}
                  onChange={e => setHistoryForm(prev => ({ ...prev, period_end: e.target.value }))}
                  className={`input-field ${historyFormErrors.period_end ? 'error' : ''}`}
                />
                {historyFormErrors.period_end && <p className="field-error">{historyFormErrors.period_end}</p>}
              </div>
            </div>

            <div className="flex justify-end border-t border-white/40 pt-3">
              <button
                type="submit"
                disabled={isSubmitting || !historyForm.powerhouse_id || !historyForm.target_mw}
                className="btn-primary"
              >
                {isSubmitting ? 'Saving…' : 'Save past target'}
              </button>
            </div>
          </form>

        </div>

        {/* ================================================================= */}
        {/* SINGLE COMBINED ROW: 75% LIVE LINE CHART + 25% PAST BAR SUMMARY  */}
        {/* ================================================================= */}
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-5 items-stretch">
          
          {/* ───────────────────────────────────────────────────────────── */}
          {/* 75% WIDTH (3 Columns): Live Daily Target Tracking LINE CHART   */}
          {/* ───────────────────────────────────────────────────────────── */}
          <div className="card !p-5 shadow-xl xl:col-span-3 flex flex-col justify-between min-w-0">
            <div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 border-b border-white/40 pb-3">
                <div>
                  <h3 className="text-xs font-extrabold tracking-wider text-[#0B2545] uppercase flex items-center gap-2">
                    <Target size={15} className="text-[#23807F]" /> Live Daily Target Tracking · {selectedPhLive?.name || 'Selected Plant'}
                  </h3>
                  <p className="text-xs text-[#143552] mt-0.5">Real-time daily average station load from Supabase vs target.</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase font-bold bg-[#23807F]/15 text-[#0B3D1E] border border-[#2F9E9A]/40 px-2.5 py-1 rounded-lg tracking-wider flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 bg-[#23807F] rounded-full animate-ping" /> Live
                  </span>
                  <span className="text-[10px] uppercase font-bold bg-white/50 border border-white/70 px-3 py-1 rounded-lg tracking-widest text-[#143552]">
                    {liveForm.month}
                  </span>
                </div>
              </div>

              {loading ? (
                <div className="h-[310px] skeleton rounded" />
              ) : (
                <div className="h-[310px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={dailyPerformanceData} margin={{ left: -14, right: 12, top: 8, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} vertical={false} />
                      <XAxis
                        dataKey="day"
                        interval={Math.max(0, Math.floor(dailyPerformanceData.length / 8) - 1)}
                        tick={{ fontSize: 11, fill: AXIS_TEXT }}
                      />
                      <YAxis tick={{ fontSize: 11, fill: AXIS_TEXT }} width={42} />
                      <Tooltip
                        contentStyle={{ borderRadius: 8, borderColor: '#2F9E9A', backgroundColor: '#E6F4F2' }}
                        labelFormatter={(_, payload) => payload?.[0]?.payload?.date || ''}
                        formatter={(value, name) => [value == null ? 'No reading yet' : `${Number(value).toFixed(2)} MW`, name]}
                      />
                      <Legend wrapperStyle={{ fontSize: 11, color: AXIS_TEXT }} />
                      {/* Line A: Target MW — drawn across entire month */}
                      {selectedLiveTarget && (
                        <Line
                          type="monotone"
                          dataKey="target_mw"
                          name="Target (MW)"
                          stroke="#2B6CB0"
                          strokeWidth={2}
                          strokeDasharray="5 4"
                          dot={false}
                          connectNulls
                        />
                      )}
                      {/* Line B: Daily average station load MW — plotted ONLY up to today */}
                      <Line
                        type="monotone"
                        dataKey="actual_mw"
                        name="Daily average station load (MW)"
                        stroke="#23807F"
                        strokeWidth={2.5}
                        dot={{ r: 3, fill: '#23807F', stroke: '#FFFFFF', strokeWidth: 1 }}
                        connectNulls={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {!selectedLiveTarget && (
              <p className="text-[11px] text-[#143552] mt-2 border-t border-white/30 pt-2">
                ℹ️ No target set for {selectedPhLive?.name} in {liveForm.month}. Set a target above to see the comparison line.
              </p>
            )}
          </div>

          {/* ───────────────────────────────────────────────────────────── */}
          {/* 25% WIDTH (1 Column): Past Target Bar Comparison & Outcome     */}
          {/* ───────────────────────────────────────────────────────────── */}
          <aside className="card !p-5 shadow-xl xl:col-span-1 flex flex-col justify-between min-w-0">
            <div>
              <div className="flex items-center justify-between mb-3 border-b border-white/40 pb-2.5">
                <div>
                  <h3 className="text-xs font-extrabold tracking-wider text-[#0B2545] uppercase">
                    Past Target Outcome
                  </h3>
                  <p className="text-[10px] text-muted">Actual vs Target Comparison</p>
                </div>
              </div>

              {/* Target Selector Dropdown */}
              <div className="mb-3.5">
                <select
                  aria-label="Select saved past target"
                  value={selectedHistoryTargetId}
                  onChange={e => setSelectedHistoryTargetId(e.target.value)}
                  className="input-field !h-8 text-[11px] w-full"
                >
                  {targets.length === 0 ? (
                    <option value="">No saved targets</option>
                  ) : (
                    targets.slice(0, 20).map(target => {
                      const ph = powerhouses.find(p => p.id === target.powerhouse_id);
                      return (
                        <option key={target.id} value={target.id}>
                          {ph?.name || 'Plant'} · {target.period_start} to {target.period_end} · {target.target_mw} MW
                        </option>
                      );
                    })
                  )}
                </select>
              </div>

              {selectedHistoryTarget ? (
                <>
                  {/* Status Badge: Achieved (Green) or Missed (Red) */}
                  <div className="mb-3.5 flex items-center justify-between">
                    <span className="text-[10px] font-bold text-muted uppercase tracking-wider">Status</span>
                    {isHistoricalAchieved ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-extrabold bg-[#DCEFEF] text-[#0B3D1E] border border-[#2F9E9A]/40">
                        <CheckCircle2 size={12} /> Achieved
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-extrabold bg-[#FEE2E2] text-[#5A0F0F] border border-red-300">
                        <XCircle size={12} /> Missed
                      </span>
                    )}
                  </div>

                  {/* 25% Bar Chart Comparison (Target vs Actual MW) */}
                  <div className="h-[120px] w-full mb-3 bg-white/30 rounded-lg p-2 border border-white/50">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={pastTargetSummaryChartData} margin={{ top: 4, right: 4, left: -22, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} vertical={false} />
                        <XAxis dataKey="name" tick={{ fontSize: 9, fill: AXIS_TEXT }} hide />
                        <YAxis tick={{ fontSize: 9, fill: AXIS_TEXT }} width={30} />
                        <Tooltip
                          contentStyle={{ borderRadius: 6, borderColor: '#2F9E9A', backgroundColor: '#E6F4F2', fontSize: 10 }}
                          formatter={(v, n) => [`${Number(v).toFixed(2)} MW`, n]}
                        />
                        <Legend wrapperStyle={{ fontSize: 10, color: AXIS_TEXT, paddingTop: 2 }} />
                        <Bar dataKey="Target" fill="#2B6CB0" fillOpacity={0.75} radius={[3, 3, 0, 0]} />
                        <Bar dataKey="Actual" fill="#23807F" radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Summary Metric Rows */}
                  <dl className="space-y-2 text-xs">
                    <div className="flex justify-between border-b border-white/30 pb-1">
                      <dt className="text-muted text-[10px] uppercase font-bold">Target</dt>
                      <dd className="font-extrabold text-[#0B2545]">{selectedHistoryTarget.target_mw.toFixed(2)} MW</dd>
                    </div>
                    <div className="flex justify-between border-b border-white/30 pb-1">
                      <dt className="text-muted text-[10px] uppercase font-bold">Total Generated</dt>
                      <dd className="font-extrabold text-[#23807F]">
                        {historicalTotalActual === null ? '—' : `${historicalTotalActual.toFixed(2)} MW`}
                      </dd>
                    </div>
                    <div className="flex justify-between border-b border-white/30 pb-1">
                      <dt className="text-muted text-[10px] uppercase font-bold">Daily Average</dt>
                      <dd className="font-semibold text-secondary">
                        {historicalAverageActual === null ? '—' : `${historicalAverageActual.toFixed(2)} MW/day`}
                      </dd>
                    </div>
                    <div className="flex justify-between border-b border-white/30 pb-1">
                      <dt className="text-muted text-[10px] uppercase font-bold">Variance</dt>
                      <dd className={`font-extrabold ${historicalVariance === null ? 'text-[#0B2545]' : historicalVariance >= 0 ? 'text-[#0B3D1E]' : 'text-[#5A0F0F]'}`}>
                        {historicalVariance === null ? '—' : `${historicalVariance >= 0 ? '+' : ''}${historicalVariance.toFixed(2)} MW`}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-muted text-[10px] uppercase font-bold">Days Recorded</dt>
                      <dd className="font-extrabold text-[#0B2545]">{historicalComparisonData.filter(d => d.actual_mw !== null).length} days</dd>
                    </div>
                  </dl>
                </>
              ) : (
                <div className="py-8 text-center text-xs text-[#143552]">
                  Save a past target above to view its comparison outcome.
                </div>
              )}
            </div>
          </aside>

        </div>

        {/* ================================================================= */}
        {/* BOTTOM SECTION: Latest 20 Targets History Table                   */}
        {/* ================================================================= */}
        <div className="card !p-0 shadow-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-white/40 bg-white/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-bold text-[#0B2545] uppercase tracking-wider">
                Latest 20 targets · variance history
              </h3>
              <p className="text-xs text-[#143552] mt-0.5">
                Completed & live targets automatically listed with real-time variance calculations.
              </p>
            </div>

            {/* Table Search bar */}
            <div className="relative">
              <input
                type="text"
                placeholder="Search by powerhouse..."
                value={tableSearch}
                onChange={e => setTableSearch(e.target.value)}
                className="input-field !h-8 bg-white/50 text-[#0B2545] border-white/70 placeholder-[#1B4360]/60 pl-8 pr-3 text-xs"
              />
              <Search size={13} className="text-[#1B4360] absolute left-2.5 top-2.5 pointer-events-none" />
            </div>
          </div>

          <div className="table-scroll-wrap max-h-[420px]">
            <table className="table-aurora">
              <thead>
                <tr>
                  <th>Powerhouse</th>
                  <th>Period</th>
                  <th className="num">Installed (MW)</th>
                  <th className="num">Target (MW)</th>
                  <th className="num">Actual Avg (MW)</th>
                  <th className="num">Variance</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#0B2545]/10">
                {filteredTargetsForTable.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-6 text-[#143552] font-semibold">
                      No saved targets match this search.
                    </td>
                  </tr>
                ) : (
                  filteredTargetsForTable.map(t => {
                    const targetPowerhouse = powerhouses.find(ph => ph.id === t.powerhouse_id);
                    const summary = performance.find(item => item.target_id === t.id);
                    const actualVal = summary?.actual_avg_mw ?? null;
                    const varianceVal = summary?.variance_mw ?? (actualVal === null ? null : actualVal - t.target_mw);
                    const metStatus = varianceVal !== null && varianceVal >= 0;
                    const phName = targetPowerhouse?.name || '—';

                    return (
                      <tr key={t.id}>
                        <td title={phName} className="font-semibold">{phName}</td>
                        <td className="whitespace-nowrap">{t.period_start} to {t.period_end}</td>
                        <td className="num">{Number(targetPowerhouse?.installed_capacity_mw || 0).toFixed(1)} MW</td>
                        <td className="num font-bold text-[#2B6CB0]">{t.target_mw.toFixed(1)} MW</td>
                        <td className="num font-bold text-[#23807F]">{actualVal === null ? '—' : `${actualVal.toFixed(2)} MW`}</td>
                        <td className="num">
                          {varianceVal === null ? '—' : metStatus ? (
                            <span className="text-[#0B3D1E] font-bold flex items-center gap-1 justify-end">
                              <ArrowUpRight size={13} aria-hidden="true" />
                              +{varianceVal.toFixed(2)} MW
                            </span>
                          ) : (
                            <span className="text-[#5A0F0F] font-bold flex items-center gap-1 justify-end">
                              <ArrowDownRight size={13} aria-hidden="true" />
                              {varianceVal.toFixed(2)} MW
                            </span>
                          )}
                        </td>
                        <td>
                          {varianceVal === null ? (
                            <span className="badge-partial">NO DATA</span>
                          ) : metStatus ? (
                            <span className="badge-running">
                              ACHIEVED
                            </span>
                          ) : (
                            <span className="badge-shutdown">
                              MISSED
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </DashboardLayout>
  );
}
