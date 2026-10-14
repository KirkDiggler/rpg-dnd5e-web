import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  adoptCastMember,
  applyCastEdit,
  removeCastMember,
  removeUnusedLook,
  renameCastMember,
} from '../world-building/cast';
import type { RoomDraftDocument } from '../world-building/roomDraft';
import {
  createEmptyCastDocument,
  createGuardCastDocument,
  GUARD,
  placeCastMember,
} from './fixtures/castDocument';
import { createFakeStudioSession } from './fixtures/fakeStudioSession';
import { SKILL_IDS, StudioCast } from './StudioCast';
import type { EncounterStudioSession } from './studioSession';

vi.mock('@/compositions/CompositionThumbnailRenderer', () => ({
  ThumbnailRenderer: () => null,
}));

/** A stateful stand-in for the owner: each cast intent is one transaction
 * over the same pure edits the owner commits, recorded in history. */
function harness(initial: RoomDraftDocument) {
  const history: RoomDraftDocument[] = [initial];
  let ids = 0;
  const select = vi.fn(() => true);
  function Harness(): React.JSX.Element {
    const [document, setDocument] = useState(initial);
    const intent =
      <Args extends unknown[]>(
        edit: (current: RoomDraftDocument, ...args: Args) => RoomDraftDocument
      ) =>
      (...args: Args): boolean => {
        try {
          const next = edit(document, ...args);
          history.push(next);
          setDocument(next);
          return true;
        } catch {
          return false;
        }
      };
    const fake = createFakeStudioSession();
    const session: EncounterStudioSession = {
      ...fake,
      document,
      creatures: { ...fake.creatures, select },
      cast: {
        save: intent((current, edit) =>
          applyCastEdit(current, edit, () => `recipe-${(ids += 1)}`)
        ),
        rename: intent(renameCastMember),
        adopt: intent(adoptCastMember),
        remove: intent(removeCastMember),
        removeUnusedLook: intent(removeUnusedLook),
      },
    };
    return <StudioCast session={session} onShowPlacement={select} />;
  }
  render(<Harness />);
  return {
    history,
    select,
    latest: (): RoomDraftDocument => history[history.length - 1]!,
  };
}
const button = (name: string | RegExp): HTMLElement =>
  screen.getByRole('button', { name });
const member = (name: string): HTMLElement =>
  within(screen.getByRole('list', { name: 'Cast members' })).getByRole(
    'button',
    { name: new RegExp(`^${name} ·`) }
  );
const change = (label: string, value: string): void => {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
};

afterEach(cleanup);

