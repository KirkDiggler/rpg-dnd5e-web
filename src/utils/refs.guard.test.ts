/**
 * The audit guard for rpg-dnd5e-web#947.
 *
 * A ref is `module:type:id` and `src/utils/refs.ts` is the only place that
 * takes one apart. Web used to carry 25 hand-rolled colon splits; most of
 * them read `.pop()` as "the name", which silently collapses
 * `dnd5e:props:chest:small` and `dnd5e:props:crate:small` onto "small" the
 * day content starts minting multi-part ids. A new hand-split is exactly
 * that regression coming back, and it would not fail any other test —
 * it just reads wrong on screen.
 *
 * So this test walks `src/` and fails on any colon split outside the
 * allow-list below. The allow-list is explicit and each entry says why:
 * everything on it splits an equipment CHOICE VALUE (`bundle_0:0:warhammer`,
 * `cat0:id:name`) or a test's own composite key, none of which is a ref.
 *
 * If you are adding a ref site, import from `@/utils/refs` instead. If you
 * are adding a genuinely non-ref split, add it here with its reason.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

// Vitest runs from the project root (see `test.include` in vite.config.ts,
// which is root-relative too). The "finds source files at all" case below
// is what catches a wrong root rather than letting the guard pass empty.
const SRC = resolve(process.cwd(), 'src');

// Built rather than written, so this file does not match its own needle.
const NEEDLES = ['.split(' + "':'" + ')', '.split(' + '":"' + ')'];

/** path (relative to `src/`, POSIX separators) -> why it is not a ref. */
const ALLOWED: Record<string, string> = {
  'utils/refs.ts': 'the one parser — this is the split every other site uses',
  'utils/equipmentDisplay.ts':
    'equipment choice values (`bundle_0:0:warhammer`), not refs',
  'character/creation/ClassSelectionModal.tsx':
    'equipment choice values: a bundle id and `cat<index>:<id>:<name>` selections',
  'character/creation/InteractiveCharacterSheet.tsx':
    'equipment choice values (`bundle_0:0:EQUIPMENT_WARHAMMER`), not refs',
  'character/creation/components/EquipmentChoiceSelector.tsx':
    'the `<optionKey>:<weaponId>` selection this select round-trips, not a ref',
  'components/ui/dice/RollGroupTray3D.test.tsx':
    'a test-local `<feelId>:<JSON pose>` signature, not a ref',
};

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, out);
    } else if (/\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

const FILES = walk(SRC);

function splitsColons(file: string): boolean {
  const text = readFileSync(file, 'utf8');
  return NEEDLES.some((needle) => text.includes(needle));
}

const offenders = FILES.filter(splitsColons).map((file) =>
  relative(SRC, file).split(sep).join('/')
);

describe('every ref is taken apart by src/utils/refs.ts and nowhere else', () => {
  it('finds source files to check at all', () => {
    expect(FILES.length).toBeGreaterThan(100);
  });

  it('has no colon split outside the allow-list', () => {
    expect(offenders.filter((path) => !(path in ALLOWED))).toEqual([]);
  });

  it('keeps the allow-list honest — no entry for a file that stopped', () => {
    const stale = Object.keys(ALLOWED).filter(
      (path) => !offenders.includes(path)
    );
    expect(stale).toEqual([]);
  });
});
