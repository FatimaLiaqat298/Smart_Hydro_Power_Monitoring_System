'use client';
import { useState, useEffect, useMemo, useRef } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import api from '../lib/api';
import toast from 'react-hot-toast';
import {
  Save, Upload, FileSpreadsheet, Zap, HelpCircle,
  CheckCircle, AlertCircle, FileText, ArrowRight, ChevronDown
} from 'lucide-react';

// 6 time slots for inflow AND avg station load
const TIME_SLOTS = ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00'];

const createEmptyFormData = () => ({
  powerhouse_id: '',
  date: new Date().toISOString().split('T')[0],
  // 6 readings per day for both inflow and avg station load
  inflow_readings: Object.fromEntries(TIME_SLOTS.map(slot => [slot, ''])),
  avg_load_readings: Object.fromEntries(TIME_SLOTS.map(slot => [slot, ''])),
  // Once-per-day fields
  max_load_mw: '',
  total_daily_units_kwh: '',
  daily_net_energy_kwh: '',
  tariff_rate_pkr: '',       // user enters tariff; revenue auto-calcs
  avg_annual_design_plant_factor_pct: '',
  expected_generation_gwh: '',
  expected_revenue_pkr: '',
  aux_consumption_kwh: '',
  avg_historical_hydrology: '',
  remarks: '',
});

const fmt = (value, digits = 2) =>
  Number.isFinite(value) ? value.toLocaleString('en-US', { maximumFractionDigits: digits }) : '—';

/* Compute average from a slot-map, ignoring empty strings */
function slotAvg(slotMap) {
  const vals = Object.values(slotMap)
    .filter(v => v !== '')
    .map(Number)
    .filter(n => Number.isFinite(n));
  return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
}

