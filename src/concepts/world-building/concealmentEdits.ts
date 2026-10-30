import {
  isFloorCell,
  type RoomDraftDocument,
  type RoomHexCell,
} from './roomDraft';
import type { SiteConcealmentSpec, SiteScope } from './siteScope';

export function nextConcealmentId(scope: SiteScope): string {
  let n = 1;
  while (Object.hasOwn(scope.concealments ?? {}, `secret-${n}`)) n += 1;
  return `secret-${n}`;
}

/** The declaration alone owns membership. No hidden flag, derived region, or
 * rewrite of intel references accompanies an edit. Server validation grades
 * walkability, ownership and refs; incomplete drafts remain editable. */
export function setConcealment(
  scope: SiteScope,
  id: string,
  spec: SiteConcealmentSpec | undefined
): SiteScope {
  const concealments = { ...scope.concealments };
  if (spec === undefined) delete concealments[id];
  else concealments[id] = spec;
  const next: SiteScope = { ...scope, concealments };
  if (Object.keys(concealments).length === 0) delete next.concealments;
  return next;
}

export function addConcealment(scope: SiteScope): SiteScope {
  return setConcealment(scope, nextConcealmentId(scope), {
    checks: [{ ability: 'perception', dc: 15 }],
  });
}

export function renameConcealment(
  scope: SiteScope,
  from: string,
  to: string
): SiteScope {
  if (
    from === to ||
    !Object.hasOwn(scope.concealments ?? {}, from) ||
    Object.hasOwn(scope.concealments ?? {}, to)
  )
    return scope;
  return {
    ...scope,
    concealments: Object.fromEntries(
      Object.entries(scope.concealments ?? {}).map(([id, spec]) => [
        id === from ? to : id,
        spec,
      ])
    ),
  };
}

/** Adds/removes a placed member, never its group or supporting neighbours.
 * Repeated clicks are idempotent; ordinary scene selection is not changed. */
export function setConcealmentProp(
  scope: SiteScope,
  id: string,
  prop: string,
  present: boolean
): SiteScope {
  if (!Object.hasOwn(scope.concealments ?? {}, id)) return scope;
  const spec = scope.concealments![id]!;
  if ((spec.props?.includes(prop) ?? false) === present) return scope;
  const props = present
    ? [...(spec.props ?? []), prop]
    : (spec.props ?? []).filter((value) => value !== prop);
  const next: SiteConcealmentSpec = { ...spec, props };
  if (props.length === 0) delete next.props;
  return setConcealment(scope, id, next);
}

/** Paint membership, not walkable floor. A gesture is one history entry. */
export function paintConcealmentCells(
  scope: SiteScope,
  id: string,
  cells: readonly RoomHexCell[],
  mode: 'paint' | 'erase'
): SiteScope {
  if (!Object.hasOwn(scope.concealments ?? {}, id)) return scope;
  const spec = scope.concealments![id]!;
  const byCell = new Map(
    (spec.cells ?? []).map((cell) => [`${cell.q},${cell.r}`, cell])
  );
  for (const cell of cells) {
    const key = `${cell.q},${cell.r}`;
    if (mode === 'erase') byCell.delete(key);
    else byCell.set(key, { ...cell });
  }
  const next: SiteConcealmentSpec = { ...spec, cells: [...byCell.values()] };
  if (byCell.size === 0) delete next.cells;
  return setConcealment(scope, id, next);
}

/** The concealment whose `props` list this id, if any. A prop, door or wall
 * is in at most one concealment, so the first is the only one. */
export function concealmentHiding(
  scope: SiteScope,
  propId: string
): string | null {
  for (const [id, spec] of Object.entries(scope.concealments ?? {}))
    if (spec.props?.includes(propId)) return id;
  return null;
}

/** A door's Hidden by (rpg-project#578): the id leaves every concealment's
 * `props` and joins the chosen one, or none. Only the id moves; the door's
 * wall and the floor under it are never added. */
