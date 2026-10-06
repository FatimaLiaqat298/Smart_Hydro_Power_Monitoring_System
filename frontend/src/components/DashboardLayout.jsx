'use client';

import { useState, useEffect, useRef, useMemo, createContext, useContext, Component } from 'react';
import Sidebar from './Sidebar';
import { useAuth } from '../context/AuthContext';
import { Search, Bell, AlertTriangle, Menu, RefreshCw, X } from 'lucide-react';

const SIDEBAR_STORAGE_KEY = 'shpmfs_sidebar_collapsed';

/* ── Search Context ─────────────────────────────────────────── */
export const SearchContext = createContext(null);

export function SearchProvider({ children }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [totalCount, setTotalCount] = useState(0);
  const [filteredCount, setFilteredCount] = useState(0);
  const [powerhouseList, setPowerhouseList] = useState([]);
  const onSelectPlantRef = useRef(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 200);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const setOnSelectPlant = useRef((fn) => {
    onSelectPlantRef.current = fn;
  }).current;

  const onSelectPlant = useRef((plantName) => {
    if (onSelectPlantRef.current) {
      onSelectPlantRef.current(plantName);
    }
  }).current;

  const value = useMemo(() => ({
    enabled: true,
    searchTerm,
    setSearchTerm,
    debouncedSearch,
    totalCount,
    setTotalCount,
    filteredCount,
    setFilteredCount,
    powerhouseList,
    setPowerhouseList,
    onSelectPlant,
    setOnSelectPlant,
  }), [searchTerm, debouncedSearch, totalCount, filteredCount, powerhouseList, onSelectPlant, setOnSelectPlant]);

  return (
    <SearchContext.Provider value={value}>
      {children}
    </SearchContext.Provider>
  );
}

export function useSearch() {
  return useContext(SearchContext);
}

