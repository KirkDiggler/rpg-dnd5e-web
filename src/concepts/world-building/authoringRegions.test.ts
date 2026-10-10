import { describe, expect, it } from 'vitest';
import {
  canonicalizeEnclosureWitness,
  enclosureWitnessesEqual,
  validateAuthoringRegions,
  validateEnclosureWitness,
  type BoundaryRun,
  type EnclosureWitness,
} from './authoringRegions';
import { centeredRoomWorkspace, workspaceCells } from './workspaceGeometry';

const run = (
  wallId: string,
  direction: BoundaryRun['direction'] = 'start-to-end'
): BoundaryRun => ({ wallId, direction });
const witness: EnclosureWitness = { walk: [run('A'), run('B'), run('C')] };
const labels = [{ id: 'label', text: 'Kitchen', location: { x: 0, z: 0 } }];
const automatic = {
  id: 'region',
  labelId: 'label',
  boundary: { kind: 'automatic', witness },
};

describe('authoring region definition contracts (no geometry acquisition)', () => {
  it('compares cyclic copies and compresses the seam without changing persisted direction/order', () => {
    const raw = { walk: [run('C'), run('C'), run('A'), run('B'), run('C')] };
    const before = JSON.stringify(raw);
    expect(canonicalizeEnclosureWitness(raw)).toEqual(witness);
    expect(enclosureWitnessesEqual(raw, witness)).toBe(true);
    expect(validateEnclosureWitness(raw)).toEqual(raw);
    expect(JSON.stringify(raw)).toBe(before);
    expect(
      enclosureWitnessesEqual(witness, {
        walk: [
          run('A', 'end-to-start'),
          run('C', 'end-to-start'),
          run('B', 'end-to-start'),
        ],
      })
    ).toBe(false);
    expect(
      enclosureWitnessesEqual(witness, {
        walk: [run('A', 'end-to-start'), run('B'), run('C')],
      })
    ).toBe(false);
    expect(
      enclosureWitnessesEqual(witness, { walk: [run('A'), run('C'), run('B')] })
    ).toBe(false);
  });
  it('uses tuple code-unit order rather than locale or delimiter concatenation', () => {
    expect(
      canonicalizeEnclosureWitness({
        walk: [run('a'), run('Z'), run('a|end-to-start')],
      }).walk[0].wallId
    ).toBe('Z');
    expect(
      canonicalizeEnclosureWitness({
        walk: [run('A'), run('A', 'end-to-start'), run('B')],
      }).walk[0]
    ).toEqual(run('A', 'end-to-start'));
    expect(
      enclosureWitnessesEqual(
        { walk: [run('A|B'), run('C'), run('D')] },
        { walk: [run('A'), run('B|C'), run('D')] }
      )
    ).toBe(false);
  });
  it('rejects malformed walks, variants and unknown intent instead of silently stripping it', () => {
    for (const value of [
      null,
      { walk: [] },
      { walk: [run('A'), run('B')] },
      { walk: [run('A'), run('A'), run('B'), run('A')] },
      { walk: [run(''), run('B'), run('C')] },
      { walk: [{ wallId: 'A', direction: 'forward' }, run('B'), run('C')] },
      { ...witness, polygon: [] },
      { walk: [{ ...run('A'), junction: 1 }, run('B'), run('C')] },
    ])
      expect(() => validateEnclosureWitness(value)).toThrow();
    for (const boundary of [
      null,
      { kind: 'other' },
      { kind: 'automatic', witness: null },
      { kind: 'automatic', cells: [] },
      { kind: 'explicit' },
      { kind: 'explicit', cells: [], witness },
    ])
      expect(() =>
        validateAuthoringRegions([{ ...automatic, boundary }], labels)
      ).toThrow();
    expect(() =>
      validateAuthoringRegions([{ ...automatic, name: 'second name' }], labels)
    ).toThrow(/unsupported/);
  });
  it('retains separated same-source runs for the geometry owner to certify, rather than guessing a face in schema validation', () => {
    const concaveWord = {
      walk: [
        run('A'),
        run('B'),
        run('C'),
        run('D'),
        run('A'),
        run('E'),
        run('F'),
        run('G'),
      ],
    };
    expect(validateEnclosureWitness(concaveWord)).toEqual(concaveWord);
    expect(
      enclosureWitnessesEqual(concaveWord, {
        walk: [...concaveWord.walk.slice(4), ...concaveWord.walk.slice(0, 4)],
      })
    ).toBe(true);
  });
  it('retains unbound, stale source references and authored empty explicit intent without guessed workspace', () => {
    expect(validateAuthoringRegions([automatic], labels)).toEqual([automatic]);
    const unbound = { ...automatic, boundary: { kind: 'automatic' } };
    expect(
      validateAuthoringRegions([unbound], labels)[0].boundary
    ).not.toHaveProperty('witness');
    const empty = { ...automatic, boundary: { kind: 'explicit', cells: [] } };
    expect(validateAuthoringRegions([empty], labels)).toEqual([empty]);
    const remote = {
      ...automatic,
      boundary: { kind: 'explicit', cells: [{ q: 1000, r: -1000 }] },
    };
    expect(validateAuthoringRegions([remote], labels)).toEqual([remote]);
    expect(() =>
      validateAuthoringRegions([remote], labels, {
        workspace: centeredRoomWorkspace(1, 1),
      })
    ).toThrow(/workspace/);
  });
  it('requires one-to-one existing label links and unique reserved region identities', () => {
    const twoLabels = [...labels, { ...labels[0], id: 'other' }];
    for (const regions of [
      null,
      [automatic, automatic],
      [{ ...automatic, labelId: 'missing' }],
      [{ ...automatic, id: 'label' }],
      [automatic, { ...automatic, id: 'other-region' }],
      [automatic, { ...automatic, labelId: 'other' }],
    ])
      expect(() => validateAuthoringRegions(regions, twoLabels)).toThrow();
    expect(() =>
      validateAuthoringRegions([automatic], labels, {
        reservedIds: new Set(['region']),
      })
    ).toThrow(/duplicate/);
    expect(validateAuthoringRegions([], [])).toEqual([]);
  });
  it('accepts the existing 256-label quota and actual workspace capacity, refuses excess and duplicate cells', () => {
    const manyLabels = Array.from({ length: 256 }, (_, i) => ({
      ...labels[0],
      id: `label-${i}`,
    }));
    const manyRegions = manyLabels.map((label, i) => ({
      ...automatic,
      id: `region-${i}`,
      labelId: label.id,
    }));
    expect(validateAuthoringRegions(manyRegions, manyLabels)).toHaveLength(256);
    expect(() =>
      validateAuthoringRegions([...manyRegions, automatic], manyLabels)
    ).toThrow(/linked labels/);
    const workspace = centeredRoomWorkspace(128, 128);
    const cells = workspaceCells(workspace);
    expect(
      validateAuthoringRegions(
        [{ ...automatic, boundary: { kind: 'explicit', cells } }],
        labels,
        { workspace }
      )[0].boundary
    ).toEqual({ kind: 'explicit', cells });
    for (const invalid of [
      [...cells, { q: 0, r: 0 }],
      [
        { q: 0, r: 0 },
        { q: 0, r: 0 },
      ],
      [{ q: 0.5, r: 0 }],
      [{ q: Infinity, r: 0 }],
      [{ q: 0, r: 0, unknown: true }],
    ])
      expect(() =>
        validateAuthoringRegions(
          [{ ...automatic, boundary: { kind: 'explicit', cells: invalid } }],
          labels,
          { workspace }
        )
      ).toThrow();
  });
});

describe('optional visual lighting grammar', () => {
  it('copies exact authored values only with allowLighting and never supplies defaults', () => {
    const input = { ...automatic, lighting: { background: 0.153728 } };
    expect(
      validateAuthoringRegions([input], labels, { allowLighting: true })
    ).toEqual([input]);
    expect(() => validateAuthoringRegions([input], labels)).toThrow();
    expect(
      validateAuthoringRegions([automatic], labels, { allowLighting: true })[0]
    ).not.toHaveProperty('lighting');
  });
  it('refuses unknown/null/undefined/nonfinite/out-of-range settings atomically', () => {
    for (const lighting of [
      null,
      undefined,
      {},
      { background: '0.15' },
      { background: NaN },
      { background: Infinity },
      { background: -0.01 },
      { background: 1.01 },
      { background: 0.15, tint: 'red' },
    ]) {
      expect(() =>
        validateAuthoringRegions([{ ...automatic, lighting }], labels, {
          allowLighting: true,
        })
      ).toThrow();
    }
    for (const background of [0, 1])
      expect(
        validateAuthoringRegions(
          [{ ...automatic, lighting: { background } }],
          labels,
          { allowLighting: true }
        )[0].lighting
      ).toEqual({ background });
  });
});
