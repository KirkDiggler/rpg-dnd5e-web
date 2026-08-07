/**
 * specCompat — the load-time spec-version compatibility check
 * (local-drafts unit). Kirk's ask, verbatim: "we could have 0.4 able to
 * load in the concept page and want to run the v0.3 version of it if
 * possible. maybe we can check compatibility."
 *
 * Two genuinely different questions, both answered here, neither
 * reimplementing the other's machinery:
 *
 * 1. **Which spec CUT does this document's own construct usage require?**
 *    (`inferSpecCut`) — a pure, structural read of the parsed `DungeonDoc`
 *    against the ratified level cut
 *    (`ideas/dungeon-builder/spec/v0.3/spec.md` §1/§2): every construct in
 *    §1's four groups (a–d) is "0.3"; anything in §2 ("Explicitly ABOVE
 *    v0.3" — `wallLines:`, `defaults:`, `holes:`, `end:`, `lighting:`,
 *    `mount:`/`height:`/`rotate_degrees:`/`targeting:` on a placement) is
 *    "draft." This has nothing to do with any live server — it's a
 *    property of the DOCUMENT, derivable offline. Note `canvas:`/
 *    `regions:`/top-level `place:` (spec groups c/d, Wave 0/1) ARE "0.3"
 *    by this reckoning even though no server compiles them yet — they're
 *    ratified constructs, just not-yet-IMPLEMENTED ones. "Not started
 *    server-side" and "not part of v0.3" are different facts; conflating
 *    them would make every from-scratch canvas doc read as "draft" when
 *    the spec itself says otherwise.
 * 2. **What would THIS connected server actually drop from this document
 *    today?** — server capability, not document classification, and
 *    already fully solved by `dungeonYaml.ts`'s `stripToV1Subset` /
 *    `capabilityProbe.ts`'s live probe. `buildSpecCompatReport` below
 *    reads `V1SubsetResult.dropped` verbatim rather than recomputing
 *    anything — the explicit instruction this unit was given ("REUSE the
 *    existing stripToV1Subset dropped-list machinery, do not
 *    reimplement").
 *
 * A document can be spec-clean ("0.3", nothing in `reasons`) and STILL
 * have server drops (e.g. a from-scratch canvas today, before platform
 * Wave 0 ships `canvas:` support) — the two questions are independent
 * axes, not the same fact asked twice.
 */
import type { DungeonDoc, PlacementDoc, V1SubsetResult } from './dungeonYaml';
import { pluralCount } from './dungeonYaml';

/** The two spec-cut values this concept currently knows about. `'0.3'` —
 * the document uses only constructs in the ratified v0.3 level cut.
 * `'draft'` — it uses at least one construct spec.md §2 explicitly places
 * ABOVE v0.3 (no ratified number for "how far" above; `'draft'` is the
 * honest label until whichever of those constructs is itself ratified
 * into a numbered cut, at which point THAT value — e.g. `'0.4'` — becomes
 * a new valid `spec:` value alongside `'0.3'`, unchanged shape). */
export type SpecCut = '0.3' | 'draft';

export interface SpecInference {
  /** The minimum spec cut this document's constructs actually require. */
  inferredCut: SpecCut;
  /** Human-readable, which above-v0.3 constructs are in use
   * ("2 straight walls", "mount: wall (1 placement)") — empty when
   * `inferredCut === '0.3'`. */
  reasons: string[];
}

/** Which above-v0.3 (spec.md §2) constructs a single placement uses —
 * `facing` is deliberately excluded: it's a v0.3 construct (§4.9) on
 * every entry type, including the ones the SERVER currently rejects it
 * on (monster/boss/`mount:wall`) — that's a live-capability gap
 * (`stripToV1Subset`'s job), not a spec-cut one. */
function placementAboveV03Reasons(p: PlacementDoc): string[] {
  const reasons: string[] = [];
  if (p.mount === 'wall') reasons.push('mount: wall');
  if (p.height !== null) reasons.push('height');
  if (p.rotationDegrees !== null) reasons.push('rotate_degrees');
  if (p.targeting !== null) reasons.push('targeting');
  return reasons;
}

