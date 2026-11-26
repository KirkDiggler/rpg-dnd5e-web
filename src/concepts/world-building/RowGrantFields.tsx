/**
 * THE FORMS FOR A ROW'S GRANT AND A LOUDNESS (rpg-project#975 A). A form,
 * not a sentence: each label names the field; what the choice does is said
 * by the engine's read-back after the next check. Ids are offered from what
 * the site defines (`SiteNamesContext`); a topic, declared by mention, may
 * also be typed new.
 *
 * `RelocationFields` is THE relocation (R33): a region, the words the moved
 * are told, and the rounds it takes. A row's `relocate` uses it here; a
 * conversation's `jail` and `arrest` are the same primitive with their own
 * extras, and use it too.
 */
import { useContext, useId } from 'react';
import { RevealDiv } from '../encounter-studio/RevealDiv';
import {
  APPLY_STATUS_TO,
  GIVE_ABOUT,
  GIVE_HEARD_BY,
  grantOf,
  LOUDNESSES,
  otherGrantsOf,
  withApplyStatus,
  withGive,
  withGrant,
  withRelocation,
  withTells,
  type GrantingRow,
  type RelocationShape,
  type RowGrant,
} from './rowGrants';
import { SiteNamesContext } from './siteNames';

const LOUDNESS_LABELS: Record<string, string> = {
  whisper: 'Whisper',
  speak: 'Speak',
  shout: 'Shout',
  scream: 'Scream',
};

/** A loudness: Speak (written as nothing), Whisper, Shout or Scream. A
 * `speak` the file writes is kept as written. */
export function LoudnessSelect({
  label,
  value,
  onChange,
  heard = false,
}: {
  /** The select's accessible name. */
  label: string;
  value: string | undefined;
  onChange(word: string): void;
  /** A heard voice's "at least" (`when.heard.loudness`): the empty choice
   * is Any (no loudness asked), Speak is a word that means something (a
   * voice, not a whisper), and Whisper — the quietest, so the same as Any —
   * is offered only when the file writes it. On a line or a row the empty
   * choice is Speak, the word written as nothing. */
  heard?: boolean;
}): React.JSX.Element {
  const words = LOUDNESSES.filter((word) =>
    heard
      ? word !== 'whisper' || value === 'whisper'
      : word !== 'speak' || value === 'speak'
  );
  return (
    <select
      aria-label={label}
      value={value ?? ''}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">{heard ? 'Any' : 'Speak'}</option>
      {words.map((word) => (
        <option key={word} value={word}>
          {LOUDNESS_LABELS[word]}
        </option>
      ))}
      {value !== undefined &&
        value !== '' &&
        !(LOUDNESSES as readonly string[]).includes(value) && (
          <option value={value}>{value}</option>
        )}
    </select>
  );
}

/** A region of the site, offered by name. The relocation's Region; an
 * arrest's "Held in". */
export function RegionField({
  label,
  name = 'Region',
  region,
  onChange,
}: {
  /** What the control is named for: "<name> for <label>". */
  label: string;
  name?: string;
  region: string;
  onChange(region: string): void;
}): React.JSX.Element {
  const names = useContext(SiteNamesContext);
  const known = names.regions.some((entry) => entry.id === region);
  return (
    <label>
      <span>{name}</span>
      <select
        aria-label={`${name} for ${label}`}
        value={region}
        onChange={(event) => onChange(event.target.value)}
      >
        {!known && (
          <option value={region}>
            {region === '' ? '(choose a region)' : region}
          </option>
        )}
        {names.regions.map((entry) => (
          <option key={entry.id} value={entry.id}>
            {entry.name === entry.id ? entry.id : `${entry.name} (${entry.id})`}
          </option>
        ))}
      </select>
    </label>
  );
}

