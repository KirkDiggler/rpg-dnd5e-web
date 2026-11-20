/**
 * ONE LINE OF A CONVERSATION, AS A CARD (rpg-project#1030).
 *
 * Closed, a card shows what the player says, when it is offered, the check
 * with each way's difficulty editable in place, and what follows on a pass
 * and on a miss. Edit opens the one line form (`OptionsEditor`, given
 * `only`) for this line, in place.
 *
 * THE ENGINE IS THE ONLY VOICE. Every sentence on a closed card is the
 * `sentence` of a read-back statement at or under this line's path
 * (`lineReadBackOf`), sorted by where it stands, never by what it says. What
 * the card reads from the draft are VALUES at the line's path, as the form
 * does: the words said and answered, and each way's ability and difficulty.
 * While the read-back is not of this draft, the card says "checking…" where
 * the engine's sentences would be.
 */
import { speakSkillName } from '@/components/session/combat-experience/speakOptions';
import type { ReadBackStatement } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/authoring/v1alpha1/service_pb';
import { useCallback } from 'react';
import type { OptionShape } from '../world-building/answerTableShape';
import type { LineReadBack } from './sharedLinesView';
import { useRevealablePath } from './useReveal';

export const CHECKING_LINE_SENTENCE = 'checking…';
export const REFUSED_LINE_SENTENCE =
  'not read back: the engine refused this draft';

/** Whether the card's sentences are the engine's for this draft. */
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

function Sentences({
  statements,
  sentences,
  none,
  className,
}: {
  statements: (r: LineReadBack) => readonly ReadBackStatement[];
  sentences: LineSentences;
  /** Said when the engine is current and says nothing here. */
  none?: string;
  className?: string;
}): React.JSX.Element | null {
  if (sentences.state !== 'current')
    return (
      <p className={`es-line-card-pending ${className ?? ''}`}>
        {sentences.state === 'refused'
          ? REFUSED_LINE_SENTENCE
          : CHECKING_LINE_SENTENCE}
      </p>
    );
  const said = statements(sentences.readBack);
  if (said.length === 0)
    return none ? <p className={className}>{none}</p> : null;
  return (
    <>
      {said.map((statement, at) => (
        <p
          key={`${statement.path}#${at}`}
          className={className}
          data-engine-path={statement.path}
          title={statement.path}
        >
          {statement.sentence}
        </p>
      ))}
    </>
  );
}

function Branch({
  title,
  tone,
  rows,
  statements,
  sentences,
}: {
  title: string;
  tone: 'pass' | 'miss' | 'said';
  rows: readonly unknown[];
  statements: (r: LineReadBack) => readonly ReadBackStatement[];
  sentences: LineSentences;
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
            The listener says <q>{say}</q>
          </p>
        ))
      )}
      {rows.length > 0 && (
        <div className="es-line-card-follows">
          <Sentences statements={statements} sentences={sentences} />
        </div>
      )}
    </section>
  );
}

export function SharedLineCard({
  conversation,
  index,
  linePath,
  option,
  sentences,
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
  const said = saidWords(option);
  const ways = option.check ?? [];
  const checked = option.check !== undefined && ways.length > 0;
  const passRows = option.success ?? [];
  const missRows = option.failure ?? [];
  const editLabel = `Edit line ${n} of ${conversation}`;
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
              aria-label={editLabel}
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
          <div className="es-line-card-when">
            <span className="es-line-card-cap">Offered when</span>
            <Sentences
              statements={(r) => r.offered}
              sentences={sentences}
              none="Always."
            />
          </div>
          <div
            className="es-line-card-check"
            role="group"
            aria-label={`Check of line ${n} of ${conversation}`}
          >
            {checked ? (
              <>
                <span className="es-line-card-cap">
                  {ways.length > 1 ? 'Check, best of:' : 'Check:'}
                </span>
                {ways.map((way, j) => {
                  const words = wayWords(way.ability);
                  return (
                    <span key={j} className="es-line-card-way-wrap">
                      {j > 0 && <span className="es-line-card-or">or</span>}
                      <label className="es-line-card-way">
                        <span>{words}</span>
                        <input
                          type="number"
                          min={1}
                          step={1}
                          aria-label={`${words} difficulty, line ${n} of ${conversation}`}
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
          <div className="es-line-card-branches">
            {checked ? (
              <>
                <Branch
                  title="On a pass"
                  tone="pass"
                  rows={passRows}
                  statements={(r) => r.pass}
                  sentences={sentences}
                />
                <Branch
                  title="On a miss"
                  tone="miss"
                  rows={missRows}
                  statements={(r) => r.miss}
                  sentences={sentences}
                />
              </>
            ) : (
              <>
                <Branch
                  title="When it is said"
                  tone="said"
                  rows={passRows}
                  statements={(r) => r.pass}
                  sentences={sentences}
                />
                {missRows.length > 0 && (
                  <Branch
                    title="On a miss"
                    tone="miss"
                    rows={missRows}
                    statements={(r) => r.miss}
                    sentences={sentences}
                  />
                )}
              </>
            )}
          </div>
          {Object.hasOwn(option, 'advance') && (
            <div className="es-line-card-steps">
              <span className="es-line-card-cap">Then</span>
              <Sentences statements={(r) => r.advance} sentences={sentences} />
            </div>
          )}
          {sentences.state === 'current' && (
            <details className="es-line-card-more">
              <summary>How the engine reads this line</summary>
              <Sentences
                statements={(r) => [...r.line, ...r.check, ...r.more]}
                sentences={sentences}
                none="The engine says nothing more of it."
              />
            </details>
          )}
        </>
      )}
    </article>
  );
}
