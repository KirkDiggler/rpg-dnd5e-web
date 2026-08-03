/**
 * EquipmentCategoryDropdown — rpg-dnd5e-web#670. A compact, accessible
 * dropdown for picking one item from a live `EquipmentCategoryChoice`
 * category slot. Kirk's call after reviewing #670 Phase 1: keep the
 * dropdown *interaction* (a closed, compact trigger — not an always-open
 * grid), but make the items INSIDE the opened dropdown rich content
 * (damage dice/type/range/properties for weapons; AC/dex/category/
 * stealth/strength for armor), reusing `EquipmentCard` rather than
 * duplicating its formatting.
 *
 * This is wired directly into the production category-choice path
 * (`EquipmentBundleChoice`'s `CategorySelector`) and renders the
 * authoritative `EquipmentCategoryChoice.options` items exactly as the API
 * supplies them. It has no eligibility or category reconstruction logic.
 *
 * Accessibility: implements the W3C ARIA APG "select-only" combobox
 * pattern (w3.org/WAI/ARIA/apg/patterns/combobox/examples/combobox-select-only/)
 * — a `role="combobox"` trigger owns focus and `aria-activedescendant`
 * points at the active option in a popup `role="listbox"`; Up/Down/Home/
 * End/Enter/Escape are supported, and the popup closes on outside click,
 * Escape, or selection, returning focus to the trigger.
 */

import type { EquipmentItem } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/choices_pb';
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { EquipmentCard } from './EquipmentCard';

export interface EquipmentCategoryDropdownProps {
  /** Accessible name for the combobox trigger, e.g. "Choose item 1". */
  ariaLabel: string;
  /** Placeholder shown in the trigger when nothing is selected. */
  placeholder?: string;
  /** Authoritative, enriched category options for this slot. */
  options: EquipmentItem[];
  /** Currently selected option id (controlled), or null. */
  selectedId: string | null;
  onChange: (id: string) => void;
  /** True while `options` is being fetched. */
  isLoading?: boolean;
  /** Non-null if the last fetch failed. */
  error?: Error | null;
  /** Optional retry handler, surfaced next to the error message. */
  onRetry?: () => void;
  /** Optional id root for stable test/DOM ids; auto-generated if omitted. */
  id?: string;
}