/** What the one moved is told. A relocation's Words; a jail's. */
export function WordsField({
  label,
  words,
  onChange,
}: {
  label: string;
  words: string;
  onChange(words: string): void;
}): React.JSX.Element {
  return (
    <label className="wb-relocation-words">
      <span>Words</span>
      <textarea
        aria-label={`Words for ${label}`}
        placeholder="What the one moved is told"
        rows={2}
        value={words}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

/** How many world rounds the move takes; empty is none. A relocation's
 * Rounds; a jail's. */
export function RoundsField({
  label,
  rounds,
  onChange,
}: {
  label: string;
  rounds: number | undefined;
  /** null: the field emptied, written as nothing. */
  onChange(rounds: number | null): void;
}): React.JSX.Element {
  return (
    <label className="wb-relocation-rounds">
      <span>Rounds</span>
      <input
        type="number"
        min={0}
        step={1}
        aria-label={`Rounds for ${label}`}
        placeholder="0"
        value={rounds === undefined ? '' : String(rounds)}
        onChange={(event) => {
          const raw = event.target.value;
          if (raw === '') return onChange(null);
          const n = Number(raw);
          if (Number.isInteger(n) && n >= 0) onChange(n);
        }}
      />
    </label>
  );
}

/** THE RELOCATION (R33): a region, the words the moved are told, the rounds
 * it takes — a row's `relocate`. A conversation's `jail` and `arrest` are
 * the same primitive and use its parts: a jail its Words and Rounds (it
 * moves the taken into the arrest's cell, so it names no region), an arrest
 * its Region as where the taken are held. */
export function RelocationFields({
  label,
  region,
  words,
  rounds,
  onChange,
}: {
  /** What the controls are named for: "<…> entry". */
  label: string;
  region: string;
  words: string;
  rounds: number | undefined;
  onChange(patch: {
    to?: string;
    words?: string;
    rounds?: number | null;
  }): void;
}): React.JSX.Element {
  return (
    <div className="wb-relocation">
      <RegionField
        label={label}
        region={region}
        onChange={(to) => onChange({ to })}
      />
      <WordsField
        label={label}
        words={words}
        onChange={(next) => onChange({ words: next })}
      />
      <RoundsField
        label={label}
        rounds={rounds}
        onChange={(next) => onChange({ rounds: next })}
      />
    </div>
  );
}

/** A GIVE's fields (`give:`, rpg-project#1005): the topic given, to whom
 * (the one spoken to, the only word), whom it is about, and whether the
 * witnessing carriers of the conversation come to note it too. A line's row
 * gives one; a conversation's outcome writes one. */
export function GiveFields({
  label,
  give,
  canBeWitnessed,
  onChange,
}: {
  /** What the controls are named for: "<field> for <label>". */
  label: string;
  give: { topic: string; about: string; heard_by?: string };
  /** Whether there are carriers to witness it (a line naming a
   * conversation, or a conversation's own outcome). */
  canBeWitnessed: boolean;
  onChange(patch: { topic?: string; about?: string; heard?: boolean }): void;
}): React.JSX.Element {
  const names = useContext(SiteNamesContext);
  const topicsId = useId();
  return (
    <>
      <label>
        <span>Topic</span>
        <input
          aria-label={`Topic for ${label}`}
          list={topicsId}
          placeholder="a topic, or a new one"
          value={give.topic}
          onChange={(event) => onChange({ topic: event.target.value })}
        />
        <datalist id={topicsId}>
          {names.topics.map((topic) => (
            <option key={topic} value={topic} />
          ))}
        </datalist>
      </label>
      <label>
        <span>Given to</span>
        <select aria-label={`Given to for ${label}`} value="spoken_to" disabled>
          <option value="spoken_to">The one spoken to</option>
        </select>
      </label>
      <label>
        <span>About</span>
        <select
          aria-label={`About for ${label}`}
          value={give.about}
          onChange={(event) => onChange({ about: event.target.value })}
        >
          <option value="party_in_sight">The speaker’s party in sight</option>
          <option value="speaker">The speaker</option>
          {!(GIVE_ABOUT as readonly string[]).includes(give.about) && (
            <option value={give.about}>{give.about}</option>
          )}
        </select>
      </label>
      <label className="wb-check">
        <input
          type="checkbox"
          aria-label={`Also given to the conversation’s carriers who witness it, for ${label}`}
          checked={give.heard_by === GIVE_HEARD_BY}
          disabled={!canBeWitnessed && give.heard_by === undefined}
          onChange={(event) => onChange({ heard: event.target.checked })}
        />
        <span>Also given to the conversation’s carriers who witness it</span>
      </label>
    </>
  );
}

const GRANT_LABELS: Record<RowGrant, string> = {
  give: 'Gives a topic',
  tells: 'Record',
  relocate: 'Relocation',
  apply_status: 'Gives a status effect',
};

/** Who receives a status, in the voice of a give's "About". */
const RECEIVER_LABELS: Record<string, string> = {
  speaker: 'The speaker',
  party_in_sight: 'The speaker’s party in sight',
  spoken_to: 'The one spoken to',
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/** A row's `apply_status`: the status, who receives it, the rounds it
 * lasts; a value written outside what is offered is shown as written, and
 * the keys the web does not know are kept and listed. */
function ApplyStatusFields({
  label,
  row,
  isProp,
  onCommit,
}: {
  label: string;
  row: GrantingRow;
  isProp: boolean;
  onCommit(row: GrantingRow): void;
}): React.JSX.Element {
  const names = useContext(SiteNamesContext);
  const written = (row as Record<string, unknown>).apply_status;
  if (!isRecord(written))
    return (
      <p className="wb-help" aria-label={`Status written for ${label}`}>
        Written as <code>{JSON.stringify(written)}</code>, kept as written: the
        engine reads <code>status</code> and <code>to</code>.
      </p>
    );
  const status = typeof written.status === 'string' ? written.status : '';
  const to = typeof written.to === 'string' ? written.to : '';
  const until = isRecord(written.until) ? written.until : undefined;
  const rounds = typeof until?.rounds === 'number' ? until.rounds : undefined;
  const offeredTo: readonly string[] = isProp
    ? [APPLY_STATUS_TO[0]]
    : APPLY_STATUS_TO;
  const unknown = [
    ...Object.keys(written).filter(
      (key) => !['status', 'to', 'until'].includes(key)
    ),
    ...Object.keys(until ?? {})
      .filter((key) => key !== 'rounds')
      .map((key) => `until.${key}`),
  ];
  return (
    <>
      <label>
        <span>Status</span>
        <select
          aria-label={`Status for ${label}`}
          value={status}
          onChange={(event) =>
            onCommit(withApplyStatus(row, { status: event.target.value }))
          }
        >
          {!names.statuses.some((entry) => entry.id === status) && (
            <option value={status}>
              {status === '' ? '(choose a status)' : status}
            </option>
          )}
          {names.statuses.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.name === entry.id
                ? entry.id
                : `${entry.name} (${entry.id})`}
            </option>
          ))}
        </select>
      </label>
      {names.statuses.length === 0 && (
        <p className="wb-help">This site has no status effects yet.</p>
      )}
      <label>
        <span>To</span>
        <select
          aria-label={`To for ${label}`}
          value={to}
          onChange={(event) =>
            onCommit(withApplyStatus(row, { to: event.target.value }))
          }
        >
          {offeredTo.map((word) => (
            <option key={word} value={word}>
              {RECEIVER_LABELS[word]}
            </option>
          ))}
          {!offeredTo.includes(to) && <option value={to}>{to}</option>}
        </select>
      </label>
      <RoundsField
        label={label}
        rounds={rounds}
        onChange={(next) => onCommit(withApplyStatus(row, { rounds: next }))}
      />
      {unknown.length > 0 && (
        <p className="wb-help">also written: {unknown.join(', ')}</p>
      )}
    </>
  );
}

