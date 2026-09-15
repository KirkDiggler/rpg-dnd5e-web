import {
  Verb,
  type Declaration,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { useMemo, useState, type ReactNode } from 'react';
import {
  actionTooltipText,
  buildActionTooltip,
  slotLabel,
  type ActionTooltip,
} from './actionTooltip';
import { castLabel } from './castLabel';
import styles from './CombatExperience.module.css';
import {
  currentExecutableDeclaration,
  organizeDeclarations,
  type OrganizedActionPresentation,
  type OrganizedActionSection,
} from './organizedActionPresentation';

function declarationLabel(declaration: Declaration): string {
  if (declaration.verb === Verb.ATTACK)
    return declaration.attack?.name || 'Attack';
  if (declaration.verb === Verb.ACTIVATE)
    return declaration.ability?.name || 'Ability';
  if (declaration.verb === Verb.CAST) return castLabel(declaration);
  if (declaration.verb === Verb.DEATH_SAVE)
    return declaration.deathSave?.name || 'Death Save';
  return 'Move';
}

function icon(declaration: Declaration): string {
  if (declaration.verb === Verb.ATTACK) return '⚔';
  if (declaration.verb === Verb.CAST) return '✧';
  if (declaration.verb === Verb.ACTIVATE) return '✦';
  return declaration.verb === Verb.MOVE ? '➜' : '✚';
}

function Inspection({
  label,
  tooltip,
  unavailable,
}: {
  label: string;
  tooltip: ActionTooltip;
  unavailable: string | null;
}) {
  return (
    <div
      className={styles.organizedInspection}
      role="region"
      aria-label={`${label} details`}
    >
      <strong>{tooltip.title}</strong>
      {tooltip.lines.map((line) => (
        <span key={line.label}>
          <em>{line.label}</em>
          {line.value}
        </span>
      ))}
      {unavailable && <p>Unavailable: {unavailable}</p>}
    </div>
  );
}

function Offer({
  declaration,
  authorityFresh,
  inspected,
  selected,
  onChoose,
  onInspect,
}: {
  declaration: Declaration;
  authorityFresh: boolean;
  inspected: boolean;
  selected: boolean;
  onChoose: (id: string) => void;
  onInspect: (id: string) => void;
}) {
  const tooltip = buildActionTooltip(declaration);
  const disabled = !authorityFresh || !declaration.available;
  const label = declarationLabel(declaration);
  return (
    <div className={styles.organizedOfferSlot}>
      <button
        type="button"
        className={styles.organizedOffer}
        disabled={disabled}
        aria-pressed={selected}
        title={actionTooltipText(tooltip)}
        aria-label={`${label}. ${actionTooltipText(tooltip)}`}
        onClick={() => onChoose(declaration.id)}
      >
        <span aria-hidden="true">{icon(declaration)}</span>
        <strong>{label}</strong>
        {declaration.verb === Verb.MOVE &&
          declaration.remaining !== undefined && (
            <small>{declaration.remaining} ft</small>
          )}
        <em>{slotLabel(declaration.slot)}</em>
      </button>
      <button
        type="button"
        className={styles.organizedInspectButton}
        aria-expanded={inspected}
        aria-controls={`organized-inspection-${declaration.id}`}
        onClick={() => onInspect(declaration.id)}
      >
        Details
      </button>
    </div>
  );
}

const sectionTitle: Record<OrganizedActionSection, string> = {
  spells: 'Spells',
  abilities: 'Abilities',
  items: 'Items',
  actions: 'All actions',
};

/** A compact, opt-in renderer for current server declarations. It has no rules. */
export function OrganizedActionSurface({
  declarations,
  authorityFresh,
  presentation,
  armedDeclarationId,
  onSelectDeclaration,
  onCancelSelection,
  onOpenEquipment,
  secondaryControls,
}: {
  declarations: readonly Declaration[];
  authorityFresh: boolean;
  presentation?: OrganizedActionPresentation;
  armedDeclarationId?: string;
  onSelectDeclaration: (declaration: Declaration) => void;
  onCancelSelection?: () => void;
  onOpenEquipment?: () => void;
  secondaryControls?: ReactNode;
}) {
  const [open, setOpen] = useState<OrganizedActionSection | null>(null);
  const [inspectedId, setInspectedId] = useState<string | null>(null);
  const organized = useMemo(
    () => organizeDeclarations(declarations, presentation),
    [declarations, presentation]
  );
  const activeOpen = open && organized.sections[open].length > 1 ? open : null;
  const inspectedDeclaration = declarations.find(
    (item) => item.id === inspectedId
  );
  const choose = (id: string) => {
    const current = authorityFresh
      ? currentExecutableDeclaration(declarations, id)
      : undefined;
    if (!current) return;
    setOpen(null); // Target/option flow owns the next surface.
    setInspectedId(null);
    onSelectDeclaration(current);
  };
  const inspect = (id: string) =>
    setInspectedId((current) => (current === id ? null : id));
  const openEntries = activeOpen ? organized.sections[activeOpen] : [];
  return (
    <div
      className={styles.organizedActions}
      data-testid="organized-action-surface"
    >
      <div
        className={styles.organizedQuick}
        role="group"
        aria-label="Quick actions"
      >
        <span>Quick</span>
        {organized.quick.map((declaration) => (
          <Offer
            key={declaration.id}
            declaration={declaration}
            authorityFresh={authorityFresh}
            inspected={inspectedId === declaration.id}
            selected={armedDeclarationId === declaration.id}
            onChoose={choose}
            onInspect={inspect}
          />
        ))}
        {organized.quick.length === 0 && (
          <small>No shortcut hints supplied.</small>
        )}
      </div>
      <div
        className={styles.organizedCollections}
        role="group"
        aria-label="Action collections"
      >
        {(Object.keys(sectionTitle) as OrganizedActionSection[]).map(
          (section) => {
            const count = organized.sections[section].length;
            if (!count) return null;
            if (count === 1) {
              const declaration = organized.sections[section][0]!;
              return (
                <Offer
                  key={section}
                  declaration={declaration}
                  authorityFresh={authorityFresh}
                  inspected={inspectedId === declaration.id}
                  selected={armedDeclarationId === declaration.id}
                  onChoose={choose}
                  onInspect={inspect}
                />
              );
            }
            return (
              <button
                key={section}
                type="button"
                className={styles.organizedCollection}
                aria-expanded={activeOpen === section}
                onClick={() => setOpen(activeOpen === section ? null : section)}
              >
                {sectionTitle[section]} <span>{count}</span>
              </button>
            );
          }
        )}
        {secondaryControls}
        {onOpenEquipment && (
          <button
            type="button"
            className={`${styles.organizedCollection} ${styles.organizedEquipmentShortcut}`}
            onClick={onOpenEquipment}
          >
            Equipment
          </button>
        )}
      </div>
      {armedDeclarationId && onCancelSelection && (
        <button
          type="button"
          className={styles.organizedCancel}
          onClick={onCancelSelection}
        >
          Cancel action
        </button>
      )}
      {activeOpen && (
        <div
          className={styles.organizedTray}
          role="region"
          aria-label={`${sectionTitle[activeOpen]} collection`}
        >
          <div>
            <strong>{sectionTitle[activeOpen]}</strong>
            <button type="button" onClick={() => setOpen(null)}>
              Close
            </button>
          </div>
          <div role="group" aria-label={`${sectionTitle[activeOpen]} offers`}>
            {openEntries.map((declaration) => (
              <Offer
                key={declaration.id}
                declaration={declaration}
                authorityFresh={authorityFresh}
                inspected={inspectedId === declaration.id}
                selected={armedDeclarationId === declaration.id}
                onChoose={choose}
                onInspect={inspect}
              />
            ))}
          </div>
        </div>
      )}
      {/* Outside the scrolling rows: their overflow otherwise clips the card. */}
      {inspectedDeclaration && (
        <div id={`organized-inspection-${inspectedDeclaration.id}`}>
          <Inspection
            label={declarationLabel(inspectedDeclaration)}
            tooltip={buildActionTooltip(inspectedDeclaration)}
            unavailable={
              !authorityFresh
                ? 'Actions may be out of date'
                : !inspectedDeclaration.available
                  ? inspectedDeclaration.why?.text || 'Unavailable'
                  : null
            }
          />
        </div>
      )}
    </div>
  );
}
