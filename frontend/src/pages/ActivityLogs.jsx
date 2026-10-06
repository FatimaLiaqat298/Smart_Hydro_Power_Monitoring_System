'use client';
import { useState, useEffect, useCallback } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import { useAuth } from '../context/AuthContext';
import api from '../lib/api';
import {
  History, Search, RefreshCw, ChevronLeft, ChevronRight,
  LogIn, LogOut, Database, Target, FileText, Download,
  UserPlus, UserCog, Shield, ShieldCheck, Zap, AlertTriangle,
  ShieldX, X, UserMinus, FileSpreadsheet
} from 'lucide-react';

const LOG_VIEW_ROLES = ['admin', 'manager'];

// Action mapping config
const ACTION_CONFIG = {
  login:               { icon: LogIn,           label: 'Login',           color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
  logout:              { icon: LogOut,          label: 'Logout',          color: 'text-sky-400',     bg: 'bg-sky-500/10 border-sky-500/20' },
  create_user:         { icon: UserPlus,        label: 'Create User',     color: 'text-green-400',   bg: 'bg-green-500/10 border-green-500/20' },
  delete_user:         { icon: UserMinus,       label: 'Delete User',     color: 'text-red-400',     bg: 'bg-red-500/10 border-red-500/20' },
  update_user:         { icon: UserCog,         label: 'Update User',     color: 'text-amber-400',   bg: 'bg-amber-500/10 border-amber-500/20' },
  update_user_status:  { icon: ShieldCheck,     label: 'User Status',     color: 'text-cyan-400',    bg: 'bg-cyan-500/10 border-cyan-500/20' },
  create_generation:   { icon: Database,        label: 'Data Entry',      color: 'text-blue-400',    bg: 'bg-blue-500/10 border-blue-500/20' },
  update_generation:   { icon: Database,        label: 'Edit Entry',      color: 'text-indigo-400',  bg: 'bg-indigo-500/10 border-indigo-500/20' },
  delete_generation:   { icon: Database,        label: 'Delete Entry',    color: 'text-rose-400',    bg: 'bg-rose-500/10 border-rose-500/20' },
  bulk_import:         { icon: FileSpreadsheet, label: 'Bulk Import',     color: 'text-purple-400',  bg: 'bg-purple-500/10 border-purple-500/20' },
  create_target:       { icon: Target,          label: 'Create Target',   color: 'text-amber-400',   bg: 'bg-amber-500/10 border-amber-500/20' },
  update_target:       { icon: Target,          label: 'Update Target',   color: 'text-amber-400',   bg: 'bg-amber-500/10 border-amber-500/20' },
  generate_report:     { icon: FileText,        label: 'Generate Report', color: 'text-teal-400',    bg: 'bg-teal-500/10 border-teal-500/20' },
};

const ROLE_STYLE = {
  admin:    'bg-red-500/15 text-red-300 border border-red-500/25',
  manager:  'bg-sky-500/15 text-sky-300 border border-sky-500/25',
  engineer: 'bg-blue-500/15 text-blue-300 border border-blue-500/25',
  viewer:   'bg-slate-500/15 text-slate-300 border border-slate-500/25',
};

function formatPKT(isoString) {
  if (!isoString) return '—';
  try {
    const d = new Date(isoString);
    return d.toLocaleString('en-GB', {
      timeZone: 'Asia/Karachi',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).replace(',', '');
  } catch (e) {
    return String(isoString);
  }
}

/** Safely formats the log details into a human-readable text string */
function formatLogDetails(log) {
  const { action, details } = log;

  if (typeof details === 'string') return details;

  if (details && typeof details === 'object') {
    if (action === 'login') {
      return `User logged into system portal (${details.email || log.user_email || 'Session started'})`;
    }
    if (action === 'logout') {
      return 'User logged out of session';
    }
    if (action === 'create_user') {
      const email = details.email || '';
      const role = String(details.role || '').toUpperCase();
      return `Created new user account: ${email} (${role})`;
    }
    if (action === 'delete_user') {
      return `Deleted user account (ID: ${log.entity_id || '—'})`;
    }
    if (action === 'update_user' || action === 'update_user_status') {
      const status = details.status ? `Status: ${details.status}` : '';
      const role = details.role ? `Role: ${details.role}` : '';
      return `Updated user settings ${[status, role].filter(Boolean).join(' | ')}`;
    }
    if (action === 'create_generation' || action === 'update_generation') {
      const ph = details.powerhouse_name || details.powerhouse || '';
      const mw = details.avg_station_load_mw != null ? `${details.avg_station_load_mw} MW` : '';
      const date = details.reading_date || details.date || '';
      return `Entered generation log ${ph ? `for ${ph}` : ''} ${mw ? `(${mw})` : ''} ${date ? `[Date: ${date}]` : ''}`.trim();
    }
    if (action === 'bulk_import') {
      return `Bulk imported ${details.rows_imported || 'multiple'} generation records from ${details.file_name || 'spreadsheet'}`;
    }
    if (action === 'create_target' || action === 'update_target') {
      const mw = details.target_mw != null ? `${details.target_mw} MW` : '';
      return `Saved target benchmark ${mw} (${details.period_type || 'custom'})`;
    }
    if (action === 'generate_report') {
      return `Generated PDF performance audit report`;
    }

    // Generic object formatter: convert key-values to string
    const entries = Object.entries(details)
      .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
      .join(' | ');
    return entries || 'Activity logged';
  }

  return 'Activity logged';
}

/** Extract powerhouse name from details object if present */
function extractPowerhouse(log) {
  if (log.powerhouse) return log.powerhouse;
  if (log.details && typeof log.details === 'object') {
    return log.details.powerhouse_name || log.details.powerhouse || log.details.ph_name || null;
  }
  return null;
}

export default function ActivityLogs() {
  const { user } = useAuth();

  if (!LOG_VIEW_ROLES.includes(user?.role)) {
    return (
      <DashboardLayout title="Activity Logs">
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center px-4">
          <ShieldX size={56} className="text-red-400" />
          <h1 className="text-2xl font-extrabold text-white">Access Denied</h1>
          <p className="text-muted max-w-sm">
            Activity Logs are restricted to <span className="text-pedo-accent font-bold">Admin</span> and <span className="text-pedo-accent font-bold">Manager</span> roles.
          </p>
        </div>
      </DashboardLayout>
    );
  }

  return <ActivityLogsContent />;
}

function ActivityLogsContent() {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [q, setQ] = useState('');

  // Pagination
  const pageSize = 25;
  const [page, setPage] = useState(1);

  const fetchLogs = useCallback(async (pg = page) => {
    setLoading(true);
    setError(null);
    try {
      const params = { page: pg, page_size: pageSize };
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      if (actionFilter) params.action = actionFilter;

      const res = await api.get('/activity-logs', { params });
      const rows = res.data?.data || [];

      // Filter locally by search query if provided
      let filtered = rows;
      if (q.trim()) {
        const query = q.toLowerCase();
        filtered = rows.filter(item => {
          const uName = (item.user_name || '').toLowerCase();
          const uEmail = (item.user_email || '').toLowerCase();
          const detailStr = formatLogDetails(item).toLowerCase();
          const act = (item.action || '').toLowerCase();
          return uName.includes(query) || uEmail.includes(query) || detailStr.includes(query) || act.includes(query);
        });
      }

      setLogs(filtered);
      setTotal(res.data?.pagination?.total || filtered.length);
      setPage(pg);
    } catch (err) {
      console.error('[ActivityLogs] fetch error:', err);
      setError(err?.response?.data?.message || err?.response?.data?.detail || 'Failed to load activity logs.');
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, actionFilter, q, page]);

  useEffect(() => {
    fetchLogs(1);
  }, [dateFrom, dateTo, actionFilter, q]);

  const handleReset = () => {
    setDateFrom('');
    setDateTo('');
    setActionFilter('');
    setQ('');
    setPage(1);
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const firstItem = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastItem = Math.min(page * pageSize, total);
  const hasFilters = dateFrom || dateTo || actionFilter || q;

  return (
    <DashboardLayout title="Activity Logs">
      <div className="flex flex-col gap-5">

        {/* ── Page Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-pedo-primary/20 border border-pedo-primary/40">
              <History size={22} className="text-pedo-accent" />
            </div>
            <div>
              <h1 className="text-xl font-extrabold text-navy tracking-tight">System Activity Logs</h1>
              <p className="text-xs text-muted mt-0.5">Audit trail of all user actions across the platform (Pakistan Time - PKT)</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => fetchLogs(page)}
            disabled={loading}
            className="btn-primary text-xs !py-1.5 flex items-center gap-1.5"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        {/* ── Filters Bar */}
        <div className="bg-card border border-subtle rounded-xl p-4 shadow-xl">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">

            <div className="field-group">
              <label className="label text-[10px]">Date From</label>
              <input
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                className="input-field !h-9 text-xs"
              />
            </div>

            <div className="field-group">
              <label className="label text-[10px]">Date To</label>
              <input
                type="date"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                className="input-field !h-9 text-xs"
              />
            </div>

            <div className="field-group">
              <label className="label text-[10px]">Action Category</label>
              <select
                value={actionFilter}
                onChange={e => setActionFilter(e.target.value)}
                className="input-field !h-9 text-xs"
              >
                <option value="">All Actions</option>
                <option value="login">User Login</option>
                <option value="logout">User Logout</option>
                <option value="create_user">Create User</option>
                <option value="delete_user">Delete User</option>
                <option value="create_generation">Data Entry</option>
                <option value="bulk_import">Bulk Import</option>
                <option value="create_target">Target Set</option>
                <option value="generate_report">Report Generation</option>
              </select>
            </div>

            <div className="field-group">
              <label className="label text-[10px]">Search User / Details</label>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-2.5 text-muted pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search name, email, details..."
                  value={q}
                  onChange={e => setQ(e.target.value)}
                  className="input-field !h-9 pl-9 pr-7 text-xs"
                />
                {q && (
                  <button
                    type="button"
                    onClick={() => setQ('')}
                    className="absolute right-2.5 top-2.5 text-muted hover:text-navy"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            </div>

          </div>

          {hasFilters && (
            <div className="flex justify-between items-center mt-3 pt-2.5 border-t border-subtle text-xs">
              <span className="text-muted font-semibold">
                Found {logs.length} matching event(s)
              </span>
              <button
                type="button"
                onClick={handleReset}
                className="text-pedo-accent font-bold flex items-center gap-1 hover:underline"
              >
                <RefreshCw size={12} /> Clear Filters
              </button>
            </div>
          )}
        </div>

        {/* ── Table Card */}
        <div className="bg-card border border-subtle rounded-xl shadow-2xl overflow-hidden">
          <div className="table-scroll-wrap max-h-[550px]">
            <table className="table-aurora">
              <thead>
                <tr>
                  <th>Time (PKT)</th>
                  <th>User / Role</th>
                  <th>Action</th>
                  <th>Powerhouse</th>
                  <th>Event Description</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i}>
                      <td colSpan={5} className="py-4 px-6">
                        <div className="h-4 bg-hull animate-pulse rounded" />
                      </td>
                    </tr>
                  ))
                ) : error ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-red-500 font-semibold">
                      <AlertTriangle size={28} className="mx-auto mb-2" />
                      {error}
                    </td>
                  </tr>
                ) : logs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-muted font-semibold">
                      <History size={32} className="mx-auto mb-2 opacity-50" />
                      No activity logs found for the selected filters.
                    </td>
                  </tr>
                ) : (
                  logs.map(log => {
                    const actionKey = (log.action || '').toLowerCase();
                    const cfg = ACTION_CONFIG[actionKey] || {
                      icon: History,
                      label: log.action || 'Event',
                      color: 'text-navy',
                      bg: 'bg-hull border-subtle'
                    };
                    const ActionIcon = cfg.icon;
                    const roleKey = (log.user_role || 'viewer').toLowerCase();
                    const roleStyle = ROLE_STYLE[roleKey] || ROLE_STYLE.viewer;
                    const formattedDetails = formatLogDetails(log);
                    const powerhouseName = extractPowerhouse(log);

                    return (
                      <tr key={log.id}>
                        {/* Time */}
                        <td className="whitespace-nowrap font-mono text-muted text-xs">
                          {formatPKT(log.created_at)}
                        </td>

                        {/* User */}
                        <td className="whitespace-nowrap">
                          <div className="flex flex-col">
                            <span className="font-bold text-navy text-xs">
                              {log.user_name || 'System / User'}
                            </span>
                            <span className="text-[10px] text-muted truncate max-w-[150px]">
                              {log.user_email || '—'}
                            </span>
                            {log.user_role && (
                              <span className={`mt-1 inline-block text-[8px] font-extrabold px-1.5 py-0.5 rounded uppercase tracking-widest w-max ${roleStyle}`}>
                                {log.user_role}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Action Badge */}
                        <td className="whitespace-nowrap">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-extrabold uppercase tracking-wider ${cfg.bg} ${cfg.color}`}>
                            <ActionIcon size={11} />
                            {cfg.label}
                          </span>
                        </td>

                        {/* Powerhouse */}
                        <td className="whitespace-nowrap font-semibold text-xs text-navy">
                          {powerhouseName || '—'}
                        </td>

                        {/* Event Details — ALWAYS STRING */}
                        <td className="text-xs text-navy font-medium max-w-md leading-relaxed">
                          {formattedDetails}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer */}
          {!loading && !error && total > 0 && (
            <div className="px-6 py-3 bg-hull/60 border-t border-subtle flex items-center justify-between text-xs">
              <span className="text-muted font-semibold">
                Showing {firstItem}–{lastItem} of {total} total activity events
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage(p => Math.max(p - 1, 1))}
                  disabled={page === 1}
                  className="px-3 py-1 bg-card border border-subtle rounded font-bold text-navy disabled:opacity-40"
                >
                  <ChevronLeft size={13} className="inline" /> Prev
                </button>
                <span className="text-navy font-bold px-2">Page {page} of {totalPages}</span>
                <button
                  type="button"
                  onClick={() => setPage(p => Math.min(p + 1, totalPages))}
                  disabled={page >= totalPages}
                  className="px-3 py-1 bg-card border border-subtle rounded font-bold text-navy disabled:opacity-40"
                >
                  Next <ChevronRight size={13} className="inline" />
                </button>
              </div>
            </div>
          )}
        </div>

      </div>
    </DashboardLayout>
  );
}
