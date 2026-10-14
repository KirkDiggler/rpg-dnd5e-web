import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TexturePackPanel } from './TexturePackPanel';
import { parseMaterialEditorManifest } from './materialRecipe';
import { materialEditorManifestFixture } from './materialRecipe.testFixtures';
import {
  addPack,
  createLibrary,
  libraryDraftKey,
  parseLibrary,
  serializeLibrary,
} from './texturePackLibrary';

function setup() {
  const manifest = parseMaterialEditorManifest(materialEditorManifestFixture());
  const currentTarget = {
    sourcePath: manifest.editor.sources[0]!.sourcePath,
    objectName: manifest.editor.sources[0]!.targets[0]!.objectName,
    slot: 0,
  };
  const definition = manifest.profile.definitions['wall-stone']!,
    onPreview = vi.fn();
  const result = render(
    <TexturePackPanel
      manifest={manifest}
      currentTarget={currentTarget}
      currentDefinition={definition}
      onPreview={onPreview}
    />
  );
  fireEvent.click(screen.getByText('Texture packs and bulk assignment'));
  return { ...result, manifest, currentTarget, definition, onPreview };
}
function createPack() {
  fireEvent.change(screen.getByLabelText('New pack name'), {
    target: { value: 'Wall finishes' },
  });
  fireEvent.change(screen.getByLabelText('Pack set name'), {
    target: { value: 'Stone' },
  });
  fireEvent.click(
    screen.getByRole('button', { name: 'Save current surface as named set' })
  );
}
function saved(manifest: ReturnType<typeof parseMaterialEditorManifest>) {
  return parseLibrary(
    JSON.parse(localStorage.getItem(libraryDraftKey(manifest))!)
  );
}
beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('pack authoring workbench', () => {
  it('saves a complete set, assigns only the explicit selected slot, and previews separately', async () => {
    const { manifest, onPreview, definition } = setup();
    createPack();
    fireEvent.click(
      screen.getByRole('button', { name: 'Select current surface' })
    );
    expect(
      screen.getByText(/1 rendered slots across 1 assets selected/)
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole('button', { name: 'Assign pack to selected slots' })
    );
    await waitFor(() => expect(saved(manifest).assignments).toHaveLength(1));
    expect(saved(manifest).assignments[0]!.slot).toBe(0);
    expect(onPreview).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Preview Stone' }));
    expect(onPreview).toHaveBeenCalledWith({ ...definition, label: 'Stone' });
    expect(saved(manifest).assignments[0]).not.toHaveProperty('selection');
  });
  it('bulk asset selection enumerates all actual rendered slots and preserves one shared pack', async () => {
    const { manifest } = setup();
    createPack();
    fireEvent.click(
      screen.getByLabelText(
        `All slots: ${manifest.editor.sources[0]!.sourcePath.split('/').at(-1)!.replace('.fbx', '')}`
      )
    );
    expect(
      screen.getByText(/2 rendered slots across 1 assets selected/)
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole('button', { name: 'Assign pack to selected slots' })
    );
    await waitFor(() => expect(saved(manifest).assignments).toHaveLength(2));
    expect(saved(manifest).assignments.map((a) => a.packs)).toEqual([
      ['wall-finishes'],
      ['wall-finishes'],
    ]);
  });
  it('creates color-only sets from explicitly checked searchable images', async () => {
    const { manifest } = setup();
    fireEvent.change(screen.getByLabelText('New pack name'), {
      target: { value: 'Atlas choices' },
    });
    fireEvent.click(
      screen.getByText('Create color-only choices from source images')
    );
    fireEvent.change(screen.getByLabelText('Find pack color images'), {
      target: { value: 'Stone_Texture' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Select matching color images (1)' })
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Save selected colors as sets' })
    );
    await waitFor(() =>
      expect(saved(manifest).packs['atlas-choices']).toBeTruthy()
    );
    const choices = Object.values(saved(manifest).packs['atlas-choices']!.sets);
    expect(choices).toHaveLength(1);
    expect(choices[0]!.normal).toBeNull();
    expect(choices[0]!.emissive).toBeNull();
  });
  it('restores exact pack membership from autosave without touching the current preview', async () => {
    const first = setup();
    createPack();
    fireEvent.click(
      screen.getByRole('button', { name: 'Select current surface' })
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Assign pack to selected slots' })
    );
    await waitFor(() =>
      expect(saved(first.manifest).assignments).toHaveLength(1)
    );
    const before = serializeLibrary(saved(first.manifest));
    first.unmount();
    const second = setup();
    expect(screen.getByText(/Current surface: Wall finishes/)).toBeTruthy();
    expect(second.onPreview).not.toHaveBeenCalled();
    expect(serializeLibrary(saved(second.manifest))).toBe(before);
  });
  it('preserves an incompatible saved draft and displays the reason instead of overwriting it', () => {
    const manifest = parseMaterialEditorManifest(
        materialEditorManifestFixture()
      ),
      bad = '{"kind":"not-a-library"}';
    localStorage.setItem(libraryDraftKey(manifest), bad);
    setup();
    expect(screen.getByRole('alert').textContent).toMatch(
      /saved file was preserved/i
    );
    expect(localStorage.getItem(libraryDraftKey(manifest))).toBe(bad);
  });
  it('refuses a malformed import while preserving current membership and saved data', async () => {
    const { manifest } = setup();
    createPack();
    await waitFor(() =>
      expect(saved(manifest).packs['wall-finishes']).toBeTruthy()
    );
    const before = localStorage.getItem(libraryDraftKey(manifest));
    fireEvent.change(screen.getByLabelText('Import pack library'), {
      target: {
        files: [
          new File(['{"trusted":true}'], 'bad.json', {
            type: 'application/json',
          }),
        ],
      },
    });
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toMatch(/preserved/i)
    );
    expect(localStorage.getItem(libraryDraftKey(manifest))).toBe(before);
  });
  it('imports a complete independent role set without activating a look', async () => {
    const { manifest, definition, onPreview } = setup();
    const library = addPack(
      createLibrary('role-library', manifest),
      'brick',
      'Brick pack',
      {
        brick: {
          ...definition,
          normal: { image: definition.baseColor!, strength: 0.5 },
          emissive: {
            image: definition.baseColor!,
            color: 'AABBCC',
            strength: 2,
          },
        },
      }
    );
    fireEvent.change(screen.getByLabelText('Import pack library'), {
      target: {
        files: [
          new File([serializeLibrary(library)], 'roles.json', {
            type: 'application/json',
          }),
        ],
      },
    });
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: `Preview ${definition.label}` })
      ).toBeTruthy()
    );
    expect(onPreview).not.toHaveBeenCalled();
    expect(saved(manifest)).toEqual(library);
  });
});
