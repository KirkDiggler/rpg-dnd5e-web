import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AssetReviewLab } from './AssetReviewLab';
import { MaterialEditorLab } from './MaterialEditorLab';
import { slotKey } from './materialRecipe';
import {
  FIXTURE_OBJECT_NAME,
  FIXTURE_SOURCE_PATH,
  materialEditorManifestFixture,
} from './materialRecipe.testFixtures';

const sceneLifecycle = vi.hoisted(() => ({ starts: 0 }));
vi.mock('./MaterialEditorScene', () => ({
  MaterialEditorScene: ({
    source,
    onLoadStateChange,
    onTextureStateChange,
  }: {
    source: { glb: { url: string } };
    slots: Record<string, unknown>;
    onLoadStateChange: (
      url: string,
      status: 'loading' | 'success' | 'error',
      detail?: string
    ) => void;
    onTextureStateChange: (
      key: string,
      status: 'loading' | 'success' | 'error',
      detail?: string
    ) => void;
  }) => {
    // Mirror the real scene's load-effect dependencies. Bound the test so an
    // unstable callback fails immediately rather than spinning React forever.
    useEffect(() => {
      if (++sceneLifecycle.starts > 8)
        throw new Error('Scene keeps restarting its load effect');
      onLoadStateChange(source.glb.url, 'loading');
    }, [source.glb.url, onLoadStateChange]);
    const slot0 = slotKey(FIXTURE_SOURCE_PATH, FIXTURE_OBJECT_NAME, 0);
    return (
      <div>
        <button onClick={() => onLoadStateChange(source.glb.url, 'success')}>
          Scene GLB loaded
        </button>
        <button
          onClick={() =>
            onLoadStateChange(source.glb.url, 'error', 'Fixture GLB failed')
          }
        >
          Scene GLB failed
        </button>
        <button
          onClick={() =>
            onTextureStateChange(
              `${slot0}\u0000baseColor`,
              'error',
              'Fixture image failed'
            )
          }
        >
          Texture failed
        </button>
        <button
          onClick={() =>
            onTextureStateChange(`${slot0}\u0000baseColor`, 'success')
          }
        >
          Texture loaded
        </button>
      </div>
    );
  },
}));

let blobs: Blob[];
function readBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}
function fixtureResponse() {
  return { ok: true, json: async () => materialEditorManifestFixture() };
}
function importFile(content: unknown): File {
  return new File([JSON.stringify(content)], 'profile.json', {
    type: 'application/json',
  });
}
beforeEach(() => {
  blobs = [];
  sceneLifecycle.starts = 0;
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fixtureResponse()));
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: (blob: Blob) => {
      blobs.push(blob);
      return 'blob:fixture';
    },
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    value: vi.fn(),
  });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function renderReadyLab() {
  render(<MaterialEditorLab />);
  await screen.findByRole('button', { name: 'Scene GLB loaded' });
  fireEvent.click(screen.getByRole('button', { name: 'Scene GLB loaded' }));
  expect(
    await screen.findByText('Prepared editor geometry loaded.')
  ).toBeVisible();
}

