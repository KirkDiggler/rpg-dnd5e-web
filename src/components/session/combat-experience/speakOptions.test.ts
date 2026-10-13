import { create } from '@bufbuild/protobuf';
import {
  DeclarationSchema,
  ShortfallReason,
  SpeakOptionSchema,
  TargetKind,
  Verb,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { describe, expect, it } from 'vitest';
import {
  sameSpeakTarget,
  speakLine,
  speakLinesFor,
  speakTargetsOf,
} from './speakOptions';

const goblin = { case: 'memberId', value: 'goblin-2' } as const;
const cook = { case: 'memberId', value: 'cook-3' } as const;
const altar = { case: 'propId', value: 'altar-1' } as const;

function speakDeclaration() {
  return create(DeclarationSchema, {
    id: 'speak.1',
    verb: Verb.SPEAK,
    available: true,
    targetKind: TargetKind.MEMBER,
    speakOptions: [
      create(SpeakOptionSchema, {
        target: goblin,
        optionId: 'troupe',
        line: "We're the troupe for the feast.",
        available: true,
      }),
      create(SpeakOptionSchema, {
        target: goblin,
        optionId: 'kitchen-word',
        line: 'The cook sent us.',
        available: false,
      }),
      create(SpeakOptionSchema, {
        target: goblin,
        optionId: 'threat',
        line: 'Move, or be moved.',
        available: true,
      }),
      create(SpeakOptionSchema, {
        target: cook,
        optionId: 'gossip',
        line: 'Gated.',
        available: false,
        shortfall: ShortfallReason.NO_OPTION,
      }),
      create(SpeakOptionSchema, {
        target: altar,
        optionId: 'pray',
        line: 'Grant us passage.',
        available: true,
      }),
    ],
  });
}

describe('the target step', () => {
  it('lists each target with an available line once, in the order sent', () => {
    expect(speakTargetsOf(speakDeclaration())).toEqual([goblin, altar]);
  });

  it('omits a target whose every line is gated — there is nothing to say', () => {
    const targets = speakTargetsOf(speakDeclaration());
    expect(targets.some((target) => sameSpeakTarget(target, cook))).toBe(false);
  });
});

describe('the line step', () => {
  it('lists only the chosen target’s AVAILABLE lines', () => {
    const lines = speakLinesFor(speakDeclaration(), goblin).map(
      (option) => option.optionId
    );
    // `kitchen-word` is the goblin's too, and gated: not shown.
    expect(lines).toEqual(['troupe', 'threat']);
  });

  it('keeps a prop’s lines apart from a member’s with the same id', () => {
    const declaration = speakDeclaration();
    expect(
      speakLinesFor(declaration, { case: 'memberId', value: 'altar-1' })
    ).toEqual([]);
    expect(
      speakLinesFor(declaration, altar).map((option) => option.optionId)
    ).toEqual(['pray']);
  });

  it('finds the one row a click names, and refuses a gated one', () => {
    const declaration = speakDeclaration();
    expect(speakLine(declaration, goblin, 'troupe')?.line).toBe(
      "We're the troupe for the feast."
    );
    expect(speakLine(declaration, goblin, 'kitchen-word')).toBeUndefined();
    expect(speakLine(declaration, cook, 'troupe')).toBeUndefined();
  });
});
