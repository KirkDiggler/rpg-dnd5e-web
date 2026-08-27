import { fireEvent, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConceptsView } from '../ConceptsView';
import { WeaponAttachmentConcept } from './WeaponAttachmentConcept';
import {
  formatTextureBudget,
  type WeaponClassId,
  type WeaponEquipmentState,
} from './weaponAttachmentExperiment';

vi.mock('./WeaponAttachmentPreview', () => ({
  WeaponAttachmentPreview: (props: {
    classId?: WeaponClassId;
    equipmentState: WeaponEquipmentState;
    motion: 'idle' | 'walk';
    view: 'close' | 'orbit' | 'play';
    facing: 0 | 1 | 2 | 3 | 4 | 5;
    presentation?: { ref: string };
    onAttachmentStatus: (status: { code: 'unarmed' | 'attached' }) => void;
    onRenderObserved: (observation: {
      equipmentState: WeaponEquipmentState;
      motion: 'idle' | 'walk';
      view: 'close' | 'orbit' | 'play';
      facing: 0 | 1 | 2 | 3 | 4 | 5;
      attachmentCode: 'unarmed' | 'attached';
    }) => void;
  }) => {
    const {
      equipmentState,
      motion,
      view,
      facing,
      presentation,
      onAttachmentStatus,
      onRenderObserved,
    } = props;
    const code = presentation ? 'attached' : 'unarmed';

    useEffect(() => {
      onAttachmentStatus({ code });
      onRenderObserved({
        equipmentState,
        motion,
        view,
        facing,
        attachmentCode: code,
      });
    }, [
      code,
      equipmentState,
      facing,
      motion,
      onAttachmentStatus,
      onRenderObserved,
      view,
    ]);

    return (
      <div
        data-testid="mock-weapon-preview"
        data-class-id={props.classId ?? 'fighter'}
      >
        {props.equipmentState}|{props.motion}|{props.view}|{props.facing}
      </div>
    );
  },
}));

function setSearch(search: string) {
  window.history.replaceState({}, '', search);
}

const FORBIDDEN_TERMS = /(position|rotation|scale|nudge|transform)/i;

function forbiddenTransformControls() {
  return Array.from(
    document.body.querySelectorAll(
      'button, input:not([type="hidden"]), select, textarea, [role], [contenteditable="true"]'
    )
  ).flatMap((element) => {
    const role = element.getAttribute('role')?.trim();
    const name = (
      element.getAttribute('aria-label') ??
      element.textContent ??
      ''
    ).trim();

    if (FORBIDDEN_TERMS.test(name)) return [name];
    if (role && FORBIDDEN_TERMS.test(role)) return [role];
    return [];
  });
}

