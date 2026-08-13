import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AttackDie3DProps } from '../../components/ui/dice/AttackDie3D';
import { PROVISIONAL_RESULT_10_POSE } from './attackDieExperiment';
import { DiceTray3DConceptPanel } from './DiceTray3DConceptPanel';

const attackDieProps: AttackDie3DProps[] = [];
vi.mock('../../components/ui/dice/AttackDie3D', () => ({
  AttackDie3D: (props: AttackDie3DProps) => {
    attackDieProps.push(props);
    return <div data-testid="attack-die">{props.fallback}</div>;
  },
}));

describe('DiceTray3DConceptPanel', () => {
  it('renders the fixed result-10 die in the fixture gameplay placement', () => {
    localStorage.clear();
    attackDieProps.length = 0;
    const scene = {} as AttackDie3DProps['sceneOverride'];
    const sidecar = {} as NonNullable<AttackDie3DProps['sidecarOverride']>;

    render(
      <DiceTray3DConceptPanel
        token={9}
        sceneOverride={scene}
        sidecarOverride={sidecar}
      />
    );

    expect(screen.getByText('Gameplay placement checkpoint')).toBeTruthy();
    expect(
      screen.getByText('Result 10 only · no interaction yet')
    ).toBeTruthy();
    expect(screen.getByTestId('dice-tray-encounter-preview')).toBeTruthy();
    expect(screen.getByTestId('dice-tray-left-drawer')).toBeTruthy();
    expect(screen.getByTestId('encounter-dock')).toBeTruthy();
    expect(screen.getByTestId('attack-die')).toBeTruthy();
    expect(attackDieProps).toHaveLength(1);
    expect(attackDieProps[0]).toMatchObject({
      result: 10,
      presentationToken: 9,
      phase: 'settled',
      reducedMotion: true,
      sceneOverride: scene,
      sidecarOverride: sidecar,
      calibrationPose: PROVISIONAL_RESULT_10_POSE,
    });
    expect(screen.queryByRole('button', { name: /roll|grab/i })).toBeNull();
  });
});
