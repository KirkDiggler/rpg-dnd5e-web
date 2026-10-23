import { create } from '@bufbuild/protobuf';
import {
  MemberKind,
  PublicMemberInfoSchema,
  type PublicMemberInfo,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PortraitCaptureProps } from './PortraitCapture';
import { PortraitProvider } from './PortraitProvider';
import { usePortrait } from './usePortrait';

const capture = vi.hoisted(() => ({ render: vi.fn() }));
vi.mock('./PortraitCapture', () => ({
  PortraitCapture: (props: PortraitCaptureProps) => {
    capture.render(props);
    return null;
  },
}));

const hero = (id: string, color = 0x123456) =>
  create(PublicMemberInfoSchema, {
    id,
    name: id,
    kind: MemberKind.PLAYER,
    raceRef: 'human',
    classRef: 'fighter',
    customization: { hair: { colorSrgb: color } },
  });
function Reader({ id }: { id: string }) {
  const portrait = usePortrait(id);
  return <output data-testid={id}>{JSON.stringify(portrait)}</output>;
}
function tree(members: PublicMemberInfo[], scopeKey = 'owner/session') {
  return (
    <PortraitProvider scopeKey={scopeKey} members={members}>
      <Reader id="a" />
      <Reader id="b" />
    </PortraitProvider>
  );
}
function latest(): PortraitCaptureProps {
  return capture.render.mock.calls.at(-1)![0];
}
function result(id = 'a') {
  return JSON.parse(screen.getByTestId(id).textContent!);
}
beforeEach(() => capture.render.mockClear());
afterEach(cleanup);

describe('portrait provider consumer', () => {
  it('shares one image for matching appearances and removes the capture after completion', () => {
    render(tree([hero('a'), hero('b')]));
    expect(result().status).toBe('loading');
    const request = latest();
    act(() =>
      request.onComplete(request.source.key, 'data:image/png;base64,first')
    );
    expect(result()).toMatchObject({
      status: 'ready',
      image: 'data:image/png;base64,first',
    });
    expect(result('b')).toEqual(result());
    const calls = capture.render.mock.calls.length;
    act(() =>
      request.onComplete(request.source.key, 'data:image/png;base64,duplicate')
    );
    expect(result().image).toBe('data:image/png;base64,first');
    expect(capture.render).toHaveBeenCalledTimes(calls);
  });

  it('hides the old image immediately on an appearance change and ignores its late completion', () => {
    const view = render(tree([hero('a')]));
    const old = latest();
    act(() => old.onComplete(old.source.key, 'data:image/png;base64,old'));
    view.rerender(tree([hero('a', 0)]));
    expect(result()).toMatchObject({ status: 'loading' });
    expect(result().image).toBeUndefined();
    act(() => old.onComplete(old.source.key, 'data:image/png;base64,late'));
    expect(result().status).toBe('loading');
    const next = latest();
    act(() => next.onComplete(next.source.key, 'data:image/png;base64,new'));
    expect(result().image).toBe('data:image/png;base64,new');
  });

  it('separates cache scopes even for the same appearance', () => {
    const members = [hero('a')];
    const view = render(tree(members));
    const old = latest();
    act(() => old.onComplete(old.source.key, 'data:image/png;base64,private'));
    view.rerender(tree(members, 'another-owner/session'));
    expect(result().status).toBe('loading');
    act(() => old.onComplete(old.source.key, 'data:image/png;base64,late'));
    expect(result().image).toBeUndefined();
  });

  it('returns unavailable for removed members and never carries their last image', () => {
    const view = render(tree([hero('a')]));
    const request = latest();
    act(() =>
      request.onComplete(request.source.key, 'data:image/png;base64,old')
    );
    view.rerender(tree([]));
    expect(result()).toMatchObject({ status: 'unavailable' });
    expect(result().image).toBeUndefined();
  });

  it('moves on after a failed capture and reports the failure instead of a partial image', () => {
    render(tree([hero('a'), hero('b', 0)]));
    const first = latest();
    act(() => first.onError(first.source.key, 'Hair attachment rejected'));
    expect(result()).toMatchObject({
      status: 'error',
      message: 'Hair attachment rejected',
    });
    const next = latest();
    expect(next.source.key).not.toBe(first.source.key);
    act(() => next.onComplete(next.source.key, 'data:image/png;base64,second'));
    expect(result('b').status).toBe('ready');
  });

  it('settles all pending portraits on a root failure', () => {
    render(tree([hero('a'), hero('b', 0)]));
    act(() => latest().onRootError('WebGL unavailable'));
    expect(result()).toMatchObject({
      status: 'error',
      message: 'WebGL unavailable',
    });
    expect(result('b').status).toBe('error');
  });

  it('refuses ambiguous duplicate member IDs and missing scope without rendering', () => {
    const view = render(tree([hero('a'), hero('a', 0)]));
    expect(result().status).toBe('unavailable');
    expect(capture.render).not.toHaveBeenCalled();
    view.rerender(tree([hero('a')], ''));
    expect(result().status).toBe('unavailable');
    expect(capture.render).not.toHaveBeenCalled();
  });
});
