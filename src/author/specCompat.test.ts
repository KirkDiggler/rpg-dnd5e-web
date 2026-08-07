import { describe, expect, it } from 'vitest';
import { emptyCanvasYaml } from './creation/emptyCanvasDoc';
import { canonicalCorner } from './creation/hexCorner';
import {
  addWallLine,
  parseDungeon,
  setBossTargeting,
  setEnd,
  setLightingAmbient,
  setPlacementFacing,
  setPlacementHeight,
  setPlacementMount,
  setPlacementRotationDegrees,
  setPlacementTargeting,
  setRefDefault,
  setStart,
  toggleHole,
  toggleWall,
  type V1SubsetResult,
} from './dungeonYaml';
import { SHOWCASE_YAML } from './fixtures';
import { buildSpecCompatReport, inferSpecCut } from './specCompat';

describe('inferSpecCut', () => {
  it('a pure showcase.yaml (rooms/connectors/room-scoped place — spec group a) is 0.3, no reasons', () => {
    const { doc } = parseDungeon(SHOWCASE_YAML);
    expect(inferSpecCut(doc)).toEqual({ inferredCut: '0.3', reasons: [] });
  });

  it('walls: and start: (spec group b, already-compiling) do not require draft', () => {
    const { cst } = parseDungeon(SHOWCASE_YAML);
    toggleWall(cst, 7, 0);
    setStart(cst, [0, 4]);
    const { doc } = parseDungeon(cst.toString());
    expect(inferSpecCut(doc).inferredCut).toBe('0.3');
  });

  it('a from-scratch canvas doc (canvas: + top-level place:, spec group c) is 0.3', () => {
    const { doc } = parseDungeon(emptyCanvasYaml(20, 30));
    expect(inferSpecCut(doc).inferredCut).toBe('0.3');
  });

  it('wallLines: (spec §2, above v0.3) requires draft, named in reasons', () => {
    const { cst } = parseDungeon(emptyCanvasYaml(20, 30));
    const from = canonicalCorner({ cell: [1, 1], corner: 0 });
    const to = canonicalCorner({ cell: [3, 1], corner: 0 });
    addWallLine(cst, from, to);
    const { doc } = parseDungeon(cst.toString());
    const result = inferSpecCut(doc);
    expect(result.inferredCut).toBe('draft');
    expect(result.reasons).toEqual(['1 straight wall']);
  });

  it('holes: requires draft', () => {
    const { cst } = parseDungeon(emptyCanvasYaml(20, 30));
    toggleHole(cst, 2, 2);
    const { doc } = parseDungeon(cst.toString());
    expect(inferSpecCut(doc)).toEqual({
      inferredCut: 'draft',
      reasons: ['1 hole'],
    });
  });

  it('end: requires draft', () => {
    const { cst } = parseDungeon(SHOWCASE_YAML);
    setEnd(cst, [19, 25]);
    const { doc } = parseDungeon(cst.toString());
    expect(inferSpecCut(doc)).toEqual({
      inferredCut: 'draft',
      reasons: ['end'],
    });
  });

  it('lighting: requires draft', () => {
    const { cst } = parseDungeon(SHOWCASE_YAML);
    setLightingAmbient(cst, 0.5);
    const { doc } = parseDungeon(cst.toString());
    expect(inferSpecCut(doc)).toEqual({
      inferredCut: 'draft',
      reasons: ['lighting'],
    });
  });

  it('defaults: requires draft', () => {
    const { cst } = parseDungeon(SHOWCASE_YAML);
    setRefDefault(cst, 'dnd5e:props:brazier', 'blocksMovement', true);
    const { doc } = parseDungeon(cst.toString());
    expect(inferSpecCut(doc)).toEqual({
      inferredCut: 'draft',
      reasons: ['1 default ref'],
    });
  });

  it('mount: wall on a placement requires draft, tallied by count', () => {
    const { cst, doc } = parseDungeon(SHOWCASE_YAML);
    setPlacementMount(cst, doc.rooms[0].id, 0, 'wall');
    const { doc: after } = parseDungeon(cst.toString());
    expect(inferSpecCut(after)).toEqual({
      inferredCut: 'draft',
      reasons: ['mount: wall (1 placement)'],
    });
  });

  it('a placement height requires draft', () => {
    const { cst, doc } = parseDungeon(SHOWCASE_YAML);
    setPlacementHeight(cst, doc.rooms[0].id, 0, 2.0);
    const { doc: after } = parseDungeon(cst.toString());
    expect(inferSpecCut(after)).toEqual({
      inferredCut: 'draft',
      reasons: ['height (1 placement)'],
    });
  });

  it('a placement rotate_degrees requires draft', () => {
    const { cst, doc } = parseDungeon(SHOWCASE_YAML);
    setPlacementRotationDegrees(cst, doc.rooms[0].id, 0, 15);
    const { doc: after } = parseDungeon(cst.toString());
    expect(inferSpecCut(after)).toEqual({
      inferredCut: 'draft',
      reasons: ['rotate_degrees (1 placement)'],
    });
  });

  it('a placement targeting requires draft', () => {
    const { cst, doc } = parseDungeon(SHOWCASE_YAML);
    setPlacementTargeting(cst, doc.rooms[0].id, 0, 'lowest-health');
    const { doc: after } = parseDungeon(cst.toString());
    expect(inferSpecCut(after)).toEqual({
      inferredCut: 'draft',
      reasons: ['targeting (1 placement)'],
    });
  });

  it('a boss targeting also requires draft, tallied into the same "targeting" bucket', () => {
    const { cst, doc } = parseDungeon(SHOWCASE_YAML);
    setBossTargeting(cst, doc.rooms[2].id, 'closest');
    const { doc: after } = parseDungeon(cst.toString());
    expect(inferSpecCut(after)).toEqual({
      inferredCut: 'draft',
      reasons: ['targeting (1 placement)'],
    });
  });

  it('facing does NOT require draft — it is a v0.3 construct (spec.md §4.9) regardless of who uses it', () => {
    const { cst, doc } = parseDungeon(SHOWCASE_YAML);
    const room = doc.rooms[0];
    setPlacementFacing(cst, room.id, 0, 2);
    const { doc: after } = parseDungeon(cst.toString());
    expect(inferSpecCut(after).inferredCut).toBe('0.3');
  });

  it('multiple above-v0.3 constructs are all named, in field order', () => {
    const { cst } = parseDungeon(emptyCanvasYaml(20, 30));
    toggleHole(cst, 2, 2);
    setEnd(cst, [5, 5]);
    const { doc } = parseDungeon(cst.toString());
    expect(inferSpecCut(doc)).toEqual({
      inferredCut: 'draft',
      reasons: ['1 hole', 'end'],
    });
  });
});

