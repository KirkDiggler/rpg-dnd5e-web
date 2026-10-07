# Desktop hotbar — concept #1225

Issue: https://github.com/KirkDiggler/rpg-dnd5e-web/issues/1225

Open `?concept=desktop-hotbar&preview=1` in development, or **Desktop Hotbar** in Concepts Lab. This is a fixture-only interactive preview, not a live-game change. **Controls** selects Cleric/Martial, scenarios, original-layout comparison and sample events.

## Walkthrough

- **Status** stays fixed at the left: HP, AC and movement. On your turn it shows declared remaining movement; otherwise base Speed. Zero stays zero; missing facts are unknown and stale facts qualified. Private-read Retry stays attached. Resource/feature/condition badges remain in the top strip.
- Commands are grouped into **Actions / Features / Spells / Items**. General/equipment actions, including Unarmed Strike, live in Actions. Martial's Second Wind demonstrates Features. Empty categories say **No offers**, not that the character has no features or inventory.
- Spells contain labeled **Cantrips / Leveled spells** blocks; unknown metadata gets **Other spells**, never a guessed level. One Spells pager advances the blocks together. A shorter block retains its last full window, preserving context.
- **Rows** selects 1–4 rows, default one. Rows balance actual visible icons as evenly as possible; decorative blank cells complete odd totals. **12-spell grid** demonstrates six plus six, not ten plus two. Four-row remainders distribute across rows rather than piling empties into the last row.
- **Edit bar** now stars/unstars favorites, replacing drag ordering. Maximum **four per section**, shared across Spells' blocks. Unavailable offers can be favorited without executing. A fifth star is refused visibly; unstar remains available. Done/Escape exits Edit, not a discard operation. Artwork/color is not player-editable.
- Favorites repeat in leading cells inside their own block on every page. Normal offers retain source order. A short final page overlaps the preceding tail to keep a full window. Example: two favorites A/B plus ten normal offers C..L in eight slots yields `A B C D E F G H`, then `A B G H I J K L`. No duplicates within a page.
- Four remains four on narrow frames. The section rail may scroll horizontally rather than dropping pins, lowering the cap or forcing extra rows. Players may unstar some to free space. A non-favorite browsing slot remains reachable whenever other offers exist.
- **36 icons (layout only)** exercises paging and favorites: 12 ordinary offers plus 24 explicitly artificial samples, not a legal expanded cleric build.
- Hover/focus inspects an action. Click selects through existing callbacks. Command's chevron opens a **choice tray above the unchanged bar**. Choose Grovel/Flee, then target; the prompt names **Command · Grovel**. **Change choice** lives in the targeting prompt, avoiding footer reflow. Cancel/Escape backs out; another action switches directly.
- **Effects & traits** below Status is informational. In Martial, inspect Raging or Sneak Attack; click pins details, outside click/focus, Close or Escape dismisses. No effect icon can execute or enter favorites. Details name their action context (and selected target when present), e.g. **For Longsword**, rather than presenting a conditional answer as a global active flag.
- The log starts closed. **Controls → Next event** adds an authored actor/action/result notice for six seconds, retained in Log afterward. Latest three notices are visible; all entries remain in history. Samples do not move actors, change HP or send RPCs.
- **Log → Debug → inspect JSON** uses a real generated event. Wide JSON overlays the bar, captures input, and does not rearrange icons; End Turn remains accessible.
- Frames narrower than 1000px or no taller than 500px use the previous compact organizer/touch handling. The concept's log starts closed there too. Live callers/default behavior are unchanged.

## State and authority boundaries

The existing registry/organizer owns executable membership; `desktopHotbarGroups` only classifies its current members using explicit hints. CAST defaults to Spells; unclassified other executable offers remain Actions. Feature/item and spell-kind hints do not infer rules from names, costs, classes or refs. Unknown hints cannot mint offers. Generated declarations own availability, costs, targets, effects and option labels.

`desktopHotbarLayout` owns bounded display math. `favoriteIdsBySection` stores up to four current IDs in selection order. Unknown/duplicate hints are ignored, favorites are excluded from the normal window, final windows backfill from the tail, and capacity/page/row counts are bounded. Width reserves pinned icons plus browsing space; only the rail overflows when needed. Balanced cells distribute icons with at most one difference between rows and fill the remainder with noninteractive placeholders.

