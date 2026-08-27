# Session camera bands — issue #831

This evidence records the production session-route camera approved for friend
feedback under [rpg-dnd5e-web#831](https://github.com/KirkDiggler/rpg-dnd5e-web/issues/831).
The change restores the shared battle-map camera configuration on
`SessionCanvas` and revises the continuous pitch curve into deliberate
Frosthaven-inspired wheel bands sized for this game's longer six-hex movement
budget.

## Interaction contract

One physical same-direction wheel burst advances one band. Events within 120 ms
of the accepted event are coalesced; reversing direction remains responsive.
The provisional friend-feedback bands are:

| Band | Orthographic zoom | Polar angle from vertical | Forward focus lead |
| --- | ---: | ---: | ---: |
| Overview | 35 | 28° | 0 |
| Tabletop | 50 | 28° | 0 |
| Tactical (initial) | 80 | 45° | 0.5 world unit |
| Shoulder | 110 | 62° | 2 world units |
| Detail | 140 | 62° | 2 world units |

The first two bands change scale without changing angle. Tactical and Shoulder
move closer and lower the camera. Detail changes scale while retaining the
Shoulder angle. Forward focus lead settles the local character lower in frame
and reserves more close-view space for the dungeon ahead. Wheel-out traverses
the same bands in reverse. Q/E rotation, player follow, right-drag panning, and
the fixed-angle `?pitchCurve=0` escape hatch remain.

## Real-route evidence

All five frames are full-window PNGs at 1600×900 from the real production
session route against the local API stack and exact synced private runtime
assets. The flow was Home → select `Toolkit Sandbox Fighter` → Play → create
lobby → choose `The Reference Tomb` → Ready → Start. Starting from the initial
Tactical band, the capture moved to Overview and then advanced inward one band
at a time with more than 120 ms between gestures.

| Frame | SHA-256 |
| --- | --- |
| `01-overview.png` | `8eec8af6d5efb0c25c2f9884def6254c456e63ddd82affe61c1a899c748c24ed` |
| `02-tabletop.png` | `84a50deecbb54f7f438a83e54b4c24b2448234346d59effaa65a951f006b2f66` |
| `03-tactical.png` | `1b1f1802dbf5c133e82482ffba7342c58e2831f3bfebd3714e113a2ae07cfd15` |
| `04-shoulder.png` | `ff52fbb11629c7a6c331472f73d2686d9455f70dfaa619b8a9200b6f27717e1c` |
| `05-detail.png` | `2b14ee6a82a04e7679aeab50a093df42f32b4aabfa6b67ec729c441de3c3a5c0` |

Capture reported exactly three console errors, all existing development
StrictMode cleanup aborts: `GetCharacterData`, the retired lobby stream during
the lobby→session transition, and the first `StreamEvents` mount. There were no
page errors in the capture.

## Human verdict

Kirk drove multiple live iterations against the real route, supplied the
Frosthaven zoom sequence as the interaction reference, and gave the final
verdict:

> love it, i think we have a keeper. at least ready for friend feedback

This is a presentation approval for friend feedback, not a claim that the band
values are permanent or that later viewport/accessibility feedback cannot tune
them.