export function EquipmentCategoryDropdown({
  ariaLabel,
  placeholder = '-- Select item --',
  options,
  selectedId,
  onChange,
  isLoading = false,
  error = null,
  onRetry,
  id,
}: EquipmentCategoryDropdownProps) {
  const autoId = useId();
  const rootId = id ?? `equipment-category-dropdown-${autoId}`;
  const listboxId = `${rootId}-listbox`;
  const triggerId = `${rootId}-trigger`;

  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(selectedId);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const optionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const selectedItem = useMemo(
    () => options.find((o) => o.selectionId === selectedId) ?? null,
    [options, selectedId]
  );

  const disabled = isLoading || !!error || options.length === 0;

  // Keep the active (highlighted-while-open) option pointed at something
  // real whenever the option list changes out from under an open dropdown.
  useEffect(() => {
    if (options.length === 0) {
      setActiveId(null);
      return;
    }
    if (!options.some((o) => o.selectionId === activeId)) {
      setActiveId(selectedId ?? options[0].selectionId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options]);

  const closeAndFocusTrigger = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [open]);

  const activeIndex = useMemo(
    () => options.findIndex((o) => o.selectionId === activeId),
    [options, activeId]
  );

  const moveActive = useCallback(
    (nextIndex: number) => {
      if (options.length === 0) return;
      const clamped = Math.max(0, Math.min(options.length - 1, nextIndex));
      setActiveId(options[clamped].selectionId);
    },
    [options]
  );

  const commit = useCallback(
    (optionId: string) => {
      onChange(optionId);
      closeAndFocusTrigger();
    },
    [onChange, closeAndFocusTrigger]
  );

  const handleTriggerKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (disabled) return;
      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          if (!open) {
            setOpen(true);
            setActiveId(selectedId ?? options[0]?.selectionId ?? null);
          } else {
            moveActive(activeIndex + 1);
          }
          break;
        case 'ArrowUp':
          event.preventDefault();
          if (!open) {
            setActiveId(selectedId ?? options[0]?.selectionId ?? null);
          } else {
            moveActive(activeIndex - 1);
          }
          break;
        case 'Home':
          if (open) {
            event.preventDefault();
            moveActive(0);
          }
          break;
        case 'End':
          if (open) {
            event.preventDefault();
            moveActive(options.length - 1);
          }
          break;
        case 'Enter':
        case ' ':
          event.preventDefault();
          if (!open) {
            setOpen(true);
            setActiveId(selectedId ?? options[0]?.selectionId ?? null);
          } else if (activeId) {
            commit(activeId);
          }
          break;
        case 'Escape':
          if (open) {
            event.preventDefault();
            closeAndFocusTrigger();
          }
          break;
        case 'Tab':
          if (open) setOpen(false);
          break;
        default:
          break;
      }
    },
    [
      disabled,
      open,
      activeIndex,
      activeId,
      moveActive,
      commit,
      selectedId,
      options,
      closeAndFocusTrigger,
    ]
  );

  useEffect(() => {
    if (open && activeId) {
      optionRefs.current[activeId]?.scrollIntoView?.({ block: 'nearest' });
    }
  }, [open, activeId]);

  return (
    <div
      ref={containerRef}
      style={{ position: 'relative' }}
      data-testid={rootId}
    >
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-label={ariaLabel}
        aria-activedescendant={
          open && activeId ? `${rootId}-option-${activeId}` : undefined
        }
        disabled={disabled}
        data-testid={`${rootId}-trigger`}
        onClick={() => {
          if (disabled) return;
          setOpen((prev) => !prev);
          if (!open) setActiveId(selectedId ?? options[0]?.selectionId ?? null);
        }}
        onKeyDown={handleTriggerKeyDown}
        style={{
          width: '100%',
          padding: '8px 12px',
          backgroundColor: 'var(--bg-secondary)',
          border: `1px solid ${open ? 'var(--accent-primary)' : 'var(--border-primary)'}`,
          borderRadius: '4px',
          color: 'var(--text-primary)',
          fontSize: '13px',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.6 : 1,
          outline: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
          textAlign: 'left',
        }}
      >
        <span
          style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {isLoading
            ? 'Loading options…'
            : error
              ? 'Failed to load options'
              : selectedItem
                ? (selectedItem.equipmentDetail?.name ??
                  selectedItem.selectionId)
                : options.length === 0
                  ? 'No options available'
                  : placeholder}
        </span>
        <span aria-hidden="true" style={{ fontSize: '10px', opacity: 0.7 }}>
          {open ? '▲' : '▼'}
        </span>
      </button>

      {error && (
        <div
          role="alert"
          style={{
            marginTop: '6px',
            padding: '8px 10px',
            border: '1px solid var(--border-primary)',
            borderRadius: '4px',
            fontSize: '12px',
            color: 'var(--text-secondary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
          }}
        >
          <span>Couldn&apos;t load options: {error.message}</span>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--accent-primary)',
                cursor: 'pointer',
                fontSize: '12px',
                textDecoration: 'underline',
              }}
            >
              Retry
            </button>
          )}
        </div>
      )}

      {open && !disabled && (
        <div
          role="listbox"
          id={listboxId}
          aria-label={ariaLabel}
          data-testid={`${rootId}-listbox`}
          style={{
            position: 'absolute',
            zIndex: 20,
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            maxHeight: '320px',
            overflowY: 'auto',
            backgroundColor: 'var(--bg-primary)',
            border: '1px solid var(--border-primary)',
            borderRadius: '6px',
            boxShadow: '0 8px 20px rgba(0,0,0,0.35)',
            padding: '4px',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
          }}
        >
          {options.map((option) => {
            const isSelected = option.selectionId === selectedId;
            const isActive = option.selectionId === activeId;
            return (
              <div
                key={option.selectionId}
                ref={(node) => {
                  optionRefs.current[option.selectionId] = node;
                }}
                role="option"
                id={`${rootId}-option-${option.selectionId}`}
                aria-selected={isSelected}
                data-testid={`${rootId}-option-${option.selectionId}`}
                onMouseEnter={() => setActiveId(option.selectionId)}
                onClick={() => commit(option.selectionId)}
                style={{
                  cursor: 'pointer',
                  borderRadius: '6px',
                  outline: isActive
                    ? '2px solid var(--accent-primary)'
                    : '2px solid transparent',
                  outlineOffset: '1px',
                  boxShadow: isSelected
                    ? '0 0 0 2px var(--accent-primary) inset'
                    : 'none',
                }}
              >
                <EquipmentCard equipment={option.equipmentDetail!} compact />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
