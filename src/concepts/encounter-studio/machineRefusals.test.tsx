/**
 * A REFUSED STEP IS MARKED (rpg-project#1018): the engine reports a refused
 * step at `behaviorDefinitions.<id>.recipe.states.<S>.transitions[<k>]`,
 * deeper for one condition or act. The step's row in Edit, the condition
 * or act it names, and its arrow (a moving step) or box (a staying step)
 * are marked with the engine's sentence; the mark opens the row. A refusal
 * on the creature is not a step's.
 */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readDraftYaml } from './draftFile';
import {
  castleMachinesV228ReadBack,
  machineWordsV225,
} from './fixtures/engineReadBack';
import served from './fixtures/the-mad-king-served.yaml?raw';
import {
  definitionOf,
  setBehaviorDefinition,
  stepRefusalsOf,
  transitionsOf,
  withTransitions,
  type Node,
} from './machineEdit';
import { STUDIO_ROOT } from './MachineStateEdit';
import { RevealProvider } from './reveal';
import { StudioBehaviours } from './StudioBehaviours';

afterEach(cleanup);

const GATE = 'gate-1-policy';
const AT = `behaviorDefinitions.${GATE}.recipe.states`;
const NOWHERE = 'to "nowhere-at-all" is not a state of the recipe';

function studio(
  refusals: { path: string; message: string }[],
  words = true,
  edit?: (definition: Node) => Node
) {
  const read = readDraftYaml(served);
  if (!read.ok) throw new Error(read.refusal);
  if (edit)
    read.scope = setBehaviorDefinition(
      read.scope,
      GATE,
      edit(definitionOf(read.scope, GATE)!)
    );
  render(
    <div className={STUDIO_ROOT}>
      <RevealProvider>
        <StudioBehaviours
          document={{ draft: read.draft, scope: read.scope }}
          readBack={{
            readBack: castleMachinesV228ReadBack(),
            readBackIsCurrent: false,
            unavailable: null,
          }}
          focus={GATE}
          onSelect={vi.fn()}
          onCommitDefinition={vi.fn(() => true)}
          machineWords={words ? machineWordsV225() : null}
          refusals={refusals}
        />
      </RevealProvider>
    </div>
  );
}

const drawing = () =>
  screen.getByRole('group', { name: `The machine of ${GATE}` });
const arrowOf = (from: string, beat: string) =>
  drawing().querySelector<SVGGElement>(
    `g.es-machine-step[data-from~="${from}"][data-beat="${beat}"]`
  )!;
const boxOf = (state: string) =>
  drawing().querySelector<SVGGElement>(
    `g.es-machine-state[data-state="${state}"]`
  )!;
const openEdit = (state: string) => {
  fireEvent.click(
    within(drawing()).getByRole('button', {
      name: new RegExp(`^State ${state}\\b`),
    })
  );
  fireEvent.click(screen.getByRole('tab', { name: 'Edit' }));
};
const row = (state: string, index: number) =>
  screen
    .getByRole('list', { name: `Steps in ${state}` })
    .querySelector<HTMLLIElement>(`li[data-step="${index}"]`)!;

describe('which refusals are a step’s', () => {
  it('a step’s path, or deeper, of this routine only', () => {
    expect(
      stepRefusalsOf(
        [
          { path: `${AT}.alert.transitions[3]`, message: 'a' },
          { path: `${AT}.alert.transitions[4].when.rounds`, message: 'b' },
          { path: `${AT}.in-hall.transitions[12].do[1]`, message: 'c' },
          {
            path: 'room.room.monsterBindings.gate-1.behaviors[0].use',
            message: 'd',
          },
          {
            path: 'behaviorDefinitions.gate-2-policy.recipe.states.alert.transitions[0]',
            message: 'e',
          },
          { path: `behaviorDefinitions.${GATE}.table.post[0]`, message: 'f' },
        ],
        GATE
      )
    ).toEqual([
      { state: 'alert', index: 3, rest: '', message: 'a' },
      { state: 'alert', index: 4, rest: '.when.rounds', message: 'b' },
      { state: 'in-hall', index: 12, rest: '.do[1]', message: 'c' },
    ]);
  });
});

describe('a refused moving step', () => {
  it('marks its arrow with the sentence and a visible mark that opens its row', () => {
    studio([{ path: `${AT}.alert.transitions[3]`, message: NOWHERE }]);
    const arrow = arrowOf('alert', 'barred');
    expect(arrow.hasAttribute('data-refused')).toBe(true);
    expect(arrow.querySelector('title')!.textContent).toContain(
      `Refused: ${NOWHERE}`
    );
    expect(arrow.getAttribute('aria-description')).toContain(NOWHERE);
    expect(boxOf('alert').hasAttribute('data-refused')).toBe(false);
    const mark = within(drawing()).getByRole('button', {
      name: 'Refused step 4 in alert: open it in Edit',
    });
    expect(mark.textContent).toContain('refused');
    fireEvent.click(mark);
    expect(
      screen.getByRole('tab', { name: 'Edit' }).getAttribute('aria-selected')
    ).toBe('true');
    const li = row('alert', 3);
    expect(li.hasAttribute('data-refused')).toBe(true);
    expect(li.textContent).toContain(`Refused: ${NOWHERE}`);
    expect(row('alert', 4).hasAttribute('data-refused')).toBe(false);
  });
});

