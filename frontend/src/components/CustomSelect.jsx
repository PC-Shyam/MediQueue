import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';

const CustomSelect = ({ options, value, onChange, placeholder, disabled }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  const selectedOption = options.find(opt => opt.value === value || opt === value);
  const displayValue = selectedOption?.label || selectedOption || placeholder;

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="custom-select-container" ref={containerRef}>
      <div 
        className={`custom-select-trigger ${isOpen ? 'active' : ''} ${disabled ? 'disabled' : ''}`}
        onClick={() => !disabled && setIsOpen(!isOpen)}
      >
        <span>{displayValue}</span>
        <ChevronDown size={16} className={`arrow ${isOpen ? 'rotate' : ''}`} />
      </div>

      {isOpen && (
        <div className="custom-select-dropdown animate-in">
          {options.map((opt, i) => {
            const val = opt.value || opt;
            const label = opt.label || opt;
            return (
              <div 
                key={i} 
                className={`custom-select-option ${value === val ? 'selected' : ''}`}
                onClick={() => {
                  onChange(val);
                  setIsOpen(false);
                }}
              >
                {label}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default CustomSelect;
