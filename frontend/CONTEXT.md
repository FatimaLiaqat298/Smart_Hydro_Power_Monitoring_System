# SHPMFS Frontend – Context Map

## Framework & Tooling
- **React 18** + **Vite 5** (ESM, `vite.config.js`)
- **Routing:** `react-router-dom` v6 — all routes declared in `src/App.jsx`; protected via role-based `ProtectedRoute` wrapper
- **State:** React Context only — `src/context/AuthContext.jsx` holds global auth (`user`, `loading`); persisted to `localStorage`; no Redux/Zustand
- **Styling:** Tailwind CSS v3 — config at `tailwind.config.js` (custom PEDO brand colors: `pedo-primary`, `pedo-accent`, `pedo-dark`, etc.); global CSS at `src/index.css` (Tailwind directives + base body styles)

## Key File Paths

| Role | Path |
|---|---|
| Router / entry | `src/App.jsx` |
| Layout wrapper | `src/components/DashboardLayout.jsx` |
| Sidebar | `src/components/Sidebar.jsx` |
| Auth guard | `src/components/ProtectedRoute.jsx` |
| Login page | `src/pages/Login.jsx` |
| Dashboard page | `src/pages/Dashboard.jsx` |
| Global CSS | `src/index.css` |
| Tailwind config | `tailwind.config.js` |
| Auth context | `src/context/AuthContext.jsx` |
| API client | `src/lib/api.js` |

## Charts
- **Library:** `recharts` v2 — used in `src/pages/Dashboard.jsx` (line charts, sparklines) and likely `src/pages/Forecast.jsx` and `src/pages/Reports.jsx`
- Chart components are **inline inside pages** (no separate chart component files)
- `src/components/PowerHousesGrid.jsx` — grid display component (not a chart library component)

## Data Flow
- **API:** `axios` via `src/lib/api.js` — pre-configured client pointing to `http://localhost:5000/api` with automatic JWT Bearer token injection from `localStorage`
- **Auth state:** `src/context/AuthContext.jsx` — user object and token stored in `localStorage`; consumed via `useAuth()` hook across all pages
- **No mock data** — all pages call the live backend via the `api` client
- **Forms:** `react-hook-form` + `zod` for validation; `react-hot-toast` for notifications
- **PDF export:** `jspdf` + `jspdf-autotable` (used in Reports)

## Pages & Routes

| Route | Page File | Allowed Roles |
|---|---|---|
| `/login` | `src/pages/Login.jsx` | public |
| `/dashboard` | `src/pages/Dashboard.jsx` | all |
| `/data-entry` | `src/pages/DataEntry.jsx` | admin, engineer |
| `/targets` | `src/pages/Targets.jsx` | admin, manager, engineer |
| `/forecast` | `src/pages/Forecast.jsx` | admin, manager, engineer |
| `/reports` | `src/pages/Reports.jsx` | admin, manager |
| `/admin/users` | `src/pages/AdminUsers.jsx` | admin |