describe('WeaponAttachmentConcept', () => {
  it('formats texture budget comparisons from the measured values', () => {
    expect(formatTextureBudget(4, 4.5)).toBe(
      '4 MB <= 4.5 MB production budget'
    );
    expect(formatTextureBudget(8, 4.5)).toBe('8 MB > 4.5 MB production budget');
  });

  beforeEach(() => {
    setSearch('/');
  });

  it('renders lab controls, inspector values, and the gated non-production verdict', () => {
    render(<WeaponAttachmentConcept />);

    expect(
      screen.getByRole('heading', { name: /Equipped Weapon Lab/i })
    ).toBeTruthy();
    expect(screen.getByTestId('equipped-ref').textContent).toContain('unarmed');
    expect(screen.getByTestId('candidate-source').textContent).toContain(
      'none'
    );
    expect(screen.getByTestId('candidate-url').textContent).toContain('none');
    expect(screen.getByTestId('attachment-status').textContent).toContain(
      'unarmed'
    );
    expect(screen.getByTestId('texture-warning').textContent).toContain('none');
    expect(screen.getByTestId('socket-profile').textContent).toBe(
      'Hand_R · bone units 0.01m · pos [-0.113569, 0.043781, -0.007072] · quat [-0.317175, -0.455560, 0.682831, 0.474981] · scale 1'
    );

    expect(forbiddenTransformControls()).toEqual([]);

    fireEvent.click(screen.getByRole('button', { name: 'Longsword' }));
    expect(screen.getByTestId('equipped-ref').textContent).toContain(
      'dnd5e:item:longsword'
    );
    expect(screen.getByTestId('candidate-source').textContent).toContain(
      'rpg-game-assets#71'
    );
    expect(screen.getByTestId('candidate-url').textContent).toContain(
      '/models/synty/weapons/longsword.glb'
    );
    expect(screen.getByTestId('texture-warning').textContent).toContain(
      '4 MB <= 4.5 MB'
    );
    expect(screen.getByTestId('attachment-status').textContent).toContain(
      'attached'
    );

    fireEvent.click(screen.getByRole('button', { name: 'Shortbow' }));
    expect(screen.getByTestId('equipped-ref').textContent).toContain(
      'dnd5e:item:shortbow'
    );
    expect(screen.getByTestId('texture-warning').textContent).toContain(
      '4 MB <= 4.5 MB'
    );

    for (const label of [
      'Shortsword',
      'Dagger',
      'Greataxe',
      'Quarterstaff',
      'Greatsword',
      'Battleaxe',
      'Handaxe',
      'Club',
      'Greatclub',
      'Warhammer',
    ]) {
      fireEvent.click(screen.getByRole('button', { name: label }));
    }
    fireEvent.click(screen.getByRole('button', { name: 'Walk' }));
    fireEvent.click(screen.getByRole('button', { name: 'Full orbit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Hand close-up' }));
    fireEvent.click(screen.getByRole('button', { name: 'Tactical play' }));
    for (const label of ['E', 'NE', 'NW', 'W', 'SW', 'SE']) {
      fireEvent.click(screen.getByRole('button', { name: `Facing ${label}` }));
    }
    fireEvent.click(screen.getByRole('button', { name: 'Unarmed' }));

    expect(screen.getByTestId('coverage-status').textContent).toContain(
      'equipment 13/13 · motion 2/2 · views 3/3 · facings 6/6'
    );

    const record = screen.getByRole('button', {
      name: 'Record non-production verdict',
    }) as HTMLButtonElement;
    expect(record.disabled).toBe(false);
    fireEvent.click(record);
    expect(screen.getByTestId('provisional-verdict').textContent).toContain(
      'NON-PRODUCTION CONCEPT EVIDENCE'
    );
  });

  it('reviews every current class against the complete 12-weapon provider roster', () => {
    render(<WeaponAttachmentConcept />);

    for (const label of ['Fighter', 'Barbarian', 'Monk', 'Rogue']) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy();
    }
    for (const label of [
      'Shortbow',
      'Longsword',
      'Shortsword',
      'Dagger',
      'Greataxe',
      'Quarterstaff',
      'Greatsword',
      'Battleaxe',
      'Handaxe',
      'Club',
      'Greatclub',
      'Warhammer',
    ]) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy();
    }

    fireEvent.click(screen.getByRole('button', { name: 'Rogue' }));
    fireEvent.click(screen.getByRole('button', { name: 'Greatsword' }));

    expect(screen.getByTestId('mock-weapon-preview').dataset.classId).toBe(
      'rogue'
    );
    expect(screen.getByTestId('equipped-ref').textContent).toContain(
      'dnd5e:item:greatsword'
    );
    expect(screen.getByTestId('candidate-url').textContent).toContain(
      '/models/synty/weapons/greatsword.glb'
    );
  });

  it('registers the weapon attachment deep link in ConceptsView', () => {
    setSearch('/?concept=weapon-attachment');

    render(<ConceptsView onBack={() => {}} />);

    expect(
      screen.getByRole('heading', { name: /Equipped Weapon Lab/i })
    ).toBeTruthy();
  });

  it('reads allowlisted deep-link fixture state once on initial render', () => {
    setSearch(
      '/?concept=weapon-attachment&weapon=shortbow&motion=walk&view=close&facing=4'
    );

    render(<WeaponAttachmentConcept />);

    expect(screen.getByTestId('equipped-ref').textContent).toContain(
      'dnd5e:item:shortbow'
    );
    expect(screen.getByTestId('attachment-status').textContent).toContain(
      'attached'
    );
    expect(screen.getByTestId('mock-weapon-preview').textContent).toBe(
      'shortbow|walk|close|4'
    );
  });

  it('falls back to documented defaults when deep-link params are invalid', () => {
    setSearch(
      '/?concept=weapon-attachment&weapon=axe&motion=run&view=side&facing=9'
    );

    render(<WeaponAttachmentConcept />);

    expect(screen.getByTestId('equipped-ref').textContent).toContain('unarmed');
    expect(screen.getByTestId('attachment-status').textContent).toContain(
      'unarmed'
    );
    expect(screen.getByTestId('mock-weapon-preview').textContent).toBe(
      'unarmed|idle|play|0'
    );
  });

  it('the forbidden-control guard catches non-button transform widgets too', () => {
    render(
      <div>
        <div aria-label="Position X" role="slider" />
        <div aria-label="Rotation Y" role="spinbutton" />
        <div aria-label="Scale note" role="textbox" />
        <select aria-label="Nudge preset">
          <option>1 cm</option>
        </select>
        <div aria-label="Transform picker" role="combobox" />
        <div aria-label="Safe label" role="transform-editor" tabIndex={0} />
      </div>
    );

    expect(forbiddenTransformControls()).toEqual([
      'Position X',
      'Rotation Y',
      'Scale note',
      'Nudge preset',
      'Transform picker',
      'transform-editor',
    ]);
  });
});
