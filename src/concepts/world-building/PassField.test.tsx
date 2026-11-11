/**
 * A post's pass (rpg-project#928): a password or a recognition, switched and
 * typed; any other shape shown as written and never offered for change.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BindingPostPasses } from './BindingPostPasses';
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

  it('switches a password to a recognition on the word typed, and back', () => {
    const onChange = renderPass('admitted');
    fireEvent.change(screen.getByLabelText('Pass kind in gate-1 posted'), {
      target: { value: 'recognized' },
    });
    expect(onChange).toHaveBeenLastCalledWith({ recognized: 'admitted' });
  });

  it('a recognition offers the site’s topics and writes the one typed', () => {
    const onChange = renderPass({ recognized: 'admitted' });
    const topic = screen.getByLabelText(
      'Pass topic in gate-1 posted'
    ) as HTMLInputElement;
    expect(topic.value).toBe('admitted');
    const offered = [
      ...document.querySelectorAll(
        `datalist[id="${topic.getAttribute('list')}"] option`
      ),
    ].map((o) => (o as HTMLOptionElement).value);
    expect(offered).toEqual(['admitted', 'guest']);
    fireEvent.change(topic, { target: { value: 'welcome' } });
    expect(onChange).toHaveBeenLastCalledWith({ recognized: 'welcome' });
    fireEvent.change(screen.getByLabelText('Pass kind in gate-1 posted'), {
      target: { value: 'fact' },
    });
    expect(onChange).toHaveBeenLastCalledWith('admitted');
  });

  it.each([
    ['a list', [{ recognized: 'admitted' }, { fact: 'feast-tonight' }]],
    ['a not', { not: { recognized: 'admitted' } }],
    ['a form it does not know', { holds: 'seal' }],
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
        pass: { recognized: 'admitted' },
        at: [{ q: -4, r: 8 }],
      },
    },
  } as unknown as RoomMonsterBinding;

  it('edits the pass of a post and keeps every other key', () => {
    const onChange = vi.fn();
    render(
      <BindingPostPasses
        owner="captain"
        binding={captain}
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

  it('shows nothing for a creature that posts nothing', () => {
    render(
      <BindingPostPasses
        owner="cook"
        binding={{}}
        topics={[]}
        onChange={vi.fn()}
      />
    );
    expect(screen.queryByLabelText('Behavior posts for cook')).toBeNull();
  });
});
