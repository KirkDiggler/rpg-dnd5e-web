import {
  Verb,
  type Declaration,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  actionTooltipText,
  buildActionTooltip,
  slotLabel,
  type ActionTooltip,
} from './actionTooltip';
import { castLabel } from './castLabel';
import styles from './CombatExperience.module.css';
import { bindOfferPress, type OfferPressBinding } from './offerPress';
import {
  currentExecutableDeclaration,
  organizeDeclarations,
  type OrganizedActionPresentation,
  type OrganizedActionSection,
} from './organizedActionPresentation';
import type { QuickOverflowGroup } from './quickOverflow';
import { useQuickOverflow } from './useQuickOverflow';

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
function OfferFace({ declaration }: { declaration: Declaration }) {
  return (
    <>
      <span aria-hidden="true">{icon(declaration)}</span>
      <strong>{declarationLabel(declaration)}</strong>
      {declaration.verb === Verb.MOVE &&
        declaration.remaining !== undefined && (
          <small>{declaration.remaining} ft</small>
        )}
      <em>{slotLabel(declaration.slot)}</em>
    </>
  );
}
function Inspection({
  label,
  tooltip,
  unavailable,
  temporary,
  onClose,
}: {
  label: string;
  tooltip: ActionTooltip;
  unavailable: string | null;
  temporary: boolean;
  onClose: () => void;
}) {
  return (
    <div
      className={`${styles.organizedInspection} ${temporary ? styles.organizedHoverInspection : ''}`}
      role={temporary ? 'tooltip' : 'region'}
      aria-label={`${label} details`}
    >
      <div className={styles.organizedInspectionHeading}>
        <strong>{tooltip.title}</strong>
        {!temporary && (
          <button
            type="button"
            className={styles.organizedCollection}
            onClick={onClose}
            aria-label="Close details"
          >
            Close
          </button>
        )}
      </div>
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
  selected,
  onChoose,
  onHover,
  onKeyboardFocus,
}: {
  declaration: Declaration;
  authorityFresh: boolean;
  selected: boolean;
  onChoose: (id: string) => void;
  onHover: (id: string | null) => void;
  onKeyboardFocus: (id: string | null) => void;
}) {
  const disabled = !authorityFresh || !declaration.available;
  const description = `${declarationLabel(declaration)}. ${actionTooltipText(buildActionTooltip(declaration))}`;
  return (
    <div
      className={styles.organizedOfferSlot}
      data-offer-id={declaration.id}
      // The input event is the evidence. A PC can report a coarse primary pointer.
      onPointerEnter={(event) => {
        if (event.pointerType === 'mouse' || event.pointerType === 'pen')
          onHover(declaration.id);
      }}
      onPointerLeave={() => onHover(null)}
      onFocus={() => onKeyboardFocus(declaration.id)}
      onBlur={() => onKeyboardFocus(null)}
      tabIndex={disabled ? 0 : undefined}
      role={disabled ? 'group' : undefined}
      aria-label={disabled ? description : undefined}
      aria-disabled={disabled || undefined}
    >
      <button
        type="button"
        className={styles.organizedOffer}
        disabled={disabled}
        aria-pressed={selected}
        aria-label={description}
        onClick={() => onChoose(declaration.id)}
      >
        <OfferFace declaration={declaration} />
      </button>
    </div>
  );
}
const sectionTitle: Record<
  OrganizedActionSection | QuickOverflowGroup,
  string
> = {
  spells: 'Spells',
  abilities: 'Abilities',
  items: 'Items',
  actions: 'All actions',
  cantrips: 'Cantrips',
  features: 'Features',
};
type Menu = keyof typeof sectionTitle;

