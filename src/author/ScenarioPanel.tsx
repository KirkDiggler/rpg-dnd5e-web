/**
 * ScenarioPanel — the scenarios THIS DUNGEON runs, and the blanks each one
 * needs filled in (rpg-project#368 §3.2, rpg-dnd5e-web#945).
 *
 * IT READS THE DOCUMENT, NOT THE REGISTRY. The forms on screen are the keys
 * under `scenarios:`, sorted, one per binding — not one per scenario the
 * server happens to offer. A registry-shaped panel showed every scenario's
 * blanks to every dungeon, which said the wrong thing twice: that a dungeon
 * is somehow bound to all of them, and that the way to bind one is to start
 * filling in a form that was already there. Choosing is the verb (`Add
 * scenario`), and so is unchoosing (`Remove`).
 *
 * Each form is still generated entirely from the descriptor `ListScenarios`
 * returns: there is no scenario knowledge in this file and no fallback
 * descriptor anywhere, so a scenario shipped after this component was
 * written renders through it unchanged. `scenarioForm.ts` holds the pure
 * half — what a blank offers and which refusal belongs under it.
 *
 * A scenario the FILE binds and this build does not offer is shown, not
 * hidden: its keys and values read-only, the line saying this build does not
 * have it, and its Remove. Hiding it would mean an author deleting the
 * binding they cannot see.
 */
