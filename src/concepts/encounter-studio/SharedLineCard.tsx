/**
 * ONE LINE, AS A CARD (rpg-project#1030): a conversation's line, or a
 * carrier's own line beside it.
 *
 * Closed, a card is a few lines: what the player says, when it is offered,
 * the check with each way's difficulty editable in place, and what follows
 * on a pass and on a miss, reply by reply. Edit opens the one line form
 * (`OptionsEditor`, given `only`) for this line, in place.
 *
 * THE ENGINE IS THE ONLY VOICE. The card's face is built from the engine's
 * STRUCTURE (`lineFaceOf`): each clause and chip comes from a read-back
 * statement's connections at or under this line's path, about the line's
 * owner, and carries that statement's full sentence as its tooltip. Every
 * sentence the engine says of the line is in the card's details; a
 * connection the face does not know is counted there ("+N more"), never
 * dropped.
 *
 * WHILE THE READ-BACK IS NOT OF THIS DRAFT: while the check runs, the card
 * says "checking…" where the engine's words would be. When the engine
 * refused the draft, the card keeps the words of the last draft that
 * compiled, marked as from before the last edit, and shows the refusal that
 * concerns it.
 */
import { speakSkillName } from '@/components/session/combat-experience/speakOptions';
import type { ReadBackStatement } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/authoring/v1alpha1/service_pb';
import { useCallback, useEffect, useId, useState } from 'react';
import type { OptionShape } from '../world-building/answerTableShape';
import {
  difficultyOf,
  lineFaceOf,
  type FaceItem,
  type FaceRow,
  type FaceSide,
  type ValueAt,
} from './lineFace';
import type { LineReadBack } from './sharedLinesView';
import { useRevealablePath } from './useReveal';

export const CHECKING_LINE_SENTENCE = 'checking…';
export const STALE_LINE_SENTENCE =
  'From before your last edit: the engine refused the draft.';
export const DIFFICULTY_REFUSAL =
  'A difficulty is a whole number, 0 or more. Not written.';

/** Whether the card's words are the engine's for this draft: `current`;
 * `stale`, the last compiled draft's while the engine refuses this one; or
 * `checking`, none yet. */
export type LineSentences =
  | { state: 'current' | 'stale'; readBack: LineReadBack }
  | { state: 'checking' };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/** An ability or skill, in words ("performance" reads "Performance"), as the
 * play screen names the skill a line rolled. */
function wayWords(ability: string): string {
  return ability.trim() === '' ? 'no ability' : speakSkillName(ability);
}

/** What the line says, from the draft, in the line's own words. */
function saidWords(option: OptionShape): string {
  if (typeof option.do === 'string' && option.do !== '')
    return `does “${option.do}”`;
  return typeof option.say === 'string' && option.say !== ''
    ? `“${option.say}”`
    : 'Nothing said yet';
}

/** A way's difficulty, edited in place on a closed card. Only a whole
 * number, 0 or more, is written; anything else stays in the field, unwritten,
 * and the field says why. */
function DifficultyInput({
  label,
  dc,
  onDifficulty,
}: {
  label: string;
  dc: number;
  onDifficulty(dc: number): void;
}): React.JSX.Element {
  const [text, setText] = useState(String(dc));
  const errorId = useId();
  // The draft moved (an undo, the form): show what it holds.
  useEffect(() => {
    setText((was) => (difficultyOf(was) === dc ? was : String(dc)));
  }, [dc]);
  const refused = difficultyOf(text) === null;
  return (
    <>
      <input
        type="text"
        inputMode="numeric"
        aria-label={label}
        aria-invalid={refused || undefined}
        aria-describedby={refused ? errorId : undefined}
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          const next = difficultyOf(event.target.value);
          if (next !== null && next !== dc) onDifficulty(next);
        }}
        onBlur={() => {
          if (difficultyOf(text) === null) setText(String(dc));
        }}
      />
      {refused && (
        <span id={errorId} role="alert" className="es-line-card-invalid">
          {DIFFICULTY_REFUSAL}
        </span>
      )}
    </>
  );
}

function Item({ item }: { item: FaceItem }): React.JSX.Element {
  return (
    <span
      className="es-line-card-item"
      title={item.sentence || undefined}
      data-engine-path={item.path}
    >
      {item.parts.map((part, at) =>
        typeof part === 'string' ? (
          <span key={at}>{part}</span>
        ) : (
          <code key={at}>{part.id}</code>
        )
      )}
    </span>
  );
}

/** "+N more": what the face does not know, opening the engine's words. */
function More({
  count,
  onOpen,
}: {
  count: number;
  onOpen(): void;
}): React.JSX.Element | null {
  if (count === 0) return null;
  return (
    <button
      type="button"
      className="es-line-card-more-count"
      aria-label={`${count} more the engine says; show its words`}
      onClick={onOpen}
    >
      +{count} more
    </button>
  );
}

