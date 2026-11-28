import { useState } from 'react';
import type {
  AppearanceChannelAdjustmentField,
  AppearanceEdit,
  AppearanceField,
  AppearanceSheet,
} from './appearanceTypes';

type ChoiceField = Exclude<
  AppearanceField,
  { kind: 'channel' | 'channel-adjustment' }
>;
function editFor(field: ChoiceField, value: string): AppearanceEdit {
  if (field.kind === 'atlas-pack')
    return { kind: field.kind, surfaceId: field.surfaceId, value };
  if (field.kind === 'wall-finish')
    return { kind: field.kind, side: field.side, value };
  return { kind: field.kind, value };
}

/** One choice interaction; validity and owner semantics come from the sheet. */
function AppearanceChoiceField({
  field,
  onChange,
}: {
  field: ChoiceField;
  onChange(edit: AppearanceEdit): void;
}): React.JSX.Element {
  const displayValue = field.displayValue ?? field.value;
  const singleAppearance =
    field.kind === 'atlas-pack' &&
    field.displayValue !== undefined &&
    field.choices.length === 1 &&
    !field.unavailable;
  const missing =
    !field.mixed &&
    !field.choices.some((choice) => choice.value === displayValue);
  return (
    <div className="es-appearance-choice">
      <label className="es-arrange-row">
        <span>{field.label}</span>
        {singleAppearance ? (
          <output aria-label={field.label}>{field.choices[0]!.label}</output>
        ) : (
          <select
            aria-label={field.label}
            value={displayValue}
            disabled={!field.choices.length}
            onChange={(event) => onChange(editFor(field, event.target.value))}
          >
            {field.mixed && (
              <option value={field.value} disabled>
                Different sides — choose to set both
              </option>
            )}
            {missing && (
              <option value={field.value} disabled>
                Unavailable: {field.value}
              </option>
            )}
            {field.choices.map((choice) => (
              <option key={choice.value} value={choice.value}>
                {choice.label}
              </option>
            ))}
          </select>
        )}
      </label>
      {singleAppearance && (
        <p className="es-help">
          Only one distinct appearance is available for this surface.
        </p>
      )}
      {field.displayValue !== undefined &&
        field.value &&
        field.value !== field.displayValue && (
          <p className="es-help">
            The saved palette reference is retained; equivalent appearances are
            grouped.
          </p>
        )}
      {field.value && field.choices.some((choice) => choice.value === '') && (
        <button
          type="button"
          aria-label={`Reset ${field.label}`}
          onClick={() => onChange(editFor(field, ''))}
        >
          Original / default
        </button>
      )}
      {field.unavailable && (
        <p role="alert" className="es-help">
          {field.unavailable}
        </p>
      )}
    </div>
  );
}

function ChannelAdjustmentField({
  field,
  onChange,
}: {
  field: AppearanceChannelAdjustmentField;
  onChange(edit: AppearanceEdit): void;
}): React.JSX.Element {
  const capability = field.capability;
  const editable = capability?.kind === 'adjustable' && !field.unavailable;
  const identity = {
    kind: 'channel-adjustment' as const,
    targetId: field.targetId,
    channel: field.channel,
  };
  return (
    <div className="es-appearance-choice">
      <label className="es-arrange-row">
        <span>{field.label}</span>
        {editable ? (
          <select
            aria-label={`${field.label} mode`}
            value={field.value?.mode ?? 'default'}
            onChange={(event) => {
              const mode = event.target.value;
              onChange(
                mode === 'off' || mode === 'default'
                  ? { ...identity, mode }
                  : {
                      ...identity,
                      mode: 'scale',
                      multiplier:
                        field.value?.mode === 'scale'
                          ? field.value.multiplier
                          : 1,
                    }
              );
            }}
          >
            <option value="default">Default</option>
            <option value="off">Off</option>
            <option value="scale">Strength</option>
          </select>
        ) : (
          <output>
            {field.unavailable
              ? 'Unavailable'
              : capability?.kind === 'fixed'
                ? 'Fixed by source'
                : 'No map'}
          </output>
        )}
      </label>
      {editable &&
        capability.kind === 'adjustable' &&
        field.value?.mode === 'scale' && (
          <label className="es-arrange-row">
            <span>Relative strength</span>
            <input
              type="range"
              aria-label={`${field.label} strength`}
              min={capability.minMultiplier}
              max={capability.maxMultiplier}
              step="any"
              value={field.value.multiplier}
              onChange={(event) =>
                onChange({
                  ...identity,
                  mode: 'scale',
                  multiplier: Number(event.target.value),
                })
              }
            />
            <output>{field.value.multiplier}×</output>
          </label>
        )}
      {field.value && (
        <button
          type="button"
          aria-label={`Reset ${field.label}`}
          onClick={() => onChange({ ...identity, mode: 'default' })}
        >
          Original / default
        </button>
      )}
      {(field.unavailable || field.invalid) && (
        <p role="alert" className="es-help">
          {field.unavailable ?? field.invalid}
        </p>
      )}
    </div>
  );
}

