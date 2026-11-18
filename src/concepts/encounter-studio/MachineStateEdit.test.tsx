/**
 * SET A MACHINE (rpg-project#996): a marked state's box opens Read back and
 * Edit; Edit sets the state's steps, each change one commit of the whole
 * definition; "List" opens a pop-up of the list's rows. The castle is held
 * in state, so a commit shows as the form re-reads it.
 */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { exportDraftYaml, readDraftYaml } from './draftFile';
import { castleMachinesReadBack } from './fixtures/engineReadBack';
import served from './fixtures/the-mad-king-served.yaml?raw';
import {
  definitionOf,
  setBehaviorDefinition,
  stepOf,
  tableRowsOf,
  transitionsOf,
  type Node,
} from './machineEdit';
import { STUDIO_ROOT } from './MachineStateEdit';
import { RevealProvider } from './reveal';
import { StudioBehaviours } from './StudioBehaviours';

afterEach(cleanup);

const GATE = 'gate-1-policy';

function studio() {
  const read = castleRead();
  const commits: Node[] = [];
  const commit = vi.fn((id: string, definition: Node) => {
    expect(id).toBe(GATE);
    commits.push(definition);
    return true;
  });
  let scopeNow = read.scope;
  function Harness() {
    const [scope, setScope] = useState(read.scope);
    scopeNow = scope;
    return (
      <StudioBehaviours
        document={{ draft: read.draft, scope }}
        readBack={{
          readBack: castleMachinesReadBack(),
          readBackIsCurrent: true,
          unavailable: null,
        }}
        focus={GATE}
        onSelect={vi.fn()}
        onCommitDefinition={(id, definition) => {
          const ok = commit(id, definition);
          setScope((was) => setBehaviorDefinition(was, id, definition));
          return ok;
        }}
      />
    );
  }
  render(
    <div className={STUDIO_ROOT} data-testid="studio-root">
      <RevealProvider>
        <Harness />
      </RevealProvider>
    </div>
  );
  return {
    commit,
    last: () => commits.at(-1)!,
    saved: () =>
      exportDraftYaml({ draft: read.draft, scope: scopeNow }, read.key),
  };
}

const markAlert = () =>
  fireEvent.click(
    within(
      screen.getByRole('group', { name: `The machine of ${GATE}` })
    ).getByRole('button', { name: /^State alert\b/ })
  );
const openEdit = () => {
  markAlert();
  fireEvent.click(screen.getByRole('tab', { name: 'Edit' }));
};

describe('a marked box opens Read back and Edit', () => {
  it('Read back is the default; Edit lists the state’s steps', () => {
    const { commit, saved } = studio();
    expect(screen.queryByRole('tab', { name: 'Edit' })).toBeNull();
    markAlert();
    expect(
      screen
        .getByRole('tab', { name: 'Read back' })
        .getAttribute('aria-selected')
    ).toBe('true');
    fireEvent.click(screen.getByRole('tab', { name: 'Edit' }));
    const steps = within(
      screen.getByRole('list', { name: 'Steps in alert' })
    ).getAllByRole('listitem');
    expect(steps.length).toBeGreaterThan(0);
    const barred = screen.getByLabelText<HTMLSelectElement>(
      'What fires alert step 4'
    );
    expect(barred.value).toBe('barred');
    expect(
      screen.getByLabelText<HTMLSelectElement>('Where alert step 4 goes').value
    ).toBe('challenged');
    expect(
      screen.getByLabelText<HTMLSelectElement>(
        'The list alert step 4 does one of'
      ).value
    ).toBe('barred');
    // Its anchor is kept and said as the engine says the step.
    expect(steps[3]!.textContent).toContain('Kept as written: its other acts');
    expect(steps[3]!.textContent).toContain('In the state `alert`');
    // Opening Edit and changing nothing commits nothing: the file is
    // byte-identical.
    expect(commit).not.toHaveBeenCalled();
    expect(saved()).toBe(served);
  });

  it('turn and approached are offered as beats', () => {
    studio();
    openEdit();
    const beats = Array.from(
      screen.getByLabelText<HTMLSelectElement>('What fires alert step 1')
        .options
    ).map((o) => o.value);
    expect(beats).toEqual(expect.arrayContaining(['turn', 'approached']));
  });
});