function Chips({
  items,
  label,
}: {
  items: readonly FaceItem[];
  label: string;
}): React.JSX.Element | null {
  if (items.length === 0) return null;
  return (
    <ul className="es-line-card-chips" aria-label={label}>
      {items.map((chip, at) => (
        <li key={at}>
          <Item item={chip} />
        </li>
      ))}
    </ul>
  );
}

function Reply({
  row,
  share,
}: {
  row: FaceRow;
  share: string | null;
}): React.JSX.Element {
  return (
    <div
      className="es-line-card-reply"
      data-engine-path={row.path}
      title={row.sentence || undefined}
    >
      <p>
        {share && <span className="es-line-card-share">{share}</span>}
        {row.say !== null ? (
          <q>{row.say}</q>
        ) : (
          <span className="es-help">No words.</span>
        )}
      </p>
      <Chips items={row.chips} label="What this reply does" />
    </div>
  );
}

function Branch({
  title,
  tone,
  rows,
  face,
  onMore,
}: {
  title: string;
  tone: 'pass' | 'miss' | 'said';
  /** The verdict's rows as the draft holds them: shown while the engine's
   * words are not yet in. */
  rows: readonly unknown[];
  face: FaceSide | null;
  onMore(): void;
}): React.JSX.Element {
  let body: React.ReactNode;
  if (face === null) {
    const answers = rows
      .map((row) =>
        isRecord(row) && typeof row.say === 'string' ? row.say : ''
      )
      .filter((say) => say !== '');
    body = (
      <>
        {answers.map((say, at) => (
          <p key={at}>
            <q>{say}</q>
          </p>
        ))}
        <span className="es-line-card-pending">{CHECKING_LINE_SENTENCE}</span>
      </>
    );
  } else if (face.rows.length === 0) {
    body = <p className="es-help">The listener answers nothing.</p>;
  } else if (face.rows.length === 1) {
    body = <Reply row={face.rows[0]!} share={null} />;
  } else {
    // THE ENGINE PICKS ONE ROW BY WEIGHT (`dungeonspec.AnswerSpec.Weight`).
    body = (
      <>
        <p className="es-line-card-cap">One of:</p>
        <ol className="es-line-card-replies">
          {face.rows.map((row) => (
            <li key={row.path}>
              <Reply row={row} share={`${row.weight} in ${face.total}`} />
            </li>
          ))}
        </ol>
      </>
    );
  }
  return (
    <section
      className={`es-line-card-branch es-line-card-${tone}`}
      aria-label={title}
    >
      <h6 className="es-line-card-cap">{title}</h6>
      {body}
      {face && (
        <>
          <Chips items={face.steps} label={`${title}, the step`} />
          <More count={face.unknown} onOpen={onMore} />
        </>
      )}
    </section>
  );
}

/** Every sentence the engine says of the line, in the engine's order. */
function allOf(read: LineReadBack): ReadBackStatement[] {
  return [
    ...read.line,
    ...read.offered,
    ...read.check,
    ...read.pass,
    ...read.miss,
    ...read.advance,
    ...read.more,
  ];
}

