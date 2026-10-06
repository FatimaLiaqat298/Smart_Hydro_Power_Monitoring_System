'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '../context/AuthContext';
import {
  BarChart3,
  Target,
  LineChart,
  FileSpreadsheet,
  Edit3,
  Users,
  History,
  LogOut,
  ChevronLeft,
  ChevronRight,
  X,
} from 'lucide-react';

const navSections = [
  {
    title: 'OVERVIEW',
    items: [
      { name: 'Analytics Dashboard', path: '/dashboard', icon: BarChart3, roles: ['admin', 'manager', 'engineer', 'viewer'] },
      { name: 'Targets & Performance', path: '/targets', icon: Target, roles: ['admin', 'manager', 'engineer'] },
      { name: 'Generation Forecast', path: '/forecast', icon: LineChart, roles: ['admin', 'manager', 'engineer'] },
      { name: 'Weekly Reports', path: '/reports', icon: FileSpreadsheet, roles: ['admin', 'manager'] },
    ],
  },
  {
    title: 'DATA',
    items: [
      { name: 'Data Entry', path: '/data-entry', icon: Edit3, roles: ['admin', 'engineer'] },
    ],
  },
  {
    title: 'ADMIN',
    items: [
      { name: 'User Management', path: '/admin/users', icon: Users, roles: ['admin'] },
      { name: 'Activity Logs', path: '/activity-logs', icon: History, roles: ['admin', 'manager'] },
    ],
  },
];