describe('material editor lab', () => {
  it('shows the draft notice, actual slot labels and the prepared mapping', async () => {
    await renderReadyLab();
    expect(screen.getByText(/Experimental draft preview/i)).toBeVisible();
    expect(screen.getByText(/does NOT mark assets Ready/i)).toBeVisible();
    // Both rendered slots of the wall are listed with their actual labels.
    const slotButtons = screen.getAllByRole('button', {
      name: new RegExp(FIXTURE_OBJECT_NAME),
    });
    expect(slotButtons.length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/SM_Bld_Wall_L_Curve_01 · slot 0/i)).toBeVisible();
    expect(screen.getAllByText(/Stone_01/).length).toBeGreaterThan(0);
  });

  it('edits two slots independently and exports the per-slot v2 recipe', async () => {
    await renderReadyLab();
    // Select slot 1 (unassigned) and give it its own base color image.
    fireEvent.click(
      screen.getByRole('button', {
        name: new RegExp(`${FIXTURE_OBJECT_NAME} · slot 1`),
      })
    );
    expect(await screen.findByLabelText('Base color image')).toBeVisible();
    fireEvent.change(screen.getByLabelText('Base color image'), {
      target: { value: 'Texture/Clay_Texture_01.tga' },
    });
    expect(screen.getByText(/Draft changes/)).toBeVisible();
    // Select slot 0 (family default) and turn emissive solid on there.
    fireEvent.click(
      screen.getByRole('button', {
        name: new RegExp(`${FIXTURE_OBJECT_NAME} · slot 0`),
      })
    );
    fireEvent.change(screen.getByLabelText('Emissive mode'), {
      target: { value: 'solid' },
    });
    fireEvent.change(screen.getByLabelText('Emissive color hex'), {
      target: { value: 'FF8800' },
    });
    fireEvent.change(screen.getByLabelText('Emissive strength'), {
      target: { value: '1.5' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Export editing profile' })
    );
    const profile = JSON.parse(await readBlob(blobs[0]!)) as {
      schemaVersion: number;
      assignments: {
        slotOverrides: { slot: number; definition: string }[];
        familyDefaults: Record<string, string>;
      };
      definitions: Record<
        string,
        {
          baseColor: { image: string };
          emissive: {
            image: string | null;
            color: string;
            strength: number;
          } | null;
        }
      >;
    };
    expect(profile.schemaVersion).toBe(2);
    // Two independent slot overrides with separate definitions.
    expect(profile.assignments.slotOverrides).toHaveLength(2);
    const bySlot = new Map(
      profile.assignments.slotOverrides.map(
        (override: { slot: number; definition: string }) => [
          override.slot,
          profile.definitions[override.definition],
        ]
      )
    );
    expect(bySlot.get(1)!.baseColor).toEqual({
      image: 'Texture/Clay_Texture_01.tga',
    });
    expect(bySlot.get(0)!.emissive).toEqual({
      image: null,
      color: 'FF8800',
      strength: 1.5,
    });
    // Slot 1's emissive stays off; slot 0's base color keeps the family image.
    expect(bySlot.get(1)!.emissive).toBeNull();
    expect(bySlot.get(0)!.baseColor).toEqual({
      image: 'Texture/Stone_Texture_01.png',
    });
    // The legacy family default is carried through unchanged.
    expect(profile.assignments.familyDefaults).toEqual({
      Stone_01: 'wall-stone',
    });
  });

  it('imports an exported profile and rejects wrong-pack files without losing state', async () => {
    await renderReadyLab();
    fireEvent.click(
      screen.getByRole('button', {
        name: new RegExp(`${FIXTURE_OBJECT_NAME} · slot 1`),
      })
    );
    fireEvent.change(await screen.findByLabelText('Base color image'), {
      target: { value: 'Texture/Clay_Texture_01.tga' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Export editing profile' })
    );
    const exported = JSON.parse(await readBlob(blobs[0]!));
    // Import the exported profile: state survives the reload round-trip.
    fireEvent.change(screen.getByLabelText('Import editing profile'), {
      target: { files: [importFile(exported)] },
    });
    await waitFor(() =>
      expect(screen.getByLabelText('Base color image')).toHaveValue(
        'Texture/Clay_Texture_01.tga'
      )
    );
    // Exporting the imported state reproduces the same v2 document byte-for-byte.
    fireEvent.click(
      screen.getByRole('button', { name: 'Export editing profile' })
    );
    const second = JSON.parse(await readBlob(blobs[1]!)) as object;
    expect(second).toEqual(exported);
    // A wrong-pack import is rejected loudly and keeps the current draft.
    fireEvent.change(screen.getByLabelText('Import editing profile'), {
      target: {
        files: [importFile({ ...exported, packSlug: 'different-pack' })],
      },
    });
    expect(await screen.findByRole('alert')).toHaveTextContent(/pack differs/);
    expect(screen.getByText(/Draft changes/)).toBeVisible();
  });

  it('distinguishes GLB load errors from texture load errors', async () => {
    await renderReadyLab();
    fireEvent.click(
      screen.getByRole('button', {
        name: new RegExp(`${FIXTURE_OBJECT_NAME} · slot 0`),
      })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Texture failed' }));
    expect(await screen.findByText(/1 image load failed/i)).toBeVisible();
    expect(screen.getAllByText(/Fixture image failed/).length).toBeGreaterThan(
      0
    );
    // The failure is reported on the base color channel, not a fake success.
    expect(
      screen.getAllByText(/Base color image: failed/).length
    ).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Scene GLB failed' }));
    expect(await screen.findByText(/GLB load failed/)).toHaveTextContent(
      'Fixture GLB failed'
    );
  });

  it('opens the editor mode through the existing Lab route', async () => {
    const previous = window.location.href;
    try {
      window.history.replaceState({}, '', '?assetReview=1&materialEditor=1');
      render(<AssetReviewLab />);
      expect(
        await screen.findByRole('button', { name: 'Scene GLB loaded' })
      ).toBeVisible();
      expect(
        screen.queryByRole('button', { name: /Export Ready provider/ })
      ).not.toBeInTheDocument();
    } finally {
      window.history.replaceState({}, '', previous);
    }
  });

  it('shows a preparation error instead of a fake editor', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 404 })
    );
    render(<MaterialEditorLab />);
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/404/)
    );
    expect(
      screen.queryByRole('button', { name: 'Export editing profile' })
    ).not.toBeInTheDocument();
  });
});
