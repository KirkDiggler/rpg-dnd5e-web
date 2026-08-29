# #846 Wave D weapon evidence

Status: **ready for review**.

This directory proves the four Wave D additions—Light Crossbow, Longbow,
Javelin, and Rapier—through the actual shared renderer and production resolver,
then separately proves owned Light Crossbow state through the real sandbox
Fighter session route.

## Provider and code binding

- Provider: `KirkDiggler/rpg-game-assets`
- Provider commit: `cf3bd0bd325d9440a6d28f1d39601845bdfbcdde`
- Synced manifest: `public/models/synty/weapons/manifest.json`
- Manifest SHA-256:
  `030ddd69117aed1b124f69320bc2def039d45eba0b7840644974108aaf117795`
- Web code HEAD:
  `af5294859be964cd55b7bc56f73d85bf8587f3f1`

The exact synced bytes were verified before browser capture:

| Exact ref | Browser path | SHA-256 |
| --- | --- | --- |
| `dnd5e:item:light-crossbow` | `/models/synty/weapons/light-crossbow.glb` | `84ee7b3798bf56c39afe9772caa48d9f1c82ff1684f22d2d30d1d328b6a10712` |
| `dnd5e:item:longbow` | `/models/synty/weapons/longbow.glb` | `42eb8ea762adec72803415ac11d7917c45df2a76855c3adcb0054741d8e5485e` |
| `dnd5e:item:javelin` | `/models/synty/weapons/javelin.glb` | `2b0a7ba06a56c581cb5817bfb5c1be3bf9a70c6aba64cb91c234b921bf6a9c14` |
| `dnd5e:item:rapier` | `/models/synty/weapons/rapier.glb` | `3318941a7dcfcd37256a289d234529da6279976e286734ba10b2dd41dee6c96f` |

Licensed GLBs remain ignored runtime inputs and are not committed here.

## Four-class renderer evidence

[`wave-d-four-class-contact-sheet.png`](wave-d-four-class-contact-sheet.png)
contains Fighter, Barbarian, Monk, and Rogue × all four additions in Idle and
Full orbit. Every one of the 16 isolated Playwright captures:

- entered through the production-backed `?concept=weapon-attachment` deep link;
- resolved the exact `dnd5e:item:*` ref through the production catalog;
- reported attachment status `attached` on the shared `Hand_R` socket;
- received the exact GLB with HTTP 200 and matching SHA-256; and
- produced zero console errors, page errors, or unexpected request failures.

This matrix is visual fixture compatibility evidence. It does **not** invent
inventory authority for Barbarian, Monk, Rogue, or any peer.

[`wave-d-fighter-walk-contact-sheet.png`](wave-d-fighter-walk-contact-sheet.png)
shows the same four exact outputs on the Fighter in Walk with full-body/orbit
framing. It proves rigid attachment during Walk only—not combat/bow animation,
finger posing, projectile behavior, or second-hand contact.

## Authoritative owner sequence

[`authoritative-light-crossbow-contact-sheet.png`](authoritative-light-crossbow-contact-sheet.png)
records the real owner route against the local API/Envoy stack. The sandbox
owner UI identified the acting character as a Fighter and exposed an enabled,
owned `dnd5e:item:light-crossbow` inventory row. No other-class inventory or
peer equipment was queried or inferred.

1. `GetCharacterData` HTTP 200 presented the exact observed initial
   `main_hand` `dnd5e:item:warhammer`, with Shield in `off_hand`, Chain Mail
   equipped, and presented AC `18`.
2. `EquipItem` POST HTTP 200 returned the complete replacement
   `CharacterData`; Light Crossbow appeared immediately in the renderer and
   owner equipment UI, the two-handed equip moved Shield to carried inventory,
   and presented AC became `16`. Its exact GLB returned HTTP 200.
3. A fresh browser context recovered the owner seat, called `GetCharacterData`
   HTTP 200, and restored Light Crossbow with presented AC `16`.
4. `UnequipItem` POST HTTP 200 returned the complete replacement
   `CharacterData`; the renderer and main-hand slot became unarmed immediately
   with presented AC `16`.
5. Another fresh context called `GetCharacterData` HTTP 200 and remained
   unarmed with presented AC `16`.
6. Restoration used the exact observed owner items: `EquipItem` HTTP 200 for
   Warhammer, then `EquipItem` HTTP 200 for the Shield displaced by the
   two-handed Light Crossbow. Final main hand, off hand, armor, and presented AC
   `18` exactly match the observed initial presentation.

All relevant owner RPC and asset responses were HTTP 200. Final captured stages
had zero console errors, page errors, and unexpected request failures. Each of
the 20 isolated Concept contexts and three authoritative contexts intentionally
closed its seat-recovery `StreamLobby` after the first authoritative snapshot:
that POST first returned HTTP 200 and then ended as `net::ERR_ABORTED`. The 23
expected one-snapshot terminations are recorded separately in `receipt.json`;
they are not session request failures.