/** Pure field presentation; it never owns catalogs, document state or commits. */
export function StudioAppearancePanel({
  sheet,
  onChange,
  emptyMessage,
}: {
  sheet: AppearanceSheet;
  onChange(edit: AppearanceEdit): void;
  emptyMessage?: string;
}): React.JSX.Element | null {
  const [separate, setSeparate] = useState(() =>
    sheet.fields.some((field) => field.kind === 'wall-finish' && field.mixed)
  );
  if (!sheet.fields.length && !emptyMessage) return null;
  const hasBoth = sheet.fields.some(
    (field) => field.kind === 'wall-finish' && field.side === 'both'
  );
  const choices = sheet.fields
    .filter(
      (field): field is ChoiceField =>
        field.kind !== 'channel' && field.kind !== 'channel-adjustment'
    )
    .filter(
      (field) =>
        field.kind !== 'wall-finish' ||
        !hasBoth ||
        (separate ? field.side !== 'both' : field.side === 'both')
    );
  const channels = sheet.fields.filter((field) => field.kind === 'channel');
  const adjustments = sheet.fields.filter(
    (field) => field.kind === 'channel-adjustment'
  );
  const names = { color: 'Color', normal: 'Normal', emissive: 'Emissive' };
  return (
    <fieldset className="es-texture-pack" aria-label="Appearance">
      <legend>Appearance</legend>
      {!sheet.fields.length && <p className="es-help">{emptyMessage}</p>}
      <p className="es-help">
        Choices are staged. Apply changes this placement; Cancel discards
        unapplied choices.
      </p>
      {hasBoth && (
        <label className="es-wall-finish-sides">
          <input
            type="checkbox"
            checked={separate}
            onChange={(event) => setSeparate(event.target.checked)}
          />
          Set sides separately
        </label>
      )}
      {choices.map((field) => (
        <AppearanceChoiceField
          key={field.id}
          field={field}
          onChange={onChange}
        />
      ))}
      {(channels.length > 0 || adjustments.length > 0) && (
        <details className="es-help" open>
          <summary>Material channels</summary>
          {adjustments.map((field) => (
            <ChannelAdjustmentField
              key={field.id}
              field={field}
              onChange={onChange}
            />
          ))}
          <dl>
            {channels.map((field) => (
              <div key={field.id}>
                <dt>
                  {channels.length > 3
                    ? `${field.target === 'positive-z' ? 'Side A' : field.target === 'negative-z' ? 'Side B' : field.target} · `
                    : ''}
                  {names[field.channel]}
                </dt>
                <dd>
                  {field.state.kind === 'pack-map'
                    ? 'Included in selected pack'
                    : field.state.kind === 'no-map'
                      ? 'No map in this pack'
                      : field.state.kind === 'complete-look'
                        ? 'Part of the original / complete appearance'
                        : field.state.reason}
                </dd>
              </div>
            ))}
          </dl>
          <p>
            {adjustments.length
              ? 'Strength is relative to the current look. Source maps stay unchanged; emission adds no scene lights.'
              : 'Channels shown here are part of the selected look, not independent overrides.'}
          </p>
        </details>
      )}
      {hasBoth && (
        <p className="es-help">
          A/B markers identify the faces and follow the wall when it rotates.
          Choices belong to this wall. Region defaults without a wall binding
          remain unapplied.
        </p>
      )}
    </fieldset>
  );
}
