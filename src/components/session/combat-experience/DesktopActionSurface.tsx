import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { ActionArt } from './ActionArt';
import { ActionInformationContent } from './ActionInformationContent';
import {
  buildActionTooltip,
  informationDescription,
  slotLabel,
} from './actionTooltip';
import { castLabel } from './castLabel';
import { DesktopActionSection } from './DesktopActionSection';
import styles from './DesktopActionSurface.module.css';
import { desktopHotbarGroups } from './desktopHotbarGroups';
import {
  DEFAULT_HOTBAR_LAYOUT,
  hotbarRows,
  toggleFavorite,
  type DesktopHotbarLayout,
  type DesktopHotbarSection,
} from './desktopHotbarLayout';
import { isMultiMemberDeclaration } from './memberTargeting';
import { currentExecutableDeclaration } from './organizedActionPresentation';
import type { OrganizedActionSurfaceProps } from './OrganizedActionSurface';

/** Current offers, local display preferences, and unchanged command callbacks. */
export function DesktopActionSurface({
  declarations,
  authorityFresh,
  presentation,
  armedDeclarationId,
  onSelectDeclaration,
  onCancelSelection,
  secondaryControls,
  embedded = false,
  externalCancel = false,
  optionDeclaration,
  onSelectCastOption,
  onCancelCastOption,
}: OrganizedActionSurfaceProps) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const choiceRef = useRef<HTMLDivElement>(null);
  const readerRef = useRef<HTMLDivElement>(null);
  const groupsRef = useRef<HTMLDivElement>(null);
  const [surfaceHeight, setSurfaceHeight] = useState(0);
  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface || typeof ResizeObserver === 'undefined') return;
    const frame = surface.closest('[data-desktop-dock]') ?? surface;
    const observer = new ResizeObserver(() =>
      setSurfaceHeight(frame.getBoundingClientRect().height)
    );
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);
  const [localLayout, setLocalLayout] = useState<DesktopHotbarLayout>(
    DEFAULT_HOTBAR_LAYOUT
  );
  const layout = presentation?.desktopCustomization?.layout ?? localLayout;
  const updateLayout =
    presentation?.desktopCustomization?.onChange ?? setLocalLayout;
  const favoritesEnabled = presentation?.desktopFavorites === true;
  const favorites = favoritesEnabled ? (layout.favoriteIdsBySection ?? {}) : {};
  const rows = hotbarRows(layout.rows);
  const [editingRequested, setEditing] = useState(false);
  const editing = favoritesEnabled && editingRequested;
  useEffect(() => {
    if (!favoritesEnabled) setEditing(false);
  }, [favoritesEnabled]);
  const [feedback, setFeedback] = useState('');
  const [inspectedId, setInspectedId] = useState<string | null>(null);
  const [pointerInCard, setPointerInCard] = useState(false);
  // Keep the named reader during pointer travel across the map, not on a timer.
  // Other dock controls and deliberate outside clicks end that reading session.
  useEffect(() => {
    if (!inspectedId) return;
    const otherControl = (event: Event): void => {
      const target = event.target;
      const surface = surfaceRef.current;
      if (!(target instanceof Element) || !surface) return;
      if (readerRef.current?.contains(target)) return;
      if (surface.contains(target) && target.closest('[data-offer-id]')) return;
      const dock = surface.closest('[data-desktop-dock]') ?? surface;
      if (
        dock.contains(target) &&
        target.closest('button, select, input, a, [role="button"]')
      )
        setInspectedId(null);
    };
    const pointerOver = (event: PointerEvent): void => {
      if (event.pointerType === 'mouse' || event.pointerType === 'pen')
        otherControl(event);
    };
    const outsidePress = (event: PointerEvent): void => {
      if (
        event.target instanceof Node &&
        !surfaceRef.current?.contains(event.target)
      )
        setInspectedId(null);
    };
    window.addEventListener('pointerover', pointerOver);
    window.addEventListener('focusin', otherControl);
    window.addEventListener('pointerdown', outsidePress, true);
    return () => {
      window.removeEventListener('pointerover', pointerOver);
      window.removeEventListener('focusin', otherControl);
      window.removeEventListener('pointerdown', outsidePress, true);
    };
  }, [inspectedId]);
  const closeInspection = (): void => {
    setInspectedId(null);
    setPointerInCard(false);
    groupsRef.current?.focus();
  };
  const groups = desktopHotbarGroups(declarations, presentation);
  const offers = groups.flatMap((group) => group.offers);
  const inspected = offers.find((offer) => offer.id === inspectedId);
  const optionMatches = optionDeclaration
    ? offers.filter(
        (offer) =>
          offer.id === optionDeclaration.id &&
          offer.available &&
          offer.options.length > 0
      )
    : [];
  const choosing =
    optionMatches.length === 1 && onSelectCastOption
      ? optionMatches[0]
      : undefined;
  useEffect(() => {
    if (inspectedId && !inspected) setInspectedId(null);
  }, [inspectedId, inspected]);
  const choosingId = choosing?.id;
  useEffect(() => {
    if (choosingId) {
      setInspectedId(null);
      choiceRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    }
  }, [choosingId]);
  const tooltip = inspected ? buildActionTooltip(inspected) : null;
  const refusal = !authorityFresh
    ? 'Actions may be out of date'
    : tooltip?.refusal;
  const choose = (section: DesktopHotbarSection, id: string): void => {
    if (editing) {
      const group = groups.find((item) => item.key === section);
      if (!group) return;
      const next = toggleFavorite(group.offers, favorites[section] ?? [], id);
      if (next.refused) {
        setFeedback(
          next.refused === 'limit'
            ? `Four favorites maximum in ${group.label}. Unstar one first.`
            : 'That offer is no longer present.'
        );
        return;
      }
      updateLayout({
        rows,
        favoriteIdsBySection: { ...favorites, [section]: next.favorites },
      });
      setFeedback('');
      return;
    }
    const current = authorityFresh
      ? currentExecutableDeclaration(declarations, id)
      : undefined;
    // Re-clicking an armed multi-target action neither confirms nor erases picks.
    if (
      current?.id === armedDeclarationId &&
      isMultiMemberDeclaration(current)
    ) {
      setInspectedId(null);
      return;
    }
    if (current) {
      setInspectedId(null);
      onSelectDeclaration(current);
    }
  };
  const cancelChoice = (): void => {
    onCancelCastOption?.();
    const button = Array.from(
      surfaceRef.current?.querySelectorAll<HTMLButtonElement>(
        'button[data-offer-id]'
      ) ?? []
    ).find((node) => node.dataset.offerId === choosing?.id);
    button?.focus();
  };
  const selectOption = (id: string): void => {
    const current =
      authorityFresh && choosing
        ? currentExecutableDeclaration(declarations, choosing.id)
        : undefined;
    const matches = current?.options.filter((option) => option.id === id) ?? [];
    if (id && matches.length === 1 && matches[0]?.label.trim())
      onSelectCastOption?.(id);
  };
  const setEditMode = (next: boolean): void => {
    if (next) {
      if (choosing) onCancelCastOption?.();
      else if (armedDeclarationId) onCancelSelection?.();
    }
    setEditing(next);
    setFeedback('');
    setInspectedId(null);
  };
  return (
    <div
      ref={surfaceRef}
      className={styles.surface}
      style={
        surfaceHeight
          ? ({
              '--hotbar-surface-height': `${surfaceHeight}px`,
            } as CSSProperties)
          : undefined
      }
      data-testid="desktop-action-surface"
      data-embedded={embedded}
      data-editing={editing}
      data-rows={rows}
      onPointerLeave={() => setPointerInCard(false)}
      onBlur={(event) => {
        if (
          !event.currentTarget.contains(event.relatedTarget) &&
          !pointerInCard
        )
          setInspectedId(null);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && (editing || choosing || inspectedId)) {
          if (editing) setEditMode(false);
          else if (choosing) cancelChoice();
          else closeInspection();
          event.stopPropagation();
        }
      }}
    >
      <div
        ref={groupsRef}
        className={styles.groups}
        aria-label="Action sections"
        tabIndex={0}
      >
        {groups.map((group) => (
          <DesktopActionSection
            key={group.key}
            group={group}
            rows={rows}
            favorites={favorites[group.key] ?? []}
            authorityFresh={authorityFresh}
            icons={presentation?.desktopIcons}
            editing={editing}
            armedId={armedDeclarationId}
            optionId={choosing?.id}
            onChoose={(id) => choose(group.key, id)}
            onInspect={setInspectedId}
          />
        ))}
      </div>
      {editing && (
        <div className={styles.editControls} aria-label="Edit favorites">
          <span>
            Click to star or unstar · Up to 4 per section · No actions execute
          </span>
          <small>
            Favorites repeat on every page. Scroll sections or choose fewer if
            space is tight.
          </small>
          <p aria-live="polite">{feedback}</p>
        </div>
      )}
      <div className={styles.footer}>
        {secondaryControls && (
          <div className={styles.utilities}>{secondaryControls}</div>
        )}
        <label className={styles.rows}>
          Rows
          <select
            aria-label="Hotbar rows"
            value={rows}
            onChange={(event) => {
              setInspectedId(null);
              updateLayout({
                rows: hotbarRows(Number(event.target.value)),
                favoriteIdsBySection: favorites,
              });
            }}
          >
            {[1, 2, 3, 4].map((count) => (
              <option key={count} value={count}>
                {count}
              </option>
            ))}
          </select>
        </label>
        {favoritesEnabled && (
          <button
            type="button"
            className={styles.editButton}
            aria-pressed={editing}
            onClick={() => setEditMode(!editing)}
          >
            {editing ? 'Done editing' : 'Edit bar'}
          </button>
        )}
        <button
          type="button"
          className={styles.cancel}
          style={{
            visibility:
              !editing &&
              !externalCancel &&
              armedDeclarationId &&
              onCancelSelection
                ? 'visible'
                : 'hidden',
          }}
          onClick={onCancelSelection}
        >
          Cancel action
        </button>
      </div>
      {choosing && !editing && (
        <div
          className={styles.choiceTray}
          ref={choiceRef}
          role="dialog"
          aria-label={`${castLabel(choosing)} choices`}
          aria-modal="false"
          data-testid="cast-options"
        >
          <header>
            <strong>{castLabel(choosing)}</strong>
            <span>Choose how to cast</span>
          </header>
          <div className={styles.choiceOptions}>
            {choosing.options.map((option, index) => (
              <div
                className={styles.choiceOption}
                key={`${option.id}:${index}`}
              >
                <button
                  type="button"
                  data-testid={`cast-option-${option.id}`}
                  aria-label={
                    option.label.trim()
                      ? option.label
                      : 'Choice label unavailable'
                  }
                  aria-description={informationDescription(option.description)}
                  disabled={
                    !authorityFresh ||
                    !option.id ||
                    !option.label.trim() ||
                    choosing.options.filter(
                      (candidate) => candidate.id === option.id
                    ).length !== 1
                  }
                  onClick={() => selectOption(option.id)}
                >
                  <span>
                    {option.label.trim()
                      ? option.label
                      : 'Choice label unavailable'}
                  </span>
                </button>
                <small>{informationDescription(option.description)}</small>
              </div>
            ))}
            <button
              type="button"
              data-testid="cast-option-cancel"
              onClick={cancelChoice}
            >
              Cancel
            </button>
          </div>
          {!authorityFresh && <p>Actions may be out of date</p>}
        </div>
      )}
      {!choosing && inspected && tooltip && (
        <div className={styles.inspectionBridge}>
          <div
            ref={readerRef}
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
              <button
                type="button"
                className={styles.closeInspection}
                aria-label="Close action information"
                onClick={closeInspection}
              >
                Close
              </button>
            </header>
            <ActionInformationContent
              description={tooltip.description}
              lines={tooltip.lines}
              effects={tooltip.effects}
              effectsLabel="Effects"
            />
            {refusal && (
              <p className={styles.refusal}>Unavailable — {refusal}</p>
            )}
            {editing ? (
              <p className={styles.ready}>
                Edit favorites — click to star or unstar
              </p>
            ) : (
              !refusal && <p className={styles.ready}>Click to select</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
