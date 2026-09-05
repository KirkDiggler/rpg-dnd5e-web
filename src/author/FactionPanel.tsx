/**
 * FactionPanel — the two dungeon sections the hold-out slice adds beside
 * Intel and Scenarios (rpg-project#375 §7, the R7 precedent): FACTIONS,
 * who fights as one side and which member is its mind; DISPOSITIONS, how
 * two sides stand to each other and the predicate that ends a hostility.
 *
 * Both are DUNGEON-LEVEL declarations, like an intel record or a scenario
 * binding: a faction belongs to the dungeon, not to whichever monster
 * happens to be in it, so both live on the panel the inspector shows when
 * nothing in particular is selected. Every row is edited in place — the
 * list IS the form — so the whole camp can be authored without leaving
 * this panel, and every §2 refusal the client can know renders under the
 * field it names (`factionRules.ts`).
 */
import { useState } from 'react';
import {
  factionMembers,
  STANCES,
  type DispositionDoc,
  type DungeonDoc,
  type FactionDoc,
  type Stance,
} from './dungeonYaml';
import { refusalsAt, type Refusal } from './factionRules';
import { FactionPicker, PredicateEditor } from './PredicateEditor';

export interface FactionSectionsProps {
  doc: DungeonDoc;
  /** `factionRefusals(doc)`, computed once by the dungeon panel and shared
   * with the placement panel so one sentence renders in both places. */
  refusals: readonly Refusal[];
  onAddFaction: () => void;
  onFaction: (id: string, patch: Partial<FactionDoc>) => void;
  onRemoveFaction: (id: string) => void;
  onAddDisposition: () => void;
  onDisposition: (index: number, patch: Partial<DispositionDoc>) => void;
  onRemoveDisposition: (index: number) => void;
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

export function FactionsSection(props: FactionSectionsProps) {
  const { doc, refusals } = props;
  return (
    <div className="flex flex-col gap-2" data-testid="factions-section">
      <div className="flex items-center justify-between">
        <h3 className="dg-h">Factions</h3>
        <button
          type="button"
          className="dg-mini"
          data-testid="new-faction"
          onClick={props.onAddFaction}
        >
          + new faction
        </button>
      </div>
      {doc.factions.length === 0 ? (
        <div className="text-xs opacity-70">
          none — every monster is on the reserved `monsters` side, hostile to
          the party, exactly as before
        </div>
      ) : (
        doc.factions.map((faction, index) => (
          <FactionRow
            key={index}
            doc={doc}
            index={index}
            faction={faction}
            refusals={refusals}
            onChange={(patch) => props.onFaction(faction.id, patch)}
            onRemove={() => props.onRemoveFaction(faction.id)}
          />
        ))
      )}
    </div>
  );
}

/**
 * One faction, edited in place: its id (renamed freely; a blank or a
 * clash is held as typed text and never written, as the placement id
 * control does; `party` IS written and refused by the same sentence a
 * loaded file gets) and its mind, a dropdown of the NAMED monsters placed
 * in this faction — a mind is a placement id, so an unnamed member cannot
 * be one.
 */
function FactionRow({
  doc,
  index,
  faction,
  refusals,
  onChange,
  onRemove,
}: {
  doc: DungeonDoc;
  index: number;
  faction: FactionDoc;
  refusals: readonly Refusal[];
  onChange: (patch: Partial<FactionDoc>) => void;
  onRemove: () => void;
}) {
  const [typed, setTyped] = useState<string | null>(null);
  const taken = new Set(
    doc.factions.filter((_, i) => i !== index).map((f) => f.id)
  );
  const shown = typed ?? faction.id;
  const blank = typed !== null && typed.trim() === '';
  const clash = typed !== null && taken.has(typed);
  const members = factionMembers(doc, faction.id);
  const named = members.filter((m) => !!m.placement.id);
  const mind = faction.mind ?? '';
  const mindRefusals = refusalsAt(refusals, `factions[${index}].mind`);
  const idRefusals = refusalsAt(refusals, `factions[${index}].id`);
  const testId = `faction-${index}`;
  return (
    <div
      className="flex flex-col gap-2 dg-intel-form"
      data-testid={testId}
      data-faction-id={faction.id}
    >
      <label className="dg-label">
        id
        <input
          className="dg-input"
          data-testid={`${testId}-id`}
          aria-label="faction id"
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
            a faction needs a name — it is what a monster&apos;s `faction` and a
            disposition&apos;s `between` point at. Use &quot;remove
            faction&quot; to delete it
          </div>
        ) : clash ? (
          <div className="text-xs" data-testid={`${testId}-id-refusal`}>
            another faction is already called &quot;{typed}&quot; — two cannot
            share a name, because a monster fights for exactly one
          </div>
        ) : idRefusals.length > 0 ? (
          <Refusals testId={`${testId}-id-refusal`} messages={idRefusals} />
        ) : (
          <div className="text-xs opacity-70">
            The side&apos;s name. `party` is the players and is never declared.
          </div>
        )}
      </label>

