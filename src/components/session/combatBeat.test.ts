import type { Event as SessionEvent } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/events_pb';
import {
  DamageType,
  DoorState,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { describe, expect, it } from 'vitest';
import { damageTypeWord, formatBeat } from './combatBeat';
import { participantNameMap } from './participantNames';

const names = participantNameMap([
  { member: 'char-1', name: 'Aldric' } as never,
  { member: 'skeleton-1', name: 'skeleton-1' } as never,
]);

function event(body: SessionEvent['body']): SessionEvent {
  return { body } as SessionEvent;
}

describe('damageTypeWord', () => {
  it('maps every named DamageType to its lowercase word', () => {
    expect(damageTypeWord(DamageType.SLASHING)).toBe('slashing');
    expect(damageTypeWord(DamageType.BLUDGEONING)).toBe('bludgeoning');
    expect(damageTypeWord(DamageType.NECROTIC)).toBe('necrotic');
  });

  it('empty string for unspecified/undefined — never a placeholder word', () => {
    expect(damageTypeWord(DamageType.UNSPECIFIED)).toBe('');
    expect(damageTypeWord(undefined)).toBe('');
  });
});

describe('formatBeat', () => {
  it('the local player\'s own hit — "You hit X — N vs AC M, D word." (design rpg-project#249 §1)', () => {
    const e = event({
      case: 'struck',
      value: {
        attacker: 'char-1',
        target: 'skeleton-1',
        roll: 14,
        total: 17,
        against: 13,
        damage: 6,
        attack: {
          ref: 'longsword',
          name: 'Longsword',
          damageType: DamageType.SLASHING,
        },
        critical: false,
      } as never,
    });
    expect(formatBeat(e, 'char-1', names)).toBe(
      'You hit skeleton-1 — 17 vs AC 13, 6 slashing.'
    );
  });

  it('someone else\'s hit uses third person and lowercase "you" for the target', () => {
    const e = event({
      case: 'struck',
      value: {
        attacker: 'skeleton-1',
        target: 'char-1',
        roll: 10,
        total: 12,
        against: 15,
        damage: 4,
        attack: { ref: 'claw', name: 'Claw', damageType: DamageType.SLASHING },
        critical: false,
      } as never,
    });
    expect(formatBeat(e, 'char-1', names)).toBe(
      'skeleton-1 hits you — 12 vs AC 15, 4 slashing.'
    );
  });

  it('a critical hit appends the callout', () => {
    const e = event({
      case: 'struck',
      value: {
        attacker: 'char-1',
        target: 'skeleton-1',
        roll: 20,
        total: 23,
        against: 13,
        damage: 12,
        attack: {
          ref: 'longsword',
          name: 'Longsword',
          damageType: DamageType.SLASHING,
        },
        critical: true,
      } as never,
    });
    expect(formatBeat(e, 'char-1', names)).toBe(
      'You hit skeleton-1 — 23 vs AC 13, 12 slashing. Critical hit!'
    );
  });

  it('no attack ref / unspecified damage type degrades to a bare number, never "N ."', () => {
    const e = event({
      case: 'struck',
      value: {
        attacker: 'char-1',
        target: 'skeleton-1',
        roll: 14,
        total: 17,
        against: 13,
        damage: 6,
        attack: undefined,
        critical: false,
      } as never,
    });
    expect(formatBeat(e, 'char-1', names)).toBe(
      'You hit skeleton-1 — 17 vs AC 13, 6.'
    );
  });

  it('a miss', () => {
    const e = event({
      case: 'missed',
      value: {
        attacker: 'char-1',
        target: 'skeleton-1',
        roll: 3,
        total: 5,
        against: 13,
      } as never,
    });
    expect(formatBeat(e, 'char-1', names)).toBe(
      'You miss skeleton-1 — 5 vs AC 13.'
    );
  });

  it('downed names who (rpg-toolkit#1137) — no anonymous placeholder', () => {
    const e = event({
      case: 'downed',
      value: { member: 'skeleton-1' } as never,
    });
    expect(formatBeat(e, 'char-1', names)).toBe('skeleton-1 is downed.');
  });

  it('fight started rosters everyone by name', () => {
    const e = event({
      case: 'fightStarted',
      value: { members: ['char-1', 'skeleton-1'] } as never,
    });
    expect(formatBeat(e, 'char-1', names)).toBe(
      'A fight begins: You, skeleton-1.'
    );
  });

  it('fight ended', () => {
    const e = event({ case: 'fightEnded', value: {} as never });
    expect(formatBeat(e, 'char-1', names)).toBe('The fight is over.');
  });

  it("turnEnded returns null — driven by useCombatPanel's own pacing, not a context-free string", () => {
    const e = event({
      case: 'turnEnded',
      value: { member: 'char-1', next: 'skeleton-1' } as never,
    });
    expect(formatBeat(e, 'char-1', names)).toBeNull();
  });

  it('moved returns null — never narrated on the single beat line', () => {
    const e = event({
      case: 'moved',
      value: { member: 'char-1', to: { x: 1, y: 0 } } as never,
    });
    expect(formatBeat(e, 'char-1', names)).toBeNull();
  });

  it('an unset body case returns null', () => {
    expect(formatBeat(event({ case: undefined }), 'char-1', names)).toBeNull();
  });
});

describe('formatBeat: the door and the end (rpg-project#268)', () => {
  it("a beaten lock — the attempt's author and numbers, then the door swings open", () => {
    expect(
      formatBeat(
        event({
          case: 'door',
          value: {
            door: 'hall-tomb',
            state: DoorState.OPEN,
            actor: 'char-1',
            dc: 12,
            total: 22,
            beaten: true,
          } as never,
        }),
        'char-2',
        names
      )
    ).toBe('Aldric picks the lock — 22 vs DC 12. The door swings open.');
  });

  it('a failed attempt is narrated too — the miss is as much fiction as the hit', () => {
    expect(
      formatBeat(
        event({
          case: 'door',
          value: {
            door: 'hall-tomb',
            state: DoorState.LOCKED,
            actor: 'char-1',
            dc: 12,
            total: 9,
            beaten: false,
          } as never,
        }),
        'char-2',
        names
      )
    ).toBe('Aldric tries the lock — 9 vs DC 12. It holds.');
  });

  it('a plain open names whose hands, no numbers — dc zero IS a plain open/close', () => {
    expect(
      formatBeat(
        event({
          case: 'door',
          value: {
            door: 'entrance-hall',
            state: DoorState.OPEN,
            actor: 'char-1',
            dc: 0,
            total: 0,
            beaten: false,
          } as never,
        }),
        'char-2',
        names
      )
    ).toBe('Aldric opens the door.');
  });

  it("the run's end is the log's plain record — the overlay owns the headline", () => {
    expect(
      formatBeat(
        event({ case: 'ended', value: { ending: 'boss-down' } as never }),
        'char-1',
        names
      )
    ).toBe('The encounter is over.');
  });
});
