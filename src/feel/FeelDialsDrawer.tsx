/**
 * The feel dials drawer (#906 batch 2, step 4). Kirk: "as we get into the
 * polish phases we should have a debug panel we can slide out to change
 * the params there. in game we do not have access to the url."
 *
 * A fixed right-edge slide-out OVER the canvas — it never changes layout
 * (the stage behind it never resizes; this is `position: fixed`, not part
 * of any flex/grid flow). Tailwind throughout, matching App.tsx's own
 * styling convention (it's opened FROM App.tsx); `DiscordDebugPanel`
 * itself is untouched and keeps its own inline styles.
 *
 * Two sections in this ONE drawer, replacing the old bare
 * `<DiscordDebugPanel>` toggle in App.tsx: "Feel dials" first (this file's
 * own camera/dice controls), the existing Debug content second.
 *
 * z-index note: shares `FEEL_LAB_LAYER_Z` (see `./layer.ts` for the full
 * incident) with the App.tsx wrench button row — both are dev-tools
 * surfaces that must paint over a live session route, and both lost that
 * fight once already before picking a shared layer. Applied via inline
 * `style`, not a Tailwind class — Tailwind's arbitrary-value scanning is
 * static, so a class built from the imported constant would never be
 * generated.
 */
import { DiscordDebugPanel } from '@/discord';
import { useState, type ChangeEvent } from 'react';
import {
  ALL_DIAL_SPECS,
  type DialSpec,
  type DialValues,
  type EnumDialSpec,
  type NumberDialSpec,
} from './dials';
import {
  resetAll,
  resetDial,
  setDial,
  toSearchParams,
  useDialValues,
} from './dialStore';
import { FEEL_LAB_LAYER_Z } from './layer';

export interface FeelDialsDrawerProps {
  readonly open: boolean;
  readonly onClose: () => void;
}

function NumberDialRow({
  spec,
  value,
}: {
  readonly spec: NumberDialSpec;
  readonly value: number;
}) {
  const isDefault = value === spec.default;
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    setDial(spec.key, event.target.valueAsNumber);
  };
  return (
    <div className="space-y-1" data-testid={`dial-${spec.key}`}>
      <div className="flex items-center justify-between text-xs text-gray-300">
        <span>{spec.label}</span>
        <span className="flex items-center gap-2">
          <input
            type="number"
            aria-label={`${spec.label} value`}
            className="w-20 rounded border border-gray-600 bg-gray-800 px-1 py-0.5 text-right text-white"
            value={value}
            min={spec.min}
            max={spec.max}
            step={spec.step}
            onChange={handleChange}
          />
          {spec.unit && <span className="text-gray-500">{spec.unit}</span>}
          <button
            type="button"
            title="Reset to default"
            aria-label={`Reset ${spec.label}`}
            disabled={isDefault}
            onClick={() => resetDial(spec.key)}
            className="text-gray-500 hover:text-white disabled:opacity-30"
          >
            ↺
          </button>
        </span>
      </div>
      <input
        type="range"
        aria-label={spec.label}
        className="w-full accent-amber-500"
        value={value}
        min={spec.min}
        max={spec.max}
        step={spec.step}
        onChange={handleChange}
      />
    </div>
  );
}

function EnumDialRow({
  spec,
  value,
}: {
  readonly spec: EnumDialSpec;
  readonly value: string;
}) {
  const isDefault = value === spec.default;
  return (
    <div className="space-y-1" data-testid={`dial-${spec.key}`}>
      <div className="flex items-center justify-between text-xs text-gray-300">
        <span>{spec.label}</span>
        <button
          type="button"
          title="Reset to default"
          aria-label={`Reset ${spec.label}`}
          disabled={isDefault}
          onClick={() => resetDial(spec.key)}
          className="text-gray-500 hover:text-white disabled:opacity-30"
        >
          ↺
        </button>
      </div>
      <div
        role="group"
        aria-label={spec.label}
        className="flex flex-wrap gap-1"
      >
        {spec.options.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={option === value}
            onClick={() => setDial(spec.key, option)}
            className={`rounded px-2 py-1 text-xs ${
              option === value
                ? 'bg-amber-500 text-gray-900'
                : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
            }`}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}

function DialRow({
  spec,
  values,
}: {
  readonly spec: DialSpec;
  readonly values: DialValues;
}) {
  if (spec.kind === 'number') {
    return <NumberDialRow spec={spec} value={values[spec.key] as number} />;
  }
  return <EnumDialRow spec={spec} value={values[spec.key] as string} />;
}

function DialGroupSection({
  title,
  specs,
  values,
}: {
  readonly title: string;
  readonly specs: readonly DialSpec[];
  readonly values: DialValues;
}) {
  if (specs.length === 0) return null;
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-amber-400">
        {title}
      </h3>
      <div className="space-y-3">
        {specs.map((spec) => (
          <DialRow key={spec.key} spec={spec} values={values} />
        ))}
      </div>
    </section>
  );
}

const CAMERA_SPECS = ALL_DIAL_SPECS.filter((spec) => spec.group === 'camera');
const DICE_SPECS = ALL_DIAL_SPECS.filter((spec) => spec.group === 'dice');

export function FeelDialsDrawer({ open, onClose }: FeelDialsDrawerProps) {
  const values = useDialValues();
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  const handleCopyUrl = () => {
    const query = toSearchParams(values);
    const url = `${window.location.origin}${window.location.pathname}${
      query ? `?${query}` : ''
    }`;
    setCopiedUrl(url);
    // Clipboard access can be blocked inside the Discord iframe — the URL
    // stays visible below either way, so a blocked write never leaves the
    // player with nothing to copy by hand.
    void navigator.clipboard?.writeText(url).catch(() => undefined);
  };

  return (
    <div
      data-testid="feel-dials-drawer"
      aria-hidden={!open}
      style={{ zIndex: FEEL_LAB_LAYER_Z }}
      className={`fixed inset-y-0 right-0 flex w-full max-w-sm flex-col overflow-y-auto bg-gray-900 text-white shadow-2xl transition-transform duration-300 ease-out ${
        open ? 'translate-x-0' : 'pointer-events-none translate-x-full'
      }`}
    >
      <div className="flex items-center justify-between border-b border-gray-700 p-4">
        <h2 className="text-lg font-bold">Feel dials</h2>
        <button
          type="button"
          aria-label="Close feel dials drawer"
          onClick={onClose}
          className="rounded p-1 text-gray-400 hover:bg-gray-800 hover:text-white"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 space-y-6 p-4">
        <DialGroupSection title="Camera" specs={CAMERA_SPECS} values={values} />
        <DialGroupSection title="Dice" specs={DICE_SPECS} values={values} />
      </div>

      <div className="space-y-2 border-t border-gray-700 p-4">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => resetAll()}
            className="flex-1 rounded bg-gray-800 px-3 py-1.5 text-sm hover:bg-gray-700"
          >
            Reset all
          </button>
          <button
            type="button"
            onClick={handleCopyUrl}
            className="flex-1 rounded bg-amber-600 px-3 py-1.5 text-sm text-gray-900 hover:bg-amber-500"
          >
            Copy as URL
          </button>
        </div>
        {copiedUrl && (
          <div
            data-testid="feel-dials-copied-url"
            className="break-all rounded bg-gray-800 p-2 font-mono text-[11px] text-gray-300"
          >
            {copiedUrl}
          </div>
        )}
      </div>

      <div className="border-t border-gray-700 p-4">
        <h2 className="mb-2 text-lg font-bold">Debug</h2>
        <DiscordDebugPanel />
      </div>
    </div>
  );
}
