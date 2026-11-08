import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorldMaterialCatalogState } from '../world-building/useWorldMaterialCatalog';
import { StudioTexturePackControls } from './StudioTexturePackControls';
const assetRef = 'dnd5e:env:test:wall',
  hash = 'a'.repeat(64);
const refs = ['01_a', '04_c'].map((x) => `dnd5e:material:test:atlas_${x}`);
function catalog(): WorldMaterialCatalogState {
  return {
    status: 'ready',
    message: 'Pinned',
    catalog: {
      kind: 'pinned',
      catalogSha256: hash,
      materials: [],
      surfaces: [],
      atlas: {
        materials: refs.map((ref, i) => ({
          ref,
          displayName: i ? '04_C' : '01_A',
          family: 'atlas',
          mapping: 'authored-uv',
          normal: null,
          emissive: null,
          baseColor: {
            url: '/verified.png',
            sha256: hash,
            width: 1,
            height: 1,
            sizeBytes: 4,
          },
        })),
        collections: [
          {
            ref: 'dnd5e:material-collection:test:main_atlas',
            displayName: 'Atlas',
            materials: [refs[0]],
          },
        ],
        bindings: [
          {
            assetRef,
            glbSha256: hash,
            surfaces: [
              {
                id: 'atlas',
                node: 'Wall',
                material: 'Atlas',
                texCoord: 0,
                defaultBaseColorSha256: hash,
                sampler: {
                  wrapS: 10497,
                  wrapT: 10497,
                  magFilter: 9728,
                  minFilter: 9984,
                },
                suggestedCollections: [
                  'dnd5e:material-collection:test:main_atlas',
                ],
              },
            ],
          },
        ],
      },
    },
  };
}
afterEach(cleanup);
describe('Studio texture pack choices', () => {
  it('stages a declared-scope choice including an uncurated pack and resets Original', () => {
    const change = vi.fn();
    const props = {
      assetRef,
      glbSha256: hash,
      catalog: catalog(),
      values: [],
      onChange: change,
    };
    const view = render(<StudioTexturePackControls {...props} />);
    const select = screen.getByLabelText('Texture pack');
    expect(screen.getByRole('option', { name: '01_A' })).toBeTruthy();
    expect(screen.getByRole('option', { name: '04_C' })).toBeTruthy();
    fireEvent.change(select, { target: { value: refs[1] } });
    expect(change).toHaveBeenLastCalledWith([
      { surfaceId: 'atlas', materialRef: refs[1] },
    ]);
    view.rerender(
      <StudioTexturePackControls
        {...props}
        values={[{ surfaceId: 'atlas', materialRef: refs[1] }]}
      />
    );
    fireEvent.change(screen.getByLabelText('Texture pack'), {
      target: { value: '' },
    });
    expect(change).toHaveBeenLastCalledWith([]);
  });
  it('refuses stale binding choices while retaining an explicit reset for existing intent', () => {
    const change = vi.fn();
    render(
      <StudioTexturePackControls
        assetRef={assetRef}
        glbSha256={'c'.repeat(64)}
        catalog={catalog()}
        values={[{ surfaceId: 'atlas', materialRef: refs[0] }]}
        onChange={change}
      />
    );
    expect(screen.getByRole('alert').textContent).toMatch(/geometry|binding/i);
    expect(screen.queryByRole('combobox')).toBeNull();
    fireEvent.click(
      screen.getByRole('button', { name: 'Use original texture' })
    );
    expect(change).toHaveBeenCalledWith([]);
  });
  it('does not silently turn an unavailable explicit choice into Original', () => {
    render(
      <StudioTexturePackControls
        assetRef={assetRef}
        glbSha256={hash}
        catalog={catalog()}
        values={[{ surfaceId: 'atlas', materialRef: 'missing-look' }]}
        onChange={() => {}}
      />
    );
    expect(
      (screen.getByLabelText('Texture pack') as HTMLSelectElement).value
    ).toBe('missing-look');
    expect(screen.getByRole('alert').textContent).toMatch(/unavailable/i);
  });
});
