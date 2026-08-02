/**
 * EquipmentCategoryPicker — rpg-dnd5e-web#668 Phase 1 (rpg-project#173,
 * ideas/equipment-enrichment/plan.md). A reusable, accessible listbox for
 * picking `chooseCount` items out of a category's concrete, enriched
 * `EquipmentItem[]` — the shape `EquipmentCategoryChoice.options` will carry
 * once the toolkit/API side of the wave lands (Phase 2, deferred).
 *
 * Boundary rule: this component NEVER decides which items are eligible for a
 * category — it only renders the `options` it is handed and reports which of
 * them the player picked. Eligibility (which weapon IDs count as "martial",
 * Monk's simple-melee/simple-ranged set, any class-specific exclusion) is a
 * toolkit decision that arrives already resolved on the wire — see
 * design.md's 2026-08-01 update. Phase 1 feeds this component typed fixtures
 * only (see the `equipment-category-picker` concept); it is not wired to any
 * production choice flow, and no eligibility is reconstructed here to do so.
 *
 * Accessibility: implements the ARIA listbox pattern (w3.org/WAI/ARIA/apg/
 * patterns/listbox/) — `role="listbox"`, `aria-multiselectable` when
 * `chooseCount > 1`, per-option `role="option"`/`aria-selected`, a roving
 * tabindex, and Up/Down/Home/End/Enter/Space keyboard support. Selection is
 * fully controlled by the caller (`selectedIds`/`onChange`) so it can be
 * unit-tested and later driven by real wire data without changing this
 * component.
 */

import type { EquipmentItem } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/choices_pb';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EquipmentCard } from './EquipmentCard';

export interface EquipmentCategoryPickerProps {
  /** Human-readable category label, e.g. "Choose a martial weapon". */
  label: string;
  /** How many of `options` the player must/may pick. */
  chooseCount: number;
  /** Concrete, enriched options — fixture data in Phase 1, live
   * `EquipmentCategoryChoice.options` once Phase 2 lands. */
  options: EquipmentItem[];
  /** True while options are being fetched — renders a busy placeholder
   * instead of an empty-state message. */
  isLoading?: boolean;
  /** Currently selected option `selectionId`s (controlled). */
  selectedIds: string[];
  onChange: (selectedIds: string[]) => void;
  /** Optional id for the picker root, used to build stable test/DOM ids. */
  id?: string;
}

function displayName(item: EquipmentItem): string {
  if (item.equipmentDetail?.name) return item.equipmentDetail.name;
  if (item.typeHint.case) return item.typeHint.case;
  return item.selectionId;
}

