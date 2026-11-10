import { useState } from 'react';
import type {
  AppearanceEdit,
  AppearanceField,
  AppearanceSheet,
} from './appearanceTypes';

type ChoiceField = Exclude<AppearanceField, { kind: 'channel' }>;
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
  const missing =
    !field.mixed &&
    !field.choices.some((choice) => choice.value === field.value);
  return (
    <div className="es-arrange-field">
      <label className="es-arrange-row">
        <span>{field.label}</span>
        <select
          aria-label={field.label}
          value={field.value}
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
      </label>
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
    .filter((field): field is ChoiceField => field.kind !== 'channel')
    .filter(
      (field) =>
        field.kind !== 'wall-finish' ||
        !hasBoth ||
        (separate ? field.side !== 'both' : field.side === 'both')
    );
  const channels = sheet.fields.filter((field) => field.kind === 'channel');
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
      {channels.length > 0 && (
        <details className="es-help" open>
          <summary>Material channels</summary>
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
            Channels shown here are part of the selected look, not independent
            overrides.
          </p>
        </details>
      )}
      {hasBoth && (
        <p className="es-help">
          A/B markers identify the faces and follow the wall when it rotates.
          Wall-finish playback integration is still in progress; this preview
          verifies Studio editing.
        </p>
      )}
    </fieldset>
  );
}
