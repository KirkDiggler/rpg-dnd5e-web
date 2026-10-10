import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type {
  EncounterStudioSession,
  EncounterStudioView,
} from '../encounter-studio/studioSession';
import { WORLD_BUILDING_CATALOG } from './catalog';
import type { KeyValueStorage } from './types';
import { WorldBuildingConcept } from './WorldBuildingConcept';

const capture = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error('Catalog must not start a thumbnail renderer');
  })
);
vi.mock('@/compositions/CompositionThumbnailRenderer', () => ({
  ThumbnailRenderer: capture,
}));
vi.mock('./WorldBuildingViewport', () => ({
  WorldBuildingViewport: () => <div data-testid="mock-world-viewport" />,
}));

class MemoryStorage implements KeyValueStorage {
  values = new Map<string, string>();
  writes = 0;
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.writes++;
    this.values.set(key, value);
  }
}

describe('World Builder provider thumbnails', () => {
  it('uses static images across Studio views and preserves wall intents/history on load or error', () => {
    let session: EncounterStudioSession;
    let view: EncounterStudioView = 'layout';
    const storage = new MemoryStorage();
    const element = () => (
      <WorldBuildingConcept
        roomMode
        storage={storage}
        studioPresentation={{
          view,
          render: (next) => {
            session = next;
            return next.propControls.palette;
          },
        }}
      />
    );
    const mounted = render(element());
    const entry = WORLD_BUILDING_CATALOG.find(
      (e) => e.source === 'generated' && e.thumbnail
    )!;
    expect(entry).toBeDefined();
    const option = session!.wallEditing.options.find(
      (o) => o.ref === entry.ref
    )!;
    expect(option.thumbnail).toEqual({
      status: 'ready',
      image: entry.thumbnail,
    });
    const epoch = session!.intentEpoch;
    const document = session!.document;
    const writes = storage.writes;
    const preview =
      session!.viewportProps.roomAuthoring!.onWallTransformPreview;
    const live = session!.wallEditing;
    const card = window.document.querySelector(
      `[data-asset-ref="${entry.ref}"]`
    )!;
    const image = card.querySelector('img')!;
    expect(image.getAttribute('src')).toBe(entry.thumbnail);
    fireEvent.load(image);
    fireEvent.error(image);
    expect(
      screen.getByLabelText(`Preview unavailable for ${entry.label}`)
    ).not.toBeNull();
    expect(session!.intentEpoch).toBe(epoch);
    expect(session!.document).toBe(document);
    expect(session!.viewportProps.roomAuthoring!.onWallTransformPreview).toBe(
      preview
    );
    expect(storage.writes).toBe(writes);
    act(() => expect(live.setAsset(entry.ref)).toBe(true));
    act(() =>
      expect(
        session!.wallEditing.create({
          start: { x: -1, z: 0 },
          end: { x: 1, z: 0 },
        })
      ).toBe(true)
    );
    view = '3d';
    mounted.rerender(element());
    fireEvent.change(screen.getByLabelText('Search assets'), {
      target: { value: entry.ref },
    });
    expect(
      screen.getByLabelText(`Drag ${entry.label} into scene`)
    ).not.toBeNull();
    view = 'layout';
    mounted.rerender(element());
    expect(capture).not.toHaveBeenCalled();
    expect(window.document.querySelector('canvas')).toBeNull();
  });

  it('never creates a capture worker in the legacy asset palette either', () => {
    render(<WorldBuildingConcept storage={new MemoryStorage()} />);
    expect(capture).not.toHaveBeenCalled();
    const generated = window.document.querySelectorAll(
      '[data-thumbnail-source="provider"]'
    );
    expect(generated.length).toBeGreaterThan(0);
    expect(
      [...generated].every((card) =>
        card
          .querySelector('img')
          ?.getAttribute('src')
          ?.startsWith('/models/synty/thumbnails/world-assets/')
      )
    ).toBe(true);
  });
});
