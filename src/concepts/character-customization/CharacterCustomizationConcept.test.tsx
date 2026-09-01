import { fireEvent, render, screen, within } from '@testing-library/react';
import { useEffect } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConceptsView } from '../ConceptsView';
import {
  DEFAULT_FACIAL_HAIR_STYLE_REF,
  DEFAULT_SCALP_STYLE_REF,
  FACIAL_HAIR_OPTIONS,
  SCALP_OPTIONS,
} from './characterCustomizationAssets';
import { CharacterCustomizationConcept } from './CharacterCustomizationConcept';
import type {
  ActiveSurfacePreset,
  CharacterCustomizationFixture,
  ResolvedCustomizationFixture,
} from './characterCustomizationExperiment';

const gltfPreload = vi.hoisted(() => vi.fn());

const previewState = vi.hoisted(() => ({
  publishDiagnostics: true,
  latest: undefined as
    | {
        fixture: CharacterCustomizationFixture;
        surfacePreset: ActiveSurfacePreset;
        resolution: ResolvedCustomizationFixture;
      }
    | undefined,
}));

vi.mock('@react-three/drei', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@react-three/drei')>();
  return {
    ...actual,
    useGLTF: Object.assign(actual.useGLTF, { preload: gltfPreload }),
  };
});

vi.mock('./CharacterCustomizationPreview', () => ({
  CharacterCustomizationPreview: (props: {
    fixture: CharacterCustomizationFixture;
    surfacePreset: ActiveSurfacePreset;
    resolution: ResolvedCustomizationFixture;
    onDiagnostics: (diagnostics: unknown) => void;
    onRenderObserved: (observation: unknown) => void;
  }) => {
    const { fixture, surfacePreset, resolution, onDiagnostics } = props;
    previewState.latest = { fixture, surfacePreset, resolution };

    useEffect(() => {
      if (!previewState.publishDiagnostics) return;
      const statusFor = (
        resolution:
          | ResolvedCustomizationFixture['scalp']
          | ResolvedCustomizationFixture['facialHair'],
        identity: string
      ) => {
        if (resolution.code === 'none') {
          return { code: 'none' as const, slot: resolution.slot };
        }
        if (resolution.code === 'unmapped') return undefined;
        return {
          code: 'attached' as const,
          slot: resolution.slot,
          styleRef: resolution.styleRef,
          url: resolution.asset.url,
          meshUuid: `${identity}-${resolution.slot}-mesh`,
          bodyRootBoneUuid: `${identity}-root-bone`,
          mappedBoneNames: ['Root', 'Head'],
          mappedBoneUuids: [`${identity}-root`, `${identity}-head`],
          instanceMaterials: [
            {
              materialUuid: `${identity}-${resolution.slot}-material`,
              ...fixture.treatment,
            },
          ],
        };
      };
      const scalpStatus = statusFor(resolution.scalp, 'controlled');
      const facialHairStatus = statusFor(resolution.facialHair, 'controlled');
      const referenceScalpStatus = {
        code: 'attached' as const,
        slot: 'scalp' as const,
        styleRef: DEFAULT_SCALP_STYLE_REF,
        url: SCALP_OPTIONS[0].url,
        meshUuid: 'reference-scalp-mesh',
        bodyRootBoneUuid: 'reference-root-bone',
        mappedBoneNames: ['Root', 'Head'],
        mappedBoneUuids: ['reference-root', 'reference-head'],
        instanceMaterials: [
          {
            materialUuid: 'reference-scalp-material',
            baseColorSrgb: '#5A3825' as const,
            roughness: 0.72,
            metalness: 0,
          },
        ],
      };
      const referenceFacialHairStatus = {
        code: 'attached' as const,
        slot: 'facial-hair' as const,
        styleRef: DEFAULT_FACIAL_HAIR_STYLE_REF,
        url: FACIAL_HAIR_OPTIONS[1].url,
        meshUuid: 'reference-facial-hair-mesh',
        bodyRootBoneUuid: 'reference-root-bone',
        mappedBoneNames: ['Root', 'Head'],
        mappedBoneUuids: ['reference-root', 'reference-head'],
        instanceMaterials: [
          {
            materialUuid: 'reference-facial-hair-material',
            baseColorSrgb: '#5A3825' as const,
            roughness: 0.72,
            metalness: 0,
          },
        ],
      };
      onDiagnostics({
        scalpStatus,
        facialHairStatus,
        referenceScalpStatus,
        referenceFacialHairStatus,
        mountedAccessoryArmatures:
          scalpStatus && facialHairStatus ? 0 : 'unknown',
        referenceTwinIsolation: false,
        sceneCommitted: false,
        weaponStatus: { code: 'unarmed' },
      });
    }, [fixture.treatment, onDiagnostics, resolution]);

    return (
      <div data-testid="mock-customization-preview">
        <span>Controlled customization</span>
        <span>Untouched reference twin</span>
      </div>
    );
  },
}));

