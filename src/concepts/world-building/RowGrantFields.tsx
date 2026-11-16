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
  grantOf,
  LOUDNESSES,
  RECOGNITION_ABOUT,
  RECOGNITION_HEARD_BY,
  withGrant,
  withRecognition,
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
  anyLabel,
}: {
  /** The select's accessible name. */
  label: string;
  value: string | undefined;
  onChange(word: string): void;
  /** What the empty choice reads: "Speak" for a line, "Any" for a heard
   * voice (no loudness asked). */
  anyLabel?: string;
}): React.JSX.Element {
  const words = LOUDNESSES.filter(
    (word) => word !== 'speak' || value === 'speak'
  );
  return (
    <select
      aria-label={label}
      value={value ?? ''}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">{anyLabel ?? 'Speak'}</option>
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

/** THE RELOCATION: a region, words, rounds. Shared by a row's `relocate`
 * and a conversation's `jail` and `arrest` (R33). */
export function RelocationFields({
  label,
  region,
  words,
  rounds,
  regionLabel = 'Region',
  onChange,
}: {
  /** What the controls are named for: "<…> entry". */
  label: string;
  region: string;
  words: string;
  rounds: number | undefined;
  regionLabel?: string;
  onChange(patch: {
    to?: string;
    words?: string;
    rounds?: number | null;
  }): void;
}): React.JSX.Element {
  const names = useContext(SiteNamesContext);
  const known = names.regions.some((entry) => entry.id === region);
  return (
    <div className="wb-relocation">
      <label>
        <span>{regionLabel}</span>
        <select
          aria-label={`${regionLabel} for ${label}`}
          value={region}
          onChange={(event) => onChange({ to: event.target.value })}
        >
          {!known && (
            <option value={region}>
              {region === '' ? '(choose a region)' : region}
            </option>
          )}
          {names.regions.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.name === entry.id
                ? entry.id
                : `${entry.name} (${entry.id})`}
            </option>
          ))}
        </select>
      </label>
      <label className="wb-relocation-words">
        <span>Words</span>
        <textarea
          aria-label={`Words for ${label}`}
          placeholder="What the one moved is told"
          rows={2}
          value={words}
          onChange={(event) => onChange({ words: event.target.value })}
        />
      </label>
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
            if (raw === '') return onChange({ rounds: null });
            const n = Number(raw);
            if (Number.isInteger(n) && n >= 0) onChange({ rounds: n });
          }}
        />
      </label>
    </div>
  );
}

const GRANT_LABELS: Record<RowGrant, string> = {
  recognize: 'Recognition',
  tells: 'Record',
  relocate: 'Relocation',
};

/** A line's verdict row's grant: Nothing, or ONE of a recognition, a record
 * told or a relocation. Not on a table row (the caller offers it only on a
 * line's row); no recognition on a prop's line. */
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
  const topicsId = useId();
  const grant = grantOf(row);
  const offered: RowGrant[] = isProp
    ? ['tells', 'relocate']
    : ['recognize', 'tells', 'relocate'];
  const named = `${label} entry`;
  const recognize = row.recognize;
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
      {grant === 'recognize' && recognize && (
        <RevealDiv
          path={at ? `${at}.recognize` : undefined}
          className="wb-entry-grant-fields"
        >
          <label>
            <span>Topic</span>
            <input
              aria-label={`Topic for ${named}`}
              list={topicsId}
              placeholder="a topic, or a new one"
              value={recognize.topic}
              onChange={(event) =>
                onCommit(withRecognition(row, { topic: event.target.value }))
              }
            />
            <datalist id={topicsId}>
              {names.topics.map((topic) => (
                <option key={topic} value={topic} />
              ))}
            </datalist>
          </label>
          <label>
            <span>Held by</span>
            <select
              aria-label={`Held by for ${named}`}
              value="spoken_to"
              disabled
            >
              <option value="spoken_to">The one spoken to</option>
            </select>
          </label>
          <label>
            <span>About</span>
            <select
              aria-label={`About for ${named}`}
              value={recognize.about}
              onChange={(event) =>
                onCommit(withRecognition(row, { about: event.target.value }))
              }
            >
              <option value="party_in_sight">
                The speaker’s party in sight
              </option>
              <option value="speaker">The speaker</option>
              {!(RECOGNITION_ABOUT as readonly string[]).includes(
                recognize.about
              ) && <option value={recognize.about}>{recognize.about}</option>}
            </select>
          </label>
          <label className="wb-check">
            <input
              type="checkbox"
              aria-label={`Witnessing carriers hold it too for ${named}`}
              checked={recognize.heard_by === RECOGNITION_HEARD_BY}
              disabled={!namesConversation && recognize.heard_by === undefined}
              onChange={(event) =>
                onCommit(withRecognition(row, { heard: event.target.checked }))
              }
            />
            <span>Also held by the conversation’s carriers who witness it</span>
          </label>
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
    </div>
  );
}
