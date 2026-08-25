import { create } from '@bufbuild/protobuf';
import {
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
  selectDirectMapAttack,
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

  it('returns null when the selected opaque id is no longer offered', () => {
    expect(
      selectCombatExperience([declaration('v1.current')], state('v1.stale'))
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

describe('selectDirectMapAttack', () => {
  it('returns null when there are zero direct matches, including independently unavailable facts', () => {
    const unavailableDeclaration = declaration('v1.spent', {
      available: false,
      candidates: [candidate('goblin-1')],
    });
    const unavailableCandidate = declaration('v1.out-of-reach', {
      candidates: [candidate('goblin-1', false, 'out of reach')],
    });
    const wrongTargetKind = declaration('v1.not-member-targeted', {
      targetKind: TargetKind.PATH,
      candidates: [candidate('goblin-1')],
    });

    expect(
      selectDirectMapAttack(
        [unavailableDeclaration, unavailableCandidate, wrongTargetKind],
        'goblin-1'
      )
    ).toBeNull();
  });

  it('returns the exact declaration when there is one direct match', () => {
    const exact = declaration('v1.longsword', {
      candidates: [candidate('goblin-1')],
    });

    expect(selectDirectMapAttack([exact], 'goblin-1')).toBe(exact);
    expect(selectDirectMapAttack([exact], 'unknown')).toBeNull();
  });

  it('refuses ambiguity when two offers directly match the same subject', () => {
    const first = declaration('v1.longsword', {
      candidates: [candidate('goblin-1')],
    });
    const second = declaration('v1.unarmed', {
      candidates: [candidate('goblin-1')],
    });

    expect(selectDirectMapAttack([first, second], 'goblin-1')).toBeNull();
  });
});
