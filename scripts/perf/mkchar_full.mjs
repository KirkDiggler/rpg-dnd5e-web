// Full character-creation driver for the #537 perf sweep -- creates ONE
// real character end-to-end via the actual wizard (Name/Race/Class/
// Background/Abilities -> Begin Adventure), matching the real-route
// convention from docs/evidence/idle-anim-506-real-route-reverify.md
// (real characters through the real wizard, not devseed fixtures).
//
// Learned the hard way (see explore*/debug*/e*.mjs in this dir):
//   - Filling the name field BEFORE opening the Race modal makes the
//     "Choose Race" click flaky (layout shift race) -- fill name LAST.
//   - Ability-score assignments and the name field are NOT persisted to
//     the draft on the server between page loads -- this whole flow must
//     run in one continuous browser session, no reload in between.
//   - The name field only commits to the draft on blur/Enter (.fill()
//     alone updates local input state only) -- must press Enter after.
//   - Both the Race and Class picker modals default-select a race/class
//     that VARIES per draft (looks server- or draft-seeded, not fixed).
//     The race icon strip only shows 7 of 9 races and doesn't support a
//     normal scrollIntoView, so clicking a specific named race is flaky
//     whenever it isn't in the initially-visible slice. Since the exact
//     race/class doesn't matter for this perf sweep (only a real,
//     finalized character does), this script ACCEPTS whichever race/
//     class the modal already has pre-selected rather than fighting the
//     picker -- it reads the name back (race: the h3 under the icon
//     strip; class: the second h2 in the modal) and picks its equipment/
//     skill plan accordingly. If the class rolls Fighter, the script
//     exits early with a distinct "ABORT_FIGHTER" line -- Fighter's
//     level-1 "fighting style" choice is required by the backend but
//     never rendered by this wizard build (ListClasses is called with
//     includeFeatures:false), so Begin Adventure always 400s for it. The
//     shell driver retries with a fresh playerId until it rolls one of
//     the three usable classes.
//
// Usage: node mkchar_full.mjs <baseUrl> <playerId> <charName>
import { chromium } from 'playwright';

