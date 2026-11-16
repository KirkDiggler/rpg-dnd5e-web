# Encounter Studio contract: reveal and places

Story: [KirkDiggler/rpg-project#966](https://github.com/KirkDiggler/rpg-project/issues/966)
Slices: [rpg-project#983](https://github.com/KirkDiggler/rpg-project/issues/983) (reveal, jumps, places),
[rpg-project#984](https://github.com/KirkDiggler/rpg-project/issues/984) (list and detail)

This is the studio's extension surface for **where a jump lands** and **how a
place in the file is named**. The rest of the studio's boundary is in
`../world-building/CONTRACT.md`.

## Reveal

One contract, one implementation (`useReveal.ts`; providers in `reveal.tsx`).
No screen scrolls, focuses or highlights a jump target on its own.

- **Key.** An item registers under `{kind, id, part?}`. `part` is the rest of
  the file path inside the thing, in the file's own form (`options[1]`,
  `options[1].failure[0]`, `posts.alert`), so a jump's key and an item's key
  always agree.
- **Reveal.**
  1. The item's own `onReveal` runs first: a list chooses its row, a
     collapsed row opens, an ending opens its form.
  2. Every closed `<details>` around the item opens.
  3. The item is scrolled within its own scroll container (the nearest
     `overflow: auto|scroll` ancestor, or one marked `data-scroll-pane`),
     never the page.
  4. The item itself is focused, never a control inside it. If it takes no
     focus it gets `tabindex="-1"`, and it is named for a screen reader from
     its key (`nameOfKey` → `placeName`).
  5. The item is marked with `data-revealed="true"`. The mark lasts until the
     next jump, a new selection, or a pointer down or editing/activating key
     outside the item.
- **Landing.** A reveal lands at once on the closest registered link of the
  key's chain: the item, then the same thing with a shorter part, then the
  thing. A closer key that registers within 700 ms (a screen still mounting)
  takes the landing over. The workspace queues a jump's reveal and fires it
  after the jump's navigation has committed.

### To make a new id-keyed screen revealable

Put `useRevealable({kind, id}, onReveal)` on each item's whole block, or use
`RevealLi`, `RevealDiv` or `RevealButton` with `revealKey`. Use `onReveal` to
open whatever hides the item. Keep the ref stable: pass the hook's callback,
or a `useCallback` that calls it, never an inline arrow. A list-and-detail
screen gets all of this from `StudioListDetail`.

### To add a new path-keyed place inside a thing

Register the element by its file path with `useRevealablePath(path,
onReveal)`, or `RevealDiv path={…}`. The workspace's path map (`keyOfPath`)
turns the path into the same key a jump makes. Table and bundle rows do this
through `useRowRefusalsAt(at, onReveal)`.

### To add a new kind of thing

1. In `locatePath.ts`, the one parser for the dialect's paths, add one `case`
   for its head that returns its kind, id and entry.
2. Give it words in `placeName.ts` and, if it has a selection or section, a
   target in `targetOfPath` (`refusalJump.ts`).
3. Give it its path in `pathOfKey` (`revealKey.ts`), so a reveal of it is
   named.
4. Register its items under that kind.

### To add a section

Map the section to its items' kind in `SECTION_KINDS` (`revealKey.ts`), so a
jump to the section with an id lands on the item.

## Places in words

`placeName(path, document)` names a location, never what runs there. It reads
the path through `locate`.

- Ids are verbatim, in code style.
- A line, row or thing the draft no longer holds is said plainly ("line 40",
  "intel 100"), never as an invented id.
- An unknown shape falls back to its last two segments.

Wherever a place is shown, its raw path is the element's `title` and sits one
key away in `CopyPath`, a "Copy path" control. `CopyPath` writes the
clipboard, or shows the path selected to copy by hand.
