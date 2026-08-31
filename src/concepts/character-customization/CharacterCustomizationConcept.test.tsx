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

const previewState = vi.hoisted(() => ({
  latest: undefined as
    | {
        fixture: CharacterCustomizationFixture;
        surfacePreset: ActiveSurfacePreset;
        resolution: ResolvedCustomizationFixture;
      }
    | undefined,
}));

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
          bodyRootBoneUuid: `${identity}-root-bone`,
          mappedBoneNames: ['Root', 'Head'],
          mappedBoneUuids: [`${identity}-root`, `${identity}-head`],
        };
      };
      const scalpStatus = statusFor(resolution.scalp, 'controlled');
      const facialHairStatus = statusFor(resolution.facialHair, 'controlled');
      const referenceScalpStatus = {
        code: 'attached' as const,
        slot: 'scalp' as const,
        styleRef: DEFAULT_SCALP_STYLE_REF,
        url: SCALP_OPTIONS[0].url,
        bodyRootBoneUuid: 'reference-root-bone',
        mappedBoneNames: ['Root', 'Head'],
        mappedBoneUuids: ['reference-root', 'reference-head'],
      };
      const referenceFacialHairStatus = {
        code: 'attached' as const,
        slot: 'facial-hair' as const,
        styleRef: DEFAULT_FACIAL_HAIR_STYLE_REF,
        url: FACIAL_HAIR_OPTIONS[1].url,
        bodyRootBoneUuid: 'reference-root-bone',
        mappedBoneNames: ['Root', 'Head'],
        mappedBoneUuids: ['reference-root', 'reference-head'],
      };
      onDiagnostics({
        scalpStatus,
        facialHairStatus,
        referenceScalpStatus,
        referenceFacialHairStatus,
        mountedAccessoryArmatures:
          scalpStatus && facialHairStatus ? 0 : 'unknown',
        referenceTwinIsolation: false,
        sceneCommitted: true,
        weaponStatus: { code: 'unarmed' },
      });
    }, [onDiagnostics, resolution]);

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
  previewState.latest = undefined;
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
