import { create } from '@bufbuild/protobuf';
import {
  DeathSaveRefSchema,
  DeclarationSchema,
  ShortfallReason,
  ShortfallSchema,
  Slot,
  TargetCandidateSchema,
  TargetKind,
  Verb,
  type Declaration,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { describe, expect, it } from 'vitest';
import {
  STALE_DECLARATION_MESSAGE,
  selectCombatExperience,
  staleDeclarationMessage,
} from './selection';
import type { CombatExperiencePresentationState } from './types';

const state = (
  armedDeclarationId: string,
  selectedCandidateMember: string | null = null
): CombatExperiencePresentationState => ({
  armedDeclarationId,
  selectedCandidateMember,
  changedOptionNotice: null,
});

function declaration(
  id: string,
  overrides: Parameters<typeof create<typeof DeclarationSchema>>[1] = {}
): Declaration {
  return create(DeclarationSchema, {
    id,
    verb: Verb.ATTACK,
    slot: Slot.ACTION,
    available: true,
    targetKind: TargetKind.MEMBER,
    candidates: [],
    ...overrides,
  });
}

const why = (text: string) =>
  create(ShortfallSchema, { reason: ShortfallReason.NO_BUDGET, text });

const candidate = (member: string, available = true, text?: string) =>
  create(TargetCandidateSchema, {
    member,
    available,
    why: text ? why(text) : undefined,
  });

describe('selectCombatExperience', () => {
  it('keeps the exact generated declaration and available candidate facts', () => {
    const target = candidate('goblin-1');
    const offer = declaration('v1.attack', { candidates: [target] });

    expect(
      selectCombatExperience([offer], state('v1.attack', 'goblin-1'))
    ).toEqual({ declaration: offer, candidate: target, whyText: null });
  });

  it('uses declaration why.text when the declaration is unavailable even if the candidate is available', () => {
    const target = candidate('goblin-1');
    const offer = declaration('v1.spent', {
      available: false,
      why: why('action: 1 needed, 0 left'),
      candidates: [target],
    });

    expect(
      selectCombatExperience([offer], state('v1.spent', 'goblin-1'))
    ).toEqual({
      declaration: null,
      candidate: null,
      whyText: 'action: 1 needed, 0 left',
    });
  });

  it('uses only the unavailable candidate why.text when the declaration remains available', () => {
    const target = candidate(
      'goblin-1',
      false,
      'Target is outside this attack’s reach.'
    );
    const offer = declaration('v1.out-of-reach', { candidates: [target] });

    expect(
      selectCombatExperience([offer], state('v1.out-of-reach', 'goblin-1'))
    ).toEqual({
      declaration: offer,
      candidate: null,
      whyText: 'Target is outside this attack’s reach.',
    });
  });

  it('keeps whyText absent when an unavailable generated fact has no why message', () => {
    const offer = declaration('v1.malformed-blocker', { available: false });

    expect(
      selectCombatExperience([offer], state('v1.malformed-blocker'))?.whyText
    ).toBeNull();
  });

  it('follows the generated fixed target kinds without inventing candidate shapes', () => {
    const target = candidate('goblin-1');
    const attack = declaration('v1.attack', { candidates: [target] });
    const move = declaration('v1.move', {
      verb: Verb.MOVE,
      slot: Slot.NONE,
      targetKind: TargetKind.PATH,
      candidates: [target],
    });
    const endTurn = declaration('v1.end', {
      verb: Verb.END_TURN,
      slot: Slot.NONE,
      targetKind: TargetKind.NONE,
      candidates: [target],
    });

    expect(
      selectCombatExperience(
        [attack, move, endTurn],
        state('v1.attack', 'goblin-1')
      )?.candidate
    ).toBe(target);
    expect(
      selectCombatExperience(
        [attack, move, endTurn],
        state('v1.move', 'goblin-1')
      )?.candidate
    ).toBeNull();
    expect(
      selectCombatExperience(
        [attack, move, endTurn],
        state('v1.end', 'goblin-1')
      )?.candidate
    ).toBeNull();
  });

  it('recognizes the exact selector-bearing no-target Death Save declaration without arming a candidate', () => {
    const deathSave = declaration('selector.death-save', {
      verb: Verb.DEATH_SAVE,
      slot: Slot.NONE,
      targetKind: TargetKind.NONE,
      candidates: [],
      deathSave: create(DeathSaveRefSchema, { name: 'Death Save' }),
    });

    expect(
      selectCombatExperience(
        [deathSave],
        state('selector.death-save', 'must-not-become-a-target')
      )
    ).toEqual({ declaration: deathSave, candidate: null, whyText: null });
  });

  it('returns null when the selected opaque id is no longer offered', () => {
    expect(
      selectCombatExperience([declaration('v1.current')], state('v1.stale'))
    ).toBeNull();
  });

  it('fails closed when the selected declaration id is duplicated', () => {
    const first = declaration('v1.duplicate', {
      candidates: [candidate('goblin-1')],
    });
    const second = declaration('v1.duplicate', {
      candidates: [candidate('goblin-1')],
    });

    expect(
      selectCombatExperience([first, second], state('v1.duplicate', 'goblin-1'))
    ).toBeNull();
  });

  it('fails closed when a member candidate is missing or duplicated', () => {
    const missing = declaration('v1.missing', {
      candidates: [candidate('goblin-2')],
    });
    const duplicate = declaration('v1.duplicate-candidate', {
      candidates: [candidate('goblin-1'), candidate('goblin-1')],
    });

    expect(
      selectCombatExperience([missing], state('v1.missing', 'goblin-1'))
    ).toBeNull();
    expect(
      selectCombatExperience(
        [duplicate],
        state('v1.duplicate-candidate', 'goblin-1')
      )
    ).toBeNull();
  });
});

describe('staleDeclarationMessage', () => {
  it('uses the exact safe generic copy and appends why.text only when present', () => {
    expect(STALE_DECLARATION_MESSAGE).toBe(
      'That option changed; review your current actions.'
    );
    expect(staleDeclarationMessage()).toBe(STALE_DECLARATION_MESSAGE);
    expect(staleDeclarationMessage(why('action: 1 needed, 0 left'))).toBe(
      `${STALE_DECLARATION_MESSAGE} action: 1 needed, 0 left`
    );
    expect(staleDeclarationMessage(why(''))).toBe(STALE_DECLARATION_MESSAGE);
  });
});