/* ── Top-Level Error Boundary ─────────────────────────────── */
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen gap-4 bg-transparent text-[#0B2545] p-6">
          <AlertTriangle size={40} className="text-danger" />
          <h2 className="text-lg font-bold">Something went wrong</h2>
          <p className="text-muted text-sm text-center max-w-md">
            {this.state.error?.message || 'An unexpected error occurred.'}
          </p>
          <button
            className="btn-primary"
            onClick={() => {
              this.setState({ hasError: false, error: null });
              window.location.reload();
            }}
          >
            <RefreshCw size={14} aria-hidden="true" /> Reload Page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function DashboardLayout({ children, title, noScroll = false }) {
  const { user } = useAuth();
  const search = useSearch();
  const [showNotifications, setShowNotifications] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const searchContainerRef = useRef(null);
  const searchInputRef = useRef(null);

  const [isCollapsed, setIsCollapsed] = useState(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 1500) {
      return true;
    }
    try {
      const saved = localStorage.getItem(SIDEBAR_STORAGE_KEY);
      if (saved !== null) return JSON.parse(saved);
      return false;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 1500) {
        try {
          const saved = localStorage.getItem(SIDEBAR_STORAGE_KEY);
          if (saved === null) setIsCollapsed(true);
        } catch {
          setIsCollapsed(true);
        }
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const matches = useMemo(() => {
    if (!search?.searchTerm?.trim() || !search.powerhouseList?.length) return [];
    const q = search.searchTerm.trim().toLowerCase();
    return search.powerhouseList.filter(name => name.toLowerCase().includes(q)).slice(0, 6);
  }, [search?.searchTerm, search?.powerhouseList]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSearchKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      search?.setSearchTerm('');
      setIsDropdownOpen(false);
      setActiveIndex(-1);
      searchInputRef.current?.blur();
      return;
    }

    if (!isDropdownOpen || matches.length === 0) {
      if (e.key === 'ArrowDown' && search?.searchTerm?.trim()) {
        e.preventDefault();
        setIsDropdownOpen(true);
        setActiveIndex(0);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(prev => (prev < matches.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(prev => (prev > 0 ? prev - 1 : matches.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIndex >= 0 && activeIndex < matches.length) {
        search.onSelectPlant?.(matches[activeIndex]);
        setIsDropdownOpen(false);
        setActiveIndex(-1);
      }
    }
  };

  const toggleCollapse = () => {
    setIsCollapsed(prev => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 320);
    return () => clearTimeout(timer);
  }, [isCollapsed]);

  useEffect(() => {
    const fn = (e) => { if (e.key === 'Escape' && mobileOpen) setMobileOpen(false); };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [mobileOpen]);

  useEffect(() => {
    const fn = () => { if (window.innerWidth >= 768 && mobileOpen) setMobileOpen(false); };
    window.addEventListener('resize', fn);
    return () => window.removeEventListener('resize', fn);
  }, [mobileOpen]);

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  });

  const getRoleColor = (role) => {
    switch (role?.toLowerCase()) {
      case 'admin':    return 'bg-red-500/25 text-white border border-red-200/40';
      case 'manager':  return 'bg-[#B6E3D6]/25 text-[#B6E3D6] border border-[#B6E3D6]/40';
      case 'engineer': return 'bg-sky-400/25 text-white border border-sky-200/40';
      default:         return 'bg-white/15 text-white border border-white/25';
    }
  };

  const mockAlerts = [
    { id: 1, message: 'Shishi HPS operating at low generation efficiency (10.5%)', type: 'warning' },
    { id: 2, message: 'Malakand-3 HPS target set successfully for this month', type: 'info' },
  ];

  const sidebarW = isCollapsed ? 'md:ml-[72px]' : 'md:ml-[256px]';

  return (
    <ErrorBoundary>
      <div className={`flex h-screen overflow-hidden bg-transparent text-navy`}>
        {mobileOpen && (
          <div
            className="fixed inset-0 bg-[#0B2545]/60 backdrop-blur-sm z-30 md:hidden"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
        )}

        <Sidebar
          isCollapsed={isCollapsed}
          toggleCollapse={toggleCollapse}
          mobileOpen={mobileOpen}
          setMobileOpen={setMobileOpen}
        />

        <div
          className={`flex-1 flex flex-col min-h-0 min-w-0 transition-all duration-300 ease-in-out ${sidebarW} ml-0`}
          onTransitionEnd={() => window.dispatchEvent(new Event('resize'))}
        >
          <header
            className="bg-gradient-to-r from-[#24607F] to-[#2A7690] border-b border-white/20 px-3 sm:px-4 md:px-6 flex items-center justify-between sticky top-0 z-10 h-12 shrink-0 text-white shadow-sm"
            role="banner"
          >
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => setMobileOpen(true)}
                aria-label="Open navigation menu"
                aria-expanded={mobileOpen}
                className="md:hidden p-1.5 rounded-lg bg-white/15 text-white hover:bg-white/25 border border-white/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B6E3D6] transition-colors"
              >
                <Menu size={16} aria-hidden="true" />
              </button>

              <h1 className="text-sm md:text-base font-bold tracking-tight text-white flex items-center gap-2">
                <span className="w-1 h-4 bg-[#B6E3D6] rounded-full inline-block" aria-hidden="true" />
                {title}
              </h1>
            </div>

            <div className="flex items-center gap-2.5 md:gap-4">
              {search && search.enabled && (
                <div ref={searchContainerRef} className="relative flex items-center">
                  <label htmlFor="hdr-search" className="sr-only">Search powerhouse</label>
                  <div className="relative flex items-center">
                    <input
                      ref={searchInputRef}
                      id="hdr-search"
                      type="search"
                      value={search.searchTerm}
                      onChange={(e) => {
                        search.setSearchTerm(e.target.value);
                        setIsDropdownOpen(true);
                        setActiveIndex(-1);
                      }}
                      onFocus={() => {
                        if (search.searchTerm.trim()) setIsDropdownOpen(true);
                      }}
                      onKeyDown={handleSearchKeyDown}
                      placeholder="Search powerhouse…"
                      className="bg-white/25 border border-white/40 rounded-lg py-1 pl-2.5 pr-14 text-xs text-white placeholder-white/75 outline-none focus:bg-white/35 focus:border-[#B6E3D6] focus-visible:ring-1 focus-visible:ring-[#B6E3D6] transition-all w-44 sm:w-56 font-medium"
                    />

                    {search.searchTerm.trim() && (
                      <span className="absolute right-7 text-[10px] text-white/80 font-bold select-none pointer-events-none">
                        {search.filteredCount} of {search.totalCount}
                      </span>
                    )}

                    {search.searchTerm ? (
                      <button
                        type="button"
                        onClick={() => {
                          search.setSearchTerm('');
                          setIsDropdownOpen(false);
                          setActiveIndex(-1);
                          searchInputRef.current?.focus();
                        }}
                        className="absolute right-2 text-white/80 hover:text-white transition-colors p-0.5 cursor-pointer"
                        aria-label="Clear search"
                      >
                        <X size={13} aria-hidden="true" />
                      </button>
                    ) : (
                      <Search size={13} className="text-white/70 absolute right-2 pointer-events-none" aria-hidden="true" />
                    )}
                  </div>

                  {isDropdownOpen && search.searchTerm.trim() && (
                    <div className="absolute top-full left-0 mt-1 w-full bg-[#E6F4F2] border border-[#2F9E9A] rounded-lg shadow-xl z-50 overflow-hidden py-1 text-[#0B2545]">
                      {matches.length === 0 ? (
                        <div className="px-3 py-2 text-xs text-[#1B4360] italic">
                          No powerhouse matches
                        </div>
                      ) : (
                        matches.map((plantName, idx) => (
                          <button
                            key={plantName}
                            type="button"
                            onMouseEnter={() => setActiveIndex(idx)}
                            onClick={() => {
                              search.onSelectPlant?.(plantName);
                              setIsDropdownOpen(false);
                              setActiveIndex(-1);
                            }}
                            className={`w-full text-left px-3 py-1.5 text-xs transition-colors flex items-center justify-between ${
                              idx === activeIndex
                                ? 'bg-[#B6E3D6] text-[#0B2545] font-bold border-l-2 border-[#2F9E9A]'
                                : 'text-[#0B2545] hover:bg-white/60'
                            }`}
                          >
                            <span className="truncate">{plantName}</span>
                            {idx === activeIndex && <span className="text-[10px] text-[#2F9E9A] ml-2">↵</span>}
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowNotifications(!showNotifications)}
                  aria-label={`Notifications (${mockAlerts.length} active)`}
                  aria-expanded={showNotifications}
                  aria-haspopup="true"
                  className="p-1.5 rounded-lg bg-white/15 border border-white/25 hover:border-[#B6E3D6] text-white/90 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B6E3D6] transition-all relative flex items-center justify-center cursor-pointer"
                >
                  <Bell size={15} aria-hidden="true" />
                  {mockAlerts.length > 0 && (
                    <span className="absolute top-1 right-1 flex h-2 w-2" aria-hidden="true">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-status-shutdown opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-status-shutdown" />
                    </span>
                  )}
                </button>

                {showNotifications && (
                  <div
                    role="dialog"
                    aria-label="Live Notifications"
                    className="absolute right-0 mt-2 w-72 md:w-80 bg-[#E6F4F2] border border-[#2F9E9A] rounded-xl shadow-xl z-50 p-3 animate-fadeIn text-[#0B2545]"
                  >
                    <div className="flex items-center justify-between mb-2.5 border-b border-[#2F9E9A]/30 pb-2">
                      <span className="text-xs font-bold tracking-wider text-[#0B2545] uppercase">Live Notifications</span>
                      <span className="text-[10px] text-[#0B2545] font-semibold bg-white/70 px-2 py-0.5 rounded-full border border-[#2F9E9A]/40">
                        {mockAlerts.length} Active
                      </span>
                    </div>
                    <div className="space-y-2">
                      {mockAlerts.map(alert => (
                        <div key={alert.id} className="flex gap-2 bg-white/70 p-2 rounded-lg border border-[#2F9E9A]/20">
                          <AlertTriangle size={13} className="text-[#23807F] shrink-0 mt-0.5" aria-hidden="true" />
                          <p className="text-[11px] text-[#143552] leading-relaxed font-medium">{alert.message}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <span className="hidden md:inline-block text-[11px] font-semibold text-white/90 tracking-wider uppercase bg-white/15 border border-white/25 px-2.5 py-1 rounded-lg select-none">
                {today}
              </span>

              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider ${getRoleColor(user?.role)}`}>
                {user?.role}
              </span>
            </div>
          </header>

          <main
            className={`flex-1 min-h-0 min-w-0 animate-fadeIn ${
              noScroll
                ? 'p-2.5 xl:p-3 overflow-hidden flex flex-col'
                : 'p-4 sm:p-5 md:p-6 overflow-y-auto overflow-x-hidden space-y-4'
            }`}
            role="main"
          >
            {children}
          </main>
        </div>
      </div>
    </ErrorBoundary>
  );
}