`desktopCustomization` controls `{ rows, favoriteIdsBySection }`. The harness owns a shared row count and per-profile favorites in memory only. They survive scenario/comparison/compact changes; page/edit state is transient. A versioned shape prevents HMR from reinterpreting old drag orders as favorites. Reloading/leaving the concept resets preferences. These fixture-local declaration IDs are **not a durable identity contract for live signed selectors**; persistence still needs separate design.

`ActionDock.desktopStatus` composes fixed Status and the action surface. The shared frame owns background and popup height bounds. Reaction, spectator, cast-option, death-save and End Turn gates remain with ActionDock. Compact/default option selection keeps the existing replacement group; desktop uses the contextual tray and the same current-declaration callbacks. Empty/ambiguous choice identities or missing labels cannot dispatch.

`DesktopEffects` renders `effectLinesFor` from an explicit current reference action or a selected action supplying effects, with exact candidate overrides when applicable. The prototype reference is Mace for Cleric and Longsword for Martial. Stale answers are qualified; withdrawn references produce no invented data. **This is not a global passive-effect catalog or a claim that owning Sneak Attack makes it apply.** Context is visible on every detail card. Fixture rows are presentation samples, not legal character-build recommendations.

`storyFeedback` consumes the same released story as the log after dice/roll-window gates. Mount/scope/re-enable/recovery transitions baseline history rather than replay it. New live IDs show temporarily; updates do not renew expiry; timers clean up. Notices do not intercept pointer input. In this experiment they replace duplicate damage/roll-toast markup and own polite announcements while history is silent but readable. Existing callers retain their previous defaults.

## Provider and art limits

**CastOption currently supplies only `id` and `label`.** The tray reports that no descriptions were supplied. Hover explanations of variant mechanics need authored provider data; the client does not maintain a Command rules table. Spell descriptions/damage dice are also absent at the inspected session seam and are not fabricated.

Effects are presently action/target-scoped answers. Any promotion to a global Effects & Traits list needs an explicit data contract rather than aggregating incompatible answers. Item use is not invented to fill an empty Items category.

Licensed glyphs remain ignored local files under `public/models/synty/interface-preview/`; CSS supplies framing/tints. Missing art falls back to lettering and accessible names. On another checkout, stage referenced clean PNGs from the owned Dark Fantasy HUD archive and sync reference-scene models. No licensed PNGs, archives or screenshots are tracked. Canonical asset promotion belongs in private rpg-game-assets. Survey: [ICON-AUDIT.md](ICON-AUDIT.md).

## Verification

Current checked plan: [FAVORITES-PLAN.md](FAVORITES-PLAN.md). Earlier iteration record: [PLAN.md](PLAN.md); drag-order behavior there is superseded deliberately.

- Typecheck, changed-file ESLint/Prettier and **201 focused tests** passed: favorite/page/group invariants, option integrity/authority, information-only effects, existing Status/notice/ActionDock/TargetSurface/shell regressions.
- Chrome/SwiftShader `favorites.mjs`: native 12-spell/two-row layout is6+6; four pins accepted, fifth refused, pins maintain positions across pages; all25 normal leveled offers reachable, final seven-offer tail exact in the measured layout; four survive resize without extra rows. A constrained440px rail demonstrates horizontal overflow without dropped pins/document overflow.
- Same probe: Command tray leaves bar geometry/DOM intact, selected variant named, change/cancel/switch works. Martial effects show contextual Raging/Sneak Attack without execution. Information fits1000×501 with four rows/Edit. The lab control initially obscured the context caption there; short-desktop lab controls now sit away from left inspection cards, with an overlap assertion. Compact844×390/393×852 retains the old organizer.
- Updated `status.mjs` and `story-notices.mjs` regressions pass; screenshots inspected. Ready dock height is now about134.5px with subgroup captions and informative effects, not the prior113px. Side cushion, translucent backing, opaque inspections, foreground JSON and notice→history retention remain.
- Local ignored evidence: `evidence/desktop-hotbar/favorites.json`, `status.json`, `story-notices.json`, their scripts and screenshots. The probe waits until measured capacities match rendered widths after rail/viewport changes; an initial snapshot raced ResizeObserver. No browser page errors in completed probes.

Earlier dependency/Husky setup correction remains in git and the issue trail. Current commits run the installed hook normally. Operator walkthrough, full PR-boundary CI, independent review and live promotion remain outstanding. No merge-ready claim.
