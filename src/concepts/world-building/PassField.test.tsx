/**
 * A post's pass (rpg-project#928, #1005): a password or a holding (`holds`),
 * switched and typed; any other shape shown as written and never offered for change.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BindingPosts } from './BindingPostPasses';
import { PassField } from './PassField';
import type { RoomMonsterBinding } from './roomDraft';

function renderPass(value: unknown) {
  const onChange = vi.fn();
  render(
    <PassField
      label="gate-1 posted"
      value={value}
      topics={['admitted', 'guest']}
      onChange={onChange}
    />
  );
  return onChange;
}

describe('the pass field', () => {
  it('a password is a fact field, empty for nobody', () => {
    const onChange = renderPass('troupe-password');
    const fact = screen.getByLabelText(
      'Pass fact in gate-1 posted'
    ) as HTMLInputElement;
    expect(fact.value).toBe('troupe-password');
    fireEvent.change(fact, { target: { value: '' } });
    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });

  it('switches a password to a holding on the word typed, and back', () => {
    const onChange = renderPass('admitted');
    fireEvent.change(screen.getByLabelText('Pass kind in gate-1 posted'), {
      target: { value: 'holds' },
    });
    expect(onChange).toHaveBeenLastCalledWith({ holds: 'admitted' });
  });

  it('a holding offers the site’s holdings and writes the one typed', () => {
    const onChange = renderPass({ holds: 'admitted' });
    const topic = screen.getByLabelText(
      'Pass holding in gate-1 posted'
    ) as HTMLInputElement;
    expect(topic.value).toBe('admitted');
    const offered = [
      ...document.querySelectorAll(
        `datalist[id="${topic.getAttribute('list')}"] option`
      ),
    ].map((o) => (o as HTMLOptionElement).value);
    expect(offered).toEqual(['admitted', 'guest']);
    fireEvent.change(topic, { target: { value: 'welcome' } });
    expect(onChange).toHaveBeenLastCalledWith({ holds: 'welcome' });
    fireEvent.change(screen.getByLabelText('Pass kind in gate-1 posted'), {
      target: { value: 'fact' },
    });
    expect(onChange).toHaveBeenLastCalledWith('admitted');
  });

  it.each([
    ['a list', [{ holds: 'admitted' }, { fact: 'feast-tonight' }]],
    ['a not', { not: { holds: 'admitted' } }],
    ['a form it does not know', { carries: 'seal' }],
    ['the retired word', { recognized: 'admitted' }],
  ])('%s is shown as written and offered no change', (_name, value) => {
    renderPass(value);
    expect(
      screen.getByLabelText('Pass as written in gate-1 posted').textContent
    ).toBe(JSON.stringify(value));
    expect(screen.queryByLabelText('Pass kind in gate-1 posted')).toBeNull();
  });
});

describe('a creature’s behavior posts', () => {
  const captain = {
    behaviors: [{ id: 'policy', use: 'captain-policy' }],
    behaviorState: 'policy',
    posts: {
      ready: {
        door: 'gate-wall-door',
        against: 'entering',
        pass: { holds: 'admitted' },
        at: [{ q: -4, r: 8 }],
      },
    },
  } as unknown as RoomMonsterBinding;

  it('edits the pass of a post and keeps every other key', () => {
    const onChange = vi.fn();
    render(
      <BindingPosts
        owner="captain"
        binding={captain}
        scope={{}}
        topics={['admitted']}
        onChange={onChange}
      />
    );
    fireEvent.change(screen.getByLabelText('Pass kind in captain ready'), {
      target: { value: 'fact' },
    });
    expect(onChange).toHaveBeenLastCalledWith({
      ...captain,
      posts: {
        ready: {
          ...(captain as { posts: { ready: object } }).posts.ready,
          pass: 'admitted',
        },
      },
    });
  });

  it('says plainly when a creature runs no behaviour, and offers no post (rpg-project#975 D)', () => {
    render(
      <BindingPosts
        owner="cook"
        binding={{}}
        scope={{}}
        topics={[]}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByTestId('posts-no-behaviour-cook').textContent).toBe(
      'This creature runs no behaviour, so it has no state to hold a post in.'
    );
    expect(screen.queryByLabelText('Add post state for cook')).toBeNull();
  });
});
