import type { Declaration } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { useEffect, useRef, useState } from 'react';
import { ActionArt } from './ActionArt';
import { buildActionTooltip, effectLinesFor } from './actionTooltip';
import styles from './DesktopEffects.module.css';
import { EffectRows } from './EffectRows';
import type { ActionIconPresentation } from './organizedActionPresentation';

/** Read-only engine answers for a NAMED action context, never global applicability. */
export function DesktopEffects({
  declaration,
  targetMember,
  targetName,
  authorityFresh,
  icons,
}: {
  declaration?: Declaration;
  targetMember?: string | null;
  targetName?: string;
  authorityFresh: boolean;
  icons?: Readonly<Record<string, ActionIconPresentation>>;
}) {
  const root = useRef<HTMLElement>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const lines = declaration ? effectLinesFor(declaration, targetMember) : [];
  const inspected = lines.find((line) => line.id === (hovered ?? pinned));
  const context = declaration
    ? buildActionTooltip(declaration).title
    : undefined;
  useEffect(() => {
    if ((hovered || pinned) && !inspected) {
      setHovered(null);
      setPinned(null);
    }
  }, [hovered, pinned, inspected]);
  useEffect(() => {
    setHovered(null);
    setPinned(null);
  }, [declaration?.id]);
  useEffect(() => {
    if (!pinned) return;
    const outside = (event: PointerEvent): void => {
      if (
        event.target instanceof Node &&
        !root.current?.contains(event.target)
      ) {
        setPinned(null);
        setHovered(null);
      }
    };
    window.addEventListener('pointerdown', outside);
    return () => window.removeEventListener('pointerdown', outside);
  }, [pinned]);
  const close = (): void => {
    Array.from(
      root.current?.querySelectorAll<HTMLButtonElement>('[data-effect-id]') ??
        []
    )
      .find((button) => button.dataset.effectId === inspected?.id)
      ?.focus();
    setPinned(null);
    setHovered(null);
  };
  return (
    <section
      ref={root}
      className={styles.effects}
      aria-label="Effects and traits"
      data-testid="desktop-effects"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setPinned(null);
          setHovered(null);
        }
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && inspected) {
          event.stopPropagation();
          close();
        }
      }}
    >
      <h3>Effects &amp; traits</h3>
      <div className={styles.icons}>
        {lines.map((line) => (
          <button
            type="button"
            key={line.id}
            data-effect-id={line.id}
            className={styles.icon}
            style={
              {
                '--icon-color':
                  icons?.[line.id]?.tone === 'green'
                    ? '#77cda5'
                    : icons?.[line.id]?.tone === 'violet'
                      ? '#b09ddb'
                      : icons?.[line.id]?.tone === 'blue'
                        ? '#8bbddd'
                        : '#d6b573',
              } as React.CSSProperties
            }
            aria-label={`Inspect ${line.name}`}
            aria-description={`${line.stateWord}. ${line.reason} For ${context}${targetMember ? ` · ${targetName || 'selected target'}` : ''}`}
            aria-pressed={pinned === line.id}
            onPointerEnter={(event) => {
              if (event.pointerType === 'mouse' || event.pointerType === 'pen')
                setHovered(line.id);
            }}
            onPointerLeave={() => setHovered(null)}
            onFocus={() => setHovered(line.id)}
            onBlur={() => setHovered(null)}
            onClick={() => {
              setPinned(pinned === line.id ? null : line.id);
              setHovered(null);
            }}
          >
            <ActionArt art={icons?.[line.id]} label={line.name} />
          </button>
        ))}
      </div>
      {!lines.length && <small>No effect information</small>}
      {inspected && (
        <div
          className={`${styles.card} ${pinned ? '' : styles.preview}`}
          role={pinned ? 'region' : 'tooltip'}
          aria-label={`${inspected.name} information`}
          tabIndex={pinned ? 0 : undefined}
        >
          <header>
            <div>
              <strong>{inspected.name}</strong>
              <small>
                For {context}
                {targetMember ? ` · ${targetName || 'selected target'}` : ''}
              </small>
            </div>
            {pinned && (
              <button type="button" onClick={close}>
                Close information
              </button>
            )}
          </header>
          {!authorityFresh && (
            <p>Last received details — may be out of date.</p>
          )}
          <EffectRows lines={[inspected]} label="Effect details" />
          {!pinned && <small>Click the icon to pin these details.</small>}
        </div>
      )}
    </section>
  );
}
