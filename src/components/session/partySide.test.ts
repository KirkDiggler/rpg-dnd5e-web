// @vitest-environment node
/**
 * Which side a combatant stands on, read off the viewer's sighting
 * (rpg-project#733): the veteran who joined stands with the party.
 */
import { create } from '@bufbuild/protobuf';
import {
  MemberKind,
  SeenSchema,
  SightingSchema,
  Standing,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { describe, expect, it } from 'vitest';
import {
  companionsLine,
  companionsStanding,
  sideOf,
  stancesBySubject,
} from './partySide';

const sighting = (
  subject: string,
  name: string,
  kind: MemberKind,
  stance: string,
  standing = Standing.UP
) =>
  create(SightingSchema, {
    subject,
    name,
    kind,
    stance,
    seen: create(SeenSchema, { standing }),
  });

describe('sideOf', () => {
  it('puts a player on the party side whatever the stance says', () => {
    expect(sideOf(MemberKind.PLAYER, undefined)).toBe('party');
  });

  it('puts an allied creature on the party side', () => {
    expect(sideOf(MemberKind.MONSTER, 'allied')).toBe('party');
  });

  it('names hostile and neutral creatures by their own side', () => {
    expect(sideOf(MemberKind.MONSTER, 'hostile')).toBe('opposed');
    expect(sideOf(MemberKind.MONSTER, 'neutral')).toBe('neutral');
  });

  it('answers no side for no word or a word this build does not know', () => {
    expect(sideOf(MemberKind.MONSTER, undefined)).toBeUndefined();
    expect(sideOf(MemberKind.MONSTER, '')).toBeUndefined();
    expect(sideOf(MemberKind.MONSTER, 'pretending')).toBeUndefined();
  });
});

describe('who came with you', () => {
  const sightings = [
    sighting('p1', 'Kirk', MemberKind.PLAYER, ''),
    sighting('veteran', 'the veteran', MemberKind.MONSTER, 'allied'),
    sighting('guard', 'guard-1', MemberKind.MONSTER, 'hostile'),
    sighting(
      'squire',
      'the squire',
      MemberKind.MONSTER,
      'allied',
      Standing.DOWNED
    ),
  ];

  it('indexes the believed stance by member id, skipping no-word sightings', () => {
    const stances = stancesBySubject(sightings);
    expect(stances.get('veteran')).toBe('allied');
    expect(stances.get('guard')).toBe('hostile');
    expect(stances.has('p1')).toBe(false);
  });

  it('names allied creatures still on their feet, never players or the fallen', () => {
    expect(companionsStanding(sightings)).toEqual(['the veteran']);
  });

  it('words the line for none, one and several', () => {
    expect(companionsLine([])).toBeUndefined();
    expect(companionsLine(['the veteran'])).toBe('the veteran came with you.');
    expect(companionsLine(['A', 'B', 'C'])).toBe('A, B and C came with you.');
  });
});
