import {
  Verb,
  type Declaration,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { useMemo, useState } from 'react';
import {
  actionTooltipText,
  buildActionTooltip,
  slotLabel,
} from './actionTooltip';
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
  if (declaration.verb === Verb.CAST) return declaration.spell?.name || 'Spell';
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

function Offer({
  declaration,
  authorityFresh,
  onChoose,
}: {
  declaration: Declaration;
  authorityFresh: boolean;
  onChoose: (id: string) => void;
}) {
  const tooltip = buildActionTooltip(declaration);
  const unavailable = declaration.why?.text || 'Unavailable';
  const disabled = !authorityFresh || !declaration.available;
  return (
    <button
      type="button"
      className={styles.organizedOffer}
      disabled={disabled}
      title={actionTooltipText(tooltip)}
      aria-label={`${declarationLabel(declaration)}. ${actionTooltipText(tooltip)}`}
      onClick={() => onChoose(declaration.id)}
    >
      <span aria-hidden="true">{icon(declaration)}</span>
      <strong>{declarationLabel(declaration)}</strong>
      {declaration.verb === Verb.MOVE &&
        declaration.remaining !== undefined && (
          <small>{declaration.remaining} ft</small>
        )}
      <em>{slotLabel(declaration.slot)}</em>
      {disabled && (
        <span className={styles.semanticOnly}>
          Unavailable:{' '}
          {authorityFresh ? unavailable : 'Actions may be out of date'}
        </span>
      )}
    </button>
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
  onSelectDeclaration,
  onOpenEquipment,
}: {
  declarations: readonly Declaration[];
  authorityFresh: boolean;
  presentation?: OrganizedActionPresentation;
  onSelectDeclaration: (declaration: Declaration) => void;
  onOpenEquipment?: () => void;
}) {
  const [open, setOpen] = useState<OrganizedActionSection | null>(null);
  const organized = useMemo(
    () => organizeDeclarations(declarations, presentation),
    [declarations, presentation]
  );
  const choose = (id: string) => {
    const current = authorityFresh
      ? currentExecutableDeclaration(declarations, id)
      : undefined;
    if (!current) return;
    setOpen(null); // target/option flow owns the next surface; never cover it with a tray.
    onSelectDeclaration(current);
  };
  const openEntries = open ? organized.sections[open] : [];
  return (
    <div
      className={styles.organizedActions}
      data-testid="organized-action-surface"
    >
      <div className={styles.organizedQuick} aria-label="Quick actions">
        <span>Quick</span>
        {organized.quick.map((declaration) => (
          <Offer
            key={declaration.id}
            declaration={declaration}
            authorityFresh={authorityFresh}
            onChoose={choose}
          />
        ))}
        {organized.quick.length === 0 && (
          <small>No shortcut hints supplied.</small>
        )}
      </div>
      <div
        className={styles.organizedCollections}
        aria-label="Action collections"
      >
        {(Object.keys(sectionTitle) as OrganizedActionSection[]).map(
          (section) => {
            const count = organized.sections[section].length;
            const itemFallback =
              section === 'items' && count === 0 && onOpenEquipment;
            if (!count && !itemFallback) return null;
            return (
              <button
                key={section}
                type="button"
                className={styles.organizedCollection}
                aria-expanded={open === section}
                onClick={() =>
                  itemFallback
                    ? onOpenEquipment?.()
                    : setOpen(open === section ? null : section)
                }
              >
                {sectionTitle[section]}{' '}
                <span>{itemFallback ? 'Equipment' : count}</span>
              </button>
            );
          }
        )}
      </div>
      {open && (
        <div
          className={styles.organizedTray}
          role="region"
          aria-label={`${sectionTitle[open]} collection`}
        >
          <div>
            <strong>{sectionTitle[open]}</strong>
            <button type="button" onClick={() => setOpen(null)}>
              Close
            </button>
          </div>
          <div>
            {openEntries.map((declaration) => (
              <Offer
                key={declaration.id}
                declaration={declaration}
                authorityFresh={authorityFresh}
                onChoose={choose}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
