import {
  cubeToWorld,
  HEX_SIZE,
  hexCorners,
} from '@/components/hex-grid/hexMath';
import {
  canonicalizeEnclosureWitness,
  enclosureWitnessesEqual,
  type BoundaryRun,
  type EnclosureWitness,
  type RegionResolution,
} from './authoringRegions';
import {
  add,
  exactPoint,
  intervalSign,
  mul,
  orientation,
  pointInRing,
  samePoint,
  segmentContact,
  sub,
  type CertifiedPoint,
  type Interval,
} from './regionBoundaryPredicates';
import type { RoomDraft, RoomHexCell } from './roomDraft';
import type { StructuralWall } from './structuralWalls';
import type { WorldPoint } from './types';
function cellCorners(cell: RoomHexCell): WorldPoint[] {
  return hexCorners(
    cubeToWorld({ x: cell.q, y: -cell.q - cell.r, z: cell.r }, HEX_SIZE),
    HEX_SIZE
  );
}

type Reason = Extract<RegionResolution, { status: 'unresolved' }>['reason'];
export type EnclosureResult =
  | { status: 'resolved'; ring: WorldPoint[]; witness: EnclosureWitness }
  | { status: 'unresolved'; reason: Reason };
type Node = { p: CertifiedPoint; edges: Edge[] };
type Source = { wall: StructuralWall; forward: boolean };
type Edge = {
  from: Node;
  to: Node;
  wall: StructuralWall;
  forward: boolean;
  sources: Source[];
  twin: Edge;
  used: boolean;
};
type Face = { nodes: Node[]; witness: EnclosureWitness };
type Graph = {
  faces: Face[];
  unsupportedFaces: Node[][];
  failures: { walls: StructuralWall[]; reason: Reason }[];
  walls: StructuralWall[];
};

function vector(edge: Edge): CertifiedPoint {
  const a = exactPoint(
    edge.forward ? edge.wall.line.start : edge.wall.line.end
  );
  const b = exactPoint(
    edge.forward ? edge.wall.line.end : edge.wall.line.start
  );
  const x = sub(b.x, a.x),
    z = sub(b.z, a.z);
  return {
    point: { x: b.point.x - a.point.x, z: b.point.z - a.point.z },
    x,
    z,
  };
}
function quadrant(p: WorldPoint): number {
  return p.z >= 0 ? (p.x >= 0 ? 0 : 1) : p.x < 0 ? 2 : 3;
}
function wallAxis(wall: StructuralWall): 'x' | 'z' | null {
  return wall.line.start.z === wall.line.end.z
    ? 'x'
    : wall.line.start.x === wall.line.end.x
      ? 'z'
      : null;
}
function axisCoverage(
  a: StructuralWall,
  b: StructuralWall
): WorldPoint[] | null {
  const axis = wallAxis(a);
  if (!axis || wallAxis(b) !== axis) return null;
  const fixed = axis === 'x' ? 'z' : 'x';
  if (a.line.start[fixed] !== b.line.start[fixed]) return null;
  const low = Math.max(
    Math.min(a.line.start[axis], a.line.end[axis]),
    Math.min(b.line.start[axis], b.line.end[axis])
  );
  const high = Math.min(
    Math.max(a.line.start[axis], a.line.end[axis]),
    Math.max(b.line.start[axis], b.line.end[axis])
  );
  if (low >= high) return null; // Strict coverage, never a gap-closing tolerance.
  return [a.line.start, a.line.end, b.line.start, b.line.end].filter(
    (p) => p[axis] >= low && p[axis] <= high
  );
}
function splitOrder(
  wall: StructuralWall,
  point: CertifiedPoint,
  parameter: Interval
): Interval {
  const axis = wallAxis(wall);
  if (!axis) return parameter;
  // Exact axis coordinates certify even adjacent binary64 values; normalized
  // parameter arithmetic would obscure that order with overlapping intervals.
  const value = point[axis];
  return wall.line.end[axis] > wall.line.start[axis]
    ? value
    : [-value[1], -value[0]];
}
function sameAxisRun(a: Edge, b: Edge): boolean {
  const axis = wallAxis(a.wall);
  if (!axis || wallAxis(b.wall) !== axis) return false;
  const fixed = axis === 'x' ? 'z' : 'x';
  const aPositive =
    a.wall.line.end[axis] > a.wall.line.start[axis] === a.forward;
  const bPositive =
    b.wall.line.end[axis] > b.wall.line.start[axis] === b.forward;
  return (
    a.wall.line.start[fixed] === b.wall.line.start[fixed] &&
    aPositive === bPositive
  );
}
/** Provenance is selected only after the raw simple face is certified. An
 * overlapping straight run needs ONE source covering its full span; partial
 * exterior coverage is not another owner. No preference by ID/order/length. */
