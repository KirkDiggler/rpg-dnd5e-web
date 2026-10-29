import '@testing-library/jest-dom/vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MaterialEditorLab } from './MaterialEditorLab';
import type { SlotVisualState } from './MaterialEditorScene';
import {
  parseMaterialEditorManifest,
  type MaterialEditorManifest,
} from './materialRecipe';
import { materialEditorManifestFixture } from './materialRecipe.testFixtures';
import {
  addPack,
  assignPack,
  createLibrary,
  libraryDraftKey,
  parseLibrary,
  serializeLibrary,
} from './texturePackLibrary';
import { TexturePackWorkspace } from './TexturePackWorkspace';

vi.mock('./MaterialEditorScene', async () => {
  const { useEffect } = await import('react');
  return {
    MaterialEditorScene: ({
      source,
      slots,
      onLoadStateChange,
    }: {
      source: { glb: { url: string } };
      slots: Record<string, SlotVisualState>;
      onLoadStateChange: (url: string, status: string) => void;
    }) => {
      useEffect(() => {
        onLoadStateChange(source.glb.url, 'success');
      }, [source.glb.url, onLoadStateChange]);
      return (
        <output data-testid="scene-channels">{JSON.stringify(slots)}</output>
      );
    },
  };
});
function setup() {
  const manifest = parseMaterialEditorManifest(materialEditorManifestFixture());
  return { manifest, ...render(<TexturePackWorkspace manifest={manifest} />) };
}
function stored(manifest: MaterialEditorManifest) {
  return parseLibrary(
    JSON.parse(localStorage.getItem(libraryDraftKey(manifest))!)
  );
}
function click(name: string): void {
  fireEvent.click(screen.getByRole('button', { name }));
}
function create(): void {
  fireEvent.change(screen.getByLabelText('Pack name'), {
    target: { value: 'Kingdom atlas' },
  });
  fireEvent.click(screen.getByLabelText('Color: Texture/Stone_Texture_01.png'));
  fireEvent.click(screen.getByLabelText('Color: Texture/Clay_Texture_01.tga'));
  fireEvent.change(screen.getByLabelText('Pack normal image'), {
    target: { value: 'Texture/Clay_Texture_01.tga' },
  });
  fireEvent.change(screen.getByLabelText('Pack emissive image'), {
    target: { value: 'Texture/Stone_Texture_01.png' },
  });
  click('Save pack');
}
beforeEach(() => {
  localStorage.clear();
  window.history.replaceState({}, '', '/');
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('pack-first separated views', () => {
  it('starts with wide pack building only, without an asset scene, batch, match or file controls', () => {
    setup();
    expect(screen.getByLabelText('Pack name')).toBeTruthy();
    expect(screen.queryByTestId('scene-channels')).toBeNull();
    expect(
      screen.queryByLabelText('Match this pack to this surface')
    ).toBeNull();
    expect(screen.queryByLabelText('Load saved library')).toBeNull();
    expect(screen.queryByText('Related-piece batch')).toBeNull();
    expect(screen.getByRole('button', { name: 'Save pack' })).toBeDisabled();
  });
  it('saves N color choices with explicitly shared optional maps and opens the asset viewer', async () => {
    const { manifest } = setup();
    create();
    await waitFor(() =>
      expect(stored(manifest).packs['kingdom-atlas']).toBeTruthy()
    );
    const sets = Object.values(stored(manifest).packs['kingdom-atlas']!.sets);
    expect(sets).toHaveLength(2);
    expect(new Set(sets.map((s) => s.baseColor)).size).toBe(2);
    for (const set of sets) {
      expect(set.normal).toEqual({
        image: 'Texture/Clay_Texture_01.tga',
        strength: 1,
      });
      expect(set.emissive).toEqual({
        image: 'Texture/Stone_Texture_01.png',
        color: 'FFFFFF',
        strength: 1,
      });
    }
    expect(screen.getByLabelText('Saved pack')).toHaveValue('kingdom-atlas');
    expect(screen.queryByLabelText('Pack name')).toBeNull();
    expect(screen.queryByLabelText('Load saved library')).toBeNull();
    expect(stored(manifest).assignments).toEqual([]);
  });
  it('selects a saved pack/choice for preview without recording a match', () => {
    setup();
    create();
    const before = screen.getByTestId('scene-channels').textContent!;
    const choices = screen.getByLabelText(
      'Pack color choice'
    ) as HTMLSelectElement;
    fireEvent.change(choices, { target: { value: choices.options[1]!.value } });
    const after = screen.getByTestId('scene-channels').textContent!;
    expect(before).not.toBe(after);
    expect(
      screen.getByLabelText('Match this pack to this surface')
    ).not.toBeChecked();
  });
  it('matching changes only actual selected surface membership, not preview or sibling slots', async () => {
    const { manifest } = setup();
    create();
    const before = screen.getByTestId('scene-channels').textContent;
    fireEvent.click(screen.getByLabelText('Match this pack to this surface'));
    await waitFor(() => expect(stored(manifest).assignments).toHaveLength(1));
    expect(stored(manifest).assignments[0]!.slot).toBe(0);
    expect(screen.getByTestId('scene-channels').textContent).toBe(before);
    const surfaces = screen.getByLabelText(
      'Viewer surface'
    ) as HTMLSelectElement;
    fireEvent.change(surfaces, {
      target: { value: surfaces.options[1]!.value },
    });
    expect(
      screen.getByLabelText('Match this pack to this surface')
    ).not.toBeChecked();
    expect(stored(manifest).assignments[0]!.slot).toBe(0);
    fireEvent.change(surfaces, {
      target: { value: surfaces.options[0]!.value },
    });
    expect(
      screen.getByLabelText('Match this pack to this surface')
    ).toBeChecked();
    fireEvent.click(screen.getByLabelText('Match this pack to this surface'));
    await waitFor(() => expect(stored(manifest).assignments).toEqual([]));
  });
  it('keeps an unsaved pack form across view switches', () => {
    setup();
    fireEvent.change(screen.getByLabelText('Pack name'), {
      target: { value: 'Unsaved walls' },
    });
    fireEvent.click(
      screen.getByLabelText('Color: Texture/Stone_Texture_01.png')
    );
    click('Asset Viewer');
    click('Pack Builder');
    expect(screen.getByLabelText('Pack name')).toHaveValue('Unsaved walls');
    expect(
      screen.getByLabelText('Color: Texture/Stone_Texture_01.png')
    ).toBeChecked();
  });
  it('restores saved packs and matches with the same existing browser key', async () => {
    const first = setup();
    create();
    fireEvent.click(screen.getByLabelText('Match this pack to this surface'));
    await waitFor(() =>
      expect(stored(first.manifest).assignments).toHaveLength(1)
    );
    const before = serializeLibrary(stored(first.manifest));
    first.unmount();
    setup();
    click('Asset Viewer');
    fireEvent.change(screen.getByLabelText('Saved pack'), {
      target: { value: 'kingdom-atlas' },
    });
    expect(
      screen.getByLabelText('Match this pack to this surface')
    ).toBeChecked();
    expect(serializeLibrary(stored(first.manifest))).toBe(before);
  });
  it('leaves mixed-role saved choices intact when creating an additional pack', async () => {
    const m = parseMaterialEditorManifest(materialEditorManifestFixture()),
      d = m.profile.definitions['wall-stone']!;
    const old = addPack(createLibrary('old-library', m), 'old', 'Old', {
      a: d,
      b: {
        ...d,
        label: 'Different normal',
        normal: { image: d.baseColor!, strength: 0.5 },
        emissive: { image: null, color: 'AABBCC', strength: 2 },
      },
    });
    localStorage.setItem(libraryDraftKey(m), serializeLibrary(old));
    setup();
    create();
    await waitFor(() => expect(stored(m).packs['kingdom-atlas']).toBeTruthy());
    expect(stored(m).packs.old).toEqual(old.packs.old);
  });
  it('keeps existing other-pack membership when unmatching the selected pack', async () => {
    const m = parseMaterialEditorManifest(materialEditorManifestFixture()),
      d = m.profile.definitions['wall-stone']!,
      s = m.editor.sources[0]!,
      t = s.targets[0]!;
    let l = addPack(
      addPack(createLibrary('old', m), 'a', 'Pack A', { a: d }),
      'b',
      'Pack B',
      { b: d }
    );
    l = assignPack(
      assignPack(
        l,
        'a',
        [{ sourcePath: s.sourcePath, objectName: t.objectName, slot: t.slot }],
        m
      ),
      'b',
      [{ sourcePath: s.sourcePath, objectName: t.objectName, slot: t.slot }],
      m
    );
    localStorage.setItem(libraryDraftKey(m), serializeLibrary(l));
    setup();
    click('Asset Viewer');
    fireEvent.change(screen.getByLabelText('Saved pack'), {
      target: { value: 'a' },
    });
    fireEvent.click(screen.getByLabelText('Match this pack to this surface'));
    await waitFor(() => expect(stored(m).assignments[0]!.packs).toEqual(['b']));
  });
  it('file actions are only on their own view and malformed import preserves data', async () => {
    const { manifest } = setup();
    create();
    const before = localStorage.getItem(libraryDraftKey(manifest));
    click('Library files');
    expect(screen.queryByTestId('scene-channels')).toBeNull();
    expect(screen.queryByLabelText('Pack name')).toBeNull();
    fireEvent.change(screen.getByLabelText('Load saved library'), {
      target: { files: [new File(['{"trusted":true}'], 'bad.json')] },
    });
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toMatch(/preserved/)
    );
    expect(localStorage.getItem(libraryDraftKey(manifest))).toBe(before);
  });
  it('loads a previous valid JSON with no automatic match or activation', async () => {
    const { manifest } = setup(),
      d = manifest.profile.definitions['wall-stone']!,
      l = addPack(createLibrary('imported', manifest), 'brick', 'Brick', {
        brick: d,
      });
    click('Library files');
    fireEvent.change(screen.getByLabelText('Load saved library'), {
      target: { files: [new File([serializeLibrary(l)], 'saved.json')] },
    });
    await waitFor(() => expect(stored(manifest)).toEqual(l));
    click('Asset Viewer');
    expect(screen.getByLabelText('Saved pack')).toHaveValue('');
    expect(
      screen.getByLabelText('Match this pack to this surface')
    ).not.toBeChecked();
  });
  it('preserves an incompatible autosave without silently replacing it', () => {
    const m = parseMaterialEditorManifest(materialEditorManifestFixture()),
      raw = '{"kind":"wrong"}';
    localStorage.setItem(libraryDraftKey(m), raw);
    setup();
    expect(screen.getByRole('alert').textContent).toMatch(/preserved/);
    expect(localStorage.getItem(libraryDraftKey(m))).toBe(raw);
  });
  it('entry point loads the new pack-first view without loading the advanced scene', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => materialEditorManifestFixture(),
      })
    );
    render(<MaterialEditorLab />);
    expect(await screen.findByLabelText('Pack name')).toBeTruthy();
    expect(screen.queryByTestId('scene-channels')).toBeNull();
    expect(
      screen.getByRole('link', { name: 'Advanced material lab' })
    ).toBeTruthy();
  });
});