function setSearch(search: string) {
  window.history.replaceState({}, '', search);
}

beforeEach(() => {
  gltfPreload.mockReset();
  previewState.latest = undefined;
  previewState.publishDiagnostics = true;
  setSearch('/');
});

describe('CharacterCustomizationConcept', () => {
  it('registers the exact deep link and Character Customization label', () => {
    setSearch('/?concept=character-customization');
    render(<ConceptsView onBack={() => {}} />);

    expect(
      screen.getByRole('button', { name: 'Character Customization' })
    ).toBeTruthy();
    expect(
      screen.getByRole('heading', { name: /Character Customization Lab/i })
    ).toBeTruthy();
  });

  it('preloads all six exact Concept accessory URLs when the lab mounts', () => {
    render(<CharacterCustomizationConcept />);

    expect(gltfPreload.mock.calls.map(([url]) => url)).toEqual([
      ...SCALP_OPTIONS.map((option) => option.url),
      ...FACIAL_HAIR_OPTIONS.map((option) => option.url),
    ]);
  });

  it('lays out bounded controls beside the preview with a responsive inspector pane', () => {
    render(<CharacterCustomizationConcept />);

    const workspace = screen.getByTestId('character-customization-workspace');
    const controls = screen.getByTestId(
      'character-customization-controls-pane'
    );
    const preview = screen.getByTestId('character-customization-preview-pane');
    const inspector = screen.getByTestId(
      'character-customization-inspector-pane'
    );

    expect(workspace.className).toContain('lg:grid-cols-');
    expect(workspace.className).toContain('2xl:grid-cols-');
    expect([...workspace.children]).toEqual([controls, preview, inspector]);
    expect(controls.className).toContain('lg:sticky');
    expect(controls.className).toContain('lg:max-h-[560px]');
    expect(controls.className).toContain('lg:overflow-y-auto');
    expect(preview.className).toContain('lg:sticky');
    expect(inspector.className).toContain('lg:col-span-2');
    expect(inspector.className).toContain('lg:max-h-[560px]');
    expect(inspector.className).toContain('lg:overflow-y-auto');
    expect(inspector.className).toContain('2xl:col-span-1');
    expect(inspector.className).toContain('2xl:sticky');
  });

  it('controls both slots independently with every exact provider option', () => {
    render(<CharacterCustomizationConcept />);

    const scalp = screen.getByRole('group', { name: 'Scalp style' });
    const facial = screen.getByRole('group', { name: 'Facial hair style' });
    for (const label of ['Default', 'None', 'Hair 04', 'Hair 08', 'Hair 16']) {
      expect(within(scalp).getByRole('button', { name: label })).toBeTruthy();
    }
    for (const label of [
      'Default',
      'None',
      'Facial Hair 01',
      'Facial Hair 02',
      'Facial Hair 03',
    ]) {
      expect(within(facial).getByRole('button', { name: label })).toBeTruthy();
    }

    fireEvent.click(within(scalp).getByRole('button', { name: 'Hair 08' }));
    fireEvent.click(
      within(facial).getByRole('button', { name: 'Facial Hair 03' })
    );

    expect(previewState.latest?.fixture).toMatchObject({
      scalp: SCALP_OPTIONS[1].styleRef,
      facialHair: FACIAL_HAIR_OPTIONS[2].styleRef,
    });
  });

  it('passes one arbitrary color object to both active accessory presentations', () => {
    render(<CharacterCustomizationConcept />);

    fireEvent.change(screen.getByLabelText('Shared accessory color'), {
      target: { value: '#C02626' },
    });

    const presentations = previewState.latest?.resolution.presentations;
    expect(presentations).toHaveLength(2);
    expect(presentations?.[0]?.treatment.baseColorSrgb).toBe('#C02626');
    expect(presentations?.[1]?.treatment).toBe(presentations?.[0]?.treatment);
  });

  it('exposes bounded PBR, motion, view, preset, and weapon witness controls', () => {
    render(<CharacterCustomizationConcept />);

    const roughness = screen.getByLabelText('Roughness') as HTMLInputElement;
    const metalness = screen.getByLabelText('Metalness') as HTMLInputElement;
    expect([roughness.min, roughness.max]).toEqual(['0', '1']);
    expect([metalness.min, metalness.max]).toEqual(['0', '1']);

    fireEvent.change(roughness, { target: { value: '0.33' } });
    fireEvent.change(metalness, { target: { value: '0.66' } });
    expect(previewState.latest?.fixture.treatment).toMatchObject({
      roughness: 0.33,
      metalness: 0.66,
    });

    for (const label of ['Hair', 'Cloth-like', 'Leather-like', 'Metal-like']) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy();
    }
    fireEvent.click(screen.getByRole('button', { name: 'Metal-like' }));
    expect(previewState.latest?.surfacePreset).toBe('metalLike');

    fireEvent.click(screen.getByRole('button', { name: 'Walk' }));
    fireEvent.click(screen.getByRole('button', { name: 'Full orbit' }));
    expect(previewState.latest?.fixture).toMatchObject({
      motion: 'walk',
      view: 'orbit',
    });
    fireEvent.click(screen.getByRole('button', { name: 'Tactical play' }));
    expect(previewState.latest?.fixture.view).toBe('play');
    fireEvent.click(
      screen.getByRole('button', { name: 'Canonical weapon witness' })
    );
    expect(previewState.latest?.fixture.showWeaponWitness).toBe(true);
  });

  it('shows exact runtime diagnostics, asset sizes, fixture JSON, and both instances', () => {
    render(<CharacterCustomizationConcept />);

    expect(screen.getByText('Controlled customization')).toBeTruthy();
    expect(screen.getByText('Untouched reference twin')).toBeTruthy();
    expect(screen.getByText('NON-PRODUCTION CONCEPT EVIDENCE')).toBeTruthy();
    expect(screen.getByTestId('body-url').textContent).toContain(
      'dwarf-fighter-body.glb'
    );
    expect(screen.getByTestId('body-size').textContent).toContain('786,668');
    expect(screen.getByTestId('scalp-style-ref').textContent).toContain(
      DEFAULT_SCALP_STYLE_REF
    );
    expect(screen.getByTestId('scalp-url').textContent).toContain(
      SCALP_OPTIONS[0].url
    );
    expect(screen.getByTestId('scalp-status').textContent).toBe('attached');
    expect(screen.getByTestId('facial-hair-status').textContent).toBe(
      'attached'
    );
    expect(screen.getByTestId('mapped-bones').textContent).toContain(
      'Root, Head'
    );
    expect(screen.getByTestId('missing-bones').textContent).toContain('none');
    expect(screen.getByTestId('body-root-identity').textContent).toContain(
      'controlled-root-bone'
    );
    expect(screen.getByTestId('mapped-bone-identities').textContent).toContain(
      'controlled-head'
    );
    expect(screen.getByTestId('armature-count').textContent).toContain('0');
    expect(screen.getByTestId('material-evidence').textContent).toContain(
      'controlled-scalp-material'
    );
    expect(screen.getByTestId('material-evidence').textContent).toContain(
      '"baseColorSrgb": "#5A3825"'
    );
    expect(screen.getByTestId('attachment-status-json').textContent).toContain(
      '"bodyRootBoneUuid": "controlled-root-bone"'
    );
    expect(screen.getByTestId('attachment-status-json').textContent).toContain(
      '"bodyRootBoneUuid": "reference-root-bone"'
    );
    expect(screen.getByTestId('fixture-json').textContent).toContain(
      '"showWeaponWitness": false'
    );
  });

  it('synchronously fences stale slot and weapon diagnostics after rapid changes', () => {
    render(<CharacterCustomizationConcept />);
    expect(screen.getByTestId('scalp-status').textContent).toBe('attached');

    previewState.publishDiagnostics = false;
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Scalp style' })).getByRole(
        'button',
        { name: 'Hair 08' }
      )
    );

    expect(screen.getByTestId('scalp-style-ref').textContent).toBe(
      SCALP_OPTIONS[1].styleRef
    );
    expect(screen.getByTestId('scalp-url').textContent).toBe(
      SCALP_OPTIONS[1].url
    );
    expect(screen.getByTestId('scalp-status').textContent).toBe(
      'awaiting-render'
    );
    const exactStatus = JSON.parse(
      screen.getByTestId('attachment-status-json').textContent ?? '{}'
    );
    expect(exactStatus.controlled.scalp).toBeUndefined();

    fireEvent.click(
      screen.getByRole('button', { name: 'Canonical weapon witness' })
    );
    expect(screen.getByTestId('animation-weapon-status').textContent).toContain(
      'loading'
    );
  });

  it('keeps unknown initial refs visibly unmapped instead of choosing default', () => {
    setSearch('/?scalp=modular-fantasy-hero%3Ahair%3Aunknown');
    render(<CharacterCustomizationConcept />);

    expect(screen.getByTestId('scalp-style-ref').textContent).toContain(
      'modular-fantasy-hero:hair:unknown'
    );
    expect(screen.getByTestId('scalp-url').textContent).toBe('unmapped');
    expect(screen.getByTestId('scalp-status').textContent).toBe('unmapped');
  });

  it('keeps the Concept verdict disabled before positive coverage is complete', () => {
    render(<CharacterCustomizationConcept />);

    const record = screen.getByRole('button', {
      name: 'Record Concept verdict',
    }) as HTMLButtonElement;
    expect(record.disabled).toBe(true);
    expect(screen.getByTestId('coverage-status').textContent).toContain(
      'not complete'
    );
  });
});
