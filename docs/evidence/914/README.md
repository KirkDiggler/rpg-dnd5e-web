# Walls as lines — slice 2 evidence (#914)

Wall geometry slice 2 (rpg-project#360, design §2.6–2.9, §3.2–3.7, §4.3).
Captured against this branch through a headless browser driving the
Concepts Lab builder on a dev server, not by hand. The document is the
reference tomb; the sandbox compiles it locally (`fixtures mode — never
calls the server`), so the `sealed` cells you see hatched came through
the same `GetAtlasResponse` field the real compile fills.

## 01 — the picker: twelve rays, thin and thick told apart

`01-picker-rays-thin-and-thick.png`

The wall tool, a hex clicked, its upper-right side midpoint picked as the
start. Twelve rays 30° apart, and every one of them trimmed to the ends
that make a legal wall — 88 ends offered here.

**Green dashed rays are thin**: they shave the cells they pass and seal
nothing. **Orange solid rays are thick**: they run through cell centres,
and a wall on one seals every cell it halves. Eight thin rays and four
thick, which is four lines and two, the count at every side midpoint.

The white line is the wall the hovered end would make. Its four **sealed
cells are greyed** — the cost, shown before anything is committed — and
the label beside it reads

```
thick — seals 4 cells
```

Note the dungeon summary: **2 walls**. The whole tomb is two lines.

## 02 — committed, and what the inspector says about it

`02-committed-wall.png`

The same wall, committed. The four sealed cells now carry the orange
hatch — that is the SERVER's answer (`GetAtlasResponse.sealed`), not the
picker's preview, and it keeps its room's colour underneath because a
sealed cell keeps its region: it is that room's floor that nobody stands
on.

The inspector names the wall and says what it cost, in the same words the
picker used:

> **Thick** — it runs through 4 cells' centres, so those cells are floor
> nobody stands on.

with the wall's name, its height, its two ends (`[0.25, -0.375] of 9,4 →
[0, 0] of 13,0`) and delete. A wall is a thing in the file now, so there
is something to name; the selection used to be "the set of doc edges
behind the line you clicked".

## 03 — a door is a position on a wall

`03-door-on-a-midpoint.png`

The door tool. Every position a door may stand on is marked — the side
midpoints the walls pass through, 22 of them here. A centre is offered
nowhere: it is the midpoint of no side, so it opens no crossing.

One click puts a door on a midpoint. The gap draws **along the wall it
stands in**, not across the hex edge, and the inspector reads

> One crossing — the side this position is the midpoint of. A wider
> doorway is a second door beside it.

## 04 / 05 — the tomb before and after

`04-tomb-before-fitted.png` (slice 1's branch, `:3006`)
`05-tomb-after-segments.png` (this branch)

The same seam, same rooms, same props, same view. The walls look the
same, which is the acceptance item.

|  | before | after |
|---|---|---|
| `walls[]` entries | 28 | **2** |
| drawn wall pieces | 4 fitted runs | 2 lines |
| doors | 2 | 2 |

Two things to look for.

**The picture is unchanged and the file is not.** Before, the seam was 28
`walls[]` entries — the crossings it blocked — and the client fitted them
back into runs, getting FOUR where the author drew two, because a fitted
chain breaks where a tolerance says it does. After, the seam is one line
and draws as one line.

**The door moved one row.** That is the one content change slice 2 makes
and design A6 predicted it: no thin line passes through a flat-side
midpoint, so the door that sat on the straight crossing between `[5,3]`
and `[6,3]` cannot stand on the thin quarter line that reproduces the
seam's other fourteen crossings. It moves to the slanted midpoint of the
same cell — still between entrance and hall, still one crossing. The
thick alternative would have kept the door where it was and sealed four
entrance cells, the larger change.

## What is not here

**No 3D pair.** The Synty models are not installed on this box
(`Could not load /models/synty/textures/Dungeons_Texture_FloorTiles_01.png`),
so the 3D tab renders black on both branches and a screenshot of it would
show nothing either way. The 2D board is the substitute and is the right
one for this comparison: on slice 1's branch the board drew the chain
engine's own fitted runs (`boardWallScene` called `boundariesToWallRuns`
at the game's `HEX_SIZE` and projected the result), so `04` IS the
fitted picture the 3D route drew. `atlasWallRuns.test.ts` pins the 3D
side's geometry numerically instead.

**No live-server walk.** The api does not serve `segments` or `sealed`
yet (rpg-api#899 follows the toolkit tag). Everything above runs against
the builder's local compile. The game route degrades honestly until then:
an atlas with no `segments` draws no walls rather than falling back to
fitting, which `atlasWallRuns.test.ts` names and asserts.
