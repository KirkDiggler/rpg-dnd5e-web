/**
 * ScenarioPanel — the prize of this slice: filling in a scenario config on
 * the dungeon builder (rpg-project#368 §3.2).
 *
 * ONE FORM PER SCENARIO THE SERVER OFFERS, rendered entirely from the
 * descriptor `ListScenarios` returns. There is no scenario knowledge in
 * this file and no fallback descriptor anywhere: the panel shows the
 * rulebook's own field keys, labels, widgets and guidance sentences, and
 * a scenario shipped after this component was written renders through it
 * unchanged. `scenarioForm.ts` holds the pure half — what a blank offers
 * and which refusal belongs under it.
 *
 * Binding is the act of filling a blank in: a scenario with no field
 * filled is not in the file at all, and clearing its last field takes it
 * back out (`setScenarioBinding`). There is no separate enable switch,
 * because "bound" is not a fact separate from the bindings.
 */
import {
  FieldType,
  type FieldError,
  type ScenarioDescriptor,
  type ScenarioField,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/authoring/v1alpha1/service_pb';
import type { ScenariosState } from './authoringRpc';
import type { DungeonDoc } from './dungeonYaml';
import { bindOptions, emptyPickerReason, fieldRefusals } from './scenarioForm';

export interface ScenarioPanelProps {
  doc: DungeonDoc;
  state: ScenariosState;
  /** The compiler's current refusals, whole — the panel picks out the ones
   * addressed to its own blanks and leaves the rest to the YAML pane. */
  errors: readonly FieldError[];
  onBind: (scenarioId: string, key: string, value: string) => void;
}

export function ScenarioPanel({
  doc,
  state,
  errors,
  onBind,
}: ScenarioPanelProps) {
  return (
    <div className="flex flex-col gap-3" data-testid="scenario-panel">
      <h3 className="dg-h">Scenarios</h3>
      {state.loading && <div className="text-xs opacity-70">asking…</div>}
      {state.error && (
        <div className="text-xs" data-testid="scenario-panel-error">
          could not read the scenarios on offer: {state.error}
        </div>
      )}
      {/* NO FALLBACK. An empty answer says so and offers nothing — a
          built-in descriptor is how a form survives the deletion of the
          thing it describes. */}
      {!state.loading && !state.error && state.scenarios.length === 0 && (
        <div className="text-xs opacity-70" data-testid="scenario-panel-none">
          no scenarios offered
        </div>
      )}
      {state.scenarios.map((descriptor) => (
        <ScenarioForm
          key={descriptor.id}
          doc={doc}
          descriptor={descriptor}
          errors={errors}
          onBind={onBind}
        />
      ))}
    </div>
  );
}

function ScenarioForm({
  doc,
  descriptor,
  errors,
  onBind,
}: {
  doc: DungeonDoc;
  descriptor: ScenarioDescriptor;
  errors: readonly FieldError[];
  onBind: (scenarioId: string, key: string, value: string) => void;
}) {
  const bindings = doc.scenarios[descriptor.id] ?? {};
  return (
    <section
      className="flex flex-col gap-2"
      data-testid={`scenario-${descriptor.id}`}
    >
      <div className="dg-h">{descriptor.name || descriptor.id}</div>
      {/* A scenario with no fields is legal — it binds nothing and its
          ending stands on its own (ScenarioDescriptor.fields' own doc). */}
      {descriptor.fields.length === 0 && (
        <div className="text-xs opacity-70">
          nothing to fill in — this scenario binds to nothing
        </div>
      )}
      {descriptor.fields.map((field) => (
        <ScenarioBlank
          key={field.key}
          doc={doc}
          scenarioId={descriptor.id}
          field={field}
          value={bindings[field.key] ?? ''}
          refusals={fieldRefusals(errors, descriptor.id, field.key)}
          onBind={onBind}
        />
      ))}
    </section>
  );
}

function ScenarioBlank({
  doc,
  scenarioId,
  field,
  value,
  refusals,
  onBind,
}: {
  doc: DungeonDoc;
  scenarioId: string;
  field: ScenarioField;
  value: string;
  refusals: string[];
  onBind: (scenarioId: string, key: string, value: string) => void;
}) {
  const options = bindOptions(doc, field);
  const emptyReason = emptyPickerReason(field, options);
  const testId = `scenario-${scenarioId}-${field.key}`;
  return (
    <label className="dg-label" data-testid={`${testId}-blank`}>
      {field.label || field.key}
      {options !== null && options.length > 0 ? (
        <select
          className="dg-input"
          data-testid={testId}
          aria-label={field.label || field.key}
          value={value}
          onChange={(e) => onBind(scenarioId, field.key, e.target.value)}
        >
          <option value="">(not set)</option>
          {/* A value the file already carries that is no longer on offer —
              the prop was un-ticked, the exit deleted — stays selectable
              rather than silently becoming "(not set)". The author sees
              what the file says and the compiler names the problem. */}
          {value !== '' && !options.some((o) => o.id === value) && (
            <option value={value}>{value}</option>
          )}
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      ) : (
        // A kind with no picker, a CHECK, or an empty list: the raw id box.
        // The author can still type the id and the package still validates
        // it (ScenarioField.kind's own doc comment).
        <input
          className="dg-input"
          data-testid={testId}
          aria-label={field.label || field.key}
          value={value}
          placeholder={field.type === FieldType.CHECK ? 'a check' : 'an id'}
          onChange={(e) => onBind(scenarioId, field.key, e.target.value)}
        />
      )}
      {/* THE RULEBOOK'S OWN SENTENCE, UNEDITED — as guidance while the
          blank is empty and as the error when the compiler refuses it.
          There is no second copy of this text in rpg-api or here. */}
      {refusals.length > 0 ? (
        refusals.map((message, i) => (
          <div
            key={i}
            className="text-xs"
            data-testid={`${testId}-refusal`}
            style={{ color: 'var(--color-error, #f87171)' }}
          >
            {message}
          </div>
        ))
      ) : (
        <div className="text-xs opacity-70">
          {emptyReason ?? field.guidance}
        </div>
      )}
    </label>
  );
}