/** A line's verdict row's grant: Nothing, or ONE of a topic given, a
 * record told or a relocation. Not on a table row (the caller offers it only
 * on a line's row); no give on a prop's line. A row still written in the
 * retired `recognize:` (rpg-project#1005) is said so and kept as written. */
export function RowGrantFields({
  label,
  row,
  at,
  isProp,
  namesConversation,
  onCommit,
}: {
  /** "<line …> <verdict>": controls read "Grants for <label> entry". */
  label: string;
  row: GrantingRow;
  /** The row's path in the file, for the reveal of each field. */
  at?: string;
  isProp: boolean;
  /** Whether the line names a conversation (advances or requires one). */
  namesConversation: boolean;
  onCommit(row: GrantingRow): void;
}): React.JSX.Element {
  const names = useContext(SiteNamesContext);
  const grant = grantOf(row);
  const offered: RowGrant[] = isProp
    ? ['tells', 'relocate', 'apply_status']
    : ['give', 'tells', 'relocate', 'apply_status'];
  const named = `${label} entry`;
  const give = row.give;
  const retired = (row as Record<string, unknown>).recognize;
  const relocate: RelocationShape | undefined = row.relocate;
  return (
    <div className="wb-entry-grant">
      <label>
        <span>Grants</span>
        <select
          aria-label={`Grants for ${named}`}
          value={grant ?? ''}
          onChange={(event) =>
            onCommit(
              withGrant(
                row,
                event.target.value === ''
                  ? undefined
                  : (event.target.value as RowGrant),
                names
              )
            )
          }
        >
          <option value="">Nothing</option>
          {offered.map((key) => (
            <option
              key={key}
              value={key}
              disabled={
                key === 'tells' &&
                names.records.length === 0 &&
                grant !== 'tells'
              }
            >
              {GRANT_LABELS[key]}
            </option>
          ))}
          {grant !== undefined && !offered.includes(grant) && (
            <option value={grant}>{GRANT_LABELS[grant]}</option>
          )}
        </select>
      </label>
      {otherGrantsOf(row).length > 0 && (
        <p className="wb-help">
          This row also has: {otherGrantsOf(row).join(', ')}. The engine allows
          one.
        </p>
      )}
      {grant === undefined && retired !== undefined && (
        <p className="wb-help" aria-label={`Written as recognize in ${named}`}>
          Written as <code>recognize</code>, kept as written: the engine reads{' '}
          <code>give</code> now.
        </p>
      )}
      {grant === 'give' && give && (
        <RevealDiv
          path={at ? `${at}.give` : undefined}
          className="wb-entry-grant-fields"
        >
          <GiveFields
            label={named}
            give={give}
            canBeWitnessed={namesConversation}
            onChange={(patch) => onCommit(withGive(row, patch))}
          />
        </RevealDiv>
      )}
      {grant === 'tells' && (
        <RevealDiv
          path={at ? `${at}.tells` : undefined}
          className="wb-entry-grant-fields"
        >
          <label>
            <span>Record</span>
            <select
              aria-label={`Record for ${named}`}
              value={row.tells ?? ''}
              onChange={(event) => onCommit(withTells(row, event.target.value))}
            >
              {!names.records.includes(row.tells ?? '') && (
                <option value={row.tells ?? ''}>
                  {row.tells ? row.tells : '(choose a record)'}
                </option>
              )}
              {names.records.map((record) => (
                <option key={record} value={record}>
                  {record}
                </option>
              ))}
            </select>
          </label>
        </RevealDiv>
      )}
      {grant === 'relocate' && relocate && (
        <RevealDiv
          path={at ? `${at}.relocate` : undefined}
          className="wb-entry-grant-fields"
        >
          <RelocationFields
            label={named}
            region={relocate.to}
            words={relocate.words}
            rounds={relocate.rounds}
            onChange={(patch) => onCommit(withRelocation(row, patch))}
          />
        </RevealDiv>
      )}
      {grant === 'apply_status' && (
        <RevealDiv
          path={at ? `${at}.apply_status` : undefined}
          className="wb-entry-grant-fields"
        >
          <ApplyStatusFields
            label={named}
            row={row}
            isProp={isProp}
            onCommit={onCommit}
          />
        </RevealDiv>
      )}
    </div>
  );
}