/** Current offers only. Input and measured overflow change presentation, not authority. */
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
  const rootRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const pressRef = useRef<OfferPressBinding | null>(null);
  const [open, setOpen] = useState<Menu | null>(null);
  const [inspectedId, setInspectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const previewId = hoveredId ?? focusedId;
  const clearPreview = useCallback(() => {
    setHoveredId(null);
    setFocusedId(null);
  }, []);
  const inspect = useCallback(
    (id: string) => {
      setOpen(null);
      clearPreview();
      setInspectedId((current) => (current === id ? null : id));
    },
    [clearPreview]
  );
  useEffect(() => {
    if (!rootRef.current) return;
    const binding = bindOfferPress(rootRef.current, inspect);
    pressRef.current = binding;
    return () => {
      binding.dispose();
      pressRef.current = null;
    };
  }, [inspect]);
  const organized = useMemo(
    () => organizeDeclarations(declarations, presentation),
    [declarations, presentation]
  );
  const groups = presentation?.quickGroupByDeclarationId;
  const hasCancel = Boolean(armedDeclarationId && onCancelSelection);
  const collapsed = useQuickOverflow(
    rootRef,
    measureRef,
    organized.quick,
    groups,
    hasCancel
  );
  useEffect(() => clearPreview(), [collapsed, clearPreview]);
  const quickGroups: Record<QuickOverflowGroup, readonly Declaration[]> = {
    cantrips: organized.quick.filter(
      (item) => groups?.[item.id] === 'cantrips'
    ),
    features: organized.quick.filter(
      (item) => groups?.[item.id] === 'features'
    ),
  };
  const sections = { ...organized.sections, ...quickGroups };
  const activeOpen =
    open &&
    (open === 'cantrips' || open === 'features'
      ? collapsed.includes(open) && sections[open].length > 0
      : sections[open].length > 1)
      ? open
      : null;
  useEffect(() => {
    if (open && !activeOpen) setOpen(null);
  }, [open, activeOpen]);
  const inspectedDeclaration = declarations.find(
    (item) => item.id === (previewId ?? inspectedId)
  );
  const closeInspection = () => {
    clearPreview();
    setInspectedId(null);
  };
  const choose = (id: string) => {
    const current = authorityFresh
      ? currentExecutableDeclaration(declarations, id)
      : undefined;
    if (!current) return;
    setOpen(null);
    closeInspection();
    onSelectDeclaration(current);
  };
  const toggleMenu = (section: Menu) => {
    closeInspection();
    setOpen(activeOpen === section ? null : section);
  };
  const keyboardFocus = (id: string | null) => {
    if (!id || !pressRef.current?.isTouchInput()) setFocusedId(id);
  };
  const offer = (declaration: Declaration) => (
    <Offer
      key={declaration.id}
      declaration={declaration}
      authorityFresh={authorityFresh}
      selected={armedDeclarationId === declaration.id}
      onChoose={choose}
      onHover={setHoveredId}
      onKeyboardFocus={keyboardFocus}
    />
  );
  const menu = (section: Menu) => (
    <button
      key={section}
      type="button"
      className={styles.organizedCollection}
      aria-expanded={activeOpen === section}
      onClick={() => toggleMenu(section)}
    >
      {sectionTitle[section]} <span>{sections[section].length}</span>
    </button>
  );
  return (
    <div
      ref={rootRef}
      className={styles.organizedActions}
      data-testid="organized-action-surface"
      onKeyDown={(event) => {
        if (event.key === 'Escape') closeInspection();
      }}
    >
      {/* Inert, clipped measurement of the EXPANDED bar: no duplicate inputs or
        document overflow, and no measuring a collapsed row against itself. */}
      <div className={styles.organizedMeasure} aria-hidden="true" inert>
        <div
          ref={measureRef}
          className={styles.organizedQuick}
          style={{ width: 'max-content' }}
        >
          <span data-quick-measure>Quick</span>
          {organized.quick.map((declaration) => (
            <button
              key={declaration.id}
              tabIndex={-1}
              disabled
              type="button"
              data-quick-measure
              data-quick-group={groups?.[declaration.id]}
              className={styles.organizedOffer}
            >
              <OfferFace declaration={declaration} />
            </button>
          ))}
          {(['cantrips', 'features'] as const).map(
            (group) =>
              quickGroups[group].length > 0 && (
                <button
                  key={group}
                  type="button"
                  tabIndex={-1}
                  disabled
                  data-quick-menu={group}
                  className={styles.organizedCollection}
                >
                  {sectionTitle[group]} <span>{quickGroups[group].length}</span>
                </button>
              )
          )}
          {hasCancel && (
            <button
              type="button"
              tabIndex={-1}
              disabled
              data-quick-measure
              className={styles.organizedCancel}
            >
              Cancel action
            </button>
          )}
        </div>
      </div>
      <div
        className={styles.organizedQuick}
        role="group"
        aria-label="Quick actions"
      >
        <span>Quick</span>
        {organized.quick
          .filter(
            (item) =>
              !collapsed.includes(groups?.[item.id] as QuickOverflowGroup)
          )
          .map(offer)}
        {collapsed.map(menu)}
        {hasCancel && (
          <button
            type="button"
            className={styles.organizedCancel}
            onClick={onCancelSelection}
          >
            Cancel action
          </button>
        )}
      </div>
      <div
        className={styles.organizedCollections}
        role="group"
        aria-label="Action collections"
      >
        {(Object.keys(organized.sections) as OrganizedActionSection[]).map(
          (section) => {
            const entries = organized.sections[section];
            return entries.length === 1
              ? offer(entries[0]!)
              : entries.length > 1
                ? menu(section)
                : null;
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
      {activeOpen && (
        <div
          className={styles.organizedTray}
          role="region"
          aria-label={`${sectionTitle[activeOpen]} collection`}
        >
          <div>
            <strong>{sectionTitle[activeOpen]}</strong>
            <button
              type="button"
              onClick={() => {
                setOpen(null);
                clearPreview();
              }}
            >
              Close
            </button>
          </div>
          <div role="group" aria-label={`${sectionTitle[activeOpen]} offers`}>
            {sections[activeOpen].map(offer)}
          </div>
        </div>
      )}
      {/* Keep the positioned card a direct child. A normal-flow wrapper adds
          a grid gap and moves the menu on hover (#1076: measured 6 px). */}
      {inspectedDeclaration && (
        <Inspection
          label={declarationLabel(inspectedDeclaration)}
          tooltip={buildActionTooltip(inspectedDeclaration)}
          temporary={previewId !== null}
          onClose={closeInspection}
          unavailable={
            !authorityFresh
              ? 'Actions may be out of date'
              : !inspectedDeclaration.available
                ? inspectedDeclaration.why?.text || 'Unavailable'
                : null
          }
        />
      )}
    </div>
  );
}