describe('buildSpecCompatReport', () => {
  it('undeclared spec: + a 0.3-clean document — no mismatch, empty reasons', () => {
    const { doc } = parseDungeon(SHOWCASE_YAML);
    const report = buildSpecCompatReport(doc, null);
    expect(report).toEqual({
      declaredSpec: null,
      inferredCut: '0.3',
      inferredReasons: [],
      specMismatch: false,
      serverWouldDrop: [],
    });
  });

  it('declared "0.3" but the document actually uses a draft construct — flagged as a mismatch', () => {
    const { cst } = parseDungeon(SHOWCASE_YAML);
    cst.set('spec', '0.3');
    toggleHole(cst, 2, 2);
    const { doc } = parseDungeon(cst.toString());
    const report = buildSpecCompatReport(doc, null);
    expect(report.specMismatch).toBe(true);
    expect(report.declaredSpec).toBe('0.3');
    expect(report.inferredCut).toBe('draft');
    expect(report.inferredReasons).toEqual(['1 hole']);
  });

  it('declared "draft" for an actually-0.3-clean document is conservative, not a mismatch', () => {
    const { cst } = parseDungeon(SHOWCASE_YAML);
    cst.set('spec', 'draft');
    const { doc } = parseDungeon(cst.toString());
    const report = buildSpecCompatReport(doc, null);
    expect(report.specMismatch).toBe(false);
    expect(report.inferredCut).toBe('0.3');
  });

  it("reads v1Subset.dropped verbatim as serverWouldDrop — doesn't recompute anything", () => {
    const { doc } = parseDungeon(SHOWCASE_YAML);
    const fakeV1Subset = {
      yaml: '',
      dropped: ['2 walls', 'start'],
      compiling: [],
      compilable: true,
      compilableBlockers: [],
    } satisfies V1SubsetResult;
    const report = buildSpecCompatReport(doc, fakeV1Subset);
    expect(report.serverWouldDrop).toEqual(['2 walls', 'start']);
  });

  it('null v1Subset (mid-edit/unparseable) reports an empty serverWouldDrop, not an error', () => {
    const { doc } = parseDungeon(SHOWCASE_YAML);
    const report = buildSpecCompatReport(doc, null);
    expect(report.serverWouldDrop).toEqual([]);
  });
});
