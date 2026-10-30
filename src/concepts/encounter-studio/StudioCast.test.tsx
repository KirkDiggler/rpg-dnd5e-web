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
  shuffleCastLooks,
} from '../world-building/cast';
import type { RoomDraftDocument } from '../world-building/roomDraft';
import { projectStudioArrange } from '../world-building/studioArrange';
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
 * over the same pure edits the owner commits, recorded in history, and the
 * edited member becomes the one selection, as the owner does. */
function harness(initial: RoomDraftDocument, advanced = true) {
  const history: RoomDraftDocument[] = [initial];
  let ids = 0;
  const select = vi.fn(() => true);
  function Harness(): React.JSX.Element {
    const [document, setDocument] = useState(initial);
    const [target, setTarget] = useState<string | null>(null);
    const intent =
      <Args extends unknown[]>(
        edit: (current: RoomDraftDocument, ...args: Args) => RoomDraftDocument,
        follows?: (...args: Args) => string
      ) =>
      (...args: Args): boolean => {
        try {
          const next = edit(document, ...args);
          history.push(next);
          setDocument(next);
          const ref = follows?.(...args);
          if (ref !== undefined) setTarget(ref);
          return true;
        } catch {
          return false;
        }
      };
    const fake = createFakeStudioSession();
    const session: EncounterStudioSession = {
      ...fake,
      document,
      arrange: target
        ? projectStudioArrange({
            draft: document.draft,
            scope: document.scope,
            target: { kind: 'cast', ref: target },
            selectionRevision: 1,
          })
        : null,
      creatures: { ...fake.creatures, select },
      cast: {
        save: intent(
          (current, edit) =>
            applyCastEdit(current, edit, () => `recipe-${(ids += 1)}`),
          (edit) =>
            edit.id === undefined ? edit.ref : `dnd5e:monsters:${edit.id}`
        ),
        rename: intent(renameCastMember),
        adopt: intent(adoptCastMember),
        remove: intent(removeCastMember),
        removeUnusedLook: intent(removeUnusedLook),
        shuffle: intent((current, ref: string) =>
          shuffleCastLooks(current, ref, () => 0.5)
        ),
        select: (ref) => {
          setTarget(ref);
          return true;
        },
      },
    };
    return <StudioCast session={session} onShowPlacement={select} />;
  }
  render(<Harness />);
  if (advanced)
    fireEvent.click(screen.getByRole('button', { name: 'Advanced editor' }));
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
  it('adds a named zombie to the cast and changes only its appearance to human', () => {
    const { latest } = harness(createEmptyCastDocument(), false);
    fireEvent.click(button('Add monster'));
    change('Monster', 'dnd5e:monsters:zombie');
    change('Cast name', 'Quiet villager');
    fireEvent.click(button('Add to cast'));
    expect(latest().scope.templates).toBeUndefined();
    expect(latest().draft.scene.creaturePalette).toEqual([
      { id: 'recipe-1', name: 'Quiet villager', ref: 'dnd5e:monsters:zombie' },
    ]);
    fireEvent.click(button('Change appearance'));
    expect(screen.getByRole('radio', { name: 'King 01' })).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: 'Peasant Male' }));
    fireEvent.click(button('Apply appearance'));
    expect(latest().draft.scene.creaturePalette?.[0]).toMatchObject({
      ref: 'dnd5e:monsters:zombie',
      modelRef: 'dnd5e:npcs:kingdom:peasant-male-01',
      name: 'Quiet villager',
    });
    expect(latest().scope.templates).toBeUndefined();
    fireEvent.click(button('Use standard monster look'));
    fireEvent.click(button('Apply appearance'));
    expect(latest().draft.scene.creaturePalette?.[0]).not.toHaveProperty(
      'modelRef'
    );
  });

  it('editing a template appearance preserves its hidden default name and all rules', () => {
    const document = createGuardCastDocument();
    document.draft.scene.creaturePalette![0]!.name = 'Gate sentry';
    const { latest } = harness(document, false);
    fireEvent.click(member('Guard'));
    fireEvent.click(button('Change appearance'));
    fireEvent.click(screen.getByRole('radio', { name: 'Peasant Male' }));
    fireEvent.click(button('Apply appearance'));
    expect(latest().draft.scene.creaturePalette?.[0]?.name).toBe('Gate sentry');
    expect(latest().scope).toEqual(document.scope);
    expect(latest().draft.room).toEqual(document.draft.room);
  });

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

  it("a selected placement presses its member's row", () => {
    const document = placeCastMember(
      createGuardCastDocument(),
      'goblin-1',
      'dnd5e:monsters:goblin',
      2
    );
    const fake = createFakeStudioSession();
    render(
      <StudioCast
        session={{
          ...fake,
          document,
          arrange: projectStudioArrange({
            draft: document.draft,
            target: { kind: 'actor', id: 'gate-2' },
            selectionRevision: 1,
          }),
        }}
      />
    );
    expect(member('Guard').getAttribute('aria-pressed')).toBe('true');
    expect(member('Goblin').getAttribute('aria-pressed')).toBe('false');
    // Pressing a row is the member's selection, never a placement's.
    expect(screen.queryByRole('form')).toBeNull();
  });

  it('Shuffle looks gives two placements different looks from the default family in one transaction', () => {
    const { history, latest } = harness(createGuardCastDocument());
    fireEvent.click(member('Guard'));
    fireEvent.click(button('Shuffle looks'));
    expect(history).toHaveLength(2);
    const looks = latest().draft.room.monsterDeclarations.map(
      (monster) => monster.appearanceRef
    );
    expect(new Set(looks).size).toBe(2);
    for (const look of looks)
      expect(look).toMatch(/^dnd5e:npcs:kingdom:soldier-male-01/);
  });

  it('a member without a default look refuses the shuffle at the form', () => {
    const { history } = harness(
      placeCastMember(
        createEmptyCastDocument(),
        'goblin-1',
        'dnd5e:monsters:goblin',
        0
      )
    );
    fireEvent.click(member('Goblin'));
    fireEvent.click(button('Shuffle looks'));
    expect(screen.getByRole('alert').textContent).toBe(
      'Goblin has no default look. Choose one in the cast.'
    );
    expect(history).toHaveLength(1);
  });

  it('a new id that bare placements already use names the placements that will follow it', () => {
    let document = placeCastMember(
      createEmptyCastDocument(),
      'goblin-1',
      'dnd5e:monsters:goblin',
      0
    );
    document = placeCastMember(
      document,
      'goblin-2',
      'dnd5e:monsters:goblin',
      1
    );
    document = placeCastMember(
      document,
      'goblin-3',
      'dnd5e:monsters:goblin',
      2
    );
    const { latest } = harness(document);
    fireEvent.click(button('Add a cast member'));
    change('Cast member id', 'goblin');
    expect(screen.getByRole('status').textContent).toBe(
      'goblin-1 and 2 others are placed as the rulebook Goblin and will follow this stat block.'
    );
    fireEvent.click(button('Apply'));
    expect(latest().scope.templates?.goblin).toEqual({
      base: 'dnd5e:monsters:human',
    });
    expect(member('Goblin').textContent).toBe(
      'Goblin · stat block · 3 placements'
    );
  });

  it('one bare placement is named alone', () => {
    harness(
      placeCastMember(
        createEmptyCastDocument(),
        'goblin-1',
        'dnd5e:monsters:goblin',
        0
      )
    );
    fireEvent.click(button('Add a cast member'));
    change('Cast member id', 'goblin');
    expect(screen.getByRole('status').textContent).toBe(
      'goblin-1 is placed as the rulebook Goblin and will follow this stat block.'
    );
  });

  it('a rulebook id with no placements keeps the generic shadow warning', () => {
    harness(
      placeCastMember(
        createEmptyCastDocument(),
        'goblin-1',
        'dnd5e:monsters:goblin',
        0
      )
    );
    fireEvent.click(button('Add a cast member'));
    change('Cast member id', 'skeleton');
    expect(screen.getByRole('status').textContent).toBe(
      'This id also names a rulebook monster; the rulebook decides which is used.'
    );
  });
});

