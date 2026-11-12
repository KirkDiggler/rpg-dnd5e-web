# Run — 2026-11-03 — The world runs S6b

processed: 2026-11-12T165555Z

Slice [rpg-project#776](https://github.com/KirkDiggler/rpg-project/issues/776) of story [rpg-project#766](https://github.com/KirkDiggler/rpg-project/issues/766). Base: web dev at [b7fc67ea](https://github.com/KirkDiggler/rpg-dnd5e-web/commit/b7fc67ea).

## Shipped

- Built for review, not yet merged: Studio recipe carriage, shape validation, creature/faction YAML editor, custom table keys, current-server castle import/export and history tests — [S6b plan](https://github.com/KirkDiggler/rpg-project/issues/776#issuecomment-6614082325).

## Decided

- Used the canonical recipe YAML with explicit Apply/Cancel, rather than a second visual state-machine format; the shared document/history owner still commits one edit — [S6b plan](https://github.com/KirkDiggler/rpg-project/issues/776#issuecomment-6614082325).
- Kept unknown table keys refused unless picked by document recipes, then checked each creature's resolved recipe; allowing march globally would conceal invalid content — [provider states contract](https://github.com/KirkDiggler/rpg-toolkit/blob/main/rulebooks/dnd5e/encounter/dungeonspec/states.go).
- Added a separate verbatim current-server fixture rather than rewriting the older castle used by unrelated layout tests — [S6b plan](https://github.com/KirkDiggler/rpg-project/issues/776#issuecomment-6614082325).

## Found

- The current castle also carries a plain captain greeting: after march decoded, Studio's mandatory-check assumption was the next import refusal; check absence now survives without weakening the refusal of explicit empty checks — [server content PR](https://github.com/KirkDiggler/rpg-api/pull/1178).
- Rendering and read-back enumerated only time even after the codec admitted custom keys; the new tests assert march rows and their conditions remain visible — [S6b](https://github.com/KirkDiggler/rpg-project/issues/776).

## Mistaken

- Review exposed prototype-named custom keys being treated as JavaScript object properties rather than authored data; regression tests now cover `__proto__`, `constructor` and `toString` through codec, read-back and editing — [review finding](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1384#discussion_r4460453882).
- The faction picker initially gathered only its own recipe's picks, excluding valid placement-picked keys in shared faction rows; it now uses the same document-wide collector as root tables — [review finding](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1384#discussion_r4460453897).

- The initial investigation checked dev before the running :3030 checkout; inspecting its reflog distinguished the shipped state-log presentation from still-unbuilt Studio recipe support — [S6 record](https://github.com/KirkDiggler/rpg-project/issues/776).
- The first per-creature key check visited only bindings, omitting placements inheriting the default monsters faction; a no-binding import test exposed it and validation now visits every placement — [S6b](https://github.com/KirkDiggler/rpg-project/issues/776).
