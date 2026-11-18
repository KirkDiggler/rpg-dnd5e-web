/**
 * THE TOAST'S HEADER NEVER SQUEEZES THE NAME (operator, playing the castle at
 * shared view: "the toast with the info is cramped"). A long two-word name
 * and a long through-tag: the name and its icon share one wrapper, the tag
 * is its own item in a wrapping row, and nothing lets the name break inside a
 * word. jsdom lays nothing out, so this asserts the structure and the rules
 * that make the browser wrap the tag beneath the name; every assertion fails
 * on the header it replaces (icon, name and tag as siblings in one
 * non-wrapping row, the name `overflow-wrap: anywhere`).
 */
import { create } from '@bufbuild/protobuf';
import {
  ActSchema,
  Family,
  Loudness,
  PartyKind,
  PartySchema,
  PerceivedSchema,
  Sense,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha2/act_pb';
import { cleanup, render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildActStory } from './actStory';
import { StoryNotices } from './StoryNotices';

afterEach(cleanup);

const css = readFileSync(resolve(__dirname, 'StoryNotices.module.css'), 'utf8');
/** One rule's declarations, by its exact selector. */
function rule(selector: string): string {
  const at = css.indexOf(`${selector} {`);
  expect(at, `rule ${selector}`).toBeGreaterThanOrEqual(0);
  return css.slice(at, css.indexOf('}', at));
}

const member = (id: string) =>
  create(PartySchema, { kind: PartyKind.MEMBER, id });
const context = {
  viewerMember: 'bard',
  memberNames: {
    bard: 'Bard',
    captain: 'Guard Captain',
    fighter: 'Toolkit Sandbox Fighter',
  },
};

function render500() {
  const act = create(ActSchema, {
    session: 's',
    id: 'x1',
    act: 'speak:1',
    verb: 'speak',
    family: Family.ACT,
    perceived: create(PerceivedSchema, {
      senses: [Sense.SIGHT, Sense.HEARING],
      via: [member('fighter')],
    }),
    body: {
      case: 'speech',
      value: {
        loudness: Loudness.SPEAK,
        place: { x: 0, y: 0 },
        speaker: member('captain'),
        words: 'Halt. State your business.',
      },
    },
  } as never);
  const [row] = buildActStory(
    [{ act, index: 0, seq: 1n, source: 'live', visible: true }],
    context
  );
  const { container } = render(
    <div style={{ width: 500 }}>
      <StoryNotices
        entries={[
          {
            ...row!,
            notice: { durationMs: 6000, held: false, dismiss: () => {} },
          },
        ]}
      />
    </div>
  );
  return container.querySelector('article header')!;
}

describe('the toast header', () => {
  it('the name and its icon share a wrapper; the tag is its own item beside it, in a wrapping row', () => {
    const header = render500();
    const who = header.querySelector('[data-part="who"]')!;
    const name = who.querySelector(':scope > [data-part="name"]')!;
    const tag = who.querySelector(':scope > [data-part="tag"]')!;
    expect(name.querySelector('svg')).not.toBeNull();
    expect(name.querySelector('strong')!.textContent).toBe('Guard Captain');
    expect(tag.textContent).toBe('Speech · through Toolkit Sandbox Fighter');
    // The tag is not a sibling of the name text: it can drop to its own line.
    expect(name.contains(tag)).toBe(false);
    // The close button is outside the wrapping row, so it stays top-right.
    const close = header.querySelector(':scope > button')!;
    expect(close.getAttribute('aria-label')).toMatch(/^Dismiss/);
    expect(who.contains(close)).toBe(false);
  });

  it('the row wraps, the name is never shrunk for the tag, and never breaks inside a word', () => {
    expect(rule('.who')).toMatch(/flex-wrap: wrap/);
    const name = rule('.name strong');
    expect(name).not.toMatch(/overflow-wrap: anywhere/);
    expect(name).not.toMatch(/word-break: break-all/);
    // A single word wider than the toast ends in an ellipsis.
    expect(name).toMatch(/text-overflow: ellipsis/);
    expect(name).toMatch(/overflow: hidden/);
    // The header's icon never shrinks away from the name.
    expect(rule('.name svg')).toMatch(/flex: none/);
    expect(css).not.toMatch(/\.identity strong \{[^}]*overflow-wrap: anywhere/);
  });
});
