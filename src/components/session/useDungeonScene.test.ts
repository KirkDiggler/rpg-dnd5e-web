/**
 * useDungeonScene — the play view's read of the room it is playing in.
 *
 * The four answers this hook may give, and the one it may never give:
 * a room, no room because there is no key, no room because the dungeon
 * is authored in the other dialect, and a NAMED refusal. What it may
 * never do is answer "no room" for a room it failed to read — that is
 * the failure that would look like a rendering bug forever.
 */
import type { AuthoringClient } from '@/author/authoringRpc';
import { createRoomDraft } from '@/concepts/world-building/roomDraft';
import { createEmptyScene } from '@/concepts/world-building/sceneState';
import { encodeSingleRoomDungeon } from '@/concepts/world-building/singleRoomDungeon';
import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useDungeonScene } from './useDungeonScene';

/** The authored workshop room, exactly as the World Builder publishes
 * it and the registry hands it back. */
function workshopYaml() {
  const draft = createRoomDraft(createEmptyScene('scene-1'), 'workshop');
  draft.name = 'Workshop';
  draft.scene.name = 'Workshop';
  draft.scene.items.push({
    id: 'table',
    kind: 'prop',
    assetRef: 'dnd5e:props:torture-table',
    label: 'Table',
    transform: { x: -2.25, y: 0, z: 1.3, rotationY: 0.37 },
    heightScale: 1.5,
  });
  return {
    draft,
    yaml: encodeSingleRoomDungeon({ key: 'room-workshop', draft }),
  };
}

/** A dungeonspec document — the dialect every shipped reference dungeon
 * and the front room are authored in. It has no authored room scene. */
const FRONT_ROOM_YAML = [
  'version: 2',
  'key: front-room',
  'orientation: pointy',
  'regions:',
  '  - id: front',
  '    cells: [{ q: 0, r: 0 }]',
].join('\n');

function clientReturning(yaml: string): AuthoringClient {
  return {
    getDungeon: vi.fn(async () => ({ yaml })),
  } as unknown as AuthoringClient;
}

describe('useDungeonScene', () => {
  it('reads the room out of the file the key names', async () => {
    const { draft, yaml } = workshopYaml();
    const client = clientReturning(yaml);
    const { result } = renderHook(() =>
      useDungeonScene('room-workshop', client)
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(client.getDungeon).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'room-workshop' })
    );
    expect(result.current.error).toBeNull();
    expect(result.current.presentation).toEqual({
      coordinateFrame: draft.coordinateFrame,
      workspace: draft.workspace,
      scene: draft.scene,
    });
  });

  it('asks for nothing when the session carries no dungeon key', () => {
    const client = clientReturning(workshopYaml().yaml);
    const { result } = renderHook(() => useDungeonScene('', client));

    expect(client.getDungeon).not.toHaveBeenCalled();
    expect(result.current).toEqual({
      presentation: null,
      loading: false,
      error: null,
    });
  });

  it('answers a dungeonspec dungeon with no room and no refusal', async () => {
    const client = clientReturning(FRONT_ROOM_YAML);
    const { result } = renderHook(() => useDungeonScene('front-room', client));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.presentation).toBeNull();
    // Not a failure: this dungeon genuinely has no authored room, and
    // the legacy atlas route draws it exactly as it always did.
    expect(result.current.error).toBeNull();
  });

  it('names a single-room file it cannot read whole, never calling it roomless', async () => {
    const client = clientReturning(
      'version: 3\nkey: room-workshop\nplay: {}\nroom: {}\n'
    );
    const { result } = renderHook(() =>
      useDungeonScene('room-workshop', client)
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.presentation).toBeNull();
    expect(result.current.error).toMatch(/room-workshop/);
    expect(result.current.error).toMatch(/play contract/);
  });

  it('names a version above this build rather than treating it as the other dialect', async () => {
    const client = clientReturning('version: 9\nkey: room-future\n');
    const { result } = renderHook(() => useDungeonScene('room-future', client));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.presentation).toBeNull();
    expect(result.current.error).toMatch(/Unsupported single-room source/);
  });

  it('names a key whose file could not be fetched', async () => {
    const client = {
      getDungeon: vi.fn(async () => {
        throw new Error('connection refused');
      }),
    } as unknown as AuthoringClient;
    const { result } = renderHook(() =>
      useDungeonScene('room-workshop', client)
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.presentation).toBeNull();
    expect(result.current.error).toMatch(/connection refused/);
  });

  it('holds nothing from a key the view has moved off', async () => {
    const { yaml } = workshopYaml();
    const client = {
      getDungeon: vi.fn(async (request: { key: string }) =>
        request.key === 'room-workshop' ? { yaml } : { yaml: FRONT_ROOM_YAML }
      ),
    } as unknown as AuthoringClient;
    const { result, rerender } = renderHook(
      ({ key }: { key: string }) => useDungeonScene(key, client),
      { initialProps: { key: 'room-workshop' } }
    );
    await waitFor(() => expect(result.current.presentation).not.toBeNull());

    rerender({ key: 'front-room' });
    await waitFor(() => expect(result.current.loading).toBe(false));
    // The previous room is gone the moment the key changed; a stale
    // room is never shown under a new key.
    expect(result.current.presentation).toBeNull();
  });
});
