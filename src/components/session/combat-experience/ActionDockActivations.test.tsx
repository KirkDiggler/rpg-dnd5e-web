import { SESSION_COMBAT_FIXTURES } from '@/concepts/session-combat/fixtures';
import {
  Slot,
  TargetKind,
  Verb,
  type Declaration,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ActionDock } from './ActionDock';

const fixture = SESSION_COMBAT_FIXTURES[0]!;

// Overrides are loosely typed on purpose: these fixtures stand in for wire
// messages, and spelling every nested proto field ($typeName and all) would
// make each case unreadable for no assertion gained.
function activation(overrides: Record<string, unknown> = {}): Declaration {
  return {
    verb: Verb.ACTIVATE,
    slot: Slot.ACTION,
    available: true,
    id: 'v1.dodge',
    targetKind: TargetKind.NONE,
    candidates: [],
    ability: { ref: 'dnd5e:combat_abilities:dodge', name: 'Dodge' },
    ...overrides,
  } as unknown as Declaration;
}

function dockWith(declarations: Declaration[], onSelect = vi.fn()) {
  render(
    <ActionDock
      clock={fixture.clock}
      viewerMember={fixture.viewerMember}
      participants={fixture.participants}
      declarations={declarations}
      authorityFresh
      onSelectDeclaration={onSelect}
      onEndTurn={vi.fn()}
    />
  );
  return onSelect;
}

/** The decorative tooltip card in the same offer slot as a button. */
function cardFor(button: HTMLElement): HTMLElement {
  const card = button
    .closest('span')
    ?.querySelector<HTMLElement>('[class*="actionTooltip"]');
  if (!card) throw new Error('no tooltip card in this offer slot');
  return card;
}

/** The node a button points at with aria-describedby. */
function describedTooltip(button: HTMLElement): HTMLElement {
  const id = button.getAttribute('aria-describedby');
  if (!id) throw new Error('button has no aria-describedby');
  const tooltip = document.getElementById(id);
  if (!tooltip) throw new Error(`no tooltip with id ${id}`);
  return tooltip;
}