export function EquipmentCategoryPicker({
  label,
  chooseCount,
  options,
  isLoading = false,
  selectedIds,
  onChange,
  id,
}: EquipmentCategoryPickerProps) {
  const rootId =
    id ??
    `equipment-category-picker-${label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')}`;
  const listboxId = `${rootId}-listbox`;
  const optionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Roving tabindex: exactly one option is part of the tab sequence at a
  // time. Defaults to the first selected option, else the first option.
  const [activeId, setActiveId] = useState<string | null>(
    () => selectedIds[0] ?? options[0]?.selectionId ?? null
  );

  // Options can arrive asynchronously (isLoading -> populated) after mount,
  // or the currently-active option can disappear from a refreshed list.
  // Keep the roving tabindex pointed at a real, present option whenever
  // possible so the listbox never becomes keyboard-unreachable (Copilot
  // review, PR #670).
  useEffect(() => {
    if (options.length === 0) {
      if (activeId !== null) setActiveId(null);
      return;
    }
    const stillPresent = options.some((o) => o.selectionId === activeId);
    if (!stillPresent) {
      setActiveId(selectedIds[0] ?? options[0].selectionId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options]);

  const activeIndex = useMemo(
    () => options.findIndex((o) => o.selectionId === activeId),
    [options, activeId]
  );

  const atCapacity = chooseCount > 0 && selectedIds.length >= chooseCount;

  const toggle = useCallback(
    (selectionId: string) => {
      const isSelected = selectedIds.includes(selectionId);
      if (isSelected) {
        onChange(selectedIds.filter((id_) => id_ !== selectionId));
        return;
      }
      if (chooseCount <= 1) {
        onChange([selectionId]);
        return;
      }
      if (selectedIds.length >= chooseCount) {
        // Already at capacity — ignore. The picker never silently evicts an
        // existing pick; the player must deselect first.
        return;
      }
      onChange([...selectedIds, selectionId]);
    },
    [selectedIds, onChange, chooseCount]
  );

  const moveActive = useCallback(
    (nextIndex: number) => {
      if (options.length === 0) return;
      const clamped = Math.max(0, Math.min(options.length - 1, nextIndex));
      const next = options[clamped].selectionId;
      setActiveId(next);
      optionRefs.current[next]?.focus();
    },
    [options]
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          moveActive(activeIndex + 1);
          break;
        case 'ArrowUp':
          event.preventDefault();
          moveActive(activeIndex - 1);
          break;
        case 'Home':
          event.preventDefault();
          moveActive(0);
          break;
        case 'End':
          event.preventDefault();
          moveActive(options.length - 1);
          break;
        case 'Enter':
        case ' ':
          event.preventDefault();
          if (activeId) toggle(activeId);
          break;
        default:
          break;
      }
    },
    [activeIndex, activeId, moveActive, toggle, options.length]
  );

  const helperText =
    chooseCount > 1
      ? `Choose ${chooseCount} (${selectedIds.length}/${chooseCount} selected)`
      : 'Choose one';

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
      data-testid={rootId}
    >
      <div
        id={`${listboxId}-label`}
        style={{
          fontSize: '13px',
          fontWeight: 600,
          color: 'var(--text-primary)',
        }}
      >
        {label}
      </div>
      <div
        id={`${listboxId}-helper`}
        style={{ fontSize: '11px', color: 'var(--text-secondary)' }}
      >
        {helperText}
      </div>

      {isLoading && (
        <div role="status" aria-busy="true" style={emptyStateStyle}>
          Loading options…
        </div>
      )}

      {!isLoading && options.length === 0 && (
        <div role="status" style={emptyStateStyle}>
          No options available.
        </div>
      )}

      {!isLoading && options.length > 0 && (
        <div
          role="listbox"
          id={listboxId}
          aria-labelledby={`${listboxId}-label`}
          aria-describedby={`${listboxId}-helper`}
          aria-multiselectable={chooseCount > 1}
          onKeyDown={handleKeyDown}
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
            gap: '8px',
            maxHeight: '420px',
            overflowY: 'auto',
            padding: '4px',
          }}
        >
          {options.map((option) => {
            const isSelected = selectedIds.includes(option.selectionId);
            const isActive = option.selectionId === activeId;
            const disableFurtherSelection =
              !isSelected && atCapacity && chooseCount > 1;

            return (
              <div
                key={option.selectionId}
                ref={(node) => {
                  optionRefs.current[option.selectionId] = node;
                }}
                role="option"
                aria-selected={isSelected}
                aria-disabled={disableFurtherSelection || undefined}
                tabIndex={isActive ? 0 : -1}
                data-testid={`equipment-category-option-${option.selectionId}`}
                onFocus={() => setActiveId(option.selectionId)}
                onClick={() => {
                  if (disableFurtherSelection) return;
                  setActiveId(option.selectionId);
                  toggle(option.selectionId);
                }}
                style={{
                  cursor: disableFurtherSelection ? 'not-allowed' : 'pointer',
                  opacity: disableFurtherSelection ? 0.5 : 1,
                  borderRadius: '8px',
                  outline: isActive
                    ? '2px solid var(--accent-primary)'
                    : '2px solid transparent',
                  outlineOffset: '2px',
                  boxShadow: isSelected
                    ? '0 0 0 2px var(--accent-primary) inset'
                    : 'none',
                  transition: 'outline-color 0.1s, box-shadow 0.1s',
                }}
              >
                {option.equipmentDetail ? (
                  <EquipmentCard equipment={option.equipmentDetail} compact />
                ) : (
                  <div
                    style={{
                      padding: '8px 10px',
                      backgroundColor: 'var(--bg-secondary)',
                      border: '1px solid var(--border-primary)',
                      borderRadius: '6px',
                      fontSize: '13px',
                      color: 'var(--text-primary)',
                    }}
                  >
                    {displayName(option)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const emptyStateStyle: React.CSSProperties = {
  padding: '16px',
  border: '1px dashed var(--border-primary)',
  borderRadius: '6px',
  fontSize: '13px',
  color: 'var(--text-secondary)',
  textAlign: 'center',
};