export function setPropHiddenBy(
  scope: SiteScope,
  propId: string,
  concealmentId: string | null
): SiteScope {
  if (
    concealmentId !== null &&
    !Object.hasOwn(scope.concealments ?? {}, concealmentId)
  )
    throw new Error(`There is no concealment ${concealmentId}.`);
  let next = scope;
  for (const id of Object.keys(scope.concealments ?? {}))
    next = setConcealmentProp(next, id, propId, false);
  return concealmentId === null
    ? next
    : setConcealmentProp(next, concealmentId, propId, true);
}

/** One thing a concealment can hide (rpg-project#578, S4-Q5): a walkable
 * cell, or in `props` a declared prop id, a wall door id or a structural
 * wall id. */
export type ConcealmentMember =
  | { kind: 'cell'; cell: RoomHexCell }
  | { kind: 'prop'; id: string };

export type ConcealmentMemberKind = 'prop' | 'door' | 'wall';

/** What a `props` id names in this document, or undefined for an id that
 * is no declared prop, wall door or wall. */
export function concealmentMemberKind(
  document: Readonly<RoomDraftDocument>,
  id: string
): ConcealmentMemberKind | undefined {
  const room = document.draft.room;
  for (const wall of room.walls ?? []) {
    if (wall.id === id) return 'wall';
    if (wall.openings.some((opening) => opening.door?.id === id)) return 'door';
  }
  return Object.hasOwn(room.propDeclarations, id) ? 'prop' : undefined;
}

/** A `props` member in words: "Altar", "the door in Gate wall",
 * "Gate wall". An id this document does not name reads as itself. */
export function concealmentMemberName(
  document: Readonly<RoomDraftDocument>,
  id: string
): string {
  const room = document.draft.room;
  for (const wall of room.walls ?? []) {
    const label = wall.label?.trim() ? wall.label : wall.id;
    if (wall.id === id) return label;
    if (wall.openings.some((opening) => opening.door?.id === id))
      return `the door in ${label}`;
  }
  const item = document.draft.scene.items.find((entry) => entry.id === id);
  return item?.label?.trim() ? item.label : id;
}

const cellKey = (cell: RoomHexCell) => `${cell.q},${cell.r}`;

/** Toggle one member of concealment `id` while its members are picked on
 * the map: a member joins, or leaves if it is already there. Throws one
 * sentence for what the toolkit's ConcealmentSpec would refuse: a cell that
 * is not walkable floor, an undeclared prop, or a member another
 * concealment already hides, named. */
export function toggleConcealmentMember(
  document: Readonly<RoomDraftDocument>,
  id: string,
  member: ConcealmentMember
): SiteScope {
  const scope = document.scope;
  const spec = scope.concealments?.[id];
  if (!spec) throw new Error(`There is no concealment ${id}.`);
  const others = Object.entries(scope.concealments ?? {}).filter(
    ([other]) => other !== id
  );
  if (member.kind === 'cell') {
    const key = cellKey(member.cell);
    const where = `Hex q ${member.cell.q}, r ${member.cell.r}`;
    if (!isFloorCell(document.draft, member.cell))
      throw new Error(
        `${where} is not walkable floor, so it cannot be hidden.`
      );
    const holder = others.find(([, other]) =>
      other.cells?.some((cell) => cellKey(cell) === key)
    );
    if (holder) throw new Error(`${where} is already hidden by ${holder[0]}.`);
    const present = spec.cells?.some((cell) => cellKey(cell) === key) ?? false;
    return paintConcealmentCells(
      scope,
      id,
      [member.cell],
      present ? 'erase' : 'paint'
    );
  }
  const name = concealmentMemberName(document, member.id);
  if (concealmentMemberKind(document, member.id) === undefined)
    throw new Error(
      `${name} has no declaration, so it cannot be hidden. Only declared props, doors and walls can.`
    );
  const holder = others.find(([, other]) => other.props?.includes(member.id));
  if (holder) throw new Error(`${name} is already hidden by ${holder[0]}.`);
  return setConcealmentProp(
    scope,
    id,
    member.id,
    !(spec.props?.includes(member.id) ?? false)
  );
}
