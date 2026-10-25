import { PortraitContext, type PortraitResult } from '@/portraits/usePortrait';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MemberPortrait } from './MemberPortrait';
afterEach(cleanup);
function tree(result: PortraitResult) {
  return (
    <PortraitContext.Provider value={new Map([['hero', result]])}>
      <MemberPortrait memberId="hero" name="Aldric Vale" />
    </PortraitContext.Provider>
  );
}
describe('member portrait', () => {
  it('renders the supplied image, not a model chosen from the name', () => {
    render(
      tree({
        status: 'ready',
        key: 'appearance',
        image: 'data:image/png;base64,one',
      })
    );
    expect(
      screen.getByRole('img', { name: 'Aldric Vale portrait' })
    ).toHaveAttribute('src', 'data:image/png;base64,one');
  });
  it.each(['loading', 'unavailable', 'error'] as const)(
    'keeps a named %s fallback',
    (status) => {
      render(
        tree(
          status === 'loading'
            ? { status, key: 'a' }
            : status === 'error'
              ? { status, key: 'a', message: 'Capture failed' }
              : { status, message: 'No appearance' }
        )
      );
      expect(
        screen.getByRole('img', { name: `Aldric Vale portrait ${status}` })
      ).toHaveTextContent('AV');
      expect(document.querySelector('img')).toBeNull();
    }
  );
  it('drops the old image immediately when a changed appearance is loading', () => {
    const view = render(
      tree({ status: 'ready', key: 'old', image: 'old.png' })
    );
    view.rerender(tree({ status: 'loading', key: 'new' }));
    expect(document.querySelector('img')).toBeNull();
  });
  it('handles decode failure and recovers for a different image', () => {
    const view = render(tree({ status: 'ready', key: 'a', image: 'bad.png' }));
    fireEvent.error(screen.getByRole('img', { name: 'Aldric Vale portrait' }));
    expect(
      screen.getByRole('img', { name: 'Aldric Vale portrait error' })
    ).toHaveTextContent('AV');
    view.rerender(tree({ status: 'ready', key: 'a', image: 'good.png' }));
    expect(
      screen.getByRole('img', { name: 'Aldric Vale portrait' })
    ).toHaveAttribute('src', 'good.png');
  });
});
