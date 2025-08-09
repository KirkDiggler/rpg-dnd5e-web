import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { cn } from '../../../utils/cn';

/**
 * Custom select component with consistent theming and search capability
 */
export interface SelectOption {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
  icon?: React.ReactNode;
}

export interface SelectProps {
  /** Options to display */
  options: SelectOption[];
  /** Current selected value */
  value?: string;
  /** Callback when selection changes */
  onChange: (value: string) => void;
  /** Placeholder text */
  placeholder?: string;
  /** Whether select is disabled */
  disabled?: boolean;
  /** Error message */
  error?: string;
  /** Whether to show search */
  searchable?: boolean;
  /** Custom className */
  className?: string;
  /** Label for accessibility */
  label?: string;
  /** Multiple selection */
  multiple?: boolean;
  /** Selected values for multiple */
  values?: string[];
  /** Callback for multiple selection */
  onMultipleChange?: (values: string[]) => void;
}

export function Select({
  options,
  value,
  onChange,
  placeholder = 'Select an option...',
  disabled = false,
  error,
  searchable = false,
  className,
  label,
  multiple = false,
  values = [],
  onMultipleChange,
}: SelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const selectRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Filter options based on search
  const filteredOptions = searchable
    ? options.filter(
        (option) =>
          option.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
          option.description?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : options;

  // Get selected option(s) for display
  const selectedOption = options.find((opt) => opt.value === value);
  const selectedOptions = multiple
    ? options.filter((opt) => values.includes(opt.value))
    : [];

  // Handle click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        selectRef.current &&
        !selectRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
        setSearchQuery('');
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Focus search when opened
  useEffect(() => {
    if (isOpen && searchable && searchRef.current) {
      searchRef.current.focus();
    }
  }, [isOpen, searchable]);

  const handleSelect = (optionValue: string) => {
    if (multiple && onMultipleChange) {
      const newValues = values.includes(optionValue)
        ? values.filter((v) => v !== optionValue)
        : [...values, optionValue];
      onMultipleChange(newValues);
    } else {
      onChange(optionValue);
      setIsOpen(false);
      setSearchQuery('');
    }
  };

  const displayValue = () => {
    if (multiple) {
      if (selectedOptions.length === 0) return placeholder;
      if (selectedOptions.length === 1) return selectedOptions[0].label;
      return `${selectedOptions.length} selected`;
    }
    return selectedOption?.label || placeholder;
  };

  return (
    <div className={cn('relative', className)} ref={selectRef}>
      {/* Label */}
      {label && (
        <label
          className="block text-sm font-medium mb-2"
          style={{ color: 'var(--text-primary)' }}
        >
          {label}
        </label>
      )}

      {/* Select Trigger */}
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={cn(
          'w-full px-3 py-2 text-left border rounded-md transition-colors',
          'focus:outline-none focus:ring-2 focus:ring-offset-2',
          disabled && 'opacity-50 cursor-not-allowed',
          error ? 'border-red-500 focus:ring-red-500' : 'focus:ring-blue-500',
          'flex items-center justify-between'
        )}
        style={{
          backgroundColor: 'var(--card-bg)',
          borderColor: error ? '#ef4444' : 'var(--border-primary)',
          color:
            selectedOption || selectedOptions.length > 0
              ? 'var(--text-primary)'
              : 'var(--text-muted)',
        }}
      >
        <span className="truncate">{displayValue()}</span>
        <ChevronDown
          className={cn('w-4 h-4 transition-transform', isOpen && 'rotate-180')}
        />
      </button>

      {/* Dropdown */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.15 }}
            className="absolute z-50 w-full mt-1 border rounded-md shadow-lg max-h-60 overflow-y-auto"
            style={{
              backgroundColor: 'var(--modal-bg)',
              borderColor: 'var(--border-primary)',
            }}
          >
            {/* Search input */}
            {searchable && (
              <div
                className="p-2 border-b"
                style={{ borderColor: 'var(--border-primary)' }}
              >
                <input
                  ref={searchRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search options..."
                  className="w-full px-2 py-1 text-sm border rounded"
                  style={{
                    backgroundColor: 'var(--card-bg)',
                    borderColor: 'var(--border-primary)',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>
            )}

            {/* Options */}
            <div className="py-1">
              {filteredOptions.length === 0 ? (
                <div
                  className="px-3 py-2 text-sm"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {searchable ? 'No options found' : 'No options available'}
                </div>
              ) : (
                filteredOptions.map((option) => {
                  const isSelected = multiple
                    ? values.includes(option.value)
                    : value === option.value;

                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() =>
                        !option.disabled && handleSelect(option.value)
                      }
                      disabled={option.disabled}
                      className={cn(
                        'w-full px-3 py-2 text-left transition-colors flex items-center gap-2',
                        'hover:bg-black hover:bg-opacity-5',
                        isSelected && 'bg-blue-100 bg-opacity-20',
                        option.disabled && 'opacity-50 cursor-not-allowed'
                      )}
                      style={{
                        color: option.disabled
                          ? 'var(--text-muted)'
                          : 'var(--text-primary)',
                      }}
                    >
                      {/* Multiple selection checkbox */}
                      {multiple && (
                        <div
                          className={cn(
                            'w-4 h-4 border rounded flex items-center justify-center',
                            isSelected && 'bg-blue-600 border-blue-600'
                          )}
                        >
                          {isSelected && (
                            <Check className="w-3 h-3 text-white" />
                          )}
                        </div>
                      )}

                      {/* Icon */}
                      {option.icon && (
                        <span className="flex-shrink-0">{option.icon}</span>
                      )}

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">
                          {option.label}
                        </div>
                        {option.description && (
                          <div
                            className="text-xs truncate"
                            style={{ color: 'var(--text-muted)' }}
                          >
                            {option.description}
                          </div>
                        )}
                      </div>

                      {/* Single selection checkmark */}
                      {!multiple && isSelected && (
                        <Check className="w-4 h-4 text-blue-600" />
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error message */}
      {error && <p className="mt-1 text-sm text-red-500">{error}</p>}
    </div>
  );
}
