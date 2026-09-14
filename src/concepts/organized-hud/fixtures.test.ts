import {
  TargetKind,
  Verb,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { describe, expect, it } from 'vitest';
import { ORGANIZED_HUD_FIXTURES } from './fixtures';

describe('organized HUD fixtures', () => {
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
});
