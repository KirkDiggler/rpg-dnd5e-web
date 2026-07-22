/**
 * Reduced-motion CSS contract for the combat-pacing beat stage
 * (rpg-dnd5e-web#561, PR #579 review). `.beat-stage--reduced-motion`
 * must suppress every animated beat treatment — not just the die tumble
 * and the crit/nat-1 verdict animations, but also the Cue beat's
 * `armed-pulse` text pulse. A reviewer caught this gap: `.beat-cue`'s
 * `armed-pulse` animation had no `.beat-stage--reduced-motion` override,
 * so toggling reduced motion left the cue text pulsing.
 *
 * This is a focused test that reads `public/themes/base.css` directly
 * (this repo's theme CSS is a static file consumed at runtime, not a
 * CSS module or styled-components output, so there is no compiled
 * artifact to import and assert against in jsdom — reading the source
 * text and checking the reduced-motion selector's declaration block is
 * the most direct contract check available, matching this repo's
 * existing CSS-guard convention of grep-checking `dist/themes/base.css`
 * for the presence of a selector in `scripts/ci-check.sh`'s "Built theme
 * CSS carries the combat-HUD block" guard, web#563).
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

const CSS_PATH = resolve(__dirname, '../../../public/themes/base.css');
const css = readFileSync(CSS_PATH, 'utf-8');

/** Extracts a top-level CSS rule's declaration block body by selector,
 * e.g. `ruleBody(css, '.beat-stage--reduced-motion .beat-cue')` returns
 * the text between that selector's `{` and its matching `}`. Returns
 * `undefined` if the selector has no rule in the file at all — the RED
 * state before this fix, since `.beat-stage--reduced-motion .beat-cue`
 * doesn't exist yet. */
function ruleBody(source: string, selector: string): string | undefined {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(source);
  return match?.[1];
}

describe('combat-pacing reduced-motion CSS contract (base.css)', () => {
  it('suppresses the Cue beat armed-pulse animation under .beat-stage--reduced-motion', () => {
    const body = ruleBody(css, '.beat-stage--reduced-motion .beat-cue');
    expect(
      body,
      '.beat-stage--reduced-motion .beat-cue rule must exist'
    ).toBeDefined();
    expect(body).toMatch(/animation:\s*none/);
  });

  it('still suppresses the crit verdict glow under reduced motion (existing regression guard)', () => {
    const body = ruleBody(
      css,
      '.beat-stage--reduced-motion .beat-verdict--crit'
    );
    expect(body).toBeDefined();
    expect(body).toMatch(/animation:\s*none/);
  });

  it('still suppresses the nat-1 verdict wobble under reduced motion (existing regression guard)', () => {
    const body = ruleBody(
      css,
      '.beat-stage--reduced-motion .beat-verdict--nat1'
    );
    expect(body).toBeDefined();
    expect(body).toMatch(/animation:\s*none/);
  });

  it('leaves .beat-cue itself still animated (reduced motion only scopes .beat-stage--reduced-motion, base cue semantics unchanged)', () => {
    const body = ruleBody(css, '.beat-cue');
    expect(body).toBeDefined();
    expect(body).toMatch(/animation:\s*armed-pulse/);
  });
});
