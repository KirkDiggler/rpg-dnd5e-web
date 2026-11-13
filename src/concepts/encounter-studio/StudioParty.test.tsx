import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { SiteScope } from '../world-building/siteScope';
import { createFakeStudioSession } from './fixtures/fakeStudioSession';
import { StudioParty } from './StudioParty';

afterEach(cleanup);

function mount(scope: SiteScope) {
  const base = createFakeStudioSession();
  const session = { ...base, document: { ...base.document, scope } };
  render(<StudioParty session={session} />);
  return session;
}

const pressed = () =>
  screen
    .getAllByRole('button')
    .filter((b) => b.getAttribute('aria-pressed') === 'true')
    .map((b) => b.textContent);

describe('StudioParty — the sharing dial (rpg-project#935)', () => {
  it('offers three stops in plain words; an unmarked site shows the default', () => {
    mount({});
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Each their own',
      'Shared view (default)',
      'Shared knowledge (not built yet)',
    ]);
    expect(pressed()).toEqual(['Shared view (default)']);
    expect(
      screen.getByLabelText('What the sharing stop means').textContent
    ).toBe(
      'Each player is shown what any party member perceives, and acts only on what their own character perceives.'
    );
    expect(screen.getByLabelText('Party sharing read back').textContent).toBe(
      "The party's sharing is not set, so it is shared view, the default."
    );
  });

  it('choosing a stop commits its word; the stop already shown commits nothing', () => {
    const session = mount({});
    fireEvent.click(screen.getByRole('button', { name: 'Each their own' }));
    expect(session.commitPartySharing).toHaveBeenCalledWith('own');
    fireEvent.click(
      screen.getByRole('button', { name: 'Shared view (default)' })
    );
    expect(session.commitPartySharing).toHaveBeenCalledTimes(1);
  });

  it('shared knowledge is allowed and says the site will be refused at launch', () => {
    mount({ party: { sharing: 'knowledge' } });
    expect(pressed()).toEqual(['Shared knowledge (not built yet)']);
    expect(screen.getByRole('alert').textContent).toContain(
      'refused at launch'
    );
    expect(screen.getByLabelText('Party sharing read back').textContent).toBe(
      "The party's sharing is set to shared knowledge. Shared knowledge is not built yet (rpg-project#937), so a run of this site is refused at launch."
    );
  });

  it('a word the studio does not know presses no stop and is named as written', () => {
    mount({ party: { sharing: 'telepathy' } });
    expect(pressed()).toEqual([]);
    expect(
      screen.getByLabelText('What the sharing stop means').textContent
    ).toContain('sharing: telepathy');
  });
});