describe('each change is one commit', () => {
  it('changing where a step goes commits it once', () => {
    const { commit, last } = studio();
    openEdit();
    fireEvent.change(screen.getByLabelText('Where alert step 4 goes'), {
      target: { value: 'cowed' },
    });
    expect(commit).toHaveBeenCalledTimes(1);
    expect(stepOf(transitionsOf(last(), 'alert')[3]).to).toBe('cowed');
    expect(
      screen.getByLabelText<HTMLSelectElement>('Where alert step 4 goes').value
    ).toBe('cowed');
  });

  it('Add a step, Remove and Add a state each commit once', () => {
    const { commit, last } = studio();
    openEdit();
    const before = transitionsOf(
      definitionOf(castleScope(), GATE)!,
      'alert'
    ).length;
    fireEvent.click(screen.getByRole('button', { name: 'Add a step' }));
    expect(commit).toHaveBeenCalledTimes(1);
    expect(transitionsOf(last(), 'alert')).toHaveLength(before + 1);
    fireEvent.click(
      screen.getByRole('button', { name: `Remove alert step ${before + 1}` })
    );
    expect(commit).toHaveBeenCalledTimes(2);
    expect(transitionsOf(last(), 'alert')).toHaveLength(before);
    fireEvent.change(screen.getByLabelText('New state name'), {
      target: { value: 'resting' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add a state' }));
    expect(commit).toHaveBeenCalledTimes(3);
    expect(transitionsOf(last(), 'resting')).toEqual([]);
  });
});

describe('the List pop-up', () => {
  it('opens with the list’s rows; a change commits; Escape closes', () => {
    const { commit, last } = studio();
    openEdit();
    const list = screen.getByRole('button', {
      name: 'Open the list of alert step 3',
    });
    list.focus();
    fireEvent.click(list);
    const dialog = screen.getByRole('dialog', { name: 'approached' });
    expect(document.activeElement).toBe(dialog);
    // The studio's control styles are scoped under its root and the panel
    // class (`.encounter-studio button`, `.wb-panel input`): the pop-up is a
    // direct child of the root, above every pane, and its body and footer
    // are panels.
    const root = screen.getByTestId('studio-root');
    expect(dialog.closest(`.${STUDIO_ROOT}`)).toBe(root);
    expect(dialog.parentElement!.parentElement).toBe(root);
    expect(dialog.closest('.es-behaviours')).toBeNull();
    expect(dialog.querySelector('.es-dialog-body.wb-panel')).not.toBeNull();
    expect(dialog.querySelector('.es-dialog-footer.wb-panel')).not.toBeNull();
    const rows = within(dialog).getAllByRole('listitem');
    expect(rows.length).toBeGreaterThan(0);
    const count = rows.length;
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Add a row to approached' })
    );
    expect(commit).toHaveBeenCalledTimes(1);
    expect(tableRowsOf(last(), 'approached')).toHaveLength(count + 1);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Open the list of alert step 3' })
    );
  });

  it('a new list made in the pop-up is offered on the steps', () => {
    const { commit, last } = studio();
    openEdit();
    fireEvent.click(
      screen.getByRole('button', { name: 'Open the list of alert step 3' })
    );
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('New list name'), {
      target: { value: 'greet' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add a list' }));
    expect(commit).toHaveBeenCalledTimes(1);
    expect(tableRowsOf(last(), 'greet')).toEqual([]);
    expect(screen.getByRole('dialog', { name: 'greet' })).toBeTruthy();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    const picks = Array.from(
      screen.getByLabelText<HTMLSelectElement>(
        'The list alert step 1 does one of'
      ).options
    ).map((o) => o.value);
    expect(picks).toContain('greet');
  });
});

function castleRead() {
  const read = readDraftYaml(served);
  if (!read.ok) throw new Error(read.refusal);
  return read;
}

function castleScope() {
  return castleRead().scope;
}