## Contact-sheet integrity

| Sheet | Media type | Bytes | Dimensions | SHA-256 |
| --- | --- | ---: | --- | --- |
| `wave-d-four-class-contact-sheet.png` | `image/png` | 639133 | 2098 × 1984 | `5e49b73d93756cc5c13a89254a3df2febae22f79a55d3d53c0a0313da32a3214` |
| `wave-d-fighter-walk-contact-sheet.png` | `image/png` | 202198 | 2098 × 598 | `b66b0aa847fd3733634ba2fcc9dfed5030698c67e191d835df537b0aab92eb07` |
| `authoritative-light-crossbow-contact-sheet.png` | `image/png` | 2828238 | 1914 × 2304 | `506d1fb2881d3b5627d434cef48886f139625a914bb5b46bbbd5c8c49c5265a9` |

Fix Round 1 explicitly re-encoded the authoritative sheet from its decoded RGB
pixels as PNG with fixed compression and no metadata. The pre-normalization
blob in this checkout already had PNG magic `89504e470d0a1a0a` and Pillow format
`PNG`, rather than JPEG magic. Re-encoding changed only container bytes:
dimensions stayed `1914 × 2304`, and the before/after decoded RGB SHA-256 is
`d24783889b5d2971fb0efd0f2f0bbaf05ed044394d8841b55d8b0ba6353dea90`.

`receipt.json` contains all 16 idle observations, four Walk observations,
authoritative methods/statuses/states and presented AC, expected transport
termination record, error totals, exact sheet hashes/sizes/media, and the
before/after pixel-continuity proof.

## Verification

```sh
npm run build -- --mode development
npm run test:run -- \
  src/components/hex-grid/mainHandWeapons.test.ts \
  src/concepts/weapon-attachment/weaponAttachmentExperiment.test.ts \
  src/concepts/weapon-attachment/WeaponAttachmentConcept.test.tsx

python3 - <<'PY'
import hashlib, json
from pathlib import Path
from PIL import Image

receipt = json.loads(Path('docs/evidence/846-wave-d-weapons/receipt.json').read_text())
png_magic = bytes.fromhex('89504e470d0a1a0a')
integrity = receipt['integrity']
assert (integrity['requiredExtension'], integrity['requiredMediaType'], integrity['requiredMagicHex'], integrity['requiredPillowFormat']) == ('.png', 'image/png', png_magic.hex(), 'PNG')
for sheet in receipt['sheets']:
    path = Path(sheet['path'])
    data = path.read_bytes()
    assert path.suffix == '.png'
    assert sheet['mediaType'] == 'image/png'
    assert sheet['magicHex'] == png_magic.hex() and data[:8] == png_magic
    assert sheet['byteSize'] == len(data)
    assert sheet['sha256'] == hashlib.sha256(data).hexdigest()
    with Image.open(path) as image:
        assert sheet['pillowFormat'] == image.format == 'PNG'
        assert sheet['dimensions'] == list(image.size)
        assert sheet['decodedRgbSha256'] == hashlib.sha256(image.convert('RGB').tobytes()).hexdigest()
        assert sheet['volatileMetadataPresent'] is False and not image.info
authoritative = receipt['authoritativeRoute']
assert [stage['presentedArmorClass'] for stage in authoritative['stages']] == [18, 16, 16, 16, 16, 18]
assert authoritative['initialOwnerState']['slots'] == authoritative['finalOwnerState']['slots']
assert authoritative['initialOwnerState']['presentedArmorClass'] == authoritative['finalOwnerState']['presentedArmorClass'] == 18
facts = authoritative['exactRestorationFacts']
assert facts['slotsEqual'] is facts['presentedArmorClassEqual'] is True
assert facts['stagePresentedArmorClasses'] == [18, 16, 16, 16, 16, 18]
continuity = integrity['authoritativeSheetPixelContinuity']
assert continuity['beforeDimensions'] == continuity['afterDimensions'] == [1914, 2304]
assert continuity['beforeDecodedRgbSha256'] == continuity['afterDecodedRgbSha256']
assert continuity['pixelsUnchanged'] is True
print('sheet media integrity and authoritative AC parity: pass')
PY
```

The browser evidence used Playwright with the actual Chromium renderer and the
production build compiled in Vite development mode, served on branch port
`3024` so the Concept route remained available.

## Scope

Acting-owner main-hand presentation only. Peer equipment, invented inventory
for the other three classes, off-hand presentation beyond restoring the exact
owner state, combat/bow animations, projectiles, second-hand contact, and
finger posing remain outside this evidence.
