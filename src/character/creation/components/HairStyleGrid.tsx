import type { HairSlotSelection } from '@/character/customization/hairCustomization';
import {
  DWARF_CUSTOMIZATION_CATALOG,
  type DwarfStyleOption,
} from '@/generated/dwarfCustomizationCatalog';
import { useState } from 'react';

export interface HairStyleGridProps {
  slot: 'scalp' | 'facialHair';
  selection: HairSlotSelection;
  onChange: (selection: HairSlotSelection) => void;
}

function isSelected(
  current: HairSlotSelection,
  candidate: HairSlotSelection
): boolean {
  if (current.kind !== candidate.kind) return false;
  return (
    current.kind !== 'style' ||
    (candidate.kind === 'style' && current.styleRef === candidate.styleRef)
  );
}

function StyleOptionButton({
  option,
  selected,
  onSelect,
}: {
  option: DwarfStyleOption;
  selected: boolean;
  onSelect: () => void;
}) {
  const [imageFailed, setImageFailed] = useState(false);

  return (
    <button
      type="button"
      aria-label={option.label}
      aria-pressed={selected}
      onClick={onSelect}
      className={`min-w-0 rounded-lg border p-1.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${
        selected
          ? 'border-[var(--accent-primary)] bg-white/10 ring-1 ring-[var(--accent-primary)]'
          : 'border-[var(--border-primary)] bg-black/10 hover:bg-white/5'
      }`}
    >
      <span className="flex aspect-square items-center justify-center overflow-hidden rounded bg-black/20 text-center text-[0.65rem] text-[var(--text-muted)]">
        {imageFailed ? (
          <span>{option.label} preview unavailable</span>
        ) : (
          <img
            src={option.thumbnailUrl}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover"
            onError={() => setImageFailed(true)}
          />
        )}
      </span>
      {!imageFailed && (
        <span className="mt-1 block truncate text-center text-[0.7rem] text-[var(--text-primary)]">
          {option.label}
        </span>
      )}
    </button>
  );
}

function GeneratedChoiceButton({
  label,
  selected,
  onSelect,
}: {
  label: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={`aspect-square rounded-lg border p-2 text-center text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${
        selected
          ? 'border-[var(--accent-primary)] bg-white/10 ring-1 ring-[var(--accent-primary)]'
          : 'border-[var(--border-primary)] bg-black/10 hover:bg-white/5'
      }`}
    >
      {label}
    </button>
  );
}

export function HairStyleGrid({
  slot,
  selection,
  onChange,
}: HairStyleGridProps) {
  const slotCatalog =
    slot === 'scalp'
      ? DWARF_CUSTOMIZATION_CATALOG.slots.scalp
      : DWARF_CUSTOMIZATION_CATALOG.slots.facialHair;
  const label = slot === 'scalp' ? 'Scalp hair' : 'Facial hair';
  const defaultSelection = { kind: 'default' } as const;
  const noneSelection = { kind: 'none' } as const;

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-semibold text-[var(--text-primary)]">
        {label}
      </legend>
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-5 lg:grid-cols-4 xl:grid-cols-5">
        <GeneratedChoiceButton
          label="Default"
          selected={isSelected(selection, defaultSelection)}
          onSelect={() => onChange(defaultSelection)}
        />
        <GeneratedChoiceButton
          label="None"
          selected={isSelected(selection, noneSelection)}
          onSelect={() => onChange(noneSelection)}
        />
        {slotCatalog.options.map((option) => {
          const candidate = {
            kind: 'style',
            styleRef: option.styleRef,
          } as const;
          return (
            <StyleOptionButton
              key={option.styleRef}
              option={option}
              selected={isSelected(selection, candidate)}
              onSelect={() => onChange(candidate)}
            />
          );
        })}
      </div>
    </fieldset>
  );
}
