import type { SpeakTarget } from '@/api/useSessionSpeak';
import type { Declaration } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import legacy from './CombatExperience.module.css';
import styles from './ConversationPanel.module.css';
import { speakLinesFor, speakTargetsOf } from './speakOptions';

export interface ConversationPanelProps {
  declaration: Declaration;
  memberNames: ReadonlyMap<string, string>;
  target?: SpeakTarget | null;
  docked?: boolean;
  host?: HTMLElement | null;
  onHeightChange?: (height: number) => void;
  onTargetClick: (id: string) => void;
  onChooseTarget?: (target: SpeakTarget | null) => void;
  onSpeakOption?: (optionId: string) => void;
  onCancel?: () => void;
}
/** Present the offered targets/lines. Picking a target is not sending a line. */
export function ConversationPanel({
  declaration,
  memberNames,
  target,
  docked = false,
  host,
  onHeightChange,
  onTargetClick,
  onChooseTarget,
  onSpeakOption,
  onCancel,
}: ConversationPanelProps) {
  const root = useRef<HTMLDivElement>(null);
  const targets = speakTargetsOf(declaration);
  const lines = target ? speakLinesFor(declaration, target) : [];
  const name = (who: SpeakTarget): string =>
    who.case === 'memberId'
      ? memberNames.get(who.value) || who.value
      : who.value;
  const scope = JSON.stringify([declaration.id, target?.case, target?.value]);
  useLayoutEffect(() => {
    if (!docked || !onHeightChange) return;
    const node = root.current;
    if (!node) return;
    const measure = (): void =>
      onHeightChange(node.getBoundingClientRect().height);
    measure();
    const observer =
      typeof ResizeObserver === 'undefined'
        ? undefined
        : new ResizeObserver(measure);
    observer?.observe(node);
    return () => {
      observer?.disconnect();
      onHeightChange(0);
    };
  }, [docked, host, onHeightChange]);
  useEffect(() => {
    if (docked)
      root.current
        ?.querySelector<HTMLButtonElement>('[data-speak-choice]')
        ?.focus({ preventScroll: true });
  }, [scope, docked, host]);
  if (docked && !host) return null;
  const panel = (
    <div ref={root} className={docked ? styles.position : undefined}>
      <section
        className={`${styles.panel} ${docked ? '' : legacy.contextPrompt}`}
        data-phase="targeting"
        role="region"
        aria-label="Conversation"
      >
        <header>
          <small>Conversation</small>
          <strong>
            {target && lines.length > 0
              ? `What do you say to ${name(target)}?`
              : targets.length === 0
                ? // The offer covers only who is within interaction reach
                  // (rpg-project#753 R4); an empty one says so, and the map
                  // is where a far creature or prop is walked toward.
                  'Nobody within reach'
                : 'Choose who to speak to'}
          </strong>
        </header>
        {target && lines.length > 0 ? (
          <ul
            className={styles.choices}
            aria-label={`Lines for ${name(target)}`}
          >
            {lines.map((option) => (
              <li key={option.optionId}>
                <button
                  type="button"
                  data-speak-choice={option.optionId}
                  className={styles.choice}
                  onClick={() => onSpeakOption?.(option.optionId)}
                >
                  {option.line ? `“${option.line}”` : option.optionId}
                </button>
              </li>
            ))}
          </ul>
        ) : targets.length === 0 ? null : (
          <ul className={styles.choices} aria-label="Speak targets">
            {targets.map((who) => (
              <li key={`${who.case}:${who.value}`}>
                <button
                  type="button"
                  data-speak-choice={who.value}
                  className={styles.choice}
                  onClick={() =>
                    who.case === 'memberId'
                      ? onTargetClick(who.value)
                      : onChooseTarget?.(who)
                  }
                >
                  {name(who)}
                </button>
              </li>
            ))}
          </ul>
        )}
        <footer>
          {target && lines.length > 0 && onChooseTarget && (
            <button type="button" onClick={() => onChooseTarget(null)}>
              Speak to someone else
            </button>
          )}
          {onCancel && (
            <button type="button" onClick={onCancel}>
              Cancel
            </button>
          )}
        </footer>
      </section>
    </div>
  );
  return docked && host ? createPortal(panel, host) : panel;
}
