import { render } from '@testing-library/react';
import { useEffect } from 'react';
import { expect, it, vi } from 'vitest';

const lifecycle = vi.hoisted(() => ({
  events: [] as string[],
  presentations: [] as Array<{ main: unknown; off: unknown }>,
}));

vi.mock('@/components/hex-grid/ClassCharacterModel', () => ({
  ClassCharacterModel: ({
    url,
    mainHandPresentation,
    offHandPresentation,
  }: {
    url: string;
    mainHandPresentation?: unknown;
    offHandPresentation?: unknown;
  }) => {
    lifecycle.presentations.push({
      main: mainHandPresentation,
      off: offHandPresentation,
    });
    useEffect(() => {
      lifecycle.events.push(`mount:${url}`);
      return () => {
        lifecycle.events.push(`unmount:${url}`);
      };
    }, []);
    return <div data-testid="mock-class-model">{url}</div>;
  },
}));

vi.mock('@react-three/drei', () => ({
  PerspectiveCamera: () => null,
  OrthographicCamera: () => null,
  OrbitControls: () => null,
}));

import { OffHandAttachmentScene } from './OffHandAttachmentPreview';

it('keeps resolved hand presentation identities stable across status-only rerenders', () => {
  lifecycle.presentations.length = 0;
  const props = {
    stateId: 'longsword-shield' as const,
    classId: 'fighter' as const,
    raceId: 'human' as const,
    motion: 'idle' as const,
    view: 'orbit' as const,
    facing: 0 as const,
  };
  const view = render(<OffHandAttachmentScene {...props} />);
  const first = lifecycle.presentations.at(-1)!;
  view.rerender(<OffHandAttachmentScene {...props} />);
  const second = lifecycle.presentations.at(-1)!;
  expect(second.main).toBe(first.main);
  expect(second.off).toBe(first.off);
});

it('remounts the production character when the resolved model URL changes', () => {
  lifecycle.events.length = 0;
  const props = {
    stateId: 'shield-only' as const,
    classId: 'fighter' as const,
    raceId: 'human' as const,
    motion: 'idle' as const,
    view: 'orbit' as const,
    facing: 0 as const,
  };
  const view = render(<OffHandAttachmentScene {...props} />);
  view.rerender(<OffHandAttachmentScene {...props} raceId="dwarf" />);
  expect(
    lifecycle.events.filter((event) => event.startsWith('mount:'))
  ).toHaveLength(2);
  expect(lifecycle.events).toContain(
    'unmount:/models/synty/characters/fighter.glb'
  );
});