import {
  FieldType,
  type FieldError,
  type ScenarioDescriptor,
  type ScenarioField,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/authoring/v1alpha1/service_pb';
import { useState } from 'react';
import type { ScenariosState } from './authoringRpc';
import type { DungeonDoc, ScenarioBindings } from './dungeonYaml';
import { bindOptions, emptyPickerReason, fieldRefusals } from './scenarioForm';

export interface ScenarioPanelProps {
  doc: DungeonDoc;
  state: ScenariosState;
  /** The compiler's current refusals, whole — the panel picks out the ones
   * addressed to its own blanks and leaves the rest to the YAML pane. */
  errors: readonly FieldError[];
  onBind: (scenarioId: string, key: string, value: string) => void;
  /** Bind this dungeon to a scenario, blanks unfilled. */
  onAdd: (scenarioId: string) => void;
  /** Unbind one, blanks and all. */
  onRemove: (scenarioId: string) => void;
}

export function ScenarioPanel({
  doc,
  state,
  errors,
  onBind,
  onAdd,
  onRemove,
}: ScenarioPanelProps) {
  // SORTED, like the bytes. The map has no order of its own and the emitter
  // sorts it, so the forms read down in the same order as the file.
  const bound = Object.keys(doc.scenarios).sort();
  const offered = new Map(state.scenarios.map((d) => [d.id, d]));
  return (
    <div className="flex flex-col gap-3" data-testid="scenario-panel">
      <h3 className="dg-h">Scenarios</h3>
      {bound.length === 0 && (
        <div
          className="text-xs opacity-70"
          data-testid="scenario-panel-unbound"
        >
          this dungeon runs no scenario yet
        </div>
      )}
      {bound.map((id) => {
        const descriptor = offered.get(id);
        return descriptor === undefined ? (
          <UnofferedScenario
            key={id}
            id={id}
            bindings={doc.scenarios[id]}
            onRemove={onRemove}
          />
        ) : (
          <ScenarioForm
            key={id}
            doc={doc}
            descriptor={descriptor}
            errors={errors}
            onBind={onBind}
            onRemove={onRemove}
          />
        );
      })}
      <AddScenario state={state} bound={bound} onAdd={onAdd} />
    </div>
  );
}

/**
 * The chooser: what the server offers, minus what this dungeon already
 * binds. It is also where the three things the server can say land —
 * asking, a transport failure, an empty answer — because those are all
 * answers about what there is to CHOOSE, and nothing about the bindings the
 * file already carries.
 */
function AddScenario({
  state,
  bound,
  onAdd,
}: {
  state: ScenariosState;
  bound: readonly string[];
  onAdd: (scenarioId: string) => void;
}) {
  const [picked, setPicked] = useState('');
  if (state.loading) {
    return <div className="text-xs opacity-70">asking…</div>;
  }
  if (state.error) {
    return (
      <div className="text-xs" data-testid="scenario-panel-error">
        could not read the scenarios on offer: {state.error}
      </div>
    );
  }
  // NO FALLBACK. An empty answer says so and offers nothing — a built-in
  // descriptor is how a form survives the deletion of the thing it describes.
  if (state.scenarios.length === 0) {
    return (
      <div className="text-xs opacity-70" data-testid="scenario-panel-none">
        no scenarios offered
      </div>
    );
  }
  const unbound = state.scenarios.filter((d) => !bound.includes(d.id));
  if (unbound.length === 0) {
    return (
      <div
        className="text-xs opacity-70"
        data-testid="scenario-panel-all-bound"
      >
        every scenario on offer is already on this dungeon
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2" data-testid="scenario-add">
      <select
        className="dg-input"
        data-testid="scenario-add-pick"
        aria-label="Scenario to add"
        value={picked}
        onChange={(e) => setPicked(e.target.value)}
      >
        <option value="">(pick one)</option>
        {unbound.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name || d.id}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="dg-mini"
        data-testid="scenario-add-do"
        disabled={picked === ''}
        onClick={() => {
          onAdd(picked);
          setPicked('');
        }}
      >
        Add scenario
      </button>
    </div>
  );
}

function RemoveScenario({
  id,
  onRemove,
}: {
  id: string;
  onRemove: (scenarioId: string) => void;
}) {
  return (
    <button
      type="button"
      className="dg-mini"
      data-testid={`scenario-${id}-remove`}
      onClick={() => onRemove(id)}
    >
      Remove
    </button>
  );
}

/**
 * A scenario the file binds and this build has never heard of — the build
 * is older than the file, or the rulebook dropped it. FAIL CLOSED AND
 * LOUDLY: the binding is on screen, exactly as written, with the sentence
 * saying why there is no form for it. The author can read what the file
 * says and take it out; nothing here edits a scenario nobody can describe.
 */
function UnofferedScenario({
  id,
  bindings,
  onRemove,
}: {
  id: string;
  bindings: ScenarioBindings;
  onRemove: (scenarioId: string) => void;
}) {
  const keys = Object.keys(bindings).sort();
  return (
    <section className="flex flex-col gap-2" data-testid={`scenario-${id}`}>
      <div className="flex items-center gap-2">
        <div className="dg-h">{id}</div>
        <RemoveScenario id={id} onRemove={onRemove} />
      </div>
      <div
        className="text-xs"
        data-testid={`scenario-${id}-unoffered`}
        style={{ color: 'var(--color-error, #f87171)' }}
      >
        this build does not offer {id}
      </div>
      {keys.map((key) => (
        <label className="dg-label" key={key}>
          {key}
          <input
            className="dg-input"
            data-testid={`scenario-${id}-${key}`}
            aria-label={key}
            value={bindings[key]}
            readOnly
          />
        </label>
      ))}
    </section>
  );
}

function ScenarioForm({
  doc,
  descriptor,
  errors,
  onBind,
  onRemove,
}: {
  doc: DungeonDoc;
  descriptor: ScenarioDescriptor;
  errors: readonly FieldError[];
  onBind: (scenarioId: string, key: string, value: string) => void;
  onRemove: (scenarioId: string) => void;
}) {
  const bindings = doc.scenarios[descriptor.id] ?? {};
  return (
    <section
      className="flex flex-col gap-2"
      data-testid={`scenario-${descriptor.id}`}
    >
      <div className="flex items-center gap-2">
        <div className="dg-h">{descriptor.name || descriptor.id}</div>
        <RemoveScenario id={descriptor.id} onRemove={onRemove} />
      </div>
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
