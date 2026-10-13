// @vitest-environment node
import type { Event as SessionEvent } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/events_pb';
import {
  DamageType,
  DissolveKind,
  DoorState,
  PlacementKind,
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

  it('turnEnded returns null — driven by Story pacing, not a context-free string', () => {
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

describe('the hold-out beats on the beat line (rpg-project#375 §5)', () => {
  it('a fight that dissolved BY_STANCE is said differently from one a side lost', () => {
    const byStance = event({
      case: 'fightEnded',
      value: { cause: DissolveKind.BY_STANCE } as never,
    });
    const byDefeat = event({
      case: 'fightEnded',
      value: { cause: DissolveKind.BY_DEFEAT } as never,
    });
    expect(formatBeat(byStance, 'char-1', names)).toBe(
      'The fight dissolves — the sides are no longer hostile.'
    );
    expect(formatBeat(byDefeat, 'char-1', names)).toBe('The fight is over.');
  });

  it('narrates the stance and arrival beats through the one sentence module', () => {
    const stance = event({
      case: 'stanceChanged',
      value: { between: ['goblins', 'party'], stance: 'neutral' } as never,
    });
    expect(formatBeat(stance, 'char-1', names)).toBe(
      'The goblins and the party are no longer hostile.'
    );
    const arrival = event({
      case: 'arrived',
      value: {
        id: 'reinforcement-1',
        kind: PlacementKind.MONSTER,
        cell: { x: 1, y: 4 },
      } as never,
    });
    expect(formatBeat(arrival, 'char-1', names)).toBe(
      'The reinforcement 1 arrives at 1,4.'
    );
  });
});

// The one social check (rpg-project#569). The `spoke` beat is the ONLY account
// of this roll — `SpeakResponse` carries no beaten, total or dc — so the person
// who threw the die reads it off this line like everyone else, and both
// outcomes get one. The creature's reply is the separate `answered` beat.
describe('formatBeat — spoke and answered', () => {
  function spoke(fields: {
    actor: string;
    target?: { case: 'memberId' | 'propId'; value: string };
    line?: string;
    skill?: string;
    total?: number;
    dc?: number;
    beaten?: boolean;
    check?: false;
  }): SessionEvent {
    return event({
      case: 'spoke',
      value: {
        actor: fields.actor,
        target: fields.target ?? { case: 'memberId', value: 'skeleton-1' },
        optionId: 'troupe',
        line: fields.line ?? '',
        skill: fields.skill ?? 'performance',
        check:
          fields.check === false
            ? undefined
            : {
                dc: fields.dc ?? 13,
                total: fields.total ?? 17,
                beaten: fields.beaten ?? true,
              },
      } as never,
    });
  }

  function answered(fields: Record<string, unknown>): SessionEvent {
    return event({
      case: 'answered',
      value: {
        creature: 'skeleton-1',
        verb: 9,
        beaten: true,
        roll: 42,
        of: 100,
        entry: 0,
        word: 0,
        say: '',
        fact: '',
        ...fields,
      } as never,
    });
  }

  it('quotes the line, then the skill it rolled and the numbers', () => {
    expect(
      formatBeat(
        spoke({
          actor: 'char-1',
          line: "We're the troupe for the feast.",
          skill: 'performance',
          total: 17,
          dc: 13,
          beaten: true,
        }),
        'char-1',
        names
      )
    ).toBe(
      "You: “We're the troupe for the feast.” — Performance 17 vs DC 13. Success."
    );
  });

  it('a missed check is narrated too — the miss is as much fiction as the hit', () => {
    expect(
      formatBeat(
        spoke({
          actor: 'skeleton-1',
          line: 'Move.',
          skill: 'dnd5e:skills:intimidation',
          total: 4,
          dc: 9,
          beaten: false,
        }),
        'char-1',
        names
      )
    ).toBe('skeleton-1: “Move.” — Intimidation 4 vs DC 9. Failure.');
  });

  it('the reading is COPIED, never derived from total against dc', () => {
    // A server that says a 20 did not beat a DC 9 is telling this client
    // something it must not argue with — the law `Saved.succeeded` keeps.
    expect(
      formatBeat(
        spoke({
          actor: 'char-1',
          line: 'Hi.',
          total: 20,
          dc: 9,
          beaten: false,
        }),
        'char-1',
        names
      )
    ).toBe('You: “Hi.” — Performance 20 vs DC 9. Failure.');
  });

  it('names the target when the author wrote no line — it never invents one', () => {
    expect(
      formatBeat(
        spoke({
          actor: 'char-1',
          target: { case: 'propId', value: 'altar-1' },
          skill: 'religion',
          total: 12,
          dc: 12,
        }),
        'char-1',
        names
      )
    ).toBe('You speak to altar-1 — Religion 12 vs DC 12. Success.');
  });

  it('says nothing about what the creature does next', () => {
    // What the creature does about it is the `answered` beat's, rolled on the
    // option's own table — never a clause on the check.
    const line = formatBeat(
      spoke({ actor: 'char-1', line: 'Move.', skill: 'intimidation' }),
      'char-1',
      names
    );
    expect(line).not.toMatch(/flee|flees|runs|bolts|charge|frightened/i);
  });

  it('draws nothing for the retired checks', () => {
    // Speak replaced both (rpg-project#569); their bodies have no line here.
    expect(
      formatBeat(
        event({
          case: 'intimidated',
          value: { actor: 'char-1', target: 'skeleton-1' } as never,
        }),
        'char-1',
        names
      )
    ).toBeNull();
  });

  it("the answer quotes the author's line verbatim and adds one clause for FACT", () => {
    expect(
      formatBeat(
        answered({ word: 1, say: 'Fine! FINE.', fact: 'goblin-cowed' }),
        'char-1',
        names
      )
    ).toBe('skeleton-1: “Fine! FINE.” …and the party learned something.');
  });

  it('adds the other clause for FLEE', () => {
    expect(
      formatBeat(answered({ word: 2, say: 'Boss! BOSS!' }), 'char-1', names)
    ).toBe('skeleton-1: “Boss! BOSS!” …and bolts.');
  });

  it('adds NO clause for an entry that only speaks', () => {
    // An empty word is an answer, not a gap. Appending an outcome would
    // narrate a thing that did not happen.
    expect(
      formatBeat(answered({ word: 0, say: 'Big talk.' }), 'char-1', names)
    ).toBe('skeleton-1: “Big talk.”');
  });

  it('still names the creature when the author wrote it no line', () => {
    // `say` is legitimately empty and the beat still fired: somebody has to
    // be the subject of the sentence.
    expect(formatBeat(answered({ word: 2, say: '' }), 'char-1', names)).toBe(
      'skeleton-1 answers …and bolts.'
    );
  });

  it('keeps the die out of the line (R1)', () => {
    // The roll, the summed weights and the entry index are on the beat and
    // rendered in the debug log; this line is the fiction.
    const line = formatBeat(
      answered({ word: 2, say: 'Boss!', roll: 83, of: 100, entry: 1 }),
      'char-1',
      names
    );
    expect(line).not.toContain('83');
    expect(line).not.toContain('100');
  });
});