function faceSources(walk: Edge[]): BoundaryRun[] | null {
  const chosen = walk.map((e) => e.sources[0]);
  for (let i = 0; i < walk.length; i++) {
    if (sameAxisRun(walk[(i + walk.length - 1) % walk.length], walk[i]))
      continue;
    const indices = [i];
    while (
      indices.length < walk.length &&
      sameAxisRun(
        walk[indices[indices.length - 1]],
        walk[(i + indices.length) % walk.length]
      )
    )
      indices.push((i + indices.length) % walk.length);
    if (!indices.some((j) => walk[j].sources.length > 1)) continue;
    const candidates = walk[i].sources.filter((s) =>
      indices.every((j) =>
        walk[j].sources.some((other) => other.wall === s.wall)
      )
    );
    if (candidates.length !== 1) return null;
    for (const j of indices)
      chosen[j] = walk[j].sources.find((s) => s.wall === candidates[0].wall)!;
  }
  return chosen.map((s) => ({
    wallId: s.wall.id,
    direction: s.forward ? 'start-to-end' : 'end-to-start',
  }));
}

/** Transient graph only. Identity is exact authored endpoints or a unique
 * source-pair intersection; overlapping intersection intervals never coalesce.
 * Failure is isolated to connected source components; disconnected sound
 * components remain usable. Definitions are never removed or rebound here. */