describe('ActionDock renders what a member can activate', () => {
  // THE LABEL COMES FROM THE SERVER. There is no ref-to-name table in this
  // client, so an ability renamed upstream renames the button with no client
  // change at all.
  it('labels an activation with the name the server authored', () => {
    dockWith([activation()]);
    expect(screen.getByRole('button', { name: /Dodge/ })).toBeTruthy();
  });

  it('renders many rows for one verb, each with its own slot badge', () => {
    dockWith([
      activation({ id: 'v1.dodge' }),
      activation({
        id: 'v1.rage',
        slot: Slot.BONUS,
        ability: { ref: 'dnd5e:features:rage', name: 'Rage' },
      }),
    ]);

    // One verb, two shapes, live at the same moment — the case that forces
    // multiple declarations per verb rather than making it a preference.
    expect(screen.getByRole('button', { name: /Dodge/ })).toBeTruthy();
    const rage = screen.getByRole('button', { name: /Rage/ });
    expect(rage).toBeTruthy();
    expect(rage.querySelector('[data-cost="bonus-action"]')).not.toBeNull();
  });

  it('disables a refused activation and shows the server’s own words', () => {
    dockWith([
      activation({
        id: 'v1.rage',
        available: false,
        why: { text: 'no rage uses remaining' },
        ability: { ref: 'dnd5e:features:rage', name: 'Rage' },
      }),
    ]);

    const rage = screen.getByRole('button', { name: /Rage/ });
    expect((rage as HTMLButtonElement).disabled).toBe(true);
    // The refusal now lives in the tooltip the button describes itself by,
    // rather than a native title -- same contract, the server's own words.
    expect(describedTooltip(rage).textContent).toContain(
      'no rage uses remaining'
    );
  });

  it('hands the whole declaration back on click, selector included', () => {
    const dodge = activation();
    const onSelect = dockWith([dodge]);

    fireEvent.click(screen.getByRole('button', { name: /Dodge/ }));

    expect(onSelect).toHaveBeenCalledWith(dodge);
  });

  // HELP IS DRAWN NOW. It was held back while its declaration said
  // TARGET_KIND_MEMBER and carried no candidate universe — a control nothing
  // could drive. rpg-toolkit#1274 gave it one, so the dock draws every
  // activation the server offers and decides nothing itself.
  it('draws an activation that asks for a target', () => {
    dockWith([
      activation(),
      activation({
        id: 'v1.help',
        targetKind: TargetKind.MEMBER,
        ability: { ref: 'dnd5e:combat_abilities:help', name: 'Help' },
        candidates: [{ member: 'bob', available: true }],
      }),
    ]);

    expect(screen.getByRole('button', { name: /Dodge/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Help/ })).toBeTruthy();
  });

  // And a Help with nobody to help is drawn DISABLED with the server's reason,
  // rather than dropped — the same treatment every other refused offer gets.
  it('draws a Help with no available ally as a disabled button', () => {
    dockWith([
      activation({
        id: 'v1.help',
        targetKind: TargetKind.MEMBER,
        available: false,
        why: { text: 'no ally within reach' },
        ability: { ref: 'dnd5e:combat_abilities:help', name: 'Help' },
        candidates: [],
      }),
    ]);

    const help = screen.getByRole('button', { name: /Help/ });
    expect((help as HTMLButtonElement).disabled).toBe(true);
    expect(describedTooltip(help).textContent).toContain(
      'no ally within reach'
    );
  });

  // Copilot on #839: the visual card is revealed with `visibility`, and a node
  // hidden that way is an unreliable aria-describedby target. So the
  // description is its own genuinely-rendered sr-only node, and the card is
  // decoration.
  it('describes the button with a real node, not the visibility-hidden card', () => {
    dockWith([
      activation({
        ability: { ref: 'dnd5e:features:rage', name: 'Rage' },
        slot: Slot.BONUS,
      }),
    ]);

    const rage = screen.getByRole('button', { name: /Rage/ });
    const description = describedTooltip(rage);

    // Not the decorative card...
    expect(description.getAttribute('aria-hidden')).toBeNull();
    // ...and outside the button, so it never joins the accessible NAME.
    expect(rage.contains(description)).toBe(false);
    expect(description.textContent).toContain('Rage');
    expect(description.textContent).toContain('Bonus action');
  });

  it('hides the decorative card from assistive tech so nothing is said twice', () => {
    dockWith([activation()]);

    const dodge = screen.getByRole('button', { name: /Dodge/ });
    const card = cardFor(dodge);
    expect(card.getAttribute('aria-hidden')).toBe('true');
    expect(card.textContent).toContain('Dodge');
  });

  // Kirk's screenshot, 2026-08-28: on a REFUSED offer the card was washed out
  // and the dock's identity row painted straight through it.
  // `.actionOffer:disabled` sets opacity; opacity applies to the whole subtree
  // AND opens a stacking context; and the card used to be a child of the
  // button. It has to stay a sibling -- the bug was worst on exactly the offer
  // whose refusal the card exists to explain.
  it('keeps the card outside the button, so a disabled offer cannot fade it', () => {
    dockWith([
      activation({
        available: false,
        why: { text: 'no target in reach' },
        ability: { ref: 'dnd5e:weapons:greataxe', name: 'Greataxe' },
      }),
    ]);

    const greataxe = screen.getByRole('button', { name: /Greataxe/ });
    expect((greataxe as HTMLButtonElement).disabled).toBe(true);

    const card = cardFor(greataxe);
    expect(greataxe.contains(card)).toBe(false);
    expect(card.textContent).toContain('no target in reach');
  });

  it('keeps the whole tooltip out of the button’s accessible name', () => {
    dockWith([activation()]);
    // Had the description been rendered inside the button, its lines would
    // join the name and the button would answer to "Costs". Asserted this way
    // rather than on an exact string, because accessible-name whitespace
    // differs between jsdom and real browsers and is not the point here.
    expect(screen.queryByRole('button', { name: /Costs/ })).toBeNull();
    expect(screen.getByRole('button', { name: /^Dodge/ })).toBeTruthy();
  });
});
