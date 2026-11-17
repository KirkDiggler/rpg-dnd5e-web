/**
 * A BEHAVIOUR'S MACHINE FROM THE ENGINE'S SHAPE (rpg-project#995), over
 * the engine's own castle read-back at encounter v0.220.0, which says the
 * shape (rpg-project#994).
 */
import { describe, expect, it } from 'vitest';
import {
  castleMachinesReadBack,
  castleRoutinesReadBack,
} from './fixtures/engineReadBack';
import { layoutMachine, overlapsOf } from './machineLayout';
import { beatLabel, machineOf, stayLabel } from './machineView';

const gate = () => {
  const view = machineOf(castleMachinesReadBack(), 'gate-1-policy');
  if (!view) throw new Error('gate-1-policy has no machine');
  return view;
};
const state = (id: string) => gate().states.find((s) => s.id === id)!;

describe('machineOf', () => {
  it('the gate guard’s states, starting posted, each from its own statement', () => {
    const view = gate();
    expect(view.initial).toBe('posted');
    expect(view.states.map((s) => s.id)).toEqual(
      expect.arrayContaining([
        'posted',
        'alert',
        'challenged',
        'cowed',
        'turned',
      ])
    );
    expect(view.states.filter((s) => s.initial).map((s) => s.id)).toEqual([
      'posted',
    ]);
    expect(state('posted').statement.path).toBe(
      'behaviorDefinitions.gate-1-policy.recipe.states.posted'
    );
    // The castle's machines say no terminal state.
    expect(view.states.some((s) => s.final)).toBe(false);
  });

  it('a state the engine says is final is marked final', () => {
    const readBack = castleMachinesReadBack();
    const turned = readBack.sections
      .flatMap((s) => s.groups)
      .flatMap((g) => g.statements)
      .find(
        (st) =>
          st.path === 'behaviorDefinitions.gate-1-policy.recipe.states.turned'
      )!;
    turned.connects.push({ ...turned.connects[0]!, role: 'final' });
    const view = machineOf(readBack, 'gate-1-policy')!;
    expect(view.states.find((s) => s.id === 'turned')!.final).toBe(true);
    expect(view.states.find((s) => s.id === 'cowed')!.final).toBe(false);
  });

  it('a state no step leaves says so, apart from final', () => {
    const view = gate();
    // turned: every step from it stays; the castle does not make it final.
    expect(state('turned').noWayOut).toBe(true);
    expect(state('turned').final).toBe(false);
    expect(state('posted').noWayOut).toBe(false);
    expect(state('cowed').noWayOut).toBe(false);
    const layout = layoutMachine(view);
    const pills = (id: string) =>
      layout.boxes
        .find((b) => b.state.id === id)!
        .pills.map((pill) => pill.text);
    expect(pills('turned')).toContain('no way out');
    expect(pills('posted')).not.toContain('no way out');
  });

  it('a machine of one state does not say its only state has no way out', () => {
    const view = machineOf(castleMachinesReadBack(), 'hall-1-policy')!;
    expect(view.states.map((s) => s.id)).toEqual(['ready']);
    expect(view.states[0]!.noWayOut).toBe(false);
    expect(
      layoutMachine(view).boxes[0]!.pills.map((pill) => pill.text)
    ).toEqual(['starts here']);
  });

  it('a step that stays in place is not an edge: it is written in its state', () => {
    const view = gate();
    for (const edge of view.edges) {
      expect(edge.from).not.toContain(edge.to);
      for (const step of edge.steps) expect(step.to).toBe(edge.to);
    }
    expect(state('posted').stays.map(stayLabel)).toEqual(
      expect.arrayContaining([
        'on approached: picks approached',
        'on time: picks post',
      ])
    );
    expect(state('posted').stays.every((step) => step.to === null)).toBe(true);
    // alert's "3 rounds, nothing came of it" moves; its plain round stays.
    const alertTime = view.steps.filter(
      (step) => step.from === 'alert' && step.beat === 'time'
    );
    expect(alertTime.map((step) => step.to)).toEqual(
      expect.arrayContaining(['posted', null])
    );
  });

  it('a step several states share with one beat and one target is one edge', () => {
    const turned = gate().edges.filter((edge) => edge.to === 'turned');
    expect(turned).toHaveLength(1);
    expect(turned[0]!.from).toEqual(
      expect.arrayContaining(['posted', 'alert', 'challenged', 'cowed'])
    );
    expect(beatLabel(turned[0]!)).toBe('on fact: guards-turned');
    const heard = gate().edges.find((edge) => edge.beat === 'heard')!;
    expect(heard.from).toEqual(['posted']);
    expect(heard.to).toBe('alert');
  });

  it('posts and blocking hang on the states their `while` names', () => {
    const posted = state('posted');
    expect(posted.holds.map((h) => h.kind)).toEqual(
      expect.arrayContaining(['creature.post', 'creature.blocking'])
    );
    expect(posted.holds.every((h) => h.creature === 'gate-1')).toBe(true);
    expect(state('cowed').holds).toEqual([]);
  });

  it('a step that names its own state as `to` stays: written in the box, no arrow', () => {
    const readBack = castleMachinesReadBack();
    const plain = readBack.sections
      .flatMap((s) => s.groups)
      .flatMap((g) => g.statements)
      .find(
        (st) =>
          st.path ===
          'behaviorDefinitions.gate-1-policy.recipe.states.posted.transitions[4]'
      )!;
    plain.connects.push({ ...plain.connects[0]!, id: 'posted', role: 'to' });
    const view = machineOf(readBack, 'gate-1-policy')!;
    const step = view.steps.find((st) => st.statement === plain)!;
    expect(step.to).toBeNull();
    expect(
      view.states.find((s) => s.id === 'posted')!.stays.includes(step)
    ).toBe(true);
    expect(view.edges.some((edge) => edge.steps.includes(step))).toBe(false);
  });

  it('a step repeated under a hub is not a step of any machine', () => {
    // The engine repeats a wake under the fact it reads (`fact.ask`), its
    // shape connections kept and the fact as its subject; the repeat may
    // even sit in the routine's group. Neither changes the machine.
    const readBack = castleMachinesReadBack();
    const group = readBack.sections
      .flatMap((s) => s.groups)
      .find((g) => g.about?.id === 'gate-1-policy')!;
    const wake = group.statements.find(
      (st) =>
        st.path ===
        'behaviorDefinitions.gate-1-policy.recipe.states.posted.transitions[0]'
    )!;
    const repeat = (path: string) => ({
      ...wake,
      kind: 'fact.ask',
      path,
      about: { ...wake.about!, kind: 'fact', id: 'guards-turned' },
      connects: [
        ...wake.connects.filter((c) => c.role !== 'to'),
        { ...wake.connects[0]!, kind: 'state', id: 'nowhere', role: 'to' },
      ],
    });
    group.statements.push(repeat(wake.path));
    // A routine.wake set under another routine's definition is not this one's.
    group.statements.push({
      ...repeat(
        'behaviorDefinitions.captain-policy.recipe.states.ready.transitions[0]'
      ),
      kind: 'routine.wake',
      about: wake.about,
    });
    const view = machineOf(readBack, 'gate-1-policy');
    expect(view).not.toBeNull();
    expect(view!.steps.map((st) => st.statement.kind)).not.toContain(
      'fact.ask'
    );
    expect(
      view!.steps.some((st) => st.statement.path.includes('captain-policy'))
    ).toBe(false);
    expect(view!.edges.map((edge) => edge.to)).not.toContain('nowhere');
  });

  it('a read-back without the shape draws nothing', () => {
    // The engine as it is today: the routines with no shape connections.
    expect(machineOf(castleRoutinesReadBack(), 'gate-1-policy')).toBeNull();
    // A step to a state the routine does not say.
    const readBack = castleMachinesReadBack();
    const wake = readBack.sections
      .flatMap((s) => s.groups)
      .flatMap((g) => g.statements)
      .find(
        (st) =>
          st.about?.id === 'gate-1-policy' &&
          st.kind === 'routine.wake' &&
          st.connects.some((c) => c.role === 'to')
      )!;
    wake.connects.find((c) => c.role === 'to')!.id = 'nowhere';
    expect(machineOf(readBack, 'gate-1-policy')).toBeNull();
    // A routine the read-back does not have.
    expect(machineOf(castleMachinesReadBack(), 'no-such-policy')).toBeNull();
  });
});

