import {
  Slot,
  type Declaration,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { useEffect, useId, useState } from 'react';
import {
  actionTooltipText,
  buildActionTooltip,
  slotLabel,
} from './actionTooltip';
import styles from './DesktopActionSurface.module.css';
import { EffectRows } from './EffectRows';
import {
  currentExecutableDeclaration,
  organizeDeclarations,
  type ActionIconPresentation,
} from './organizedActionPresentation';
import type { OrganizedActionSurfaceProps } from './OrganizedActionSurface';

function ActionArt({
  art,
  label,
}: {
  art?: ActionIconPresentation;
  label: string;
}) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  return art?.src && art.src !== failedSource ? (
    <span
      className={styles.art}
      style={{ maskImage: `url("${art.src}")` }}
      aria-hidden="true"
    >
      {/* Retain native load/error reporting; the source alpha paints the tint. */}
      <img
        src={art.src}
        alt=""
        draggable={false}
        onError={() => setFailedSource(art.src)}
      />
    </span>
  ) : (
    <span className={styles.fallback} aria-hidden="true">
      {art?.fallback ?? label.slice(0, 2)}
    </span>
  );
}

function costMark(slot: Slot): string {
  if (slot === Slot.ACTION) return 'A';
  if (slot === Slot.BONUS) return 'B';
  if (slot === Slot.REACTION) return 'R';
  return '—';
}

/** Presentation of current offers, not a second action controller. */
export function DesktopActionSurface({
  declarations,
  authorityFresh,
  presentation,
  armedDeclarationId,
  onSelectDeclaration,
  onCancelSelection,
  secondaryControls,
}: OrganizedActionSurfaceProps) {
  const [inspectedId, setInspectedId] = useState<string | null>(null);
  const [pointerInCard, setPointerInCard] = useState(false);
  const descriptionPrefix = useId();
  const organized = organizeDeclarations(declarations, presentation);
  const groups = [
    { label: 'At hand', entries: organized.quick },
    { label: 'Spells', entries: organized.sections.spells },
    { label: 'Abilities', entries: organized.sections.abilities },
    { label: 'Items', entries: organized.sections.items },
    { label: 'Actions', entries: organized.sections.actions },
  ].filter((group) => group.entries.length > 0);
  const offers = groups.flatMap((group) => group.entries);
  const inspected = offers.find((offer) => offer.id === inspectedId);
  useEffect(() => {
    if (inspectedId && !inspected) setInspectedId(null);
  }, [inspectedId, inspected]);
  const tooltip = inspected ? buildActionTooltip(inspected) : null;
  const refusal = !authorityFresh
    ? 'Actions may be out of date'
    : tooltip?.refusal;
  const select = (id: string): void => {
    const current = authorityFresh
      ? currentExecutableDeclaration(declarations, id)
      : undefined;
    if (!current) return;
    setInspectedId(null);
    onSelectDeclaration(current);
  };
  const inspect = (declaration: Declaration): void =>
    setInspectedId(declaration.id);

  return (
    <div
      className={styles.surface}
      data-testid="desktop-action-surface"
      data-crowded={offers.length > 18}
      onPointerLeave={() => {
        setInspectedId(null);
        setPointerInCard(false);
      }}
      onBlur={(event) => {
        if (
          !event.currentTarget.contains(event.relatedTarget) &&
          !pointerInCard
        )
          setInspectedId(null);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && inspectedId) {
          setInspectedId(null);
          event.stopPropagation();
        }
      }}
    >
      <div className={styles.groups}>
        {groups.map((group) => (
          <section
            className={styles.group}
            key={group.label}
            aria-label={group.label}
            style={{ flexGrow: group.entries.length }}
          >
            <h3>{group.label}</h3>
            <div className={styles.offers}>
              {group.entries.map((declaration) => {
                const info = buildActionTooltip(declaration);
                const disabled = !authorityFresh || !declaration.available;
                const art = presentation?.desktopIcons?.[declaration.id];
                const descriptionId = `${descriptionPrefix}-${declaration.id}`;
                return (
                  <div key={declaration.id} className={styles.offerSlot}>
                    <button
                      type="button"
                      className={styles.offer}
                      data-tone={art?.tone ?? 'gold'}
                      data-offer-id={declaration.id}
                      aria-label={info.title}
                      aria-describedby={descriptionId}
                      aria-disabled={disabled}
                      aria-pressed={armedDeclarationId === declaration.id}
                      onPointerEnter={(event) => {
                        if (
                          event.pointerType === 'mouse' ||
                          event.pointerType === 'pen'
                        )
                          inspect(declaration);
                      }}
                      onFocus={() => inspect(declaration)}
                      onClick={() => select(declaration.id)}
                    >
                      <ActionArt art={art} label={info.title} />
                      <span className={styles.cost} aria-hidden="true">
                        {costMark(declaration.slot)}
                      </span>
                      {disabled && (
                        <span
                          className={styles.unavailableMark}
                          aria-hidden="true"
                        >
                          ×
                        </span>
                      )}
                    </button>
                    <span className={styles.srOnly} id={descriptionId}>
                      {actionTooltipText(info)}
                      {!authorityFresh ? '. Actions may be out of date' : ''}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
      <div className={styles.footer}>
        {secondaryControls && (
          <div className={styles.utilities}>{secondaryControls}</div>
        )}
        {/* Reserve the cancel cell so selection never moves the icons. */}
        <button
          type="button"
          className={styles.cancel}
          style={{
            visibility:
              armedDeclarationId && onCancelSelection ? 'visible' : 'hidden',
          }}
          onClick={onCancelSelection}
        >
          Cancel action
        </button>
      </div>
      {inspected && tooltip && (
        <div className={styles.inspectionBridge}>
          <div
            className={styles.inspection}
            role="tooltip"
            aria-label={`${tooltip.title} details`}
            tabIndex={0}
            onPointerEnter={() => setPointerInCard(true)}
            onPointerLeave={() => setPointerInCard(false)}
          >
            <header>
              <div
                className={styles.inspectionIcon}
                data-tone={
                  presentation?.desktopIcons?.[inspected.id]?.tone ?? 'gold'
                }
              >
                <ActionArt
                  art={presentation?.desktopIcons?.[inspected.id]}
                  label={tooltip.title}
                />
              </div>
              <div>
                <small>{slotLabel(inspected.slot)}</small>
                <strong>{tooltip.title}</strong>
              </div>
            </header>
            <dl>
              {tooltip.lines.map((line) => (
                <div key={line.label}>
                  <dt>{line.label}</dt>
                  <dd>{line.value}</dd>
                </div>
              ))}
            </dl>
            <EffectRows lines={tooltip.effects} />
            {refusal ? (
              <p className={styles.refusal}>Unavailable — {refusal}</p>
            ) : (
              <p className={styles.ready}>Click to select</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