function buildGraph(walls: StructuralWall[]): Graph {
  const nodes: Node[] = [];
  const wallIndices = new Map(walls.map((wall, i) => [wall, i]));
  const endpoints = new Map<number, Map<number, Node>>();
  const endpoint = (p: WorldPoint): Node => {
    let column = endpoints.get(p.x);
    if (!column) {
      column = new Map();
      endpoints.set(p.x, column);
    }
    let node = column.get(p.z);
    if (!node) {
      node = { p: exactPoint(p), edges: [] };
      nodes.push(node);
      column.set(p.z, node);
    }
    return node;
  };
  const splits = walls.map((w) => [
    {
      order: splitOrder(w, exactPoint(w.line.start), [0, 0]),
      node: endpoint(w.line.start),
    },
    {
      order: splitOrder(w, exactPoint(w.line.end), [1, 1]),
      node: endpoint(w.line.end),
    },
  ]);
  const parents = walls.map((_, i) => i);
  const root = (i: number): number => {
    let r = i;
    while (parents[r] !== r) r = parents[r];
    while (parents[i] !== i) {
      const next = parents[i];
      parents[i] = r;
      i = next;
    }
    return r;
  };
  const join = (a: number, b: number): void => {
    parents[root(a)] = root(b);
  };
  const bad = new Map<number, Reason>();
  for (let i = 0; i < walls.length; i++)
    for (let j = i + 1; j < walls.length; j++) {
      const a = walls[i].line,
        b = walls[j].line;
      const coverage = axisCoverage(walls[i], walls[j]);
      if (coverage) {
        join(i, j);
        for (const p of coverage)
          for (const index of [i, j]) {
            const node = endpoint(p);
            if (!splits[index].some((s) => s.node === node))
              splits[index].push({
                order: splitOrder(walls[index], node.p, [0, 0]),
                node,
              });
          }
        continue;
      }
      const contact = segmentContact(a.start, a.end, b.start, b.end);
      if (contact.kind === 'none') continue;
      join(i, j);
      if (contact.kind !== 'point') {
        bad.set(
          i,
          contact.kind === 'unsupported'
            ? 'unsupported-geometry'
            : 'uncertain-geometry'
        );
        continue;
      }
      let node: Node;
      if (
        contact.point.x[0] === contact.point.x[1] &&
        contact.point.z[0] === contact.point.z[1]
      )
        node = endpoint(contact.point.point);
      else {
        node = { p: contact.point, edges: [] };
        nodes.push(node);
      }
      for (const [index, t] of [
        [i, contact.a],
        [j, contact.b],
      ] as const) {
        if (!splits[index].some((s) => s.node === node))
          splits[index].push({
            order: splitOrder(walls[index], node.p, t),
            node,
          });
      }
    }
  for (let i = 0; i < walls.length; i++) {
    const ordered = splits[i].sort((a, b) => a.order[0] - b.order[0]);
    for (let j = 1; j < ordered.length; j++) {
      if (ordered[j - 1].order[1] >= ordered[j].order[0]) {
        bad.set(i, 'uncertain-geometry');
        continue;
      }
      const from = ordered[j - 1].node,
        to = ordered[j].node;
      const covered = wallAxis(walls[i])
        ? from.edges.find(
            (e) => e.to === to && wallAxis(e.wall) === wallAxis(walls[i])
          )
        : undefined;
      if (covered) {
        covered.sources.push({ wall: walls[i], forward: true });
        covered.twin.sources.push({ wall: walls[i], forward: false });
        continue;
      }
      const edge = {
        from,
        to,
        wall: walls[i],
        forward: true,
        sources: [{ wall: walls[i], forward: true }],
        used: false,
      } as Edge;
      const twin = {
        from: to,
        to: from,
        wall: walls[i],
        forward: false,
        sources: [{ wall: walls[i], forward: false }],
        used: false,
        twin: edge,
      };
      edge.twin = twin;
      from.edges.push(edge);
      to.edges.push(twin);
    }
  }
  for (const node of nodes) {
    node.edges.sort((a, b) => {
      const va = vector(a),
        vb = vector(b),
        qa = quadrant(va.point),
        qb = quadrant(vb.point);
      if (qa !== qb) return qa - qb;
      const sign = orientation(exactPoint({ x: 0, z: 0 }), va, vb);
      if (sign === 'uncertain' || sign === 0) {
        const i = wallIndices.get(a.wall)!;
        if (!bad.has(i)) bad.set(i, 'uncertain-geometry');
        return 0;
      }
      return -sign;
    });
  }
  const badRoots = new Map<number, Reason>();
  for (const [index, reason] of bad) {
    const r = root(index);
    if (badRoots.get(r) !== 'unsupported-geometry') badRoots.set(r, reason);
  }
  const faces: Face[] = [];
  const unsupportedFaces: Node[][] = [];
  for (const node of nodes)
    for (const first of node.edges) {
      if (first.used || badRoots.has(root(wallIndices.get(first.wall)!)))
        continue;
      const walk: Edge[] = [];
      let edge = first;
      while (!edge.used) {
        edge.used = true;
        walk.push(edge);
        const outgoing = edge.to.edges,
          index = outgoing.indexOf(edge.twin);
        edge = outgoing[(index + outgoing.length - 1) % outgoing.length];
      }
      if (edge !== first || walk.length < 3) continue;
      let area: Interval = [0, 0];
      for (const e of walk)
        area = add(
          area,
          sub(mul(e.from.p.x, e.to.p.z), mul(e.from.p.z, e.to.p.x))
        );
      const sign = intervalSign(area);
      if (sign === -1) continue; // unbounded exterior walk
      if (sign === 'uncertain') {
        badRoots.set(root(wallIndices.get(first.wall)!), 'uncertain-geometry');
        continue;
      }
      // BEFORE compression: repeated vertices/bridges are a slit, not a simple ring.
      if (new Set(walk.map((e) => e.from)).size !== walk.length) {
        badRoots.set(
          root(wallIndices.get(first.wall)!),
          'unsupported-geometry'
        );
        continue;
      }
      const sources = faceSources(walk);
      if (!sources) {
        unsupportedFaces.push(walk.map((e) => e.from));
        continue;
      }
      // Remove only same-owner/direction subdivisions, AFTER raw validation.
      // Collinear transitions between distinct sources remain visible.
      const faceNodes = walk
        .filter((_, i) => {
          const previous = sources[(i + sources.length - 1) % sources.length];
          return (
            previous.wallId !== sources[i].wallId ||
            previous.direction !== sources[i].direction
          );
        })
        .map((e) => e.from);
      let start = 0;
      for (let i = 1; i < faceNodes.length; i++)
        if (
          faceNodes[i].p.point.x < faceNodes[start].p.point.x ||
          (faceNodes[i].p.point.x === faceNodes[start].p.point.x &&
            faceNodes[i].p.point.z < faceNodes[start].p.point.z)
        )
          start = i;
      faces.push({
        nodes: [...faceNodes.slice(start), ...faceNodes.slice(0, start)],
        witness: canonicalizeEnclosureWitness({
          walk: sources,
        }),
      });
    }
  return {
    walls,
    unsupportedFaces,
    faces: faces.filter(
      (f) =>
        !badRoots.has(
          root(walls.findIndex((w) => w.id === f.witness.walk[0].wallId))
        )
    ),
    failures: [...badRoots].map(([r, reason]) => ({
      reason,
      walls: walls.filter((_, i) => root(i) === r),
    })),
  };
}
function inBounds(walls: StructuralWall[], p: WorldPoint): boolean {
  return (
    walls.length > 0 &&
    p.x >= Math.min(...walls.flatMap((w) => [w.line.start.x, w.line.end.x])) &&
    p.x <= Math.max(...walls.flatMap((w) => [w.line.start.x, w.line.end.x])) &&
    p.z >= Math.min(...walls.flatMap((w) => [w.line.start.z, w.line.end.z])) &&
    p.z <= Math.max(...walls.flatMap((w) => [w.line.start.z, w.line.end.z]))
  );
}
function lookup(graph: Graph, point: WorldPoint): EnclosureResult {
  for (const wall of graph.walls) {
    const a = exactPoint(wall.line.start),
      b = exactPoint(wall.line.end),
      p = exactPoint(point);
    if (orientation(a, b, p) === 0 && inBounds([wall], point))
      return { status: 'unresolved', reason: 'seed-on-boundary' };
  }
  for (const nodes of graph.unsupportedFaces) {
    const result = pointInRing(
      nodes.map((n) => n.p),
      point
    );
    if (result === 'inside')
      return { status: 'unresolved', reason: 'unsupported-geometry' };
    if (result === 'boundary')
      return { status: 'unresolved', reason: 'seed-on-boundary' };
    if (result === 'uncertain')
      return { status: 'unresolved', reason: 'uncertain-geometry' };
  }
  const containing: Face[] = [];
  for (const face of graph.faces) {
    const result = pointInRing(
      face.nodes.map((n) => n.p),
      point
    );
    if (result === 'boundary')
      return { status: 'unresolved', reason: 'seed-on-boundary' };
    if (result === 'uncertain')
      return { status: 'unresolved', reason: 'uncertain-geometry' };
    if (result === 'inside') containing.push(face);
  }
  if (containing.length > 1)
    return { status: 'unresolved', reason: 'unsupported-geometry' };
  if (!containing.length) {
    // Failed-component bounds are only a fallback diagnosis, not evidence
    // against a certified face. Connected failures have no surviving faces;
    // disconnected interior walls are still refused below as holes/slits.
    const failure = graph.failures.find((f) => inBounds(f.walls, point));
    return { status: 'unresolved', reason: failure?.reason ?? 'open' };
  }
  const face = containing[0];
  // A disconnected interior component makes a hole/slit, not a one-ring face.
  const sources = new Set(face.witness.walk.map((r) => r.wallId));
  for (const wall of graph.walls)
    if (!sources.has(wall.id)) {
      for (const p of [wall.line.start, wall.line.end]) {
        const result = pointInRing(
          face.nodes.map((n) => n.p),
          p
        );
        if (result === 'inside')
          return { status: 'unresolved', reason: 'unsupported-geometry' };
        if (result === 'uncertain')
          return { status: 'unresolved', reason: 'uncertain-geometry' };
      }
    }
  return {
    status: 'resolved',
    ring: face.nodes.map((n) => ({ ...n.p.point })),
    witness: face.witness,
  };
}
export function findEnclosureAtPoint(
  draft: Readonly<RoomDraft>,
  point: WorldPoint
): EnclosureResult {
  return lookup(buildGraph([...(draft.room.walls ?? [])]), point);
}