describe('layoutMachine', () => {
  const routines = castleMachinesReadBack()
    .sections.flatMap((s) => s.groups)
    .filter((g) => g.about?.kind === 'routine')
    .map((g) => g.about!.id);

  it('every castle machine lays out with nothing overlapping, at the studio’s width', () => {
    expect(routines).toEqual(
      expect.arrayContaining([
        'gate-1-policy',
        'captain-policy',
        'reserve-1-policy',
      ])
    );
    for (const id of routines) {
      const view = machineOf(castleMachinesReadBack(), id);
      expect(view, id).not.toBeNull();
      const layout = layoutMachine(view!);
      expect(overlapsOf(layout), id).toEqual([]);
      expect(layout.width, id).toBeLessThanOrEqual(1100);
      // Every box is drawn, and every edge at least once.
      expect(layout.boxes.map((b) => b.state.id).sort(), id).toEqual(
        view!.states.map((s) => s.id).sort()
      );
      for (const edge of view!.edges)
        expect(
          layout.pieces.some((p) => p.edge === edge),
          `${id} ${edge.id}`
        ).toBe(true);
    }
  });

  it('the gate guard: the start and its loop on top, cowed and turned below', () => {
    const layout = layoutMachine(gate());
    const row = (id: string) =>
      layout.boxes.find((b) => b.state.id === id)!.row;
    expect([row('posted'), row('alert'), row('challenged')]).toEqual([0, 0, 0]);
    expect([row('cowed'), row('turned')]).toEqual([1, 1]);
    const x = (id: string) =>
      layout.boxes.find((b) => b.state.id === id)!.rect.x;
    expect(x('posted')).toBeLessThan(x('alert'));
    expect(x('cowed')).toBeLessThan(x('turned'));
  });

  it('the garrison turning is drawn once from a bracket over the top row', () => {
    const layout = layoutMachine(gate());
    const intoTurned = layout.pieces.filter((p) => p.to === 'turned');
    const bracketed = intoTurned.filter((p) => p.bracket !== null);
    expect(bracketed).toHaveLength(1);
    expect(bracketed[0]!.from).toEqual(['posted', 'alert', 'challenged']);
    expect(bracketed[0]!.caption?.full).toBe('from posted, alert, challenged');
    // cowed, on the lower row beside turned, has its own arrow.
    expect(
      intoTurned.filter((p) => p.bracket === null).map((p) => p.from)
    ).toEqual([['cowed']]);
  });
});
