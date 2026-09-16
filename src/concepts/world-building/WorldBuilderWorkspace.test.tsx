import type { CompositionSource } from '@/compositions/compositionSource';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// Keep the real editor, replacing only the WebGL boundary unavailable in jsdom.
vi.mock('./WorldBuildingViewport', () => ({
  WorldBuildingViewport: () => <div data-testid="viewport" />,
}));

import { WorldBuilderWorkspace } from './WorldBuilderWorkspace';

const source = {
  worldId: 'world-1',
  reader: {
    listCompositions: async () => [],
    getComposition: async () => null,
  },
} as CompositionSource;

const storage = {
  values: new Map<string, string>(),
  getItem(key: string) {
    return this.values.get(key) ?? null;
  },
  setItem(key: string, value: string) {
    this.values.set(key, value);
  },
};

describe('WorldBuilderWorkspace', () => {
  it('keeps one active keyed editor and requires explicit switching', () => {
    render(
      <WorldBuilderWorkspace compositionSource={source} storage={storage} />
    );

    expect(
      screen.getByRole('button', { name: 'Rooms' }).getAttribute('aria-pressed')
    ).toBe('true');
    expect(screen.getByRole('heading', { name: 'World Builder' })).toBeTruthy();
    expect(
      screen.getByRole('region', { name: 'Room Authoring Draft' })
    ).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Prop compositions' }));
    expect(screen.getByRole('button', { name: 'Switch editor' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cancel switch' })).toBeTruthy();
    expect(
      screen.getByRole('region', { name: 'Room Authoring Draft' })
    ).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel switch' }));
    expect(
      screen.getByRole('region', { name: 'Room Authoring Draft' })
    ).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Prop compositions' }));
    fireEvent.click(screen.getByRole('button', { name: 'Switch editor' }));
    expect(screen.getByRole('heading', { name: 'World Builder' })).toBeTruthy();
    expect(
      screen.getByRole('region', { name: 'World Building Concept' })
    ).toBeTruthy();
    expect(
      screen.queryByRole('region', { name: 'Room Authoring Draft' })
    ).toBeNull();
  });
});
