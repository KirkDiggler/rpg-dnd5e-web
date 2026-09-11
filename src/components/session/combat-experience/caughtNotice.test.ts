import { create } from '@bufbuild/protobuf';
import {
  CaughtMemberSchema,
  MemberKind,
  UnresolvedReason,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { describe, expect, it } from 'vitest';
import { caughtNotice } from './caughtNotice';

const merchant = create(CaughtMemberSchema, {
  member: 'demo-merchant-1',
  kind: MemberKind.WORLD,
  reason: UnresolvedReason.NO_SHEET,
});

describe('caughtNotice', () => {
  it('is null when a cast caught nobody it could not handle', () => {
    // The ordinary case, and the reason this is nullable rather than an empty
    // string: most casts have nothing to say here and should say nothing.
    expect(caughtNotice([])).toBeNull();
  });

  it('names who was caught rather than counting them', () => {
    const notice = caughtNotice([merchant]);

    // "1 creature was unaffected" tells a player nothing they can act on. The
    // whole value is being able to point at the merchant.
    expect(notice).toContain('demo-merchant-1');
    expect(notice).toContain('nothing here models what that does to them yet');
  });

  it('lists every one of them', () => {
    const second = create(CaughtMemberSchema, {
      member: 'demo-merchant-2',
      kind: MemberKind.WORLD,
      reason: UnresolvedReason.NO_SHEET,
    });

    const notice = caughtNotice([merchant, second]);
    expect(notice).toContain('demo-merchant-1');
    expect(notice).toContain('demo-merchant-2');
  });
});