/** Structural, offline inference — no server involved. See this file's
 * own doc comment for the full reasoning and the spec.md §1/§2 mapping. */
export function inferSpecCut(doc: DungeonDoc): SpecInference {
  const reasons: string[] = [];

  if (doc.wallLines.length > 0) {
    reasons.push(pluralCount(doc.wallLines.length, 'straight wall'));
  }
  if (doc.holes.length > 0) {
    reasons.push(pluralCount(doc.holes.length, 'hole'));
  }
  if (doc.end) {
    reasons.push('end');
  }
  if (doc.lighting) {
    reasons.push('lighting');
  }
  const defaultRefCount = Object.keys(doc.defaults).length;
  if (defaultRefCount > 0) {
    reasons.push(pluralCount(defaultRefCount, 'default ref'));
  }

  // Per-placement above-v0.3 fields (mount: wall / height / rotate_degrees
  // / targeting), tallied by reason across every placement — room-scoped,
  // top-level, and boss — the same way stripToV1Subset's own dropped-list
  // bookkeeping counts per-field, not per-placement.
  const counts = new Map<string, number>();
  const allPlacements: PlacementDoc[] = [
    ...doc.place,
    ...doc.rooms.flatMap((r) => r.place),
  ];
  for (const p of allPlacements) {
    for (const reason of placementAboveV03Reasons(p)) {
      counts.set(reason, (counts.get(reason) ?? 0) + 1);
    }
  }
  // A boss is always a monster and never gates blocks_movement/blocks_los/
  // mount/height/rotate_degrees (BossDoc doesn't carry those fields at
  // all — only ref/at/facing/targeting), so `targeting` is the one
  // above-v0.3 construct a boss entry can use.
  for (const room of doc.rooms) {
    if (room.boss?.targeting) {
      counts.set('targeting', (counts.get('targeting') ?? 0) + 1);
    }
  }
  for (const [reason, count] of counts) {
    reasons.push(`${reason} (${pluralCount(count, 'placement')})`);
  }

  return { inferredCut: reasons.length === 0 ? '0.3' : 'draft', reasons };
}

export interface SpecCompatReport {
  /** The document's own declared `spec:` value, verbatim — `null` when
   * undeclared (not an error; `inferredCut` below is the honest fallback). */
  declaredSpec: string | null;
  /** The minimum spec cut this document's constructs actually require,
   * per `inferSpecCut` — independent of `declaredSpec`. */
  inferredCut: SpecCut;
  /** Mirrors `SpecInference.reasons` — empty when `inferredCut === '0.3'`. */
  inferredReasons: string[];
  /** True only in the DISHONEST direction: `declaredSpec === '0.3'` but
   * the document actually uses a draft-only construct. Declaring
   * `'draft'` for an actually-0.3-clean document is conservative, not
   * dishonest, and is deliberately NOT flagged. */
  specMismatch: boolean;
  /** What the CURRENTLY CONNECTED server (per its live-probed
   * capabilities) would drop from this document today —
   * `V1SubsetResult.dropped` verbatim, never recomputed here. Empty when
   * `v1Subset` is `null` (mid-edit, unparseable) or nothing would drop. */
  serverWouldDrop: string[];
}

/** Combines the two axes above into one report — see this file's own doc
 * comment for why they're independent and why `serverWouldDrop` is read,
 * not recomputed. */
export function buildSpecCompatReport(
  doc: DungeonDoc,
  v1Subset: V1SubsetResult | null
): SpecCompatReport {
  const { inferredCut, reasons } = inferSpecCut(doc);
  return {
    declaredSpec: doc.spec,
    inferredCut,
    inferredReasons: reasons,
    specMismatch: doc.spec === '0.3' && inferredCut === 'draft',
    serverWouldDrop: v1Subset?.dropped ?? [],
  };
}
