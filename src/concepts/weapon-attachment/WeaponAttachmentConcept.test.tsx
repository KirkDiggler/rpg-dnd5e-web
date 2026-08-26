import { fireEvent, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConceptsView } from '../ConceptsView';
import { WeaponAttachmentConcept } from './WeaponAttachmentConcept';

vi.mock('./WeaponAttachmentPreview', () => ({
  WeaponAttachmentPreview: (props: {
    equipmentState: 'unarmed' | 'longsword' | 'shortbow';
    motion: 'idle' | 'walk';
    view: 'close' | 'orbit' | 'play';
    facing: 0 | 1 | 2 | 3 | 4 | 5;
    presentation?: { ref: string };
    onAttachmentStatus: (status: { code: 'unarmed' | 'attached' }) => void;
    onRenderObserved: (observation: {
      equipmentState: 'unarmed' | 'longsword' | 'shortbow';
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
      <div data-testid="mock-weapon-preview">
        {props.equipmentState}|{props.motion}|{props.view}|{props.facing}
      </div>
    );
  },
}));

function setSearch(search: string) {
  window.history.replaceState({}, '', search);
}

describe('WeaponAttachmentConcept', () => {
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
      'Hand_R · bone units 0.01m · pos [-0.113567, 0.043773, -0.007070] · quat [-0.560139, -0.804964, 0.160704, 0.111588] · scale 1'
    );

    for (const name of [
      'position',
      'rotation',
      'scale',
      'nudge',
      'transform',
    ]) {
      expect(
        screen.queryByRole('button', { name: new RegExp(name, 'i') })
      ).toBe(null);
    }

    fireEvent.click(screen.getByRole('button', { name: 'Longsword' }));
    expect(screen.getByTestId('equipped-ref').textContent).toContain(
      'dnd5e:item:longsword'
    );
    expect(screen.getByTestId('candidate-source').textContent).toContain(
      'SM_Wep_Slayer_01'
    );
    expect(screen.getByTestId('texture-warning').textContent).toContain(
      '16 MB > 4.5 MB'
    );
    expect(screen.getByTestId('attachment-status').textContent).toContain(
      'attached'
    );

    fireEvent.click(screen.getByRole('button', { name: 'Shortbow' }));
    expect(screen.getByTestId('equipped-ref').textContent).toContain(
      'dnd5e:item:shortbow'
    );
    expect(screen.getByTestId('texture-warning').textContent).toContain(
      '64 MB > 4.5 MB'
    );

    fireEvent.click(screen.getByRole('button', { name: 'Walk' }));
    fireEvent.click(screen.getByRole('button', { name: 'Full orbit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Hand close-up' }));
    fireEvent.click(screen.getByRole('button', { name: 'Tactical play' }));
    for (const label of ['E', 'NE', 'NW', 'W', 'SW', 'SE']) {
      fireEvent.click(screen.getByRole('button', { name: `Facing ${label}` }));
    }
    fireEvent.click(screen.getByRole('button', { name: 'Unarmed' }));

    expect(screen.getByTestId('coverage-status').textContent).toContain(
      'equipment 3/3 · motion 2/2 · views 3/3 · facings 6/6'
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
});