type Conflict = 'overlap' | 'uncertain-geometry' | null;
function polygonConflict(
  a: readonly WorldPoint[],
  b: readonly WorldPoint[],
  certifiedA = a.map(exactPoint),
  certifiedB = b.map(exactPoint)
): Conflict {
  if (
    Math.max(...certifiedA.map((p) => p.x[1])) <=
      Math.min(...certifiedB.map((p) => p.x[0])) ||
    Math.max(...certifiedB.map((p) => p.x[1])) <=
      Math.min(...certifiedA.map((p) => p.x[0])) ||
    Math.max(...certifiedA.map((p) => p.z[1])) <=
      Math.min(...certifiedB.map((p) => p.z[0])) ||
    Math.max(...certifiedB.map((p) => p.z[1])) <=
      Math.min(...certifiedA.map((p) => p.z[0]))
  )
    return null;
  // Never promote rounded constructed intersections to exact overlap evidence.
  // This slice conservatively refuses a conflict involving such coordinates.
  if (
    [...certifiedA, ...certifiedB].some(
      (p) => p.x[0] !== p.x[1] || p.z[0] !== p.z[1]
    )
  )
    return 'uncertain-geometry';
  for (const p of a) {
    const result = pointInRing(b.map(exactPoint), p);
    if (result === 'inside') return 'overlap';
    if (result === 'uncertain') return 'uncertain-geometry';
  }
  for (const p of b) {
    const result = pointInRing(a.map(exactPoint), p);
    if (result === 'inside') return 'overlap';
    if (result === 'uncertain') return 'uncertain-geometry';
  }
  let uncertain = false;
  for (let i = 0; i < a.length; i++)
    for (let j = 0; j < b.length; j++) {
      if (
        samePoint(a[i], b[(j + 1) % b.length]) &&
        samePoint(a[(i + 1) % a.length], b[j])
      )
        continue;
      const contact = segmentContact(
        a[i],
        a[(i + 1) % a.length],
        b[j],
        b[(j + 1) % b.length]
      );
      if (
        contact.kind === 'point' &&
        contact.a[0] > 0 &&
        contact.a[1] < 1 &&
        contact.b[0] > 0 &&
        contact.b[1] < 1
      )
        return 'overlap';
      if (contact.kind === 'unsupported') {
        const ea = a[i],
          eb = a[(i + 1) % a.length],
          ec = b[j],
          ed = b[(j + 1) % b.length];
        const axis =
          ea.x === eb.x && ec.x === ed.x
            ? 'z'
            : ea.z === eb.z && ec.z === ed.z
              ? 'x'
              : null;
        if (axis) {
          if ((eb[axis] - ea[axis]) * (ed[axis] - ec[axis]) > 0)
            return 'overlap';
        } else uncertain = true;
      }
      if (contact.kind === 'uncertain') uncertain = true;
    }
  // Boundary-only containment (e.g. identical rings, inscribed polygons):
  // a certified interior centroid in BOTH proves positive-area intersection.
  for (const ring of [a, b]) {
    const p = {
      x: ring.reduce((s, p) => s + p.x, 0) / ring.length,
      z: ring.reduce((s, p) => s + p.z, 0) / ring.length,
    };
    if (
      pointInRing(a.map(exactPoint), p) === 'inside' &&
      pointInRing(b.map(exactPoint), p) === 'inside'
    )
      return 'overlap';
  }
  return uncertain ? 'uncertain-geometry' : null;
}
/** Pure projection. Unbound definitions are never acquired, and matched bound
 * walks recover without writes. One graph per call, independent of floor/UI. */
