import { create } from '@bufbuild/protobuf';
import { ListSpellsByLevelResponseSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { renderHook, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { characterClient } from './client';
import { useSpellCatalog } from './useSpellCatalog';
vi.mock('./client', () => ({
  characterClient: { listSpellsByLevel: vi.fn() },
}));
it('joins the shared catalog by canonical ref and preserves true and false status', async () => {
  vi.mocked(characterClient.listSpellsByLevel).mockImplementation(
    async (request) =>
      create(ListSpellsByLevelResponseSchema, {
        spells:
          request.level === 0
            ? [
                {
                  spellRef: 'dnd5e:spells:light',
                  name: 'Light',
                  notYetImplemented: true,
                },
              ]
            : [
                {
                  spellRef: 'dnd5e:spells:command',
                  name: 'Command',
                  level: 1,
                  notYetImplemented: false,
                },
              ],
      })
  );
  const first = renderHook(() => useSpellCatalog());
  const second = renderHook(() => useSpellCatalog());
  await waitFor(() => expect(first.result.current.size).toBe(2));
  await waitFor(() => expect(second.result.current.size).toBe(2));
  expect(
    first.result.current.get('dnd5e:spells:light')?.notYetImplemented
  ).toBe(true);
  expect(
    first.result.current.get('dnd5e:spells:command')?.notYetImplemented
  ).toBe(false);
  expect(characterClient.listSpellsByLevel).toHaveBeenCalledTimes(2);
});