describe('a refused staying step', () => {
  it('marks its box', () => {
    // alert's `on: time` step with no condition stays and acts from post.
    studio([{ path: `${AT}.alert.transitions[5]`, message: 'no such list' }]);
    expect(boxOf('alert').hasAttribute('data-refused')).toBe(true);
    expect(boxOf('alert').querySelector('title')!.textContent).toContain(
      'Refused: no such list'
    );
    openEdit('alert');
    expect(row('alert', 5).textContent).toContain('Refused: no such list');
  });
});

describe('deeper: one condition or one act', () => {
  it('lands on the condition row and the act row', () => {
    studio([
      { path: `${AT}.alert.transitions[4].when.rounds`, message: 'bad rounds' },
      { path: `${AT}.alert.transitions[3].do[1]`, message: 'bad anchor' },
    ]);
    openEdit('alert');
    const condition = screen
      .getByLabelText('alert step 5 condition 1')
      .closest('li')!;
    expect(condition.hasAttribute('data-refused')).toBe(true);
    expect(condition.textContent).toContain('Refused: bad rounds');
    const act = within(
      screen.getByRole('list', { name: 'Acts of alert step 4' })
    ).getAllByRole('listitem')[0]!;
    expect(act.textContent).toContain('Refused: bad anchor');
    // Said once, where it points, not again on the step's own line.
    expect(row('alert', 3).textContent!.split('bad anchor')).toHaveLength(2);
  });

  it('without words every refusal is said on its step’s row', () => {
    studio(
      [
        {
          path: `${AT}.alert.transitions[4].when.rounds`,
          message: 'bad rounds',
        },
      ],
      false
    );
    openEdit('alert');
    expect(row('alert', 4).textContent).toContain('Refused: bad rounds');
  });
});

describe('a refusal on the creature', () => {
  it('marks no step', () => {
    studio([
      {
        path: 'room.room.monsterBindings.gate-1.behaviors[0].use',
        message: 'two picks on a step',
      },
    ]);
    expect(drawing().querySelector('[data-refused]')).toBeNull();
    expect(
      within(drawing()).queryByRole('button', { name: /^Refused step/ })
    ).toBeNull();
  });
});

describe('marked from an arrow', () => {
  it('Edit opens on its first step’s state at that step’s card, revealed', async () => {
    studio([]);
    // barred → challenged is drawn once, from posted and alert.
    const arrow = arrowOf('alert', 'barred');
    const first = arrow.getAttribute('data-from')!.split(' ')[0]!;
    fireEvent.click(arrow);
    fireEvent.click(screen.getByRole('tab', { name: 'Edit' }));
    expect(
      screen.getByRole('tabpanel', { name: `Edit ${first}` })
    ).toBeTruthy();
    await waitFor(() =>
      expect(
        screen
          .getByRole('list', { name: `Steps in ${first}` })
          .querySelector('li[data-revealed="true"] select')
      ).toBeTruthy()
    );
    const revealed = screen
      .getByRole('list', { name: `Steps in ${first}` })
      .querySelector<HTMLLIElement>('li[data-revealed="true"]')!;
    expect(
      within(revealed).getByLabelText<HTMLSelectElement>(/^What fires/).value
    ).toBe('barred');
  });
});

describe('the drawing is the last that compiled', () => {
  it('after an earlier step is removed, the refusal marks the box, not the arrow now at that index', () => {
    // alert without its first step: the current alert[3] is the time →
    // posted step, which the drawing has at alert[4]; the drawing's
    // alert[3] is barred → challenged.
    studio(
      [
        {
          path: `${AT}.alert.transitions[3].when.rounds`,
          message: 'bad rounds',
        },
      ],
      true,
      (d) => withTransitions(d, 'alert', transitionsOf(d, 'alert').slice(1))
    );
    expect(arrowOf('alert', 'barred').hasAttribute('data-refused')).toBe(false);
    expect(boxOf('alert').hasAttribute('data-refused')).toBe(true);
    expect(boxOf('alert').querySelector('title')!.textContent).toContain(
      'Refused: bad rounds'
    );
    openEdit('alert');
    expect(
      screen.getByLabelText('alert step 4 condition 1').closest('li')!
        .textContent
    ).toContain('Refused: bad rounds');
  });
});