export function SharedLineCard({
  owner,
  number,
  linePath,
  option,
  sentences,
  value,
  refusals = [],
  open,
  onOpen,
  onClose,
  onDifficulty,
  children,
}: {
  /** Whose line it is, in words: the conversation's id, or the carrier's
   * name for one of its own lines. */
  owner: string;
  /** The card's number among its owner's cards, from 1. */
  number: number;
  /** The line's path: `conversations.<id>.lines[k]`, or a carrier's
   * `…options[i]`. */
  linePath: string;
  /** The line as the draft holds it. */
  option: OptionShape;
  sentences: LineSentences;
  /** What the draft holds at a path the engine named. */
  value: ValueAt;
  /** The engine's refusals at or under this line's path. */
  refusals?: readonly { path: string; message: string }[];
  /** The line's full form is open, in place of the card's body. */
  open: boolean;
  onOpen(): void;
  onClose(): void;
  /** One way's new difficulty: one write of the line. */
  onDifficulty(way: number, dc: number): void;
  /** The line's full form, shown while open. */
  children: React.ReactNode;
}): React.JSX.Element {
  const n = number;
  // A jump into this line opens its form; the form's own places take the
  // landing once it mounts (CONTRACT.md, Landing). Open, the form registers
  // the line's path itself.
  const reveal = useCallback(() => onOpen(), [onOpen]);
  const ref = useRevealablePath(open ? undefined : linePath, reveal);
  const [wordsOpen, setWordsOpen] = useState(false);
  const showWords = useCallback(() => setWordsOpen(true), []);
  const said = saidWords(option);
  const ways = option.check ?? [];
  const checked = option.check !== undefined && ways.length > 0;
  const passRows = option.success ?? [];
  const missRows = option.failure ?? [];
  const face =
    sentences.state === 'checking'
      ? null
      : lineFaceOf(sentences.readBack, linePath, value);
  const words = sentences.state === 'checking' ? [] : allOf(sentences.readBack);
  return (
    <article
      ref={ref}
      className={`es-line-card${open ? ' es-line-card-open' : ''}`}
      aria-label={`Line ${n} of ${owner}`}
      data-line-card={linePath}
    >
      <header className="es-line-card-head">
        <p className="es-line-card-say">{said}</p>
        <span className="es-line-card-tools">
          {option.id && <code title={linePath}>{option.id}</code>}
          {open ? (
            <button
              type="button"
              aria-label={`Done editing line ${n} of ${owner}`}
              onClick={onClose}
            >
              Done
            </button>
          ) : (
            <button
              type="button"
              aria-label={`Edit line ${n} of ${owner}`}
              aria-expanded={false}
              onClick={onOpen}
            >
              Edit
            </button>
          )}
        </span>
      </header>
      {refusals.length > 0 && (
        <ul
          className="es-line-card-refusals"
          aria-label={`The engine’s refusals in line ${n} of ${owner}`}
        >
          {refusals.map((refusal, at) => (
            <li key={at} title={refusal.path}>
              {refusal.message}
            </li>
          ))}
        </ul>
      )}
      {open ? (
        <div className="es-line-card-form">{children}</div>
      ) : (
        <>
          {sentences.state === 'stale' && (
            <p className="es-line-card-stale">{STALE_LINE_SENTENCE}</p>
          )}
          <div className="es-line-card-row">
            <div
              className="es-line-card-when"
              role="group"
              aria-label={`Offered when, line ${n} of ${owner}`}
            >
              <span className="es-line-card-cap">Offered when</span>{' '}
              {face ? (
                face.offered.length === 0 && face.offeredUnknown === 0 ? (
                  <span>Always</span>
                ) : (
                  <ul className="es-line-card-clauses">
                    {face.offered.map((clause, at) => (
                      <li key={at}>
                        <Item item={clause} />
                      </li>
                    ))}
                    {face.offeredUnknown > 0 && (
                      <li>
                        <More count={face.offeredUnknown} onOpen={showWords} />
                      </li>
                    )}
                  </ul>
                )
              ) : (
                <span className="es-line-card-pending">
                  {CHECKING_LINE_SENTENCE}
                </span>
              )}
            </div>
            <div
              className="es-line-card-check"
              role="group"
              aria-label={`Check of line ${n} of ${owner}`}
            >
              {checked ? (
                <>
                  <span className="es-line-card-cap">
                    {ways.length > 1 ? 'Check, best of' : 'Check'}
                  </span>
                  {ways.map((way, j) => {
                    const ability = wayWords(way.ability);
                    return (
                      <span key={j} className="es-line-card-way-wrap">
                        {j > 0 && <span className="es-line-card-or">or</span>}
                        <label className="es-line-card-way">
                          <span>{ability}</span>
                          <DifficultyInput
                            label={`${ability} difficulty, line ${n} of ${owner}`}
                            dc={way.dc}
                            onDifficulty={(dc) => onDifficulty(j, dc)}
                          />
                        </label>
                      </span>
                    );
                  })}
                </>
              ) : (
                <span className="es-line-card-cap">No check</span>
              )}
            </div>
          </div>
          <div className="es-line-card-branches">
            {checked ? (
              <>
                <Branch
                  title="On a pass"
                  tone="pass"
                  rows={passRows}
                  face={face?.pass ?? null}
                  onMore={showWords}
                />
                <Branch
                  title="On a miss"
                  tone="miss"
                  rows={missRows}
                  face={face?.miss ?? null}
                  onMore={showWords}
                />
              </>
            ) : (
              <>
                <Branch
                  title="When it is said"
                  tone="said"
                  rows={passRows}
                  face={face?.pass ?? null}
                  onMore={showWords}
                />
                {missRows.length > 0 && (
                  <Branch
                    title="On a miss"
                    tone="miss"
                    rows={missRows}
                    face={face?.miss ?? null}
                    onMore={showWords}
                  />
                )}
              </>
            )}
          </div>
          {face && (
            <details
              className="es-line-card-words"
              open={wordsOpen}
              onToggle={(event) => setWordsOpen(event.currentTarget.open)}
            >
              <summary>
                The engine’s words
                {face.moreUnknown > 0 &&
                  ` (+${face.moreUnknown} more under this line)`}
              </summary>
              {words.length === 0 ? (
                <p>The engine says nothing of this line.</p>
              ) : (
                words.map((statement, at) => (
                  <p
                    key={`${statement.path}#${at}`}
                    title={statement.path}
                    data-engine-sentence={statement.path}
                  >
                    {statement.sentence}
                  </p>
                ))
              )}
            </details>
          )}
        </>
      )}
    </article>
  );
}
