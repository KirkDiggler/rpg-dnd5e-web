/**
 * EndingsPanel — the authored endings, beside Scenarios (rpg-project#375
 * R10, step B): `endings: [{ id, when: <predicate> }]`, the predicate
 * grammar's third consumer. `until` ends a hostility, `arrives` brings a
 * placement in, and `when` ends the run — one editor for all three.
 *
 * Beside the list, the sugar line: a scenario's own field is one of these
 * endings written short. `scenarios: { hold-out: { convince: raiders } }`
 * declares exactly what `{ id: hold-out, when: { stance: { between:
 * [raiders, party], is: neutral } } }` would, and the panel says so in one
 * read-only line so the author sees the two spellings are one thing.
 *
 * THE ONE SCENARIO THIS FILE KNOWS BY NAME. The scenario form itself
 * derives nothing about a scenario (`scenarioForm.ts`); this line is a
 * deliberate, narrow exception asked for by the design's own example, and
 * it names `hold-out`/`convince` exactly once. When the descriptor learns
 * to say what its field is sugar for, this reads it from there instead.
 */
import { useState } from 'react';
import {
  PARTY,
  type DungeonDoc,
  type EndingDoc,
  type PredicateDoc,
} from './dungeonYaml';
import {
  messagesAt,
  predicatePaths,
  type PathMessage,
  type Refusal,
} from './factionRules';
import { PredicateEditor } from './PredicateEditor';

export interface EndingsSectionProps {
  doc: DungeonDoc;
  refusals: readonly Refusal[];
  errors: readonly PathMessage[];
  onAddEnding: () => void;
  onEnding: (index: number, patch: Partial<EndingDoc>) => void;
  onRemoveEnding: (index: number) => void;
}

function Refusals({
  testId,
  messages,
}: {
  testId: string;
  messages: string[];
}) {
  return (
    <>
      {messages.map((message, i) => (
        <div
          key={i}
          className="text-xs"
          data-testid={testId}
          style={{ color: 'var(--color-error, #f87171)' }}
        >
          {message}
        </div>
      ))}
    </>
  );
}

export function EndingsSection(props: EndingsSectionProps) {
  const { doc } = props;
  const convince = doc.scenarios['hold-out']?.convince;
  return (
    <div className="flex flex-col gap-2" data-testid="endings-section">
      <div className="flex items-center justify-between">
        <h3 className="dg-h">Endings</h3>
        <button
          type="button"
          className="dg-mini"
          data-testid="new-ending"
          onClick={props.onAddEnding}
        >
          + new ending
        </button>
      </div>
      {doc.endings.length === 0 ? (
        <div className="text-xs opacity-70" data-testid="endings-none">
          none of its own — the scenarios this dungeon binds declare theirs
        </div>
      ) : (
        doc.endings.map((ending, index) => (
          <EndingRow
            key={index}
            doc={doc}
            index={index}
            ending={ending}
            refusals={props.refusals}
            errors={props.errors}
            onChange={(patch) => props.onEnding(index, patch)}
            onRemove={() => props.onRemoveEnding(index)}
          />
        ))
      )}
      {convince !== undefined && convince !== '' && (
        // The scenario's field, read as the ending it is sugar for.
        <div className="text-xs opacity-70" data-testid="ending-sugar-hold-out">
          hold-out ends when {convince} × {PARTY} is neutral — the scenario’s
          `convince` is this ending written short
        </div>
      )}
    </div>
  );
}

function EndingRow({
  doc,
  index,
  ending,
  refusals,
  errors,
  onChange,
  onRemove,
}: {
  doc: DungeonDoc;
  index: number;
  ending: EndingDoc;
  refusals: readonly Refusal[];
  errors: readonly PathMessage[];
  onChange: (patch: Partial<EndingDoc>) => void;
  onRemove: () => void;
}) {
  const [typed, setTyped] = useState<string | null>(null);
  const taken = new Set(
    doc.endings.filter((_, i) => i !== index).map((e) => e.id)
  );
  const shown = typed ?? ending.id;
  const blank = typed !== null && typed.trim() === '';
  const clash = typed !== null && taken.has(typed);
  const testId = `ending-${index}`;
  const path = `endings[${index}]`;
  const idRefusals = messagesAt(refusals, errors, `${path}.id`);
  return (
    <div className="flex flex-col gap-2 dg-intel-form" data-testid={testId}>
      <label className="dg-label">
        id
        <input
          className="dg-input"
          data-testid={`${testId}-id`}
          aria-label="ending id"
          value={shown}
          onChange={(e) => {
            const next = e.target.value;
            setTyped(next);
            if (next.trim() !== '' && !taken.has(next)) {
              onChange({ id: next });
              setTyped(null);
            }
          }}
        />
        {blank ? (
          <div className="text-xs" data-testid={`${testId}-id-refusal`}>
            the ending has no id — it is what the `ended` beat names. Use
            &quot;remove ending&quot; to delete it
          </div>
        ) : clash ? (
          <div className="text-xs" data-testid={`${testId}-id-refusal`}>
            ending &quot;{typed}&quot; is already declared — two cannot share a
            name, because the `ended` beat names one
          </div>
        ) : idRefusals.length > 0 ? (
          <Refusals testId={`${testId}-id-refusal`} messages={idRefusals} />
        ) : (
          <div className="text-xs opacity-70">
            What the run’s last beat calls this ending.
          </div>
        )}
      </label>
      <div className="dg-label">
        when
        <PredicateEditor
          doc={doc}
          value={ending.when}
          required
          testId={`${testId}-when`}
          noneMeans=""
          refusals={messagesAt(
            refusals,
            errors,
            ...predicatePaths(`${path}.when`)
          )}
          onChange={(when: PredicateDoc | undefined) => {
            if (when !== undefined) onChange({ when });
          }}
        />
      </div>
      <button
        type="button"
        className="dg-mini dg-danger"
        data-testid={`${testId}-remove`}
        onClick={onRemove}
      >
        remove ending
      </button>
    </div>
  );
}
