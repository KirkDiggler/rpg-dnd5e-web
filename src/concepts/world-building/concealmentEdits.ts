import type { RoomHexCell } from './roomDraft';
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