const [baseUrl, playerId, charName] = process.argv.slice(2);
if (!baseUrl || !playerId || !charName) {
  console.error('usage: node mkchar_full.mjs <baseUrl> <playerId> <charName>');
  process.exit(1);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('pageerror', (e) => console.log(`[${playerId}] PAGEERROR:`, String(e)));

async function step(name, fn, attempt = 1) {
  try {
    return await fn();
  } catch (e) {
    if (attempt < 3) {
      console.log(`[${playerId}] retrying "${name}" (attempt ${attempt + 1})`);
      await page.waitForTimeout(800);
      return step(name, fn, attempt + 1);
    }
    console.log(`[${playerId}] FAIL at "${name}":`, String(e).slice(0, 300));
    await page.screenshot({
      path: `/tmp/mkchar-fail-${playerId}-${name}.png`,
      fullPage: true,
    });
    throw e;
  }
}

// Skill/equipment plan per class -- 2 (4 for Rogue, per 5e) skills off the
// class's own list + the first-listed CONCRETE (non-"Plus choices from
// categories") option in every equipment slot, so no slot needs a nested
// "choose a specific item" <select>. Fighter kept for reference/rerolls
// even though this sweep excludes it (see module docstring).
const CLASS_PLAN = {
  Fighter: {
    skills: ['Athletics', 'Perception'],
    equipmentByText: [
      /Chain mail/,
      /martial weapon and a shield/,
      /light crossbow/,
      /Dungeoneer/,
    ],
  },
  Barbarian: {
    skills: ['Athletics', 'Intimidation'],
    equipmentByText: [/Greataxe/, /Two handaxes/, /Explorer/],
  },
  Monk: {
    skills: ['Acrobatics', 'Stealth'],
    equipmentByText: [/Shortsword/, /Explorer/],
  },
  Rogue: {
    skills: ['Stealth', 'Acrobatics', 'Perception', 'Sleight of Hand'],
    equipmentByText: [/Rapier/, /Shortbow/, /Burglar/],
  },
};

// Opening any of the 4 section cards is oddly flaky: `.click()` on the
// card's h3 sometimes throws a "TimeoutError ... intercepts pointer
// events" even though the click DID register and the target modal ends
// up fully open (confirmed by screenshot -- looks like the modal itself
// becomes the intercepting element mid-actionability-check, which
// Playwright treats as a failure even though functionally nothing is
// wrong). So: attempt the click, but don't trust its own success/failure
// signal -- just poll for the modal heading afterward either way.
async function openModal(cardHeadingText, modalHeadingText) {
  // Verifying the modal actually opened (isVisible()/waitFor()) turned out
  // LESS reliable than just clicking and giving it a fixed settle window --
  // in every case inspected, the modal was demonstrably open in the
  // failure screenshot despite isVisible()/waitFor() reporting otherwise
  // (root cause not fully pinned down; suspect an h2/h3 query racing a
  // remount). Optimistic fixed wait + let downstream steps' own retry
  // logic catch a genuinely-not-open modal instead.
  for (let i = 0; i < 3; i++) {
    try {
      await page
        .locator(`h3:has-text("${cardHeadingText}")`)
        .click({ timeout: 8000 });
      break;
    } catch {
      await page.waitForTimeout(500);
    }
  }
  await page.waitForTimeout(1500);
  void modalHeadingText;
}

await page.goto(`${baseUrl}/?playerId=${playerId}`, {
  waitUntil: 'load',
  timeout: 30000,
});
await page.waitForTimeout(1500);

await step('create', () =>
  page.getByRole('button', { name: 'Create' }).click({ timeout: 15000 })
);
await page.waitForTimeout(1200);

await step('open-race', () => openModal('Choose Race', 'Choose Your Race'));
await page.waitForTimeout(500);

// Some races (Human: extra language; Dwarf: tool proficiency; possibly
// others) require a sub-choice this script doesn't fill in, so "Select
// <race>" silently fails validation and leaves the modal open. Detect
// that generically (did the modal actually close?) instead of
// maintaining a hardcoded "simple races" allowlist, and reroll to a
// different visible race tile when it happens.
const RACE_NAMES_EXACT =
  /^(Human|Dwarf|Elf|Halfling|Dragonborn|Gnome|Half-Elf|Half-Orc|Tiefling)$/;
// Tile buttons prefix the name with an emoji ("😈Tiefling"), so matching
// them needs the same alternation WITHOUT anchors.
const RACE_NAMES_LOOSE =
  /(Human|Dwarf|Elf|Halfling|Dragonborn|Gnome|Half-Elf|Half-Orc|Tiefling)/;
async function currentRaceName() {
  return (
    await page
      .locator('h3')
      .filter({ hasText: RACE_NAMES_EXACT })
      .first()
      .textContent({ timeout: 15000 })
  ).trim();
}
let raceName = await step('read-default-race', currentRaceName);
console.log(`[${playerId}] race: ${raceName}`);
for (let attempt = 0; attempt < 6; attempt++) {
  await step(`select-race-${raceName}`, () =>
    page
      .getByRole('button', { name: new RegExp('^Select ' + raceName) })
      .click({ timeout: 15000 })
  );
  await page.waitForTimeout(600);
  const stillOpen = await page
    .locator('h2:has-text("Choose Your Race")')
    .isVisible();
  if (!stillOpen) break;
  console.log(
    `[${playerId}] ${raceName} needs an unhandled sub-choice, rerolling race`
  );
  // Click whichever OTHER race tile is currently rendered (the carousel
  // always keeps several neighbors of the centered/selected race visible).
  // The carousel renders all 9 races in DOM (centered on the current
  // selection) but visually clips the ones farthest from center via
  // overflow:hidden -- .first()/.last() tend to land on a clipped,
  // non-visible one. The MIDDLE of the remaining (current-race-excluded)
  // matches is always one of the immediate on-screen neighbors.
  await step(`reroll-race-away-from-${raceName}`, async () => {
    const others = page
      .getByRole('button', { name: RACE_NAMES_LOOSE })
      .filter({ hasNotText: raceName });
    const count = await others.count();
    await others.nth(Math.floor(count / 2)).click({ timeout: 15000 });
  });
  await page.waitForTimeout(500);
  raceName = await step('read-rerolled-race', currentRaceName);
  console.log(`[${playerId}] rerolled race: ${raceName}`);
}
await page.waitForTimeout(1000);

await step('open-class', () => openModal('Choose Class', 'Choose Your Class'));
await page.waitForTimeout(500);

const CLASS_NAMES_EXACT = /^(Fighter|Barbarian|Monk|Rogue)$/;
async function currentClassName() {
  return (
    await page
      .locator('h2')
      .filter({ hasText: CLASS_NAMES_EXACT })
      .first()
      .textContent({ timeout: 15000 })
  ).trim();
}
let className = await step('read-default-class', currentClassName);
console.log(`[${playerId}] class: ${className}`);
// Fighter needs a "fighting style" pick this wizard build never renders
// (see module docstring) and Monk's tool/instrument pick doesn't reliably
// resolve generically -- unlike races (a 9-wide clipped carousel), all 4
// class tiles are always on-screen at once, so just click a known-good
// one directly instead of rerolling the whole character.
if (className === 'Fighter' || className === 'Monk' || className === 'Rogue') {
  const fallback = 'Barbarian';
  console.log(`[${playerId}] ${className} unusable, switching to ${fallback}`);
  await step(`switch-class-to-${fallback}`, () =>
    page
      .getByRole('button', { name: new RegExp(fallback) })
      .first()
      .click({ timeout: 15000 })
  );
  await page.waitForTimeout(800);
  className = await step('read-switched-class', currentClassName);
  console.log(`[${playerId}] class: ${className}`);
}
if (
  !CLASS_PLAN[className] ||
  className === 'Fighter' ||
  className === 'Monk' ||
  className === 'Rogue'
) {
  console.log(`[${playerId}] ABORT_UNKNOWN_CLASS ${className}`);
  await browser.close();
  process.exit(4);
}

await step('select-class-1', () =>
  page
    .getByRole('button', { name: new RegExp('^Select ' + className) })
    .click({ timeout: 15000 })
);
await page.waitForTimeout(1000);

const plan = CLASS_PLAN[className];
for (const skill of plan.skills) {
  await step(`skill-${skill}`, () =>
    page
      .getByRole('button', { name: skill, exact: true })
      .first()
      .click({ timeout: 15000 })
  );
  await page.waitForTimeout(250);
}
for (const eq of plan.equipmentByText) {
  await step(`equip-${eq}`, () =>
    page.getByRole('button', { name: eq }).first().click({ timeout: 15000 })
  );
  await page.waitForTimeout(300);
  // Handle a nested "choose a specific item" <select>, if this pick opened one.
  const nestedSelects = page.locator('select');
  const count = await nestedSelects.count();
  for (let i = 0; i < count; i++) {
    const sel = nestedSelects.nth(i);
    const val = await sel.inputValue();
    if (!val) {
      await step(`equip-${eq}-nested-select-${i}`, () =>
        sel.selectOption({ index: 1 })
      );
      await page.waitForTimeout(300);
    }
  }
}
// Some classes (Monk: an artisan's-tools-or-musical-instrument pick;
// possibly others) have one more required proficiency choice beyond
// skills/equipment that isn't worth a per-class plan entry -- generically
// resolve it: if "Select <class>" doesn't close the modal, click the
// first option in whatever bordered list is still showing a validation
// error and retry, up to a few rounds.
const TOOL_OR_INSTRUMENT_NAMES =
  /(Bagpipes|Drum|Dulcimer|Flute|Lute|Lyre|Horn|Pan flute|Shawm|Viol|Alchemist|Brewer|Calligrapher|Carpenter|Cartographer|Cobbler|Cook's|Glassblower|Jeweler|Leatherworker|Mason|Painter|Potter|Smith's|Tinker|Weaver|Woodcarver)/;
for (let attempt = 0; attempt < 4; attempt++) {
  await step(`select-class-2-attempt${attempt}`, () =>
    page
      .getByRole('button', { name: new RegExp('^Select ' + className) })
      .click({ timeout: 15000 })
  );
  await page.waitForTimeout(800);
  const stillOpen = await page
    .locator('h2:has-text("Choose Your Class")')
    .isVisible();
  if (!stillOpen) break;
  console.log(
    `[${playerId}] ${className} has an unhandled extra proficiency choice, resolving generically`
  );
  await step(`resolve-extra-proficiency-${attempt}`, () =>
    page
      .getByRole('button', { name: TOOL_OR_INSTRUMENT_NAMES })
      .first()
      .click({ timeout: 15000 })
  );
  await page.waitForTimeout(500);
}

await step('open-background', () =>
  openModal('Choose Background', 'Select Your Background')
);
await page.waitForTimeout(1000);
await step('select-background', () =>
  page
    .getByRole('button', { name: 'Select Background' })
    .click({ timeout: 15000 })
);
await page.waitForTimeout(1000);

await step('open-appearance', () =>
  openModal('Customize Appearance', 'Customize Appearance')
);
await page.waitForTimeout(1000);
await step('apply-appearance', () =>
  page.getByRole('button', { name: 'Apply' }).click({ timeout: 15000 })
);
await page.waitForTimeout(1000);

const scores = ['15', '14', '13', '12', '10', '8'];
const abilities = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];
for (let i = 0; i < 6; i++) {
  await step(`assign-${scores[i]}-${abilities[i]}`, async () => {
    await page
      .getByText(scores[i], { exact: true })
      .first()
      .click({ timeout: 15000 });
    await page.waitForTimeout(200);
    await page
      .getByText(abilities[i], { exact: true })
      .first()
      .click({ timeout: 15000 });
  });
  await page.waitForTimeout(250);
}
await step('confirm-ability-scores', () =>
  page
    .getByRole('button', { name: /confirm ability scores/i })
    .click({ timeout: 15000 })
);
await page.waitForTimeout(800);

await step('fill-name', async () => {
  await page.fill(
    'input[placeholder="Enter your character\'s name..."]',
    charName
  );
  await page.keyboard.press('Enter');
});
await page.waitForTimeout(800);

await step('begin-adventure', () =>
  page
    .getByRole('button', { name: /Begin Adventure/i })
    .click({ timeout: 10000 })
);
await page.waitForTimeout(2500);

await page.screenshot({
  path: `/tmp/mkchar-done-${playerId}.png`,
  fullPage: true,
});
console.log(`[${playerId}] DONE class=${className} url=${page.url()}`);

await browser.close();
