/**
 * ONE LINE OF A CONVERSATION, AS A CARD (rpg-project#1030).
 *
 * Closed, a card is a few lines: what the player says, when it is offered,
 * the check with each way's difficulty editable in place, and what follows
 * on a pass and on a miss. Edit opens the one line form (`OptionsEditor`,
 * given `only`) for this line, in place.
 *
 * THE ENGINE IS THE ONLY VOICE. The card's face is built from the engine's
 * STRUCTURE (`lineFaceOf`): each clause and chip comes from a read-back
 * statement's connections at or under this line's path, about this
 * conversation, and carries that statement's full sentence as its tooltip.
 * Every sentence the engine says of the line is in the card's details; a
 * connection the face does not know is counted there ("+N more"), never
 * dropped. The card reads VALUES from the draft at the line's path, as the
 * form does: the words said and answered, and each way's ability and
 * difficulty. While the read-back is not of this draft, the card says
 * "checking…" where the engine's words would be.
 */
import { speakSkillName } from '@/components/session/combat-experience/speakOptions';
import type { ReadBackStatement } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/authoring/v1alpha1/service_pb';
import { useCallback, useState } from 'react';
import type { OptionShape } from '../world-building/answerTableShape';
import {
  lineFaceOf,
  type FaceItem,
  type FaceSide,
  type ValueAt,
} from './lineFace';
import type { LineReadBack } from './sharedLinesView';
import { useRevealablePath } from './useReveal';

export const CHECKING_LINE_SENTENCE = 'checking…';
export const REFUSED_LINE_SENTENCE =
  'not read back: the engine refused this draft';

/** Whether the card's words are the engine's for this draft. */
export type LineSentences =
  | { state: 'current'; readBack: LineReadBack }
  | { state: 'checking' | 'refused' };

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

function Item({ item }: { item: FaceItem }): React.JSX.Element {
  return (
    <span
      className="es-line-card-item"
      title={item.sentence}
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

function Pending({ sentences }: { sentences: LineSentences }) {
  return (
    <span className="es-line-card-pending">
      {sentences.state === 'refused'
        ? REFUSED_LINE_SENTENCE
        : CHECKING_LINE_SENTENCE}
    </span>
  );
}

function Branch({
  title,
  tone,
  rows,
  face,
  sentences,
  onMore,
}: {
  title: string;
  tone: 'pass' | 'miss' | 'said';
  rows: readonly unknown[];
  face: FaceSide | null;
  sentences: LineSentences;
  onMore(): void;
}): React.JSX.Element {
  const answers = rows
    .map((row) => (isRecord(row) && typeof row.say === 'string' ? row.say : ''))
    .filter((say) => say !== '');
  return (
    <section
      className={`es-line-card-branch es-line-card-${tone}`}
      aria-label={title}
    >
      <h6 className="es-line-card-cap">{title}</h6>
      {answers.length === 0 ? (
        <p className="es-help">The listener answers nothing.</p>
      ) : (
        answers.map((say, at) => (
          <p key={at}>
            <q>{say}</q>
          </p>
        ))
      )}
      {face ? (
        (face.chips.length > 0 || face.unknown > 0) && (
          <ul className="es-line-card-chips" aria-label={`${title}, then`}>
            {face.chips.map((chip, at) => (
              <li key={at}>
                <Item item={chip} />
              </li>
            ))}
            {face.unknown > 0 && (
              <li>
                <More count={face.unknown} onOpen={onMore} />
              </li>
            )}
          </ul>
        )
      ) : (
        <Pending sentences={sentences} />
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
  conversation,
  index,
  linePath,
  option,
  sentences,
  value,
  open,
  onOpen,
  onClose,
  onDifficulty,
  children,
}: {
  conversation: string;
  index: number;
  /** `conversations.<id>.lines[k]`, the line's path. */
  linePath: string;
  /** The line as the draft holds it. */
  option: OptionShape;
  sentences: LineSentences;
  /** What the draft holds at a path the engine named. */
  value: ValueAt;
  /** The line's full form is open, in place of the card's body. */
  open: boolean;
  onOpen(): void;
  onClose(): void;
  /** One way's new difficulty: one write of the line. */
  onDifficulty(way: number, dc: number): void;
  /** The line's full form, shown while open. */
  children: React.ReactNode;
}): React.JSX.Element {
  const n = index + 1;
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
    sentences.state === 'current'
      ? lineFaceOf(sentences.readBack, value)
      : null;
  const words = sentences.state === 'current' ? allOf(sentences.readBack) : [];
  return (
    <article
      ref={ref}
      className={`es-line-card${open ? ' es-line-card-open' : ''}`}
      aria-label={`Line ${n} of ${conversation}`}
      data-line-card={linePath}
    >
      <header className="es-line-card-head">
        <p className="es-line-card-say">{said}</p>
        <span className="es-line-card-tools">
          {option.id && <code title={linePath}>{option.id}</code>}
          {open ? (
            <button
              type="button"
              aria-label={`Done editing line ${n} of ${conversation}`}
              onClick={onClose}
            >
              Done
            </button>
          ) : (
            <button
              type="button"
              aria-label={`Edit line ${n} of ${conversation}`}
              aria-expanded={false}
              onClick={onOpen}
            >
              Edit
            </button>
          )}
        </span>
      </header>
      {open ? (
        <div className="es-line-card-form">{children}</div>
      ) : (
        <>
          <div className="es-line-card-row">
            <div
              className="es-line-card-when"
              role="group"
              aria-label={`Offered when, line ${n} of ${conversation}`}
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
                <Pending sentences={sentences} />
              )}
            </div>
            <div
              className="es-line-card-check"
              role="group"
              aria-label={`Check of line ${n} of ${conversation}`}
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
                          <input
                            type="number"
                            min={1}
                            step={1}
                            aria-label={`${ability} difficulty, line ${n} of ${conversation}`}
                            value={way.dc}
                            onChange={(event) =>
                              onDifficulty(j, Number(event.target.value))
                            }
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
                  sentences={sentences}
                  onMore={showWords}
                />
                <Branch
                  title="On a miss"
                  tone="miss"
                  rows={missRows}
                  face={face?.miss ?? null}
                  sentences={sentences}
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
                  sentences={sentences}
                  onMore={showWords}
                />
                {missRows.length > 0 && (
                  <Branch
                    title="On a miss"
                    tone="miss"
                    rows={missRows}
                    face={face?.miss ?? null}
                    sentences={sentences}
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
