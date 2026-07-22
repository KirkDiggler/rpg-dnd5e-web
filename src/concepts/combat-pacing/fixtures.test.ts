import { describe, expect, it } from 'vitest';
import { groupByCorrelation, SCENARIOS } from './fixtures';

describe('SCENARIOS (design.md §7 round-one cases)', () => {
  it('has exactly 8 round-one scenarios', () => {
    expect(SCENARIOS).toHaveLength(8);
  });

  it('every scenario has a unique id', () => {
    const ids = SCENARIOS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every scenario has at least one event with strictly increasing sequence numbers', () => {
    for (const s of SCENARIOS) {
      expect(s.events.length).toBeGreaterThan(0);
      for (let i = 1; i < s.events.length; i++) {
        expect(
          s.events[i].sequence,
          `${s.id}: sequence must strictly increase`
        ).toBeGreaterThan(s.events[i - 1].sequence);
      }
    }
  });

  it('player-hit resolves as a plain hit, no crit/nat-1', () => {
    const s = SCENARIOS.find((x) => x.id === 'player-hit')!;
    const attack = s.events.find((e) => e.case === 'attackResolved')!.value;
    expect(attack).toMatchObject({ hit: true, critical: false });
  });

  it('player-miss has no entityDamaged event (EntityDamaged fires hit-only)', () => {
    const s = SCENARIOS.find((x) => x.id === 'player-miss')!;
    expect(s.events.some((e) => e.case === 'entityDamaged')).toBe(false);
    const attack = s.events.find((e) => e.case === 'attackResolved')!.value;
    expect(attack).toMatchObject({ hit: false, critical: false });
  });

  it('player-crit carries critical: true', () => {
    const s = SCENARIOS.find((x) => x.id === 'player-crit')!;
    const attack = s.events.find((e) => e.case === 'attackResolved')!.value;
    expect(attack).toMatchObject({ hit: true, critical: true });
  });

  it('player-nat1 is attackRoll 1, a miss, not critical (design.md §1: nat-1 !== crit)', () => {
    const s = SCENARIOS.find((x) => x.id === 'player-nat1')!;
    const attack = s.events.find((e) => e.case === 'attackResolved')!.value;
    expect(attack).toMatchObject({
      attackRoll: 1,
      hit: false,
      critical: false,
    });
  });

  it('opportunity-attack has AttackResolved with NO ActionResolved (design.md §"What we know about the wire")', () => {
    const s = SCENARIOS.find((x) => x.id === 'opportunity-attack')!;
    expect(s.events.some((e) => e.case === 'actionResolved')).toBe(false);
    expect(s.events.some((e) => e.case === 'attackResolved')).toBe(true);
  });

  it('npc-grunt-swing is tiered Brisk (design.md §4: grunts get Brisk)', () => {
    const s = SCENARIOS.find((x) => x.id === 'npc-grunt-swing')!;
    expect(s.pace).toBe('brisk');
    expect(s.npcTier).toBe('grunt');
  });

  it("npc-boss-swing is tiered Cinematic and crits (design.md §4: boss crit lands like a player's)", () => {
    const s = SCENARIOS.find((x) => x.id === 'npc-boss-swing')!;
    expect(s.pace).toBe('cinematic');
    expect(s.npcTier).toBe('boss');
    const attack = s.events.find((e) => e.case === 'attackResolved')!.value;
    expect(attack.critical).toBe(true);
  });

  it('repeated-attacks has exactly 2 distinct correlation ids (design.md §4: compression after the first)', () => {
    const s = SCENARIOS.find((x) => x.id === 'repeated-attacks')!;
    const ids = new Set(s.events.map((e) => e.correlationId));
    expect(ids.size).toBe(2);
  });
});

describe('groupByCorrelation', () => {
  it('groups events by correlationId, preserving first-seen order', () => {
    const s = SCENARIOS.find((x) => x.id === 'repeated-attacks')!;
    const groups = groupByCorrelation(s.events);
    expect(groups).toHaveLength(2);
    expect(groups[0].correlationId).not.toBe(groups[1].correlationId);
  });

  it('collects action/attack/damage onto the same group by shared correlationId', () => {
    const s = SCENARIOS.find((x) => x.id === 'player-hit')!;
    const groups = groupByCorrelation(s.events);
    expect(groups).toHaveLength(1);
    expect(groups[0].action).toBeDefined();
    expect(groups[0].attack).toBeDefined();
    expect(groups[0].damage).toBeDefined();
  });

  it('a group with no ActionResolved still groups its AttackResolved (opportunity-attack)', () => {
    const s = SCENARIOS.find((x) => x.id === 'opportunity-attack')!;
    const groups = groupByCorrelation(s.events);
    expect(groups).toHaveLength(1);
    expect(groups[0].action).toBeUndefined();
    expect(groups[0].attack).toBeDefined();
  });
});