export function resolveAuthoringRegions(
  draft: Readonly<RoomDraft>
): RegionResolution[] {
  const regions = draft.scene.authoringRegions ?? [];
  if (!regions.length) return [];
  const graph = regions.some(
    (r) => r.boundary.kind === 'automatic' && r.boundary.witness
  )
    ? buildGraph([...(draft.room.walls ?? [])])
    : ({ faces: [], unsupportedFaces: [], failures: [], walls: [] } as Graph);
  const witnesses = new Map<string, EnclosureWitness>();
  const rings = new Map<string, CertifiedPoint[]>();
  const results = regions.map((region): RegionResolution => {
    const fail = (reason: Reason): RegionResolution => ({
      id: region.id,
      status: 'unresolved',
      reason,
    });
    if (region.boundary.kind === 'explicit')
      return region.boundary.cells.length
        ? {
            id: region.id,
            status: 'resolved',
            area: {
              kind: 'hex-union',
              cells: region.boundary.cells.map((c) => ({ ...c })),
            },
          }
        : fail('empty-explicit');
    if (!region.boundary.witness) return fail('unbound');
    const label = draft.scene.mapLabels?.find((l) => l.id === region.labelId);
    if (!label) return fail('outside-bound-enclosure');
    const witness = region.boundary.witness;
    const boundFace = graph.faces.find((f) =>
      enclosureWitnessesEqual(f.witness, witness)
    );
    const candidate = lookup(graph, label.location);
    if (candidate.status === 'unresolved')
      return fail(
        candidate.reason === 'open' && boundFace
          ? 'outside-bound-enclosure'
          : candidate.reason
      );
    if (!enclosureWitnessesEqual(witness, candidate.witness)) {
      return fail(boundFace ? 'outside-bound-enclosure' : 'boundary-changed');
    }
    witnesses.set(region.id, candidate.witness);
    rings.set(
      region.id,
      graph.faces
        .find((f) => enclosureWitnessesEqual(f.witness, candidate.witness))!
        .nodes.map((n) => n.p)
    );
    return {
      id: region.id,
      status: 'resolved',
      area: { kind: 'polygon', ring: candidate.ring },
    };
  });
  const conflicts = new Map<number, Reason>();
  for (let i = 0; i < results.length; i++)
    for (let j = i + 1; j < results.length; j++) {
      const a = results[i],
        b = results[j];
      if (a.status !== 'resolved' || b.status !== 'resolved') continue;
      let conflict: Reason | null = null;
      if (a.area.kind === 'hex-union' && b.area.kind === 'hex-union') {
        const keys = new Set(a.area.cells.map((c) => `${c.q},${c.r}`));
        if (b.area.cells.some((c) => keys.has(`${c.q},${c.r}`)))
          conflict = 'overlap';
      } else if (a.area.kind === 'polygon' && b.area.kind === 'polygon') {
        if (enclosureWitnessesEqual(witnesses.get(a.id)!, witnesses.get(b.id)!))
          conflict = 'duplicate-room-label';
        // Distinct certified faces of this SAME planar source graph partition
        // interiors. Lookup already refuses disconnected containment/holes.
        // This is a positive-area exclusion certificate, including shared
        // constructed crossings, not an epsilon polygon-overlap guess.
      } else {
        const polygon = a.area.kind === 'polygon' ? a.area : b.area;
        const hexes = a.area.kind === 'hex-union' ? a.area : b.area;
        if (polygon.kind === 'polygon' && hexes.kind === 'hex-union')
          for (const cell of hexes.cells) {
            const found = polygonConflict(
              polygon.ring,
              cellCorners(cell),
              rings.get(a.area.kind === 'polygon' ? a.id : b.id)
            );
            if (found === 'overlap') {
              conflict = found;
              break;
            }
            if (found) conflict = found;
          }
      }
      if (conflict) {
        conflicts.set(i, conflict);
        conflicts.set(j, conflict);
      }
    }
  return results.map((result, i) =>
    conflicts.has(i)
      ? { id: result.id, status: 'unresolved', reason: conflicts.get(i)! }
      : result
  );
}
