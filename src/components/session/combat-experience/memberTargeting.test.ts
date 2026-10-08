import { create } from '@bufbuild/protobuf';
import {
  CastOptionSchema,
  DeclarationSchema,
  ShortfallSchema,
  SpellRefSchema,
  TargetCandidateSchema,
  TargetKind,
  Verb,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { describe, expect, it } from 'vitest';
import {
  isMultiMemberDeclaration,
  memberTargetingView,
  toggleMemberTarget,
  type MemberTargetingInput,
} from './memberTargeting';

const declaration = (name = 'Any spell') =>
  create(DeclarationSchema, {
    id: 'current-offer',
    verb: Verb.CAST,
    available: true,
    targetKind: TargetKind.MEMBER,
    minTargets: 1,
    maxTargets: 2,
    spell: create(SpellRefSchema, { name }),
    candidates: ['a', 'b', 'c'].map((member) =>
      create(TargetCandidateSchema, { member, available: true })
    ),
  });
const input = (
  selectedMembers: readonly string[] = []
): MemberTargetingInput => ({
  declaration: declaration(),
  selectedMembers,
  authorityFresh: true,
  turnAllowed: true,
});

describe('member targeting presentation', () => {
  it.each(['Bane', 'Bless', 'Unrecognised authored spell'])(
    'uses the same supplied membership/limits for %s',
    (name) => {
      const current = { ...input(), declaration: declaration(name) };
      expect(memberTargetingView(current).availableMembers).toEqual([
        'a',
        'b',
        'c',
      ]);
      expect(memberTargetingView(current).canConfirm).toBe(false);
      const first = toggleMemberTarget(current, 'a');
      expect(first.members).toEqual(['a']);
      const second = toggleMemberTarget(
        { ...current, selectedMembers: first.members },
        'b'
      );
      expect(second.members).toEqual(['a', 'b']);
      expect(
        memberTargetingView({ ...current, selectedMembers: second.members })
          .canConfirm
      ).toBe(true);
      expect(
        toggleMemberTarget({ ...current, selectedMembers: second.members }, 'c')
      ).toMatchObject({ changed: false, refusal: 'Target limit reached' });
      expect(
        toggleMemberTarget({ ...current, selectedMembers: second.members }, 'a')
          .members
      ).toEqual(['b']);
      expect(current.selectedMembers).toEqual([]);
    }
  );
  it('supports non-CAST multi-member shapes and zero supplied minimum without inventing a spell rule', () => {
    const ability = create(DeclarationSchema, {
      ...declaration(),
      verb: Verb.ACTIVATE,
      minTargets: 0,
      maxTargets: 3,
    });
    expect(isMultiMemberDeclaration(ability)).toBe(true);
    expect(
      memberTargetingView({ ...input(), declaration: ability }).canConfirm
    ).toBe(true);
    expect(
      memberTargetingView({ ...input(['a', 'b', 'c']), declaration: ability })
        .canConfirm
    ).toBe(true);
  });
  it('keeps ordinary scalar member attacks single-targeted', () => {
    const attack = create(DeclarationSchema, {
      ...declaration(),
      verb: Verb.ATTACK,
      minTargets: 0,
      maxTargets: 0,
    });
    expect(
      memberTargetingView({ ...input(), declaration: attack })
    ).toMatchObject({ multi: false, canChoose: true, canConfirm: false });
    expect(
      toggleMemberTarget({ ...input(), declaration: attack }, 'a').members
    ).toEqual(['a']);
  });
  it.each([{ authorityFresh: false }, { turnAllowed: false }])(
    'refuses additions/confirmation but permits local removal under %j',
    (state) => {
      const current = { ...input(['a']), ...state };
      expect(memberTargetingView(current).canConfirm).toBe(false);
      expect(memberTargetingView(current).availableMembers).toEqual([]);
      expect(toggleMemberTarget(current, 'b').changed).toBe(false);
      expect(toggleMemberTarget(current, 'a').members).toEqual([]);
    }
  );
  it('retains withdrawn/unavailable selection visibly but refuses confirmation or additions until removed', () => {
    const offer = declaration();
    offer.candidates = [
      create(TargetCandidateSchema, {
        member: 'a',
        available: false,
        why: create(ShortfallSchema, { text: 'No longer in reach' }),
      }),
      offer.candidates[1]!,
    ];
    const current = { ...input(['a', 'gone']), declaration: offer };
    const view = memberTargetingView(current);
    expect(view.selected.map((row) => row.member)).toEqual(['a', 'gone']);
    expect(view.selected.map((row) => row.reason)).toEqual([
      'No longer in reach',
      'No longer offered',
    ]);
    expect(view.canConfirm).toBe(false);
    expect(toggleMemberTarget(current, 'b').changed).toBe(false);
    expect(toggleMemberTarget(current, 'gone').members).toEqual(['a']);
  });
  it('refuses ambiguous candidates, duplicate selections, invalid bounds and missing declarations', () => {
    const offer = declaration();
    offer.candidates.push(offer.candidates[0]!);
    expect(
      memberTargetingView({ ...input(['a']), declaration: offer }).canConfirm
    ).toBe(false);
    expect(
      memberTargetingView({ ...input(), declaration: offer }).availableMembers
    ).not.toContain('a');
    expect(memberTargetingView(input(['a', 'a'])).canConfirm).toBe(false);
    expect(
      memberTargetingView({
        ...input(),
        declaration: create(DeclarationSchema, {
          ...declaration(),
          minTargets: 3,
          maxTargets: 2,
        }),
      }).canChoose
    ).toBe(false);
    expect(
      memberTargetingView({ ...input(['a']), declaration: undefined })
        .canConfirm
    ).toBe(false);
    expect(
      toggleMemberTarget({ ...input(['a']), declaration: undefined }, 'a')
        .members
    ).toEqual([]);
  });
  it('requires a current option identity when choices are supplied', () => {
    const offer = declaration();
    offer.options = [
      create(CastOptionSchema, { id: 'choice', label: 'Provider word' }),
    ];
    expect(
      memberTargetingView({ ...input(['a']), declaration: offer }).reason
    ).toBe('Choose a current cast option');
    expect(
      memberTargetingView({
        ...input(['a']),
        declaration: offer,
        optionId: 'old',
      }).canConfirm
    ).toBe(false);
    expect(
      memberTargetingView({
        ...input(['a']),
        declaration: offer,
        optionId: 'choice',
      }).canConfirm
    ).toBe(true);
  });
});
