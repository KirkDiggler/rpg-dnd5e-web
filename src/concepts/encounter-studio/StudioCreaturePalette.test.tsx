import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { readDraftYaml } from './draftFile';
import { createFakeStudioSession } from './fixtures/fakeStudioSession';
import castleYaml from './fixtures/the-mad-king.yaml?raw';
import { StudioCreaturePalette } from './StudioCreaturePalette';

afterEach(cleanup);

it('offers the imported castle members their existing looks without writing defaults', () => {
  const read = readDraftYaml(castleYaml);
  if (!read.ok) throw new Error(read.refusal);
  const document = { draft: read.draft, scope: read.scope };
  const before = structuredClone(document);
  const session = { ...createFakeStudioSession(), document };
  render(
    <StudioCreaturePalette
      session={session}
      onPlace={() => true}
      onConfigure={vi.fn()}
    />
  );
  const members = within(screen.getByRole('list', { name: 'Cast' }));
  for (const name of [
    'Guard',
    'Guard Captain',
    'Commoner',
    'Knight',
    'Prisoner',
    'The Mad King',
  ]) {
    fireEvent.click(members.getByRole('button', { name }));
    expect(
      (
        screen.getByRole('button', {
          name: 'Place on map',
        }) as HTMLButtonElement
      ).disabled
    ).toBe(false);
    expect(
      (
        screen.getByLabelText(
          'Appearance for this placement'
        ) as HTMLSelectElement
      ).value
    ).not.toBe('');
  }
  expect(
    (
      screen.getByLabelText(
        'Appearance for this placement'
      ) as HTMLSelectElement
    ).value
  ).toBe('dnd5e:npcs:kingdom:prince-01');
  expect(document).toEqual(before);
});

it('does not invent a look for an unpictured template or replace an unavailable explicit default', () => {
  const read = readDraftYaml(castleYaml);
  if (!read.ok) throw new Error(read.refusal);
  read.draft.room.monsterDeclarations = [];
  const session = {
    ...createFakeStudioSession(),
    document: { draft: read.draft, scope: read.scope },
  };
  const view = render(
    <StudioCreaturePalette
      session={session}
      onPlace={() => true}
      onConfigure={vi.fn()}
    />
  );
  expect(
    (screen.getByRole('button', { name: 'Place on map' }) as HTMLButtonElement)
      .disabled
  ).toBe(true);
  read.draft.scene.creaturePalette = [
    {
      id: 'guard-look',
      ref: 'dnd5e:monsters:guard',
      name: 'Guard',
      modelRef: 'dnd5e:npcs:unpublished:missing',
    },
  ];
  view.rerender(
    <StudioCreaturePalette
      session={session}
      onPlace={() => true}
      onConfigure={vi.fn()}
    />
  );
  expect(
    (screen.getByRole('button', { name: 'Place on map' }) as HTMLButtonElement)
      .disabled
  ).toBe(true);
  expect(screen.getByRole('status').textContent).toContain('Model unavailable');
});
