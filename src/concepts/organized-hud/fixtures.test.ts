import {
  TargetKind,
  Verb,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { describe, expect, it } from 'vitest';
import { ORGANIZED_HUD_FIXTURES } from './fixtures';

describe('organized HUD fixtures', () => {
  it('keeps the explicit cantrip fixtures usable when spell slots are spent', () => {
    const spent = ORGANIZED_HUD_FIXTURES.find(
      (fixture) => fixture.id === 'spent-slots'
    )!;
    for (const id of ['mockery', 'fire-bolt', 'guidance']) {
      expect(
        spent.declarations.find((declaration) => declaration.id === id)
          ?.available
      ).toBe(true);
    }
    expect(
      spent.declarations.find((declaration) => declaration.id === 'bane')
        ?.available
    ).toBe(false);
  });
  it('models Bane as an Afford-shaped multi-target cast', () => {
    const bane = ORGANIZED_HUD_FIXTURES[0]!.declarations.find(
      (declaration) => declaration.id === 'bane'
    );
    expect(bane).toMatchObject({
      verb: Verb.CAST,
      targetKind: TargetKind.MEMBER,
      minTargets: 1,
      maxTargets: 2,
    });
    expect(
      bane?.candidates.filter((candidate) => candidate.available)
    ).toHaveLength(2);
  });

  it('includes server-authored Command options for the shared option surface', () => {
    const command = ORGANIZED_HUD_FIXTURES[0]!.declarations.find(
      (declaration) => declaration.id === 'command'
    );
    expect(command?.options.map((option) => option.label)).toEqual([
      'Grovel',
      'Flee',
    ]);
  });

  it('carries Afford-shaped effect rows on the longsword, with per-target answers', () => {
    const longsword = ORGANIZED_HUD_FIXTURES[0]!.declarations.find(
      (declaration) => declaration.id === 'offer:aldric:longsword:action'
    );
    expect(longsword?.effects.length).toBeGreaterThan(0);
    const ids = new Set(longsword?.effects.map((row) => row.id));
    expect(ids.size).toBe(longsword?.effects.length);
    for (const candidate of longsword?.candidates ?? []) {
      for (const answer of candidate.effects)
        expect(ids.has(answer.id)).toBe(true);
    }
  });

  it('gives one longsword candidate held rows of its own, never sharing an actor row id', () => {
    const longsword = ORGANIZED_HUD_FIXTURES[0]!.declarations.find(
      (declaration) => declaration.id === 'offer:aldric:longsword:action'
    );
    const ids = new Set(longsword?.effects.map((row) => row.id));
    const holding = longsword?.candidates.filter(
      (candidate) => candidate.heldEffects.length > 0
    );
    expect(holding?.map((candidate) => candidate.member)).toEqual([
      'skeleton-guard',
    ]);
    for (const row of holding?.[0]?.heldEffects ?? [])
      expect(ids.has(row.id)).toBe(false);
  });
});
