import type { WorldMaterialCatalogState } from '@/rendering/useWorldMaterialCatalog';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import {
  ROOM_DRAFT_STORAGE_KEY,
  stringifyRoomDraft,
} from '../world-building/roomDraft';
import { WorldBuildingConcept } from '../world-building/WorldBuildingConcept';
import { channelAppearanceFixture } from './appearance/appearanceChannelTestFixtures';
import { StudioArrangePanel } from './StudioArrangePanel';
import type {
  EncounterStudioSession,
  StudioArrangeIntent,
} from './studioSession';

// Real document/Arrange/history/storage, synthetic capability metadata, no WebGL proof.
const provider = vi.hoisted(() => ({
  current: null as WorldMaterialCatalogState | null,
}));
vi.mock('@/rendering/useWorldMaterialCatalog', () => ({
  useWorldMaterialCatalog: () => provider.current,
}));
vi.mock('@react-three/fiber', async (original) => ({
  ...(await original<typeof import('@react-three/fiber')>()),
  Canvas: () => null,
}));
vi.mock('@/compositions/CompositionThumbnailRenderer', () => ({
  ThumbnailRenderer: () => null,
}));
afterEach(cleanup);

function owner(kind: 'wall' | 'prop' | 'npc' = 'wall') {
  const { document, input } = channelAppearanceFixture(kind);
  provider.current = {
    status: 'ready',
    message: 'Synthetic capabilities',
    catalog: input.catalog,
  };
  const bytes = new Map([
    [
      ROOM_DRAFT_STORAGE_KEY,
      stringifyRoomDraft(document.draft, document.scope),
    ],
  ]);
  const storage = {
    getItem: (key: string) => bytes.get(key) ?? null,
    setItem: vi.fn((key: string, value: string) => {
      bytes.set(key, value);
    }),
  };
  let session: EncounterStudioSession;
  const calls: StudioArrangeIntent[] = [];
  const view = () => (
    <WorldBuildingConcept
      roomMode
      storage={storage}
      studioPresentation={{
        view: '3d',
        render: (next) => {
          session = next;
          return (
            <StudioArrangePanel
              expanded
              session={{
                ...next,
                commitArrange: (intent) => {
                  calls.push(intent);
                  return next.commitArrange(intent);
                },
              }}
            />
          );
        },
      }}
    />
  );
  const mounted = render(view());
  const select = () =>
    act(() => {
      if (kind === 'wall') session.wallEditing.select('studio-wall');
      else if (kind === 'prop')
        session.viewportProps.onSelect(['studio-decoration']);
      else
        session.viewportProps.roomAuthoring!.onSelectActorTarget!({
          kind: 'actor',
          id: 'goblin-1',
        });
    });
  select();
  return {
    select,
    get session() {
      return session!;
    },
    calls,
    writes: () =>
      storage.setItem.mock.calls.filter(
        ([key]) => key === ROOM_DRAFT_STORAGE_KEY
      ).length,
    refresh: () => mounted.rerender(view()),
    channels: () =>
      kind === 'wall'
        ? session.document.draft.room.walls![0].appearance.materialChannels
        : kind === 'prop'
          ? session.document.draft.scene.items.find(
              (item) => item.id === 'studio-decoration'
            )!.materialChannels
          : session.document.draft.room.monsterDeclarations[0].materialChannels,
  };
}
const changeMode = (mode: string) =>
  fireEvent.change(
    screen.getByRole('combobox', { name: 'Body · Normal mode' }),
    { target: { value: mode } }
  );
const apply = () =>
  fireEvent.submit(screen.getByRole('form', { name: 'Arrange selected noun' }));

it.each(['wall', 'prop', 'npc'] as const)(
  'commits %s channel intent as one existing history transaction, with exact Undo/Redo and Cancel',
  (kind) => {
    const joined = owner(kind);
    const before = structuredClone(joined.session.document);
    const writes = joined.writes();
    changeMode('scale');
    expect(joined.session.document).toEqual(before);
    expect(joined.writes()).toBe(writes);
    apply();
    expect(joined.channels()).toEqual([
      { targetId: 'body', normal: { mode: 'scale', multiplier: 1 } },
    ]);
    expect(joined.writes()).toBe(writes + 1);
    const after = structuredClone(joined.session.document);
    act(() => joined.session.undo());
    expect(joined.session.document).toEqual(before);
    act(() => joined.session.redo());
    expect(joined.session.document).toEqual(after);
    joined.select();
    changeMode('off');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(joined.session.document).toEqual(after);
  }
);

it('refuses a staged strength made unsupported by fresh provider metadata before history is touched', () => {
  const joined = owner();
  changeMode('scale');
  fireEvent.change(
    screen.getByRole('slider', { name: 'Body · Normal strength' }),
    { target: { value: '1.5' } }
  );
  const before = joined.session.document;
  const writes = joined.writes();
  const catalog = provider.current!.catalog!;
  provider.current = {
    ...provider.current!,
    catalog: {
      ...catalog,
      channelBindings: catalog.channelBindings!.map((binding) => ({
        ...binding,
        targets: binding.targets.map((target) => ({
          ...target,
          normal: {
            kind: 'adjustable' as const,
            minMultiplier: 0.5,
            maxMultiplier: 1,
          },
        })),
      })),
    },
  };
  joined.refresh();
  apply();
  expect(joined.session.document).toBe(before);
  expect(joined.writes()).toBe(writes);
  expect(joined.calls).toHaveLength(0);
});
