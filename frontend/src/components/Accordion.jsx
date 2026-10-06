import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

/**
 * Generic Accordion component with smooth slide transitions.
 *
 * Props:
 *   title: string – header label displayed on the accordion bar
 *   children: ReactNode – content rendered when the accordion is expanded
 *   defaultOpen?: boolean – initial open state (default false)
 *   className?: string – additional Tailwind classes for outer wrapper
 */
export default function Accordion({ title, children, defaultOpen = false, className = '' }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={`card !p-0 overflow-hidden ${className}`}> 
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-white/25 hover:bg-white/40 transition-colors"
      >
        <span className="text-sm font-bold text-[#0B2545] uppercase tracking-wider">{title}</span>
        {open ? (
          <ChevronDown size={16} className="text-[#23807F]" />
        ) : (
          <ChevronRight size={16} className="text-[#23807F]" />
        )}
      </button>
      <div
        className={`px-4 pt-2 pb-3 text-[#143552] transform transition-all duration-300 ${open ? 'max-h-screen opacity-100' : 'max-h-0 opacity-0 overflow-hidden'}`}
      >
        {children}
      </div>
    </div>
  );
}