      <label className="dg-label">
        mind
        {named.length === 0 && mind === '' ? (
          <div className="text-xs opacity-70" data-testid={`${testId}-no-mind`}>
            {members.length === 0
              ? `no monster is in this faction yet — select a monster and set its faction to ${faction.id}`
              : 'name a monster in this faction first — a mind is a placement id'}
          </div>
        ) : (
          <select
            className="dg-input"
            data-testid={`${testId}-mind`}
            aria-label="faction mind"
            value={mind}
            onChange={(e) => onChange({ mind: e.target.value })}
          >
            <option value="">(none)</option>
            {/* A mind the file names that is not one of the named members
                stays selectable rather than silently reading as none: the
                author sees what the file says, and the refusal below names
                it. */}
            {mind !== '' && !named.some((m) => m.placement.id === mind) && (
              <option value={mind}>{mind}</option>
            )}
            {named.map((m) => (
              <option key={m.placement.id} value={m.placement.id as string}>
                {m.placement.id} · {m.placement.ref.split(':').pop()}
              </option>
            ))}
          </select>
        )}
        {mindRefusals.length > 0 ? (
          <Refusals testId={`${testId}-mind-refusal`} messages={mindRefusals} />
        ) : (
          <div className="text-xs opacity-70">
            The faction knows what its mind knows: a fact carried into the
            mind&apos;s region is what turns it. A faction of one needs none.
          </div>
        )}
      </label>

      <div className="text-xs opacity-50" data-testid={`${testId}-members`}>
        {members.length === 0
          ? 'no members'
          : `${members.length} member${members.length === 1 ? '' : 's'}: ${members
              .map((m) => m.placement.id ?? m.placement.ref.split(':').pop())
              .join(', ')}`}
      </div>

      <button
        type="button"
        className="dg-mini dg-danger"
        data-testid={`${testId}-remove`}
        onClick={onRemove}
      >
        remove faction
      </button>
    </div>
  );
}

export function DispositionsSection(props: FactionSectionsProps) {
  const { doc, refusals } = props;
  const canAdd = doc.factions.length > 0;
  return (
    <div className="flex flex-col gap-2" data-testid="dispositions-section">
      <div className="flex items-center justify-between">
        <h3 className="dg-h">Dispositions</h3>
        <button
          type="button"
          className="dg-mini"
          data-testid="new-disposition"
          disabled={!canAdd}
          title={canAdd ? undefined : 'declare a faction first'}
          onClick={props.onAddDisposition}
        >
          + new disposition
        </button>
      </div>
      {doc.dispositions.length === 0 ? (
        <div className="text-xs opacity-70" data-testid="dispositions-none">
          {canAdd
            ? 'none — a declared faction is hostile to the party until you say otherwise, and declared factions are neutral to each other'
            : 'none — declare a faction first; there is nothing to stand toward the party but `monsters`, which always does'}
        </div>
      ) : (
        doc.dispositions.map((disposition, index) => (
          <DispositionRow
            key={index}
            doc={doc}
            index={index}
            disposition={disposition}
            refusals={refusals}
            onChange={(patch) => props.onDisposition(index, patch)}
            onRemove={() => props.onRemoveDisposition(index)}
          />
        ))
      )}
    </div>
  );
}

/**
 * One disposition: the pair (two faction dropdowns, `party` included),
 * the stance, and — for a hostile stance only — the `until` predicate
 * editor. A stance that stops being hostile drops its `until` in the
 * document (`updateDisposition`); a hand-written file with one on a
 * neutral pair still loads, and the refusal renders at the stance.
 */
function DispositionRow({
  doc,
  index,
  disposition,
  refusals,
  onChange,
  onRemove,
}: {
  doc: DungeonDoc;
  index: number;
  disposition: DispositionDoc;
  refusals: readonly Refusal[];
  onChange: (patch: Partial<DispositionDoc>) => void;
  onRemove: () => void;
}) {
  const testId = `disposition-${index}`;
  const path = `dispositions[${index}]`;
  const [a, b] = disposition.between;
  const betweenRefusals = refusalsAt(refusals, `${path}.between`);
  const stanceRefusals = refusalsAt(refusals, `${path}.stance`);
  return (
    <div className="flex flex-col gap-2 dg-intel-form" data-testid={testId}>
      <div className="flex gap-1 items-end">
        <FactionPicker
          doc={doc}
          value={a}
          testId={`${testId}-a`}
          label="between"
          onChange={(next) => onChange({ between: [next, b] })}
        />
        <FactionPicker
          doc={doc}
          value={b}
          testId={`${testId}-b`}
          label="and"
          onChange={(next) => onChange({ between: [a, next] })}
        />
      </div>
      {betweenRefusals.length > 0 && (
        <Refusals
          testId={`${testId}-between-refusal`}
          messages={betweenRefusals}
        />
      )}
      <label className="dg-label">
        stance
        <select
          className="dg-input"
          data-testid={`${testId}-stance`}
          aria-label="stance"
          value={disposition.stance}
          onChange={(e) => onChange({ stance: e.target.value as Stance })}
        >
          {STANCES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        {stanceRefusals.length > 0 ? (
          <Refusals
            testId={`${testId}-stance-refusal`}
            messages={stanceRefusals}
          />
        ) : (
          <div className="text-xs opacity-70">
            {disposition.stance === 'hostile'
              ? 'They fight on sight. `until` says when that ends; when it holds the pair becomes neutral.'
              : disposition.stance === 'neutral'
                ? 'Neither side attacks the other.'
                : 'They fight together.'}
          </div>
        )}
      </label>
      {disposition.stance === 'hostile' && (
        <div className="dg-label">
          until
          <PredicateEditor
            doc={doc}
            value={disposition.until}
            testId={`${testId}-until`}
            noneMeans="the hostility never ends"
            refusals={refusalsAt(refusals, `${path}.until`)}
            onChange={(until) => onChange({ until })}
          />
        </div>
      )}
      <button
        type="button"
        className="dg-mini dg-danger"
        data-testid={`${testId}-remove`}
        onClick={onRemove}
      >
        remove disposition
      </button>
    </div>
  );
}