describe('Add action and Drop action (rpg-project#721)', () => {
  const JAVELIN = 'dnd5e:weapons:javelin';
  const addRef = (kind: 'added' | 'dropped', ref: string): void => {
    fireEvent.change(screen.getByLabelText(`New ${kind} action reference`), {
      target: { value: ref },
    });
    const title = kind === 'added' ? 'Add action' : 'Drop action';
    fireEvent.click(
      within(
        screen.getByTestId(
          `action-refs-${kind === 'added' ? 'addActions' : 'dropActions'}`
        )
      ).getByRole('button', { name: title })
    );
  };

  it('stages both ordered lists and applies them with the other fields in one transaction', () => {
    const { history, latest } = harness(createGuardCastDocument());
    fireEvent.click(member('Guard'));
    change('Armor', 'dnd5e:armor:chain-mail');
    addRef('added', 'dnd5e:weapons:dagger');
    addRef('added', JAVELIN);
    addRef('dropped', 'dnd5e:weapons:spear');
    fireEvent.click(button(`Move added action ${JAVELIN} earlier`));
    expect(history).toHaveLength(1);
    fireEvent.click(button('Apply'));
    expect(history).toHaveLength(2);
    expect(latest().scope.templates?.guard).toMatchObject({
      armor: 'dnd5e:armor:chain-mail',
      addActions: [JAVELIN, 'dnd5e:weapons:dagger'],
      dropActions: ['dnd5e:weapons:spear'],
    });
  });

  it('refuses a ref the engine grammar refuses, in its words, at the field', () => {
    const { history } = harness(createGuardCastDocument());
    fireEvent.click(member('Guard'));
    fireEvent.change(screen.getByLabelText('New added action reference'), {
      target: { value: 'dnd5e:spells:fire-bolt' },
    });
    expect(screen.getByRole('alert').textContent).toBe(
      '"dnd5e:spells:fire-bolt" is not a weapon: an action names a weapon as dnd5e:weapons:<id>'
    );
    expect(
      (
        within(screen.getByTestId('action-refs-addActions')).getByRole(
          'button',
          { name: 'Add action' }
        ) as HTMLButtonElement
      ).disabled
    ).toBe(true);
    expect(history).toHaveLength(1);
  });

  it('Apply refuses while a typed ref is not added, at that field; Cancel clears it', () => {
    const { history } = harness(createGuardCastDocument());
    fireEvent.click(member('Guard'));
    change('Armor', 'dnd5e:armor:chain-mail');
    const field = screen.getByLabelText(
      'New dropped action reference'
    ) as HTMLInputElement;
    fireEvent.change(field, { target: { value: 'dnd5e:weapons:spear' } });
    fireEvent.click(button('Apply'));
    expect(history).toHaveLength(1);
    expect(screen.getByRole('alert').textContent).toBe(
      'Drop action holds “dnd5e:weapons:spear”, which is not added. Add it or clear the field before Apply.'
    );
    expect(field.getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(field);
    fireEvent.click(button('Cancel'));
    expect(
      (
        screen.getByLabelText(
          'New dropped action reference'
        ) as HTMLInputElement
      ).value
    ).toBe('');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it("authors the castle captain's javelin through the form and the file says it", async () => {
    const { readFileSync } = await import('node:fs');
    const { readDraftYaml, exportDraftYaml } = await import('./draftFile');
    const { parse } = await import('yaml');
    const read = readDraftYaml(
      readFileSync(
        'src/concepts/encounter-studio/fixtures/the-mad-king.yaml',
        'utf8'
      )
    );
    if (!read.ok) throw new Error(read.refusal);
    const { latest } = harness({ draft: read.draft, scope: read.scope });
    fireEvent.click(member('Guard Captain'));
    addRef('added', JAVELIN);
    fireEvent.click(button('Apply'));
    const file = parse(exportDraftYaml(latest(), read.key)) as {
      templates: Record<string, Record<string, unknown>>;
    };
    expect(file.templates['guard-captain']).toMatchObject({
      actions: ['dnd5e:weapons:longsword', JAVELIN],
      addActions: [JAVELIN],
    });
    // Removing it through the form writes the castle's own template back.
    fireEvent.click(member('Guard Captain'));
    fireEvent.click(button(`Remove added action ${JAVELIN}`));
    fireEvent.click(button('Apply'));
    expect(latest().scope.templates?.['guard-captain']).toEqual(
      read.scope.templates?.['guard-captain']
    );
  });
});
