import { render, screen } from '@testing-library/react';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import { AttackDie3D, type AttackDie3DProps } from './AttackDie3D';
vi.mock('@react-three/fiber', () => ({
  Canvas: ({
    children,
    ...props
  }: React.PropsWithChildren<Record<string, unknown>>) => (
    <div data-testid="canvas" {...props}>
      {children}
    </div>
  ),
}));
vi.mock('./attackDieRuntime', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./attackDieRuntime')>();
  return { ...actual, getAttackDieRuntimeSnapshot: () => ({ status: 'idle' }) };
});
describe('AttackDie3D', () => {
  it('keeps one semantic fallback mounted and hides Canvas until truthful readiness', () => {
    render(
      <AttackDie3D
        result={20}
        presentationToken={1}
        phase="rolling"
        materialMode="raw"
        reducedMotion={false}
        fallback={<output>20 authoritative</output>}
      />
    );
    expect(screen.getAllByText('20 authoritative')).toHaveLength(1);
    expect(screen.queryByTestId('canvas')).toBeNull();
  });
  it('has no completion or result-release API', () => {
    type Forbidden = Extract<
      keyof AttackDie3DProps,
      'onComplete' | 'onResultRelease' | 'onPresentationComplete'
    >;
    expectTypeOf<Forbidden>().toEqualTypeOf<never>();
  });
  it('fails invalid results without clamping or arbitrary face display', () => {
    render(
      <AttackDie3D
        result={21}
        presentationToken={2}
        phase="rolling"
        materialMode="raw"
        reducedMotion={false}
        fallback={<output>21 authoritative</output>}
      />
    );
    expect(screen.queryByTestId('canvas')).toBeNull();
  });
});
