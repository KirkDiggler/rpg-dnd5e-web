import { PartySharing } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { SharingMode } from './SharingMode';

afterEach(cleanup);

describe('SharingMode (rpg-project#935)', () => {
  it.each([
    [
      PartySharing.OWN,
      'Each their own',
      'Each player is shown only what their own character perceives, and acts only on that.',
    ],
    [
      PartySharing.VIEW,
      'Shared view',
      'Each player is shown what any party member perceives, and acts only on what their own character perceives.',
    ],
    [
      PartySharing.KNOWLEDGE,
      'Shared knowledge',
      'Each player is shown what any party member perceives, and acts on what any party member has learned.',
    ],
  ])(
    '%s reads its label, with its meaning on hover and tap',
    (value, label, means) => {
      render(<SharingMode sharing={value} />);
      const button = screen.getByRole('button', { name: label });
      expect(button).toHaveAttribute('title', means);
      expect(screen.getByRole('note', { hidden: true })).not.toBeVisible();
      fireEvent.click(button);
      expect(screen.getByRole('note')).toHaveTextContent(means);
    }
  );

  it('shows nothing when the server does not report a mode', () => {
    const { container } = render(
      <SharingMode sharing={PartySharing.UNSPECIFIED} />
    );
    expect(container).toBeEmptyDOMElement();
    const absent = render(<SharingMode />);
    expect(absent.container).toBeEmptyDOMElement();
  });
});