export default function Sidebar({
  isCollapsed = false,
  toggleCollapse,
  mobileOpen = false,
  setMobileOpen = () => {},
}) {
  const { user, logout } = useAuth();
  const pathname = usePathname();

  const getRoleColor = (role) => {
    switch (role?.toLowerCase()) {
      case 'admin':    return 'bg-red-500/25 text-white border border-red-200/40';
      case 'manager':  return 'bg-[#B6E3D6]/25 text-[#B6E3D6] border border-[#B6E3D6]/40';
      case 'engineer': return 'bg-sky-400/25 text-white border border-sky-200/40';
      default:         return 'bg-white/15 text-white border border-white/25';
    }
  };

  const getInitials = (name) => {
    if (!name) return 'U';
    return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape' && mobileOpen) setMobileOpen(false);
  };

  return (
    <aside
      className={`bg-gradient-to-b from-[#24607F] to-[#2A7690] border-r border-white/20 h-screen fixed left-0 top-0 flex flex-col z-40 md:z-20 transition-all duration-300 ease-in-out ${
        isCollapsed ? 'md:w-[72px]' : 'md:w-[256px]'
      } w-[256px] text-white shadow-lg ${
        mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
      }`}
      aria-label="Sidebar Navigation"
      role="navigation"
      onKeyDown={handleKeyDown}
    >
      {/* ── Top Brand & Toggle ── */}
      <div className="h-12 px-3 border-b border-white/20 flex items-center justify-between overflow-hidden flex-shrink-0">
        <div className="flex items-center gap-2.5 select-none overflow-hidden">
          <div
            className="w-7 h-7 rounded-lg bg-white flex items-center justify-center flex-shrink-0 shadow-sm"
            title="SHPMFS - PEDO Monitoring"
          >
            <img
              src="/pedo-logo.png"
              alt="PEDO emblem"
              className="w-5 h-5 object-contain"
              loading="lazy"
            />
          </div>
          {!isCollapsed && (
            <div className="flex flex-col whitespace-nowrap overflow-hidden">
              <span className="text-sm font-extrabold text-white tracking-wider leading-none">SHPMFS</span>
              <span className="text-[8px] text-[#B6E3D6] font-bold uppercase tracking-widest mt-0.5">PEDO Monitoring</span>
            </div>
          )}
        </div>

        {toggleCollapse && (
          <button
            type="button"
            onClick={toggleCollapse}
            aria-expanded={!isCollapsed}
            aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="hidden md:flex p-1 rounded-lg text-white/80 hover:text-white hover:bg-white/10 border border-transparent hover:border-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B6E3D6] transition-colors"
          >
            {isCollapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
          </button>
        )}

        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          aria-label="Close sidebar"
          className="md:hidden p-1 rounded-lg text-white/80 hover:text-white hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B6E3D6]"
        >
          <X size={16} />
        </button>
      </div>

      {/* ── Navigation List ── */}
      <nav className={`flex-1 overflow-y-auto py-3 space-y-3 thin-scrollbar ${isCollapsed ? 'px-2' : 'px-2.5'}`}>
        {navSections.map((section) => {
          const visibleItems = section.items.filter((item) =>
            !user || !item.roles || item.roles.includes(user?.role)
          );
          if (visibleItems.length === 0) return null;

          return (
            <div key={section.title} className="space-y-0.5">
              {!isCollapsed ? (
                <p className="text-[9px] font-extrabold text-white/70 uppercase tracking-widest px-2.5 mb-1 select-none">
                  {section.title}
                </p>
              ) : (
                <div className="w-5 h-px bg-white/20 mx-auto my-1.5" />
              )}

              <div className="space-y-0.5">
                {visibleItems.map((item) => {
                  const isActive = pathname === item.path;
                  return (
                    <Link
                      key={item.path}
                      href={item.path}
                      onClick={() => setMobileOpen(false)}
                      className={`flex items-center rounded-lg text-xs transition-all duration-200 group relative focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B6E3D6] ${
                        isCollapsed
                          ? 'justify-center p-2'
                          : 'gap-2.5 px-2.5 py-2'
                      } ${
                        isActive
                          ? 'bg-white/15 text-[#B6E3D6] border-l-[3px] border-[#B6E3D6] font-bold shadow-[0_0_12px_rgba(182,227,214,0.35)]'
                          : 'text-white/85 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      <item.icon size={16} className="flex-shrink-0 transition-transform duration-200 group-hover:scale-105" aria-hidden="true" />
                      {!isCollapsed && <span className="truncate">{item.name}</span>}
                      {isCollapsed && (
                        <div
                          role="tooltip"
                          className="absolute left-full ml-2.5 px-2 py-1 bg-[#E6F4F2] text-[#0B2545] text-xs rounded-md font-bold tracking-wide shadow-xl border border-[#2F9E9A] opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50 whitespace-nowrap"
                        >
                          {item.name}
                        </div>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {/* ── Bottom User Block ── */}
      <div className={`border-t border-white/20 bg-black/10 flex-shrink-0 ${isCollapsed ? 'p-1.5' : 'p-2.5'}`}>
        {!isCollapsed ? (
          <>
            <div className="flex items-center gap-2.5 mb-2 px-1">
              <div className="w-7 h-7 rounded-full bg-white/20 border border-white/35 flex items-center justify-center flex-shrink-0 text-white font-extrabold text-[10px] shadow-sm">
                {getInitials(user?.name)}
              </div>
              <div className="flex flex-col overflow-hidden">
                <span className="text-xs font-bold text-white truncate leading-tight">
                  {user?.name || 'Authorized User'}
                </span>
                <span className={`text-[9px] uppercase tracking-wider font-extrabold px-1 py-0.5 rounded mt-0.5 text-center w-max ${getRoleColor(user?.role)}`}>
                  {user?.role || 'Viewer'}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={logout}
              className="flex items-center gap-2 px-2.5 py-1.5 w-full rounded-md text-xs font-bold text-white/80 hover:text-red-200 hover:bg-red-500/20 transition-colors uppercase tracking-wider focus:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
            >
              <LogOut size={14} className="flex-shrink-0" aria-hidden="true" />
              <span>Sign Out</span>
            </button>
          </>
        ) : (
          <div className="flex flex-col items-center gap-1.5">
            <div className="relative group">
              <div className="w-7 h-7 rounded-full bg-white/20 border border-white/35 flex items-center justify-center text-white font-extrabold text-[10px] shadow-sm cursor-default">
                {getInitials(user?.name)}
              </div>
            </div>

            <button
              type="button"
              onClick={logout}
              aria-label="Sign Out"
              className="w-full flex items-center justify-center p-1.5 rounded-md text-white/80 hover:text-red-200 hover:bg-red-500/20 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
            >
              <LogOut size={15} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
