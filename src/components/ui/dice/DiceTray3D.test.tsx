import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AttackDie3DProps } from './AttackDie3D';
import type { AttackDieRuntimeSidecar } from './attackDieContract';
import { DiceTray3D, type DiceTray3DItem } from './DiceTray3D';

const attackDieProps: AttackDie3DProps[] = [];
vi.mock('./AttackDie3D', () => ({
  AttackDie3D: (props: AttackDie3DProps) => {
    attackDieProps.push(props);
    return <div data-testid="attack-die-3d-mock">{props.fallback}</div>;
  },
}));

const die: DiceTray3DItem = {
  id: 'attack',
  kind: 'd20',
  presetId: 'lightning',
  authoritativeResult: 10,
  presentationToken: 7,
};
const sceneOverride = {} as AttackDie3DProps['sceneOverride'];
const sidecarOverride = {} as AttackDieRuntimeSidecar;
const calibrationPose = [0.1, 0.2, 0.3, 0.4] as const;

function renderTray(dice: readonly DiceTray3DItem[] = [die]) {
  attackDieProps.length = 0;
  return render(
    <DiceTray3D
      label="Player attack tray"
      phase="settled"
      dice={dice}
      reducedMotion
      sceneOverride={sceneOverride}
      sidecarOverride={sidecarOverride}
      calibrationPose={calibrationPose}
    />
  );
}

describe('DiceTray3D', () => {
  it('renders exactly one allowlisted d20 and passes authoritative inputs unchanged', () => {
    renderTray();

    expect(screen.getByTestId('dice-tray-3d-renderer')).toBeTruthy();
    expect(screen.getByTestId('attack-die-3d-mock')).toBeTruthy();
    expect(attackDieProps).toHaveLength(1);
    expect(attackDieProps[0]).toMatchObject({
      result: 10,
      presentationToken: 7,
      phase: 'settled',
      reducedMotion: true,
      materialMode: 'magical',
      sceneOverride,
      sidecarOverride,
      calibrationPose,
    });
    expect(screen.getByTestId('d20-die')).toBeTruthy();
    expect(screen.getByTestId('dice-face').textContent).toBe('10');
  });

  it.each([
    ['empty', []],
    ['two items', [die, { ...die, id: 'second' }]],
    ['non-d20', [{ ...die, kind: 'd12' }]],
    ['unknown preset', [{ ...die, presetId: 'unknown' }]],
    ['result below range', [{ ...die, authoritativeResult: 0 }]],
    ['result above range', [{ ...die, authoritativeResult: 21 }]],
  ])(
    'renders semantic fallback and no renderer for %s input',
    (_name, dice) => {
      renderTray(dice as DiceTray3DItem[]);

      expect(screen.getByText(/Unable to display this dice tray/)).toBeTruthy();
      expect(screen.queryByTestId('attack-die-3d-mock')).toBeNull();
      expect(attackDieProps).toHaveLength(0);
    }
  );
});