export default function DataEntry() {
  const [powerhouses, setPowerhouses] = useState([]);
  const [activeTab, setActiveTab] = useState('manual');
  const [selectedPhDetails, setSelectedPhDetails] = useState(null);
  const [formData, setFormData] = useState(createEmptyFormData);
  const [formErrors, setFormErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Bulk upload
  const [dragOver, setDragOver] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importSummary, setImportSummary] = useState(null);
  const [uploadedFile, setUploadedFile] = useState(null);
  const fileInputRef = useRef(null);

  // Active dropdown section
  const [activeSection, setActiveSection] = useState('inflow'); // 'inflow' | 'avgload'

  useEffect(() => {
    async function loadPowerhouses() {
      try {
        const res = await api.get('/powerhouses');
        setPowerhouses(Array.isArray(res.data) ? res.data : (res.data?.data || []));
      } catch (err) { console.error('Failed to load powerhouses:', err); }
    }
    loadPowerhouses();
  }, []);

  const handlePowerhouseChange = (phId) => {
    const ph = powerhouses.find(p => p.id === phId);
    setFormData(prev => ({
      ...prev,
      powerhouse_id: phId,
      tariff_rate_pkr: ph?.tariff_rate != null ? String(ph.tariff_rate) : '',
      avg_annual_design_plant_factor_pct: ph?.avg_annual_design_plant_factor_pct != null
        ? String(ph.avg_annual_design_plant_factor_pct)
        : '',
    }));
    setSelectedPhDetails(ph || null);
    setFormErrors(prev => ({ ...prev, powerhouse_id: '' }));
  };

  // Computed averages
  const avgInflow = useMemo(() => slotAvg(formData.inflow_readings), [formData.inflow_readings]);
  const avgLoad = useMemo(() => slotAvg(formData.avg_load_readings), [formData.avg_load_readings]);

  // Auto-calculated revenue (tariff × net energy)
  const autoRevenue = useMemo(() => {
    const tariff = parseFloat(formData.tariff_rate_pkr);
    const net = parseFloat(formData.daily_net_energy_kwh);
    return Number.isFinite(tariff) && Number.isFinite(net) && tariff >= 0 && net >= 0
      ? tariff * net
      : null;
  }, [formData.tariff_rate_pkr, formData.daily_net_energy_kwh]);

  // Other derived metrics (from powerhouse tariff if not manually entered)
  const derivedMetrics = useMemo(() => {
    const capacity = Number(selectedPhDetails?.installed_capacity_mw);
    const phTariff = selectedPhDetails ? Number(selectedPhDetails.tariff_rate ?? 5) : NaN;
    const effectiveTariff = formData.tariff_rate_pkr !== ''
      ? parseFloat(formData.tariff_rate_pkr)
      : phTariff;
    const total = Number(formData.total_daily_units_kwh);
    const net = Number(formData.daily_net_energy_kwh);
    const validTotal = formData.total_daily_units_kwh !== '' && Number.isFinite(total);
    const validNet = formData.daily_net_energy_kwh !== '' && Number.isFinite(net);
    const designFactor = formData.avg_annual_design_plant_factor_pct !== ''
      ? parseFloat(formData.avg_annual_design_plant_factor_pct)
      : Number(selectedPhDetails?.avg_annual_design_plant_factor_pct);
    const expectedGen = formData.expected_generation_gwh !== ''
      ? parseFloat(formData.expected_generation_gwh)
      : null;
    const expectedRevenue = formData.expected_revenue_pkr !== ''
      ? parseFloat(formData.expected_revenue_pkr)
      : expectedGen !== null && Number.isFinite(effectiveTariff)
        ? expectedGen * 1000000 * effectiveTariff : null;
    return {
      dailyPlantFactor: validTotal && capacity > 0 ? (total / (capacity * 1000 * 24)) * 100 : null,
      tariff: effectiveTariff,
      designFactor,
      expectedGeneration: expectedGen,
      expectedRevenue,
      actualRevenue: autoRevenue,
      revenueDifference: expectedRevenue !== null && autoRevenue !== null
        ? expectedRevenue - autoRevenue : null,
    };
  }, [selectedPhDetails, formData.total_daily_units_kwh, formData.daily_net_energy_kwh,
    formData.tariff_rate_pkr, formData.avg_annual_design_plant_factor_pct,
    formData.expected_generation_gwh, autoRevenue]);

  // ── Submit ──────────────────────────────────────────────────────────────
  const handleManualSubmit = async (e) => {
    e.preventDefault();

    if (!formData.powerhouse_id) { toast.error('Please select a powerhouse.'); return; }

    // Build inflow array
    const inflowReadings = TIME_SLOTS
      .filter(slot => formData.inflow_readings[slot] !== '')
      .map(slot => ({ time_slot: slot, inflow_cumecs: Number(formData.inflow_readings[slot]) }));
    if (!inflowReadings.length) {
      toast.error('Enter at least one inflow reading.'); return;
    }

    // Build avg station load — compute average from 6 readings
    if (avgLoad === null) {
      toast.error('Enter at least one Avg Station Load reading.'); return;
    }

    if (!formData.total_daily_units_kwh || !formData.daily_net_energy_kwh) {
      toast.error('Total Daily Units and Daily Net Energy are required.'); return;
    }

    const totalUnits = Number(formData.total_daily_units_kwh);
    const netEnergy = Number(formData.daily_net_energy_kwh);
    const auxiliary = formData.aux_consumption_kwh === '' ? null : Number(formData.aux_consumption_kwh);

    if (netEnergy > totalUnits) {
      toast.error('Net energy cannot exceed total daily units.'); return;
    }

    setIsSubmitting(true);
    try {
      await api.post('/generation', {
        powerhouse_id: formData.powerhouse_id,
        reading_date: formData.date,
        avg_station_load_mw: Number(avgLoad.toFixed(4)),
        max_station_load_mw: formData.max_load_mw === '' ? null : Number(formData.max_load_mw),
        inflow_readings: inflowReadings,
        actual_avg_inflow_cumecs: avgInflow !== null ? Number(avgInflow.toFixed(4)) : null,
        avg_historical_hydrology: formData.avg_historical_hydrology === '' ? null : Number(formData.avg_historical_hydrology),
        total_daily_units_kwh: totalUnits,
        daily_net_energy_kwh: netEnergy,
        tariff_rate: formData.tariff_rate_pkr === '' ? null : Number(formData.tariff_rate_pkr),
        avg_annual_design_plant_factor_pct: formData.avg_annual_design_plant_factor_pct === ''
          ? null : Number(formData.avg_annual_design_plant_factor_pct),
        expected_generation_gwh: formData.expected_generation_gwh === ''
          ? null : Number(formData.expected_generation_gwh),
        expected_revenue_pkr: formData.expected_revenue_pkr === ''
          ? null : Number(formData.expected_revenue_pkr),
        aux_consumption_kwh: auxiliary,
        remarks: formData.remarks.trim() || null,
      });
      toast.success('Daily record saved successfully!');
      setFormData(createEmptyFormData());
      setSelectedPhDetails(null);
      setFormErrors({});
    } catch (err) {
      console.error(err);
      const rd = err.response?.data;
      const msg = Array.isArray(rd?.errors)
        ? rd.errors.map(i => `${i.field}: ${i.message}`).join(', ')
        : (rd?.detail || rd?.message || 'Failed to register data record.');
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Bulk Upload ──────────────────────────────────────────────────────────
  const parseUploadedFile = (file) => { setUploadedFile(file); setImportSummary(null); };
  const handleDragOver = (e) => { e.preventDefault(); setDragOver(true); };
  const handleDragLeave = () => setDragOver(false);
  const handleDrop = (e) => {
    e.preventDefault(); setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && /\.(xlsx|csv)$/i.test(file.name)) parseUploadedFile(file);
    else toast.error('Only .xlsx or .csv files are supported.');
  };
  const handleFileChange = (e) => {
    const file = e.target.files[0]; e.target.value = '';
    if (file) parseUploadedFile(file);
  };
  const handleBulkImport = async () => {
    if (!uploadedFile) return;
    setIsImporting(true); toast.loading('Uploading and processing file...');
    try {
      const fd = new FormData(); fd.append('file', uploadedFile);
      const res = await api.post('/generation/bulk-import', fd);
      toast.dismiss();
      const result = res.data?.data || res.data;
      setImportSummary(result);
      toast.success(`Imported ${result.rows_imported} of ${result.rows_total} rows; ${result.rows_rejected} rejected.`);
      setUploadedFile(null);
    } catch (err) {
      toast.dismiss(); console.error(err);
      toast.error(err.response?.data?.detail || 'Bulk upload processing failed.');
    } finally { setIsImporting(false); }
  };

  const isSubmitDisabled = useMemo(() => {
    const hasInflowEntry = TIME_SLOTS.some(s => formData.inflow_readings[s] !== '');
    const hasLoadEntry = TIME_SLOTS.some(s => formData.avg_load_readings[s] !== '');
    return !formData.powerhouse_id || !hasInflowEntry || !hasLoadEntry ||
      !formData.total_daily_units_kwh || !formData.daily_net_energy_kwh;
  }, [formData]);

  // ── Slot input component ──────────────────────────────────────────────────
  const SlotGrid = ({ label, unit, slotKey, colorClass }) => (
    <div className="sm:col-span-2">
      <div
        className="flex items-center justify-between cursor-pointer mb-3 select-none"
        onClick={() => setActiveSection(prev => prev === slotKey ? '' : slotKey)}
      >
        <span className={`label mb-0 flex items-center gap-1.5 ${colorClass}`}>
          {label} <span className="font-normal text-muted">({unit})</span>
          <span className="text-[10px] font-bold bg-pedo-primary/15 px-1.5 py-0.5 rounded text-pedo-accent ml-1">
            6 readings / day
          </span>
        </span>
        <ChevronDown
          size={14}
          className={`text-muted transition-transform ${activeSection === slotKey ? 'rotate-180' : ''}`}
        />
      </div>

      {activeSection === slotKey && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {TIME_SLOTS.map(slot => (
            <div key={slot}>
              <label className="label text-[10px]">{slot}</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={slotKey === 'inflow'
                  ? formData.inflow_readings[slot]
                  : formData.avg_load_readings[slot]}
                onChange={ev => {
                  const val = ev.target.value;
                  if (slotKey === 'inflow') {
                    setFormData(p => ({ ...p, inflow_readings: { ...p.inflow_readings, [slot]: val } }));
                  } else {
                    setFormData(p => ({ ...p, avg_load_readings: { ...p.avg_load_readings, [slot]: val } }));
                  }
                }}
                placeholder={unit}
                className="input-field"
              />
            </div>
          ))}
        </div>
      )}

      {/* Live average pill */}
      <div className={`mt-2 text-xs font-semibold ${colorClass}`}>
        {slotKey === 'inflow'
          ? `Daily average: ${avgInflow === null ? '—' : fmt(avgInflow, 3)} cumecs`
          : `Daily average: ${avgLoad === null ? '—' : fmt(avgLoad, 3)} MW`}
      </div>
    </div>
  );

  return (
    <DashboardLayout title="Data Entry & Bulk Import">
      <div className="flex flex-col gap-6">

        {/* ───── HEADER ───── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <p className="text-xs text-muted font-bold uppercase tracking-widest">Station Submissions</p>
            <h2 className="text-xl font-extrabold text-navy mt-1">Hydrology & Grid Units</h2>
          </div>
          <div className="flex gap-1.5 bg-hull border border-subtle rounded-lg p-1" role="tablist">
            {['manual', 'bulk'].map(tab => (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={activeTab === tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 rounded-md text-xs font-bold transition-all uppercase tracking-wider ${
                  activeTab === tab
                    ? 'bg-pedo-primary text-white font-extrabold shadow-md glow-primary'
                    : 'text-navy-muted hover:text-navy'
                }`}
              >
                {tab === 'manual' ? 'Manual entry' : 'Bulk Import'}
              </button>
            ))}
          </div>
        </div>

        {/* ───── TAB 1: MANUAL ENTRY ───── */}
        {activeTab === 'manual' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">

            {/* ── Left 2-col: Main Form ── */}
            <div className="lg:col-span-2 bg-card border border-subtle rounded-xl shadow-2xl p-6 sm:p-8">
              <h3 className="text-sm font-bold text-pedo-accent uppercase tracking-wider mb-6 flex items-center gap-2">
                <FileText size={16} />
                Daily Hydrological & Generation Log
              </h3>

              <form onSubmit={handleManualSubmit} noValidate className="space-y-6">

                {/* ── Row 1: Powerhouse + Date ── */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div className="field-group">
                    <label className="label" htmlFor="de-ph">Target Powerhouse *</label>
                    <select
                      id="de-ph"
                      value={formData.powerhouse_id}
                      onChange={e => handlePowerhouseChange(e.target.value)}
                      className={`input-field ${formErrors.powerhouse_id ? 'error' : ''}`}
                    >
                      <option value="">Select Powerhouse</option>
                      {powerhouses.map(ph => (
                        <option key={ph.id} value={ph.id}>{ph.name}</option>
                      ))}
                    </select>
                    {formErrors.powerhouse_id && <p className="field-error">{formErrors.powerhouse_id}</p>}
                  </div>

                  <div className="field-group">
                    <label className="label" htmlFor="de-date">Reading Date *</label>
                    <input
                      id="de-date"
                      type="date"
                      name="date"
                      value={formData.date}
                      onChange={e => setFormData(p => ({ ...p, date: e.target.value }))}
                      max={new Date().toISOString().split('T')[0]}
                      className="input-field"
                    />
                  </div>
                </div>

                {/* ── Section divider: 6-reading fields ── */}
                <div className="border border-subtle rounded-xl p-4 space-y-5 bg-hull/40">
                  <p className="text-[11px] font-extrabold text-pedo-accent uppercase tracking-widest">
                    ⚡ Intraday Readings — 6 entries per day
                  </p>

                  {/* INFLOW readings */}
                  <SlotGrid
                    label="Inflow Readings"
                    unit="Cumecs"
                    slotKey="inflow"
                    colorClass="text-sky-600"
                  />

                  {/* AVG STATION LOAD readings */}
                  <SlotGrid
                    label="Avg Station Load"
                    unit="MW"
                    slotKey="avgload"
                    colorClass="text-pedo-accent"
                  />
                </div>

                {/* ── Once-per-day fields ── */}
                <div className="border border-subtle rounded-xl p-4 space-y-5 bg-hull/30">
                  <p className="text-[11px] font-extrabold text-pedo-accent uppercase tracking-widest">
                    📋 Once-Per-Day Readings
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">

                    {/* Max Station Load */}
                    <div className="field-group">
                      <label className="label" htmlFor="de-max-load">Max Station Load (MW)</label>
                      <input
                        id="de-max-load"
                        type="number"
                        step="0.01"
                        min="0"
                        name="max_load_mw"
                        value={formData.max_load_mw}
                        onChange={e => setFormData(p => ({ ...p, max_load_mw: e.target.value }))}
                        placeholder="e.g. 11.86"
                        className="input-field"
                      />
                    </div>

                    {/* Total Daily Units */}
                    <div className="field-group">
                      <label className="label" htmlFor="de-units">Total Daily Units (kWh) *</label>
                      <input
                        id="de-units"
                        type="number"
                        min="0"
                        name="total_daily_units_kwh"
                        value={formData.total_daily_units_kwh}
                        onChange={e => setFormData(p => ({ ...p, total_daily_units_kwh: e.target.value }))}
                        placeholder="e.g. 259301"
                        className={`input-field ${formErrors.total_daily_units_kwh ? 'error' : ''}`}
                      />
                      {formErrors.total_daily_units_kwh && <p className="field-error">{formErrors.total_daily_units_kwh}</p>}
                    </div>

                    {/* Daily Net Energy */}
                    <div className="field-group">
                      <label className="label" htmlFor="de-net">Daily Net Electricity (kWh) *</label>
                      <input
                        id="de-net"
                        type="number"
                        min="0"
                        name="daily_net_energy_kwh"
                        value={formData.daily_net_energy_kwh}
                        onChange={e => setFormData(p => ({ ...p, daily_net_energy_kwh: e.target.value }))}
                        placeholder="e.g. 257279"
                        className={`input-field ${formErrors.daily_net_energy_kwh ? 'error' : ''}`}
                      />
                      {formErrors.daily_net_energy_kwh && <p className="field-error">{formErrors.daily_net_energy_kwh}</p>}
                    </div>

                    {/* Tariff Rate — user enters, revenue auto-calculates */}
                    <div className="field-group">
                      <label className="label" htmlFor="de-tariff">
                        Tariff Rate (PKR/kWh)
                        <span className="ml-1 text-[9px] text-pedo-accent font-bold uppercase">
                          → Revenue auto-calculated
                        </span>
                      </label>
                      <input
                        id="de-tariff"
                        type="number"
                        step="0.0001"
                        min="0"
                        name="tariff_rate_pkr"
                        value={formData.tariff_rate_pkr}
                        onChange={e => setFormData(p => ({ ...p, tariff_rate_pkr: e.target.value }))}
                        placeholder={selectedPhDetails?.tariff_rate
                          ? `Plant default: ${selectedPhDetails.tariff_rate}`
                          : 'e.g. 5.2000'}
                        className="input-field"
                      />
                    </div>

                    <div className="field-group">
                      <label className="label" htmlFor="de-design-factor">Avg Annual Design Plant Factor (%)</label>
                      <input
                        id="de-design-factor"
                        type="number"
                        step="0.01"
                        min="0"
                        max="100"
                        value={formData.avg_annual_design_plant_factor_pct}
                        onChange={e => setFormData(p => ({ ...p, avg_annual_design_plant_factor_pct: e.target.value }))}
                        placeholder="Enter design plant factor"
                        className="input-field"
                      />
                    </div>

                    <div className="field-group">
                      <label className="label" htmlFor="de-expected-generation">Expected Generation (GWh)</label>
                      <input
                        id="de-expected-generation"
                        type="number"
                        step="0.0001"
                        min="0"
                        value={formData.expected_generation_gwh}
                        onChange={e => setFormData(p => ({ ...p, expected_generation_gwh: e.target.value }))}
                        placeholder="Enter expected generation"
                        className="input-field"
                      />
                    </div>

                    <div className="field-group">
                      <label className="label" htmlFor="de-expected-revenue">Expected Revenue (PKR)</label>
                      <input
                        id="de-expected-revenue"
                        type="number"
                        step="0.01"
                        min="0"
                        value={formData.expected_revenue_pkr}
                        onChange={e => setFormData(p => ({ ...p, expected_revenue_pkr: e.target.value }))}
                        placeholder="Enter expected revenue"
                        className="input-field"
                      />
                    </div>

                    {/* Auto-calculated Revenue — read-only display */}
                    <div className="field-group">
                      <label className="label">Actual Revenue (PKR) — Auto-Calculated</label>
                      <div className={`input-field cursor-not-allowed text-sm font-bold flex items-center
                        ${autoRevenue !== null ? 'text-emerald-700' : 'text-muted'}`}>
                        {autoRevenue !== null
                          ? `PKR ${fmt(autoRevenue, 0)}`
                          : 'Enter Tariff + Net Energy above'}
                      </div>
                    </div>

                    {/* Auxiliary Consumption */}
                    <div className="field-group">
                      <label className="label" htmlFor="de-aux">Auxiliary Consumption (kWh)</label>
                      <input
                        id="de-aux"
                        type="number"
                        step="0.01"
                        min="0"
                        name="aux_consumption_kwh"
                        value={formData.aux_consumption_kwh}
                        onChange={e => setFormData(p => ({ ...p, aux_consumption_kwh: e.target.value }))}
                        placeholder="Derived from total and net if blank"
                        className="input-field"
                      />
                    </div>

                    {/* Avg Historical Hydrology */}
                    <div className="field-group">
                      <label className="label" htmlFor="de-historical">Avg Historical Hydrology (CFS)</label>
                      <input
                        id="de-historical"
                        type="number"
                        step="0.01"
                        min="0"
                        name="avg_historical_hydrology"
                        value={formData.avg_historical_hydrology}
                        onChange={e => setFormData(p => ({ ...p, avg_historical_hydrology: e.target.value }))}
                        placeholder="Hydrology value"
                        className="input-field"
                      />
                    </div>
                  </div>

                  {/* Calculated Metrics Panel */}
                  <div className="bg-hull border border-subtle rounded-lg p-4">
                    <h4 className="text-xs font-extrabold text-secondary uppercase tracking-wider mb-3">
                      Calculated Daily Metrics
                    </h4>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3 text-xs">
                      <div>
                        <span className="block text-muted">Daily Actual Plant Factor</span>
                        <b className="text-navy">{fmt(derivedMetrics.dailyPlantFactor)}%</b>
                      </div>
                      <div>
                        <span className="block text-muted">Tariff Rate</span>
                        <b className="text-navy">{fmt(derivedMetrics.tariff, 4)} PKR/kWh</b>
                      </div>
                      <div>
                        <span className="block text-muted">Avg Annual Design Plant Factor</span>
                        <b className="text-navy">{fmt(derivedMetrics.designFactor)}%</b>
                      </div>
                      <div>
                        <span className="block text-muted">Expected Generation</span>
                        <b className="text-navy">{fmt(derivedMetrics.expectedGeneration, 4)} GWh</b>
                      </div>
                      <div>
                        <span className="block text-muted">Expected Revenue</span>
                        <b className="text-navy">{fmt(derivedMetrics.expectedRevenue)} PKR</b>
                      </div>
                      <div>
                        <span className="block text-muted">Actual Revenue</span>
                        <b className="text-emerald-700">{autoRevenue !== null ? `PKR ${fmt(autoRevenue, 0)}` : '—'}</b>
                      </div>
                      <div>
                        <span className="block text-muted">Revenue Difference</span>
                        <b className="text-navy">{fmt(derivedMetrics.revenueDifference)} PKR</b>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Remarks */}
                <div className="field-group">
                  <label className="label" htmlFor="de-remarks">Remarks / Maintenance Outages</label>
                  <textarea
                    id="de-remarks"
                    name="remarks"
                    rows={3}
                    value={formData.remarks}
                    onChange={e => setFormData(p => ({ ...p, remarks: e.target.value }))}
                    placeholder="Document structural defects, system shut-downs, or efficiency deviations..."
                    className="input-field"
                  />
                </div>

                {/* Submit */}
                <div className="flex justify-end pt-3 border-t border-subtle">
                  <button
                    type="submit"
                    disabled={isSubmitting || isSubmitDisabled}
                    className="btn-primary flex items-center gap-2"
                  >
                    <Save size={14} />
                    {isSubmitting ? 'Saving Record...' : 'Save Record'}
                  </button>
                </div>
              </form>
            </div>

            {/* ── Right 1-col: Plant Limits Card ── */}
            <div className="bg-card border border-subtle rounded-xl shadow-2xl p-6">
              <h3 className="text-xs font-bold text-pedo-accent uppercase tracking-wider mb-4 flex items-center gap-1.5">
                <Zap size={14} className="text-pedo-accent" />
                Plant Limits & Bounds
              </h3>

              {!selectedPhDetails ? (
                <div className="bg-hull p-4 rounded-xl border border-subtle text-center py-10">
                  <HelpCircle size={32} className="text-navy-muted mx-auto mb-2.5" />
                  <p className="text-xs text-muted font-semibold leading-relaxed">
                    Select a target powerhouse on the left to review operational constraints.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="bg-hull p-4 rounded-lg border border-subtle text-center">
                    <span className="text-[10px] font-bold text-navy-muted uppercase tracking-widest">Selected asset</span>
                    <h4 className="text-sm font-extrabold text-navy mt-1 uppercase tracking-wide truncate">
                      {selectedPhDetails.name}
                    </h4>
                  </div>
                  <div className="bg-hull p-4 rounded-lg border border-subtle space-y-3 text-xs">
                    <div className="flex justify-between border-b border-subtle pb-2">
                      <span className="text-navy-muted font-medium">Installed Capacity:</span>
                      <span className="text-pedo-accent font-black">{selectedPhDetails.installed_capacity_mw} MW</span>
                    </div>
                    <div className="flex justify-between border-b border-subtle pb-2">
                      <span className="text-navy-muted font-medium">Design Discharge:</span>
                      <span className="text-navy font-bold">{selectedPhDetails.design_discharge_cumecs || '—'} Cumecs</span>
                    </div>
                    <div className="flex justify-between border-b border-subtle pb-2">
                      <span className="text-navy-muted font-medium">Tariff Rate:</span>
                      <span className="text-navy font-bold">{selectedPhDetails.tariff_rate || '—'} PKR/kWh</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-navy-muted font-medium">District:</span>
                      <span className="text-navy font-semibold truncate max-w-[120px]">{selectedPhDetails.district || '—'}</span>
                    </div>
                  </div>

                  {/* Quick summary of today's entered data */}
                  {(avgLoad !== null || avgInflow !== null) && (
                    <div className="bg-pedo-primary/10 border border-pedo-primary/40 rounded-lg p-3 space-y-1.5">
                      <h5 className="text-[10px] font-extrabold text-pedo-accent uppercase tracking-wider">Live Entry Summary</h5>
                      {avgInflow !== null && (
                        <p className="text-xs text-navy">Avg Inflow: <b>{fmt(avgInflow, 3)} cumecs</b></p>
                      )}
                      {avgLoad !== null && (
                        <p className="text-xs text-navy">Avg Load: <b>{fmt(avgLoad, 3)} MW</b></p>
                      )}
                      {autoRevenue !== null && (
                        <p className="text-xs text-emerald-700">Revenue: <b>PKR {fmt(autoRevenue, 0)}</b></p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ───── TAB 2: BULK IMPORT ───── */}
        {activeTab === 'bulk' && (
          <div className="space-y-6">
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`bg-card border-2 border-dashed ${
                dragOver ? 'border-pedo-accent bg-pedo-accent/20' : 'border-subtle hover:border-pedo-accent/50'
              } rounded-2xl flex flex-col items-center justify-center py-12 px-6 transition-all duration-200 cursor-pointer relative shadow-xl`}
              onClick={() => fileInputRef.current?.click()}
            >
              <input ref={fileInputRef} type="file" className="hidden" accept=".xlsx,.csv" onChange={handleFileChange} />
              <FileSpreadsheet size={44} className="text-pedo-accent mb-3.5 glow-cyan" />
              <h3 className="text-base font-bold text-navy mb-1.5 uppercase tracking-wide">Upload Excel or CSV File</h3>
              <p className="text-xs text-muted text-center max-w-sm mb-5 leading-relaxed">
                Drag and drop your spreadsheet file here, or click to browse. Supported formats: .xlsx, .csv
              </p>
              <span className="bg-hull border border-subtle text-pedo-accent text-[10px] font-bold px-3 py-1.5 rounded-lg uppercase tracking-wider">
                Select from local storage
              </span>
            </div>

            {uploadedFile && (
              <div className="bg-card border border-subtle rounded-xl p-4 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <FileSpreadsheet size={20} className="text-pedo-accent shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-navy truncate">{uploadedFile.name}</p>
                    <p className="text-xs text-muted">{(uploadedFile.size / 1024).toFixed(1)} KB · Ready to import</p>
                  </div>
                </div>
                <button type="button" onClick={handleBulkImport} disabled={isImporting} className="btn-primary shrink-0 flex items-center gap-2">
                  <Upload size={14} />
                  {isImporting ? 'Importing...' : 'Process Import'}
                  {!isImporting && <ArrowRight size={14} />}
                </button>
              </div>
            )}

            {importSummary && (
              <div className="bg-card border border-subtle rounded-xl p-5 shadow-xl">
                <h3 className="text-sm font-bold text-navy mb-3">Import Results · {importSummary.file_name}</h3>
                <div className="grid grid-cols-3 gap-3 text-xs mb-4">
                  <div className="bg-hull rounded-lg p-3"><span className="block text-muted">Rows in file</span><b className="text-navy">{importSummary.rows_total}</b></div>
                  <div className="bg-hull rounded-lg p-3"><span className="block text-muted">Imported</span><b className="text-emerald-700">{importSummary.rows_imported}</b></div>
                  <div className="bg-hull rounded-lg p-3"><span className="block text-muted">Rejected</span><b className="text-red-700">{importSummary.rows_rejected}</b></div>
                </div>
                {importSummary.errors?.length > 0 && (
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {importSummary.errors.map((item, index) => (
                      <p key={index} className="text-xs text-red-700 flex gap-2">
                        <AlertCircle size={14} className="shrink-0" />
                        <span>{item.row ? `Row ${item.row}: ` : ''}{item.error}</span>
                      </p>
                    ))}
                  </div>
                )}
                {importSummary.rows_imported > 0 && importSummary.rows_rejected === 0 && (
                  <p className="text-xs text-emerald-700 flex items-center gap-2">
                    <CheckCircle size={14} /> All rows imported successfully.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

      </div>
    </DashboardLayout>
  );
}
