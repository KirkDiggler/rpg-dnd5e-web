import type { Declaration } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { useEffect, useRef, useState } from 'react';
import { ActionArt } from './ActionArt';
import { ActionInformationContent } from './ActionInformationContent';
import { buildActionTooltip, effectLinesFor } from './actionTooltip';
import styles from './DesktopEffects.module.css';
import type { ActionIconPresentation } from './organizedActionPresentation';

/** Base action information and contextual effects, never commands or global applicability. */
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
  // UI keys are separate from provider IDs: an effect named "action" cannot
  // collide with the base-information control.
  const [hovered, setHovered] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const key = hovered ?? pinned;
  const tooltip = declaration ? buildActionTooltip(declaration) : undefined;
  const lines = declaration ? effectLinesFor(declaration, targetMember) : [];
  const inspected = lines.find((line) => `effect:${line.id}` === key);
  const inspectingAction = key === 'action' && Boolean(tooltip);
  const inspecting = inspectingAction || Boolean(inspected);
  const title = inspectingAction ? tooltip?.title : inspected?.name;
  const context = tooltip?.title;
  useEffect(() => {
    if ((hovered || pinned) && !inspecting) {
      setHovered(null);
      setPinned(null);
    }
  }, [hovered, pinned, inspecting]);
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
      root.current?.querySelectorAll<HTMLButtonElement>(
        '[data-inspection-key]'
      ) ?? []
    )
      .find((button) => button.dataset.inspectionKey === key)
      ?.focus();
    setPinned(null);
    setHovered(null);
  };
  const inspectionProps = (inspectionKey: string) => ({
    'data-inspection-key': inspectionKey,
    'aria-pressed': pinned === inspectionKey,
    onPointerEnter: (event: React.PointerEvent<HTMLButtonElement>): void => {
      if (event.pointerType === 'mouse' || event.pointerType === 'pen')
        setHovered(inspectionKey);
    },
    onPointerLeave: (): void => setHovered(null),
    onFocus: (): void => setHovered(inspectionKey),
    onBlur: (): void => setHovered(null),
    onClick: (): void => {
      setPinned(pinned === inspectionKey ? null : inspectionKey);
      setHovered(null);
    },
  });
  return (
    <section
      ref={root}
      className={styles.effects}
      aria-label="Action information and effects"
      data-testid="desktop-effects"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setPinned(null);
          setHovered(null);
        }
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && inspecting) {
          event.stopPropagation();
          close();
        }
      }}
    >
      <h3>Action information</h3>
      <div className={styles.icons}>
        {tooltip && (
          <button
            type="button"
            className={styles.icon}
            aria-label={`Inspect ${tooltip.title}`}
            title={`${tooltip.title} information`}
            {...inspectionProps('action')}
          >
            <span aria-hidden="true">i</span>
          </button>
        )}
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
            {...inspectionProps(`effect:${line.id}`)}
          >
            <ActionArt art={icons?.[line.id]} label={line.name} />
          </button>
        ))}
      </div>
      {!tooltip && <small>Select an action to inspect</small>}
      {inspecting && tooltip && (
        <div
          className={`${styles.card} ${pinned ? '' : styles.preview}`}
          role={pinned ? 'region' : 'tooltip'}
          aria-label={`${title} information`}
          tabIndex={pinned ? 0 : undefined}
        >
          <header>
            <div>
              <strong>{title}</strong>
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
          <ActionInformationContent
            description={tooltip.description}
            lines={tooltip.lines}
            effects={inspectingAction ? lines : inspected ? [inspected] : []}
            effectsLabel="Effect details"
          />
          {tooltip.refusal && <p>Unavailable — {tooltip.refusal}</p>}
          {!pinned && <small>Click the icon to pin these details.</small>}
        </div>
      )}
    </section>
  );
}
