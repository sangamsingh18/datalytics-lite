import React, { useEffect, useRef, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';

/**
 * CustomDropdown — Globally styled dropdown matching the target UI specs.
 * 
 * Props:
 *   value: string or number
 *   onChange: function(value)
 *   options: array of { label, value } or array of strings, or grouped { label, options: [] }
 *   placeholder: string
 *   disabled: boolean
 *   className: string
 *   searchable: boolean
 *   searchPlaceholder: string
 */
export default function CustomDropdown({ 
  value, 
  onChange, 
  options = [], 
  placeholder = 'Select…', 
  disabled = false, 
  className = '',
  searchable = false,
  searchPlaceholder = 'Search...',
  style = {},
  children
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const dropdownRef = useRef(null);
  const searchInputRef = useRef(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [dropdownStyles, setDropdownStyles] = useState({});
  const [direction, setDirection] = useState('down');

  // Close on outside click
  useEffect(() => {
    function handler(e) {
      const clickedOutsideRoot = rootRef.current && !rootRef.current.contains(e.target);
      const clickedOutsideDropdown = dropdownRef.current && !dropdownRef.current.contains(e.target);
      
      if (clickedOutsideRoot && clickedOutsideDropdown) {
        setOpen(false);
        setSearchQuery('');
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Close on scroll to prevent detached fixed dropdown
  useEffect(() => {
    if (!open) return;
    function handleScroll(e) {
      if (dropdownRef.current && dropdownRef.current.contains(e.target)) return;
      setOpen(false);
      setSearchQuery('');
    }
    window.addEventListener('scroll', handleScroll, true);
    return () => window.removeEventListener('scroll', handleScroll, true);
  }, [open]);

  // Focus search input when opened
  useEffect(() => {
    if (open && searchable && searchInputRef.current) {
      setTimeout(() => searchInputRef.current.focus(), 50);
    }
  }, [open, searchable]);

  // Normalize and filter options
  const { normalizedOptions, selectedLabel } = useMemo(() => {
    let selLabel = null;
    let baseOptions = options;

    if (children) {
      baseOptions = [];
      React.Children.forEach(children, child => {
        if (!child) return;
        if (child.type === 'option') {
          baseOptions.push({
            label: child.props.children,
            value: child.props.value !== undefined ? child.props.value : child.props.children
          });
        } else if (child.type === 'optgroup') {
          const groupOpts = [];
          React.Children.forEach(child.props.children, subChild => {
            if (!subChild || subChild.type !== 'option') return;
            groupOpts.push({
              label: subChild.props.children,
              value: subChild.props.value !== undefined ? subChild.props.value : subChild.props.children
            });
          });
          baseOptions.push({ label: child.props.label, options: groupOpts });
        }
      });
    }

    const isGrouped = baseOptions.length > 0 && 'options' in baseOptions[0];
    
    let processed = [];
    
    if (isGrouped) {
      processed = baseOptions.map(group => {
        const filteredGroupOptions = group.options
          .map(opt => typeof opt === 'object' ? { ...opt, value: String(opt.value) } : { label: String(opt), value: String(opt) })
          .filter(opt => !searchQuery || opt.label.toLowerCase().includes(searchQuery.toLowerCase()));
          
        filteredGroupOptions.forEach(opt => {
          if (opt.value === String(value)) selLabel = opt.label;
        });
        
        return { label: group.label, options: filteredGroupOptions };
      }).filter(group => group.options.length > 0);
    } else {
      processed = baseOptions
        .map(opt => typeof opt === 'object' ? { ...opt, value: String(opt.value) } : { label: String(opt), value: String(opt) })
        .filter(opt => !searchQuery || String(opt.label).toLowerCase().includes(searchQuery.toLowerCase()));
        
      processed.forEach(opt => {
        if (opt.value === String(value)) selLabel = opt.label;
      });
    }
    
    return { normalizedOptions: processed, selectedLabel: selLabel };
  }, [options, children, value, searchQuery]);

  function handleKeyDown(e) {
    if (disabled) return;
    if (e.key === 'Escape') {
      setOpen(false);
      setSearchQuery('');
      rootRef.current?.focus();
    }
  }

  function toggleOpen(e) {
    if (disabled) return;
    if (!open && rootRef.current) {
      const rect = rootRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      
      let dir = 'down';
      if (spaceBelow < 300 && spaceAbove > spaceBelow) {
        dir = 'up';
      }
      setDirection(dir);
      
      setDropdownStyles({
        position: 'fixed',
        left: rect.left,
        width: rect.width,
        ...(dir === 'up' 
          ? { bottom: window.innerHeight - rect.top + 4 }
          : { top: rect.bottom + 4 }
        ),
        zIndex: 99999
      });
    }
    setOpen(v => !v);
    if (open) setSearchQuery('');
  }

  const isGrouped = normalizedOptions.length > 0 && 'options' in normalizedOptions[0];

  return (
    <div
      ref={rootRef}
      className={`relative w-full font-sans text-sm ${open ? 'z-[999]' : 'z-[10]'} ${disabled ? 'opacity-60 cursor-not-allowed' : ''} ${className}`}
      style={style}
      onKeyDown={handleKeyDown}
    >
      <button
        type="button"
        className={`w-full flex items-center justify-between bg-[#1a1f2e] text-slate-200 border rounded-lg px-3.5 py-2.5 outline-none transition-all duration-200 ${
          open ? 'border-green-500 ring-1 ring-green-500' : 'border-slate-700 hover:border-slate-600'
        }`}
        onClick={toggleOpen}
        disabled={disabled}
      >
        <span className={`whitespace-nowrap overflow-hidden text-ellipsis ${!selectedLabel ? 'text-slate-400' : ''}`}>
          {selectedLabel || placeholder}
        </span>
        <svg 
          className={`flex-shrink-0 ml-2.5 text-slate-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} 
          width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && typeof document !== 'undefined' && createPortal(
        <div 
          ref={dropdownRef}
          className={`bg-[#1a1f2e] border border-slate-700 rounded-lg shadow-2xl flex flex-col`}
          style={{ ...dropdownStyles, maxHeight: '250px' }}
        >
          {searchable && (
            <div className="p-2 border-b border-slate-700 shrink-0">
              <input 
                ref={searchInputRef}
                type="text" 
                className="w-full bg-white/5 border border-slate-700 rounded-md px-3 py-2 text-slate-200 text-sm outline-none focus:border-green-500" 
                placeholder={searchPlaceholder}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          )}
          <div className="overflow-y-auto p-1 custom-scrollbar">
            {normalizedOptions.length === 0 ? (
              <div className="p-3 text-center text-slate-400 text-sm">No options found</div>
            ) : isGrouped ? (
              normalizedOptions.map((group, gIdx) => (
                <div key={gIdx} className="mt-2 mb-1">
                  <div className="px-3.5 py-1 text-[11px] font-bold text-green-500 uppercase tracking-wider">{group.label}</div>
                  {group.options.map(opt => {
                    const isActive = String(opt.value) === String(value);
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        className={`w-full text-left px-3.5 py-2 text-sm rounded-md transition-colors ${
                          isActive ? 'bg-blue-200 text-[#1a1f2e] font-medium hover:bg-blue-300' : 'text-slate-200 bg-transparent hover:bg-blue-200/15'
                        }`}
                        onClick={() => { onChange(opt.value, { target: { value: opt.value } }); setOpen(false); setSearchQuery(''); }}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              ))
            ) : (
              normalizedOptions.map((opt) => {
                const isActive = String(opt.value) === String(value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    className={`w-full text-left px-3.5 py-2 text-sm rounded-md transition-colors ${
                      isActive ? 'bg-blue-200 text-[#1a1f2e] font-medium hover:bg-blue-300' : 'text-slate-200 bg-transparent hover:bg-blue-200/15'
                    }`}
                    onClick={() => { onChange(opt.value, { target: { value: opt.value } }); setOpen(false); setSearchQuery(''); }}
                  >
                    {opt.label}
                  </button>
                );
              })
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
