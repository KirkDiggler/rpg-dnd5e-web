import {
  Slot,
  type Declaration,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import {
  actionTooltipText,
  buildActionTooltip,
  slotLabel,
} from './actionTooltip';
import styles from './DesktopActionSurface.module.css';
import {
  DEFAULT_HOTBAR_LAYOUT,
  hotbarColumns,
  hotbarPage,
  hotbarRows,
  moveHotbarOffer,
  orderHotbarOffers,
  type DesktopHotbarLayout,
  type DesktopHotbarSection,
  type HotbarRows,
} from './desktopHotbarLayout';
import { EffectRows } from './EffectRows';
import {
  currentExecutableDeclaration,
  organizeDeclarations,
  type ActionIconPresentation,
} from './organizedActionPresentation';
import type { OrganizedActionSurfaceProps } from './OrganizedActionSurface';

type LocatedOffer = { section: DesktopHotbarSection; id: string };
interface OfferGroup {
  key: DesktopHotbarSection;
  label: string;
  entries: readonly Declaration[];
}

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

/** Each section owns its page, never the order or membership of another section. */
function ActionSection({
  group,
  rows,
  authorityFresh,
  icons,
  editing,
  picked,
  dragged,
  reveal,
  armedDeclarationId,
  onChoose,
  onInspect,
  onDrag,
  onMove,
}: {
  group: OfferGroup;
  rows: HotbarRows;
  authorityFresh: boolean;
  icons?: Readonly<Record<string, ActionIconPresentation>>;
  editing: boolean;
  picked: LocatedOffer | null;
  dragged: LocatedOffer | null;
  reveal: LocatedOffer | null;
  armedDeclarationId?: string;
  onChoose: (offer: LocatedOffer) => void;
  onInspect: (id: string | null) => void;
  onDrag: (offer: LocatedOffer | null) => void;
  onMove: (source: LocatedOffer, target: LocatedOffer) => void;
}) {
  const gridRef = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useState(1);
  const [page, setPage] = useState(0);
  const prefix = useId();
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setColumns(hotbarColumns(entry.contentRect.width));
    });
    observer.observe(grid);
    return () => observer.disconnect();
  }, []);
  const paging = hotbarPage(group.entries.length, columns, rows, page);
  useEffect(() => onInspect(null), [paging.page, paging.capacity, onInspect]);
  useEffect(
    () => setPage((current) => Math.min(current, paging.pages - 1)),
    [paging.pages]
  );
  const revealIndex =
    reveal?.section === group.key
      ? group.entries.findIndex((offer) => offer.id === reveal.id)
      : -1;
  useEffect(() => {
    if (revealIndex >= 0) setPage(Math.floor(revealIndex / paging.capacity));
  }, [reveal, revealIndex, paging.capacity]);
  const visible = group.entries.slice(
    paging.start,
    paging.start + paging.capacity
  );
  const changePage = (next: number): void => {
    onInspect(null);
    setPage(next);
  };
  return (
    <section
      className={styles.group}
      aria-label={group.label}
      data-section={group.key}
      style={{ flexGrow: Math.max(3, group.entries.length) }}
    >
      <div className={styles.sectionHeading}>
        <h3>{group.label}</h3>
        {paging.pages > 1 && (
          <nav className={styles.pager} aria-label={`${group.label} pages`}>
            <button
              type="button"
              aria-label={`Previous ${group.label} page`}
              disabled={paging.page === 0}
              onClick={() => changePage(paging.page - 1)}
            >
              ‹
            </button>
            <span
              aria-label={`${group.label} page ${paging.page + 1} of ${paging.pages}`}
            >
              {paging.page + 1}/{paging.pages}
            </span>
            <button
              type="button"
              aria-label={`Next ${group.label} page`}
              disabled={paging.page === paging.pages - 1}
              onClick={() => changePage(paging.page + 1)}
            >
              ›
            </button>
          </nav>
        )}
      </div>
      <div
        ref={gridRef}
        className={styles.offers}
        data-section-grid={group.key}
        style={{ '--hotbar-rows': rows } as CSSProperties}
      >
        {visible.map((declaration) => {
          const info = buildActionTooltip(declaration);
          const disabled = !authorityFresh || !declaration.available;
          const art = icons?.[declaration.id];
          const located = { section: group.key, id: declaration.id };
          return (
            <div key={declaration.id} className={styles.offerSlot}>
              <button
                type="button"
                className={styles.offer}
                data-tone={art?.tone ?? 'gold'}
                data-offer-id={declaration.id}
                aria-label={info.title}
                aria-describedby={`${prefix}-${declaration.id}`}
                aria-disabled={!editing && disabled}
                aria-pressed={
                  editing
                    ? picked?.section === group.key &&
                      picked.id === declaration.id
                    : armedDeclarationId === declaration.id
                }
                draggable={editing}
                onPointerEnter={(event) => {
                  if (
                    event.pointerType === 'mouse' ||
                    event.pointerType === 'pen'
                  )
                    onInspect(declaration.id);
                }}
                onFocus={() => onInspect(declaration.id)}
                onClick={() => onChoose(located)}
                onDragStart={(event) => {
                  if (!editing) {
                    event.preventDefault();
                    return;
                  }
                  event.dataTransfer.effectAllowed = 'move';
                  event.dataTransfer.setData('text/plain', declaration.id);
                  onInspect(null);
                  onDrag(located);
                }}
                onDragEnd={() => onDrag(null)}
                onDragOver={(event) => {
                  if (editing && dragged?.section === group.key) {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = 'move';
                  }
                }}
                onDrop={(event) => {
                  if (editing && dragged?.section === group.key) {
                    event.preventDefault();
                    onMove(dragged, located);
                  }
                  onDrag(null);
                }}
              >
                <ActionArt art={art} label={info.title} />
                <span className={styles.cost} aria-hidden="true">
                  {costMark(declaration.slot)}
                </span>
                {disabled && (
                  <span className={styles.unavailableMark} aria-hidden="true">
                    ×
                  </span>
                )}
              </button>
              <span
                className={styles.srOnly}
                id={`${prefix}-${declaration.id}`}
              >
                {editing
                  ? 'Edit mode. Select to rearrange; this cannot execute an action. '
                  : ''}
                {actionTooltipText(info)}
                {!authorityFresh ? '. Actions may be out of date' : ''}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
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
  embedded = false,
}: OrganizedActionSurfaceProps) {
  const surfaceRef = useRef<HTMLDivElement>(null);
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
  const [editing, setEditing] = useState(false);
  const [picked, setPicked] = useState<LocatedOffer | null>(null);
  const [dragged, setDragged] = useState<LocatedOffer | null>(null);
  const [reveal, setReveal] = useState<LocatedOffer | null>(null);
  const [inspectedId, setInspectedId] = useState<string | null>(null);
  const [pointerInCard, setPointerInCard] = useState(false);
  const organized = organizeDeclarations(declarations, presentation);
  const rawGroups: OfferGroup[] = [
    { key: 'quick', label: 'At hand', entries: organized.quick },
    { key: 'spells', label: 'Spells', entries: organized.sections.spells },
    {
      key: 'abilities',
      label: 'Abilities',
      entries: organized.sections.abilities,
    },
    { key: 'items', label: 'Items', entries: organized.sections.items },
    { key: 'actions', label: 'Actions', entries: organized.sections.actions },
  ];
  const groups = rawGroups
    .filter((group) => group.entries.length > 0)
    .map((group) => ({
      ...group,
      entries: orderHotbarOffers(
        group.entries,
        layout.orderBySection[group.key]
      ),
    }));
  const offers = groups.flatMap((group) => group.entries);
  const inspected = offers.find((offer) => offer.id === inspectedId);
  const pickedGroup = groups.find((group) => group.key === picked?.section);
  const pickedIndex =
    pickedGroup?.entries.findIndex((offer) => offer.id === picked?.id) ?? -1;
  const pickedOffer =
    pickedIndex >= 0 ? pickedGroup?.entries[pickedIndex] : undefined;
  useEffect(() => {
    if (inspectedId && !inspected) setInspectedId(null);
  }, [inspectedId, inspected]);
  useEffect(() => {
    if (picked && !pickedOffer) setPicked(null);
  }, [picked, pickedOffer]);
  const tooltip = inspected ? buildActionTooltip(inspected) : null;
  const refusal = !authorityFresh
    ? 'Actions may be out of date'
    : tooltip?.refusal;
  const choose = (offer: LocatedOffer): void => {
    if (editing) {
      setPicked(offer);
      return;
    }
    const current = authorityFresh
      ? currentExecutableDeclaration(declarations, offer.id)
      : undefined;
    if (!current) return;
    setInspectedId(null);
    onSelectDeclaration(current);
  };
  const move = (source: LocatedOffer, target: LocatedOffer): void => {
    if (!editing || source.section !== target.section) return;
    const ids =
      groups
        .find((group) => group.key === source.section)
        ?.entries.map((offer) => offer.id) ?? [];
    if (!ids.includes(source.id) || !ids.includes(target.id)) return;
    updateLayout({
      ...layout,
      orderBySection: {
        ...layout.orderBySection,
        [source.section]: moveHotbarOffer(ids, source.id, target.id),
      },
    });
    setPicked(source);
    setReveal({ ...source });
    setInspectedId(null);
  };
  const movePickedTo = (index: number): void => {
    const target = pickedGroup?.entries[index];
    if (picked && target)
      move(picked, { section: picked.section, id: target.id });
  };
  const setEditMode = (next: boolean): void => {
    if (next && armedDeclarationId) onCancelSelection?.();
    setEditing(next);
    setPicked(null);
    setDragged(null);
    setReveal(null);
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
      data-rows={layout.rows}
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
        if (event.key === 'Escape' && (editing || inspectedId)) {
          if (editing) setEditMode(false);
          else setInspectedId(null);
          event.stopPropagation();
        }
      }}
    >
      <div className={styles.groups}>
        {groups.map((group) => (
          <ActionSection
            key={group.key}
            group={group}
            rows={layout.rows}
            authorityFresh={authorityFresh}
            icons={presentation?.desktopIcons}
            editing={editing}
            picked={picked}
            dragged={dragged}
            reveal={reveal}
            armedDeclarationId={armedDeclarationId}
            onChoose={choose}
            onInspect={setInspectedId}
            onDrag={setDragged}
            onMove={move}
          />
        ))}
      </div>
      {editing && (
        <div
          className={styles.editControls}
          role="group"
          aria-label="Arrange actions"
        >
          <span>
            {pickedOffer
              ? `Arrange ${buildActionTooltip(pickedOffer).title}`
              : 'Drag within a section, or select an icon to move.'}
          </span>
          <button
            type="button"
            disabled={pickedIndex <= 0}
            onClick={() => movePickedTo(0)}
          >
            Move first
          </button>
          <button
            type="button"
            disabled={pickedIndex <= 0}
            onClick={() => movePickedTo(pickedIndex - 1)}
          >
            Move earlier
          </button>
          <button
            type="button"
            disabled={
              pickedIndex < 0 ||
              pickedIndex === (pickedGroup?.entries.length ?? 0) - 1
            }
            onClick={() => movePickedTo(pickedIndex + 1)}
          >
            Move later
          </button>
          <small>Editing only — action icons cannot execute.</small>
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
            value={layout.rows}
            onChange={(event) => {
              setInspectedId(null);
              updateLayout({
                ...layout,
                rows: hotbarRows(Number(event.target.value)),
              });
            }}
          >
            {[1, 2, 3, 4].map((rows) => (
              <option key={rows} value={rows}>
                {rows}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className={styles.editButton}
          aria-pressed={editing}
          onClick={() => setEditMode(!editing)}
        >
          {editing ? 'Done editing' : 'Edit bar'}
        </button>
        <button
          type="button"
          className={styles.cancel}
          style={{
            visibility:
              !editing && armedDeclarationId && onCancelSelection
                ? 'visible'
                : 'hidden',
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
            {refusal && (
              <p className={styles.refusal}>Unavailable — {refusal}</p>
            )}
            {editing ? (
              <p className={styles.ready}>
                Edit mode — select or drag to rearrange
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
