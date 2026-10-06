'use client';
import { useState, useEffect, useMemo } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import api from '../lib/api';
import toast from 'react-hot-toast';
import { 
  FileDown, Calendar, AlertTriangle, Droplet, 
  TrendingUp, Sparkles, ShieldAlert, CheckSquare,
  Clock, Bell, DollarSign, Filter, RefreshCw
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const fmt = (num, digits = 2) => 
  Number.isFinite(num) ? num.toLocaleString('en-US', { maximumFractionDigits: digits }) : '—';

export default function Reports() {
  const [startDate, setStartDate] = useState('2026-09-01');
  const [endDate, setEndDate] = useState('2026-09-10');
  const [selectedPowerhouseId, setSelectedPowerhouseId] = useState('');
  const [powerhouses, setPowerhouses] = useState([]);
  const [report, setReport] = useState(null);
  const [rawRecords, setRawRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [autoReportEnabled, setAutoReportEnabled] = useState(true);

  // Load powerhouses on mount
  useEffect(() => {
    async function loadPH() {
      try {
        const res = await api.get('/powerhouses');
        const arr = Array.isArray(res.data) ? res.data : (res.data?.data || []);
        setPowerhouses(arr);
      } catch (err) {
        console.error('Failed to load powerhouses list:', err);
      }
    }
    loadPH();
  }, []);

  // Summary message for date range
  const dateDifferenceSummary = useMemo(() => {
    if (!startDate || !endDate) return '';
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = Math.abs(end - start);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    if (isNaN(diffDays)) return '';

    const opts = { month: 'short', day: 'numeric', year: 'numeric' };
    return `Analyzing ${diffDays} days of hydro readings from ${start.toLocaleDateString('en-US', opts)} to ${end.toLocaleDateString('en-US', opts)}.`;
  }, [startDate, endDate]);

  // ── Compile Report from DB ────────────────────────────────────────────────
  const generateReport = async () => {
    if (!startDate || !endDate) {
      toast.error('Please select both start and end dates');
      return;
    }

    setLoading(true);
    try {
      const params = {
        date_from: startDate,
        date_to: endDate,
        page_size: 1000
      };
      if (selectedPowerhouseId) {
        params.powerhouse_id = selectedPowerhouseId;
      }

      const res = await api.get('/generation', { params });
      const data = Array.isArray(res.data) ? res.data : (res.data?.data || []);

      if (data.length === 0) {
        toast.error('No generation records found for the selected date range.');
        setReport(null);
        setRawRecords([]);
        return;
      }

      setRawRecords(data);

      // Aggregate by powerhouse
      const phMap = {};
      let totalKWh = 0;
      let totalNetKWh = 0;
      let totalRevenuePKR = 0;
      let totalInflowSum = 0;
      let totalInflowCount = 0;
      let shutdownEvents = 0;
      let partialEvents = 0;

      data.forEach(r => {
        const phName = r.powerhouse_name || r.powerhouses?.name || 'Unknown';
        const capacity = Number(r.powerhouses?.installed_capacity_mw || r.installed_capacity_mw || 0);
        const units = Number(r.total_daily_units_kwh || 0);
        const net = Number(r.daily_net_energy_kwh || 0);
        const load = Number(r.avg_station_load_mw || 0);
        const maxLoad = Number(r.max_station_load_mw || 0);
        const inflow = Number(r.actual_avg_inflow_cumecs || 0);
        const tariff = Number(r.tariff_rate || 5);
        const revenue = Number(r.actual_revenue_pkr || (net * tariff));

        totalKWh += units;
        totalNetKWh += net;
        totalRevenuePKR += revenue;

        if (inflow > 0) {
          totalInflowSum += inflow;
          totalInflowCount += 1;
        }

        if (capacity > 0) {
          const loadPct = (load / capacity) * 100;
          if (loadPct < 10) shutdownEvents += 1;
          else if (loadPct < 70) partialEvents += 1;
        }

        if (!phMap[phName]) {
          phMap[phName] = {
            name: phName,
            capacity: capacity,
            count: 0,
            loadSum: 0,
            maxLoadMax: 0,
            unitsSum: 0,
            netSum: 0,
            inflowSum: 0,
            revenueSum: 0,
            shutdowns: 0,
            partials: 0
          };
        }

        const ph = phMap[phName];
        ph.count += 1;
        ph.loadSum += load;
        ph.maxLoadMax = Math.max(ph.maxLoadMax, maxLoad);
        ph.unitsSum += units;
        ph.netSum += net;
        ph.inflowSum += inflow;
        ph.revenueSum += revenue;

        if (capacity > 0) {
          const loadPct = (load / capacity) * 100;
          if (loadPct < 10) ph.shutdowns += 1;
          else if (loadPct < 70) ph.partials += 1;
        }
      });

      const powerhouseList = Object.values(phMap).map(ph => {
        const avgLoad = ph.count > 0 ? ph.loadSum / ph.count : 0;
        const avgInflow = ph.count > 0 ? ph.inflowSum / ph.count : 0;
        const capacityFactor = ph.capacity > 0 ? (avgLoad / ph.capacity) * 100 : 0;
        return {
          ...ph,
          avg_load: avgLoad,
          avg_inflow: avgInflow,
          capacity_factor: capacityFactor
        };
      });

      const best = [...powerhouseList].sort((a, b) => b.unitsSum - a.unitsSum)[0]?.name || '—';
      const worst = [...powerhouseList].sort((a, b) => a.unitsSum - b.unitsSum)[0]?.name || '—';

      setReport({
        period: { startDate, endDate },
        totalKWh,
        totalNetKWh,
        totalRevenuePKR,
        avgInflow: totalInflowCount > 0 ? totalInflowSum / totalInflowCount : 0,
        shutdownEvents,
        partialEvents,
        bestPerformer: best,
        worstPerformer: worst,
        powerhouse_summary: powerhouseList
      });

      toast.success(`Fetched ${data.length} records from database across ${powerhouseList.length} powerhouse(s)!`);
    } catch (err) {
      console.error(err);
      const msg = err?.response?.data?.message || err?.response?.data?.detail || 'Failed to fetch report data from database.';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  // ── Download Comprehensive PDF Audit Report ──────────────────────────────
  const downloadPDF = () => {
    if (!report || rawRecords.length === 0) return;

    try {
      const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4'
      });

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 14;

      // ── PAGE 1: EXECUTIVE SUMMARY & POWERHOUSE BREAKDOWN ──
      // Top Navy Header Bar
      doc.setFillColor(11, 37, 69); // #0B2545
      doc.rect(0, 0, pageWidth, 28, 'F');
      
      // Cyan accent line
      doc.setFillColor(47, 158, 154); // #2F9E9A
      doc.rect(0, 28, pageWidth, 2, 'F');

      // Title & Branding
      doc.setTextColor(255, 255, 255);
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(14);
      doc.text('PAKHTUNKHWA ENERGY DEVELOPMENT ORGANIZATION (PEDO)', margin, 12);

      doc.setFontSize(10);
      doc.setFont('Helvetica', 'normal');
      doc.setTextColor(47, 158, 154);
      doc.text('Smart Hydro Power Monitoring & Forecasting System (SHPMFS)', margin, 18);

      doc.setTextColor(200, 210, 225);
      doc.setFontSize(8);
      doc.text(`AUDIT PERIOD: ${report.period.startDate} to ${report.period.endDate}   |   GENERATED: ${new Date().toLocaleString()}`, margin, 24);

      // Section 1: Executive Key Metrics Cards
      let currentY = 36;
      doc.setTextColor(11, 37, 69);
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(11);
      doc.text('1. EXECUTIVE SUMMARY & HYDROLOGICAL PERFORMANCE', margin, currentY);

      currentY += 4;
      const cardW = (pageWidth - (margin * 2) - 15) / 4;
      const cardH = 18;

      const cards = [
        { label: 'TOTAL GENERATION (GROSS)', val: `${(report.totalKWh / 1000000).toFixed(2)} GWh`, sub: `${fmt(report.totalKWh, 0)} kWh` },
        { label: 'NET ENERGY DELIVERED', val: `${(report.totalNetKWh / 1000000).toFixed(2)} GWh`, sub: `${fmt(report.totalNetKWh, 0)} kWh` },
        { label: 'ACTUAL REVENUE GENERATED', val: `PKR ${(report.totalRevenuePKR / 1000000).toFixed(2)} M`, sub: `PKR ${fmt(report.totalRevenuePKR, 0)}` },
        { label: 'AVERAGE RIVER INFLOW', val: `${report.avgInflow.toFixed(2)} Cumecs`, sub: `Across monitored channels` },
      ];

      cards.forEach((c, idx) => {
        const x = margin + idx * (cardW + 5);
        doc.setFillColor(240, 245, 250);
        doc.setDrawColor(200, 215, 230);
        doc.roundedRect(x, currentY, cardW, cardH, 2, 2, 'FD');

        doc.setTextColor(100, 115, 130);
        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(6.5);
        doc.text(c.label, x + 3, currentY + 5);

        doc.setTextColor(11, 37, 69);
        doc.setFontSize(10);
        doc.text(c.val, x + 3, currentY + 11);

        doc.setTextColor(47, 158, 154);
        doc.setFontSize(6.5);
        doc.setFont('Helvetica', 'normal');
        doc.text(c.sub, x + 3, currentY + 15);
      });

      currentY += cardH + 8;

      // Section 2: Powerhouse Performance Aggregates Table
      doc.setTextColor(11, 37, 69);
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(11);
      doc.text('2. POWERHOUSE LEVEL PERFORMANCE BREAKDOWN', margin, currentY);

      const phHeaders = [['Powerhouse', 'Capacity (MW)', 'Days Recorded', 'Avg Load (MW)', 'Max Load (MW)', 'Avg Inflow (cumecs)', 'Total Output (kWh)', 'Net Energy (kWh)', 'Capacity Factor', 'Actual Revenue (PKR)']];
      const phBody = report.powerhouse_summary.map(ph => [
        ph.name,
        `${ph.capacity.toFixed(1)} MW`,
        `${ph.count} Days`,
        `${ph.avg_load.toFixed(2)} MW`,
        `${ph.maxLoadMax.toFixed(2)} MW`,
        `${ph.avg_inflow.toFixed(2)}`,
        fmt(ph.unitsSum, 0),
        fmt(ph.netSum, 0),
        `${ph.capacity_factor.toFixed(1)}%`,
        `PKR ${fmt(ph.revenueSum, 0)}`
      ]);

      autoTable(doc, {
        startY: currentY + 3,
        head: phHeaders,
        body: phBody,
        theme: 'grid',
        headStyles: { fillColor: [11, 37, 69], fontSize: 8, fontStyle: 'bold', halign: 'center' },
        bodyStyles: { fontSize: 7.5, color: [30, 40, 50] },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: {
          0: { fontStyle: 'bold', cellWidth: 40 },
          6: { halign: 'right' },
          7: { halign: 'right' },
          8: { halign: 'center', fontStyle: 'bold', textColor: [35, 128, 127] },
          9: { halign: 'right', fontStyle: 'bold', textColor: [11, 61, 30] }
        },
        margin: { left: margin, right: margin }
      });

      // ── PAGE 2: FULL DETAILED DAILY READINGS LOG (RAW DB DATA) ──
      doc.addPage('a4', 'landscape');

      // Top Navy Header Bar
      doc.setFillColor(11, 37, 69);
      doc.rect(0, 0, pageWidth, 20, 'F');
      doc.setFillColor(47, 158, 154);
      doc.rect(0, 20, pageWidth, 1.5, 'F');

      doc.setTextColor(255, 255, 255);
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(11);
      doc.text(`3. COMPLETE DAILY GENERATION & HYDROLOGICAL LOG (${rawRecords.length} RECORDS)`, margin, 13);

      const logHeaders = [['Reading Date', 'Powerhouse', 'Avg Load (MW)', 'Max Load (MW)', 'Inflow (cumecs)', 'Total Units (kWh)', 'Net Energy (kWh)', 'Aux Cons. (kWh)', 'Tariff (PKR)', 'Revenue (PKR)', 'Remarks']];
      
      const logBody = rawRecords.map(r => {
        const phName = r.powerhouse_name || r.powerhouses?.name || 'Unknown';
        const date = String(r.reading_date || '').slice(0, 10);
        const avgLoad = r.avg_station_load_mw != null ? Number(r.avg_station_load_mw).toFixed(2) : '—';
        const maxLoad = r.max_station_load_mw != null ? Number(r.max_station_load_mw).toFixed(2) : '—';
        const inflow = r.actual_avg_inflow_cumecs != null ? Number(r.actual_avg_inflow_cumecs).toFixed(2) : '—';
        const totalUnits = r.total_daily_units_kwh != null ? fmt(Number(r.total_daily_units_kwh), 0) : '—';
        const netEnergy = r.daily_net_energy_kwh != null ? fmt(Number(r.daily_net_energy_kwh), 0) : '—';
        const aux = r.aux_consumption_kwh != null ? fmt(Number(r.aux_consumption_kwh), 0) : '—';
        const tariff = r.tariff_rate != null ? Number(r.tariff_rate).toFixed(2) : '5.00';
        const revenue = r.actual_revenue_pkr != null ? fmt(Number(r.actual_revenue_pkr), 0) : '—';
        const remarks = r.remarks || 'Optimal operation';

        return [date, phName, avgLoad, maxLoad, inflow, totalUnits, netEnergy, aux, tariff, revenue, remarks];
      });

      autoTable(doc, {
        startY: 25,
        head: logHeaders,
        body: logBody,
        theme: 'striped',
        headStyles: { fillColor: [35, 128, 127], fontSize: 7.5, fontStyle: 'bold', halign: 'center' },
        bodyStyles: { fontSize: 7, color: [30, 40, 50] },
        columnStyles: {
          0: { fontStyle: 'bold', cellWidth: 22 },
          1: { fontStyle: 'bold', cellWidth: 35 },
          2: { halign: 'right' },
          3: { halign: 'right' },
          4: { halign: 'right' },
          5: { halign: 'right' },
          6: { halign: 'right' },
          7: { halign: 'right' },
          8: { halign: 'right' },
          9: { halign: 'right', fontStyle: 'bold', textColor: [11, 61, 30] },
          10: { cellWidth: 35 }
        },
        margin: { left: margin, right: margin }
      });

      // Footer & Page numbers
      const totalPages = doc.internal.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(7);
        doc.setTextColor(120, 135, 150);
        doc.text(`Page ${i} of ${totalPages}   •   OFFICIAL PEDO HYDROPOWER AUDIT   •   SHPMFS SYSTEM`, margin, pageHeight - 6);
      }

      // Save PDF file
      const phSlug = selectedPowerhouseId ? 'Selected_Plant' : 'All_Powerhouses';
      doc.save(`PEDO_Hydro_Audit_${report.period.startDate}_to_${report.period.endDate}_${phSlug}.pdf`);
      toast.success('Official PDF Report downloaded successfully!');
    } catch (err) {
      console.error(err);
      toast.error('Failed to compile PDF report.');
    }
  };

  return (
    <DashboardLayout title="Weekly Reports & PDF Builder">
      <div className="flex flex-col gap-6">

        {/* ───── AUTOMATED WEEKLY REPORT SCHEDULER BANNER ───── */}
        <div className="bg-card border border-subtle rounded-xl p-4 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-pedo-primary/15 border border-pedo-primary/40 flex items-center justify-center shrink-0">
              <Clock className="text-pedo-accent animate-spin" style={{ animationDuration: '8s' }} size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-bold text-navy uppercase tracking-wider">Automated Weekly Report Scheduler</h3>
                <span className="text-[9px] font-extrabold bg-emerald-500/20 text-emerald-700 border border-emerald-500/40 px-2 py-0.5 rounded-full uppercase tracking-widest flex items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping" /> Active
                </span>
              </div>
              <p className="text-xs text-muted mt-0.5">
                Every 7 days when live data is entered, a PDF report is automatically generated with a download notification.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <label className="text-xs text-muted font-bold flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={autoReportEnabled}
                onChange={e => {
                  setAutoReportEnabled(e.target.checked);
                  toast.success(e.target.checked ? 'Weekly auto-report schedule enabled.' : 'Weekly auto-report schedule paused.');
                }}
                className="w-4 h-4 text-pedo-primary rounded focus:ring-pedo-primary"
              />
              <span>Auto-Weekly Schedule</span>
            </label>
          </div>
        </div>

        {/* ───── DATE & POWERHOUSE FILTERS CARD ───── */}
        <div className="bg-card border border-subtle rounded-xl p-5 shadow-xl">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
            
            <div className="field-group">
              <label className="label" htmlFor="rpt-ph">Powerhouse Filter</label>
              <select
                id="rpt-ph"
                value={selectedPowerhouseId}
                onChange={e => setSelectedPowerhouseId(e.target.value)}
                className="input-field"
              >
                <option value="">All Powerhouses</option>
                {powerhouses.map(ph => (
                  <option key={ph.id} value={ph.id}>{ph.name}</option>
                ))}
              </select>
            </div>

            <div className="field-group">
              <label className="label" htmlFor="rpt-start">Audit Start Date</label>
              <input
                id="rpt-start"
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="input-field"
              />
            </div>

            <div className="field-group">
              <label className="label" htmlFor="rpt-end">Audit End Date</label>
              <input
                id="rpt-end"
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="input-field"
              />
            </div>

            <button
              type="button"
              onClick={generateReport}
              disabled={loading}
              className="btn-primary flex items-center gap-2 justify-center"
            >
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
              {loading ? 'Fetching DB Data...' : 'Compile Audit Report'}
            </button>
          </div>

          {dateDifferenceSummary && (
            <div className="mt-4 bg-hull border border-subtle rounded-lg px-4 py-2.5 text-xs text-pedo-accent font-semibold flex items-center gap-2">
              <Sparkles size={14} className="text-pedo-accent animate-pulse" />
              <span>{dateDifferenceSummary}</span>
            </div>
          )}
        </div>

        {/* ───── COMPILED REPORT VIEW ───── */}
        {report && (
          <div className="flex flex-col gap-6 animate-fadeIn">

            {/* Action Bar */}
            <div className="bg-card border border-subtle rounded-xl p-4 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-xs font-extrabold tracking-wider text-pedo-accent uppercase flex items-center gap-1.5">
                  <CheckSquare size={14} className="text-pedo-accent" />
                  Executive Audit Summary Mapped
                </h3>
                <p className="text-[10px] text-muted mt-1">
                  {rawRecords.length} DB records fetched from {report.period.startDate} to {report.period.endDate}
                </p>
              </div>

              <button
                type="button"
                onClick={downloadPDF}
                className="btn-primary flex items-center gap-2"
              >
                <FileDown size={16} />
                Download Official PDF ({rawRecords.length} Records)
              </button>
            </div>

            {/* Highlight Cards Row */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <HighlightCard
                icon={<TrendingUp className="text-pedo-accent" />}
                title="Total Production"
                value={`${(report.totalKWh / 1000000).toFixed(2)} GWh`}
                desc={`${fmt(report.totalKWh, 0)} kWh gross`}
              />
              <HighlightCard
                icon={<DollarSign className="text-emerald-500" />}
                title="Actual Revenue"
                value={`PKR ${(report.totalRevenuePKR / 1000000).toFixed(2)} M`}
                desc={`PKR ${fmt(report.totalRevenuePKR, 0)}`}
              />
              <HighlightCard
                icon={<Droplet className="text-sky-500" />}
                title="Avg River Inflow"
                value={`${report.avgInflow.toFixed(2)} cumecs`}
                desc="Hydrology average"
              />
              <HighlightCard
                icon={<ShieldAlert className="text-amber-500" />}
                title="Outage / Partial Days"
                value={`${report.shutdownEvents} Outages`}
                desc={`${report.partialEvents} partial load days`}
              />
            </div>

            {/* Powerhouse Performance Table */}
            <div className="bg-card border border-subtle rounded-xl shadow-2xl overflow-hidden">
              <div className="px-6 py-4 border-b border-subtle bg-card/50 flex justify-between items-center">
                <h3 className="text-xs font-bold text-pedo-accent uppercase tracking-wider">
                  Powerhouse Aggregate Performance
                </h3>
                <span className="text-xs text-muted font-semibold">
                  {report.powerhouse_summary.length} Powerhouse(s)
                </span>
              </div>
              <div className="table-scroll-wrap max-h-[350px]">
                <table className="table-aurora">
                  <thead>
                    <tr>
                      <th>Powerhouse</th>
                      <th className="num">Capacity</th>
                      <th className="num">Days</th>
                      <th className="num">Avg Load (MW)</th>
                      <th className="num">Max Load (MW)</th>
                      <th className="num">Avg Inflow</th>
                      <th className="num">Total Output (kWh)</th>
                      <th className="num">Net Energy (kWh)</th>
                      <th className="num">Actual Revenue (PKR)</th>
                      <th>Capacity Factor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.powerhouse_summary.map(ph => (
                      <tr key={ph.name}>
                        <td className="font-bold">{ph.name}</td>
                        <td className="num">{ph.capacity.toFixed(1)} MW</td>
                        <td className="num">{ph.count}</td>
                        <td className="num">{ph.avg_load.toFixed(2)} MW</td>
                        <td className="num">{ph.maxLoadMax.toFixed(2)} MW</td>
                        <td className="num">{ph.avg_inflow.toFixed(2)} cumecs</td>
                        <td className="num font-bold text-pedo-accent">{fmt(ph.unitsSum, 0)} kWh</td>
                        <td className="num font-bold text-navy">{fmt(ph.netSum, 0)} kWh</td>
                        <td className="num font-extrabold text-emerald-700">PKR {fmt(ph.revenueSum, 0)}</td>
                        <td>
                          <span className="text-[10px] font-extrabold text-pedo-accent bg-pedo-accent/20 border border-subtle px-2 py-0.5 rounded uppercase">
                            {ph.capacity_factor.toFixed(1)}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Raw Daily Log Preview Table */}
            <div className="bg-card border border-subtle rounded-xl shadow-2xl overflow-hidden">
              <div className="px-6 py-4 border-b border-subtle bg-card/50 flex justify-between items-center">
                <div>
                  <h3 className="text-xs font-bold text-navy uppercase tracking-wider">
                    Fetched Daily DB Records Log
                  </h3>
                  <p className="text-[10px] text-muted mt-0.5">
                    Original Database readings included in the PDF download
                  </p>
                </div>
                <button
                  type="button"
                  onClick={downloadPDF}
                  className="btn-primary text-xs !py-1.5 !px-3"
                >
                  <FileDown size={14} /> Download PDF Table
                </button>
              </div>

              <div className="table-scroll-wrap max-h-[400px]">
                <table className="table-aurora">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Powerhouse</th>
                      <th className="num">Avg Load (MW)</th>
                      <th className="num">Max Load (MW)</th>
                      <th className="num">Inflow (cumecs)</th>
                      <th className="num">Total Units (kWh)</th>
                      <th className="num">Net Energy (kWh)</th>
                      <th className="num">Aux Cons. (kWh)</th>
                      <th className="num">Tariff (PKR)</th>
                      <th className="num">Revenue (PKR)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rawRecords.slice(0, 50).map((r, idx) => (
                      <tr key={idx}>
                        <td className="font-bold whitespace-nowrap">{String(r.reading_date || '').slice(0, 10)}</td>
                        <td className="font-semibold">{r.powerhouse_name || r.powerhouses?.name || '—'}</td>
                        <td className="num">{r.avg_station_load_mw != null ? Number(r.avg_station_load_mw).toFixed(2) : '—'}</td>
                        <td className="num">{r.max_station_load_mw != null ? Number(r.max_station_load_mw).toFixed(2) : '—'}</td>
                        <td className="num">{r.actual_avg_inflow_cumecs != null ? Number(r.actual_avg_inflow_cumecs).toFixed(2) : '—'}</td>
                        <td className="num font-bold text-pedo-accent">{r.total_daily_units_kwh != null ? fmt(Number(r.total_daily_units_kwh), 0) : '—'}</td>
                        <td className="num font-bold text-navy">{r.daily_net_energy_kwh != null ? fmt(Number(r.daily_net_energy_kwh), 0) : '—'}</td>
                        <td className="num">{r.aux_consumption_kwh != null ? fmt(Number(r.aux_consumption_kwh), 0) : '—'}</td>
                        <td className="num">{r.tariff_rate != null ? Number(r.tariff_rate).toFixed(2) : '5.00'}</td>
                        <td className="num font-extrabold text-emerald-700">
                          {r.actual_revenue_pkr != null ? `PKR ${fmt(Number(r.actual_revenue_pkr), 0)}` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {rawRecords.length > 50 && (
                <div className="p-3 bg-hull text-center text-xs text-muted font-semibold border-t border-subtle">
                  Showing first 50 of {rawRecords.length} records in preview. All {rawRecords.length} records are included in the PDF download.
                </div>
              )}
            </div>

          </div>
        )}

        {/* Empty State */}
        {!report && !loading && (
          <div className="bg-card rounded-xl border border-subtle shadow-xl flex flex-col items-center py-20 text-center">
            <Calendar size={48} className="text-muted mb-4 animate-pulse" />
            <h4 className="text-xs font-extrabold text-pedo-accent uppercase tracking-wider mb-1.5">
              No Report Compiled Yet
            </h4>
            <p className="text-xs text-muted max-w-sm px-4 leading-relaxed">
              Select date parameters above and click "Compile Audit Report" to fetch original DB records and generate the official PDF audit report.
            </p>
          </div>
        )}

      </div>
    </DashboardLayout>
  );
}

function HighlightCard({ icon, title, value, desc }) {
  return (
    <div className="bg-card border border-subtle rounded-xl p-4 shadow-lg flex flex-col justify-between min-h-[105px] relative overflow-hidden group">
      <div className="absolute right-[-10%] top-[-20%] w-[30%] h-[75%] bg-pedo-accent/10 rounded-full pointer-events-none transition-transform duration-500 group-hover:scale-110" />
      <div className="flex items-center justify-between mb-2 relative z-10">
        <span className="text-[10px] font-bold text-muted uppercase tracking-widest leading-none block">{title}</span>
        <div className="w-7 h-7 rounded bg-hull border border-subtle flex items-center justify-center text-navy">
          {icon}
        </div>
      </div>
      <div className="relative z-10">
        <p className="text-base font-black text-navy tracking-tight">{value}</p>
        <p className="text-[9px] text-muted mt-0.5">{desc}</p>
      </div>
    </div>
  );
}