describe('StudioCast', () => {
  it('lists each member with its source and placement count', () => {
    let document = placeCastMember(
      createGuardCastDocument(),
      'goblin-1',
      'dnd5e:monsters:goblin',
      2
    );
    document = placeCastMember(
      document,
      'goblin-2',
      'dnd5e:monsters:goblin',
      3
    );
    harness(document);
    expect(
      within(screen.getByRole('list', { name: 'Cast members' }))
        .getAllByRole('button')
        .map((node) => node.textContent)
    ).toEqual([
      'Guard · stat block · 2 placements',
      'Goblin · rulebook · 2 placements',
    ]);
  });

  it('a shadowing id warns and still saves', () => {
    const { latest } = harness(createEmptyCastDocument());
    fireEvent.click(button('Add a cast member'));
    change('Cast member id', 'goblin');
    expect(screen.getByRole('status').textContent).toBe(
      'This id also names a rulebook monster; the rulebook decides which is used.'
    );
    fireEvent.click(button('Apply'));
    expect(latest().scope.templates).toEqual({
      goblin: { base: 'dnd5e:monsters:human' },
    });
    expect(screen.getByRole('status').textContent).toContain(
      'the rulebook decides which is used'
    );
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('editing armor on a template member is one transaction that reaches both placements', () => {
    const { history, latest } = harness(createGuardCastDocument());
    fireEvent.click(member('Guard'));
    change('Armor', 'dnd5e:armor:chain-mail');
    change('STR', '14');
    expect(history).toHaveLength(1);
    fireEvent.click(button('Apply'));
    expect(history).toHaveLength(2);
    expect(latest().scope.templates?.guard).toEqual({
      base: 'dnd5e:monsters:human',
      name: 'Guard',
      armor: 'dnd5e:armor:chain-mail',
      abilities: { str: 14 },
    });
    // The placements follow the stat block by id; neither copies a field.
    expect(latest().draft.room.monsterDeclarations).toEqual(
      history[0]!.draft.room.monsterDeclarations
    );
    expect(
      latest().draft.room.monsterDeclarations.map((monster) => monster.ref)
    ).toEqual([GUARD, GUARD]);
  });

  it('a refusal shows at the form and keeps the staged values', () => {
    const { history } = harness(createGuardCastDocument());
    fireEvent.click(member('Guard'));
    change('Armor', 'chain mail');
    fireEvent.click(button('Apply'));
    expect(screen.getByRole('alert').textContent).toBe(
      'templates.guard.armor: must be a dnd5e:armor reference'
    );
    expect((screen.getByLabelText('Armor') as HTMLInputElement).value).toBe(
      'chain mail'
    );
    expect(history).toHaveLength(1);
    fireEvent.click(button('Cancel'));
    expect((screen.getByLabelText('Armor') as HTMLInputElement).value).toBe('');
  });

  it('an override on a rulebook member asks for an id and adopts it', () => {
    const { history, latest } = harness(
      placeCastMember(
        createEmptyCastDocument(),
        'goblin-1',
        'dnd5e:monsters:goblin',
        0
      )
    );
    fireEvent.click(member('Goblin'));
    expect(
      (screen.getByLabelText('Cast member id') as HTMLInputElement).readOnly
    ).toBe(true);
    expect(button('Give it a stat block')).toBeTruthy();
    change('STR', '12');
    expect(
      (screen.getByLabelText('Cast member id') as HTMLInputElement).readOnly
    ).toBe(false);
    fireEvent.click(button('Apply'));
    expect(screen.getByRole('alert').textContent).toBe(
      'An override gives Goblin its own stat block. Choose its id.'
    );
    expect(history).toHaveLength(1);
    change('Cast member id', 'raider');
    fireEvent.click(button('Apply'));
    expect(history).toHaveLength(2);
    expect(latest().scope.templates?.raider).toEqual({
      base: 'dnd5e:monsters:goblin',
      abilities: { str: 12 },
    });
    expect(latest().draft.room.monsterDeclarations[0]?.ref).toBe(
      'dnd5e:monsters:raider'
    );
    expect(member('Raider').getAttribute('aria-pressed')).toBe('true');
  });

  it('renaming the id rewrites the placements', () => {
    const { history, latest } = harness(createGuardCastDocument());
    fireEvent.click(member('Guard'));
    change('Cast member id', 'gate-guard');
    fireEvent.click(button('Apply'));
    expect(history).toHaveLength(2);
    expect(Object.keys(latest().scope.templates ?? {})).toEqual(['gate-guard']);
    expect(
      latest().draft.room.monsterDeclarations.map((monster) => monster.ref)
    ).toEqual(['dnd5e:monsters:gate-guard', 'dnd5e:monsters:gate-guard']);
    expect(latest().draft.scene.creaturePalette?.[0]?.ref).toBe(
      'dnd5e:monsters:gate-guard'
    );
    expect(
      (screen.getByLabelText('Cast member id') as HTMLInputElement).value
    ).toBe('gate-guard');
  });

  it('delete with placements shows the refusal naming them and changes nothing', () => {
    const { history } = harness(createGuardCastDocument());
    fireEvent.click(member('Guard'));
    fireEvent.click(button('Delete Guard'));
    expect(screen.getByRole('alert').textContent).toBe(
      'Guard has 2 placements: gate-1, gate-2. Remove them from the map or change their cast member first.'
    );
    expect(history).toHaveLength(1);
  });

  it('delete without placements removes the member', () => {
    const document = createGuardCastDocument();
    document.draft.room.monsterDeclarations = [];
    const { latest } = harness(document);
    fireEvent.click(member('Guard'));
    fireEvent.click(button('Delete Guard'));
    expect(latest().scope).not.toHaveProperty('templates');
    expect(latest().draft.scene).not.toHaveProperty('creaturePalette');
    expect(screen.queryByRole('list', { name: 'Cast members' })).toBeNull();
  });

  it('skills are picked from the eighteen skill ids', () => {
    const { latest } = harness(createGuardCastDocument());
    fireEvent.click(member('Guard'));
    const skills = screen.getByRole('group', { name: 'Skills' });
    expect(
      within(skills)
        .getAllByRole('checkbox')
        .map((box) => box.parentElement?.textContent)
    ).toEqual([...SKILL_IDS]);
    expect(SKILL_IDS).toHaveLength(18);
    fireEvent.click(within(skills).getByLabelText('stealth'));
    fireEvent.click(within(skills).getByLabelText('perception'));
    fireEvent.click(button('Apply'));
    expect(latest().scope.templates?.guard?.skills).toEqual([
      'perception',
      'stealth',
    ]);
  });

  it('the default look and faction write the recipe, never the template', () => {
    const { latest } = harness(createGuardCastDocument());
    fireEvent.click(member('Guard'));
    fireEvent.click(screen.getByRole('radio', { name: 'Peasant Male' }));
    change('Default faction', 'kitchen');
    fireEvent.click(button('Apply'));
    expect(latest().draft.scene.creaturePalette).toEqual([
      {
        id: 'guard-recipe',
        name: 'Guard',
        ref: GUARD,
        modelRef: 'dnd5e:npcs:kingdom:peasant-male-01',
        faction: 'kitchen',
      },
    ]);
    expect(latest().scope.templates?.guard).toEqual({
      base: 'dnd5e:monsters:human',
      name: 'Guard',
    });
  });

  it("a placement in the member's list selects it on the map", () => {
    const { select } = harness(createGuardCastDocument());
    fireEvent.click(member('Guard'));
    fireEvent.click(button('Select placement gate-2'));
    expect(select).toHaveBeenCalledWith('gate-2');
  });

  it('an unused look is listed and removable', () => {
    const document = createGuardCastDocument();
    document.draft.scene.creaturePalette = [
      ...document.draft.scene.creaturePalette!,
      {
        id: 'second',
        name: 'Guard in blue',
        ref: GUARD,
        modelRef: 'dnd5e:npcs:kingdom:peasant-male-01',
      },
    ];
    const { latest } = harness(document);
    fireEvent.click(member('Guard'));
    fireEvent.click(button('Remove unused look Guard in blue'));
    expect(
      latest().draft.scene.creaturePalette?.map((entry) => entry.id)
    ).toEqual(['guard-recipe']);
  });
});
