import { create } from '@bufbuild/protobuf';
import {
  DeclarationSchema,
  Verb,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ConversationPanel } from './ConversationPanel';
afterEach(() => {
  cleanup();
  document
    .querySelectorAll('[data-test-conversation-host]')
    .forEach((e) => e.remove());
});
const declaration = create(DeclarationSchema, {
  id: 'speak-offer',
  verb: Verb.SPEAK,
  available: true,
  speakOptions: [
    {
      target: { case: 'memberId', value: 'captain' },
      optionId: 'greeting-opaque',
      line: 'We are here for the feast.',
      available: true,
    },
    {
      target: { case: 'memberId', value: 'captain' },
      optionId: 'secret',
      line: 'Hidden password',
      available: false,
    },
    {
      target: { case: 'propId', value: 'altar' },
      optionId: 'pray-opaque',
      line: 'Grant us passage.',
      available: true,
    },
  ],
});
const names = new Map([['captain', 'Guard Captain']]);
function host() {
  const element = document.createElement('div');
  element.setAttribute('data-test-conversation-host', '');
  document.body.append(element);
  return element;
}
it('mounts in the dock host and selecting a target does not send a line', () => {
  const target = vi.fn(),
    choose = vi.fn(),
    say = vi.fn(),
    container = host();
  render(
    <ConversationPanel
      declaration={declaration}
      memberNames={names}
      docked
      host={container}
      onTargetClick={target}
      onChooseTarget={choose}
      onSpeakOption={say}
    />
  );
  expect(container).toContainElement(
    screen.getByRole('region', { name: 'Conversation' })
  );
  fireEvent.click(screen.getByRole('button', { name: 'Guard Captain' }));
  expect(target).toHaveBeenCalledWith('captain');
  expect(say).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'altar' }));
  expect(choose).toHaveBeenCalledWith({ case: 'propId', value: 'altar' });
});
it('draws only supplied available lines and echoes their opaque id on explicit selection', () => {
  const say = vi.fn(),
    back = vi.fn(),
    cancel = vi.fn();
  render(
    <ConversationPanel
      declaration={declaration}
      memberNames={names}
      docked
      host={host()}
      target={{ case: 'memberId', value: 'captain' }}
      onTargetClick={vi.fn()}
      onChooseTarget={back}
      onSpeakOption={say}
      onCancel={cancel}
    />
  );
  expect(screen.getByText('What do you say to Guard Captain?')).toBeVisible();
  expect(screen.queryByText('Hidden password')).toBeNull();
  const line = screen.getByRole('button', {
    name: '“We are here for the feast.”',
  });
  expect(line).toHaveFocus();
  fireEvent.click(line);
  expect(say).toHaveBeenCalledExactlyOnceWith('greeting-opaque');
  fireEvent.click(
    screen.getByRole('button', { name: 'Speak to someone else' })
  );
  expect(back).toHaveBeenCalledWith(null);
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(cancel).toHaveBeenCalledOnce();
});
it('does not flash a desktop conversation at the map corner while its host is mounting', () => {
  render(
    <ConversationPanel
      declaration={declaration}
      memberNames={names}
      docked
      host={null}
      onTargetClick={vi.fn()}
    />
  );
  expect(screen.queryByRole('region', { name: 'Conversation' })).toBeNull();
});
