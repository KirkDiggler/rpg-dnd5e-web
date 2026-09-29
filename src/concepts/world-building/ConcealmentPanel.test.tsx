import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { ConcealmentPanel } from './ConcealmentPanel';
import { decodeWorldBuilderV4Site } from './fixtures/worldBuilderV4Site';
import type { SiteScope } from './siteScope';

function Harness({ initial = {} }: { initial?: SiteScope }) {
  const [scope, setScope] = useState(initial);
  const [activeId, onActivate] = useState<string | null>(null);
  return (
    <>
      <ConcealmentPanel
        scope={scope}
        onChange={setScope}
        items={decodeWorldBuilderV4Site().draft.scene.items}
        activeId={activeId}
        onActivate={onActivate}
      />
      <output data-testid="scope">{JSON.stringify(scope)}</output>
    </>
  );
}
const value = (): SiteScope =>
  JSON.parse(screen.getByTestId('scope').textContent!);

describe('ConcealmentPanel', () => {
  it('creates a declaration, edits shared check rows, drops empty notice, removes the last declaration', () => {
    render(<Harness />);
    fireEvent.click(screen.getByText('New concealment'));
    expect(value().concealments?.['secret-1']?.checks).toHaveLength(1);
    expect(
      (
        screen.getByLabelText(
          'Remove approach 0 from secret-1 checks'
        ) as HTMLButtonElement
      ).disabled
    ).toBe(true);
    fireEvent.change(
      screen.getByLabelText('Ability for approach 0 of secret-1 checks'),
      { target: { value: 'investigation' } }
    );
    fireEvent.change(
      screen.getByLabelText('DC for approach 0 of secret-1 checks'),
      { target: { value: '17' } }
    );
    fireEvent.change(
      screen.getByLabelText('Tool for approach 0 of secret-1 checks'),
      { target: { value: 'thieves-tools' } }
    );
    expect(value().concealments?.['secret-1']?.checks[0]).toEqual({
      ability: 'investigation',
      dc: 17,
      tool: 'thieves-tools',
    });
    fireEvent.click(screen.getByLabelText('Add approach to secret-1 notice'));
    expect(value().concealments?.['secret-1']?.notice).toHaveLength(1);
    fireEvent.click(
      screen.getByLabelText('Remove approach 0 from secret-1 notice')
    );
    expect(value().concealments?.['secret-1']?.notice).toBeUndefined();
    fireEvent.click(screen.getByLabelText('Remove concealment secret-1'));
    expect(value()).toEqual({});
  });
  it('starts and finishes canvas picking, lists only members, and removes without deleting scene items', () => {
    const item = decodeWorldBuilderV4Site().draft.scene.items[0]!;
    render(
      <Harness
        initial={{
          concealments: {
            'secret-1': {
              checks: [{ ability: 'perception', dc: 15 }],
              props: [item.id],
              cells: [{ q: 0, r: 0 }],
            },
          },
          intel: [{ id: 'map', reveals: { concealment: 'secret-1' } }],
        }}
      />
    );
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    fireEvent.click(screen.getByLabelText('Add members to secret-1'));
    expect(
      screen
        .getByLabelText('Done adding members to secret-1')
        .getAttribute('aria-pressed')
    ).toBe('true');
    const input = screen.getByLabelText('Concealment id for secret-1');
    fireEvent.change(input, { target: { value: 'vault' } });
    fireEvent.blur(input);
    expect(value().concealments?.vault?.props).toEqual([item.id]);
    expect(screen.getByLabelText('Done adding members to vault')).toBeTruthy();
    expect(value().intel?.[0]?.reveals).toEqual({ concealment: 'secret-1' });
    fireEvent.click(screen.getByLabelText(`Remove prop ${item.id} from vault`));
    fireEvent.click(screen.getByLabelText('Remove hex 0,0 from vault'));
    expect(value().concealments?.vault?.props).toBeUndefined();
    expect(value().concealments?.vault?.cells).toBeUndefined();
    fireEvent.click(screen.getByLabelText('Done adding members to vault'));
    expect(
      screen.getByLabelText('Add members to vault').getAttribute('aria-pressed')
    ).toBe('false');
  });
  it('refuses a duplicate rename without losing either secret', () => {
    render(<Harness />);
    fireEvent.click(screen.getByText('New concealment'));
    fireEvent.click(screen.getByText('New concealment'));
    const input = screen.getByLabelText('Concealment id for secret-1');
    fireEvent.change(input, { target: { value: 'secret-2' } });
    fireEvent.blur(input);
    expect(screen.getByRole('alert').textContent).toMatch(/already declared/);
    expect(Object.keys(value().concealments!)).toEqual([
      'secret-1',
      'secret-2',
    ]);
  });
});
