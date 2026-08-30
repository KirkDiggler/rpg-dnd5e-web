# #861 Simple weapon consumer evidence

Status: **ready for review**.

This directory records the public-safe evidence for the six newly mapped simple
weapons: Light Hammer, Mace, Sickle, Spear, Sling, and Dart. The Concept matrix
uses the production-backed `?concept=weapon-attachment` route for visual fixture
compatibility. The authority sequence separately uses the normal live web UI as
the dedicated `weapon-gallery` owner and proves Dart through the server-owned
equipment RPCs.

## Binding

- Web code HEAD: `5f0c2c7c8830911bb839342c2e860f4aa92c484a`
- Provider: `KirkDiggler/rpg-game-assets`
- Provider commit: `11b78a0f24278a54f057a5a1abf416d30c0a879b`
- Synced manifest: `public/models/synty/weapons/manifest.json`
- Manifest SHA-256: `729282ee2a05b0d1b9f194066e7aa4da5f3682b2a5811cfbc13de4353b8d68be`

| Ref | Browser path | SHA-256 |
| --- | --- | --- |
| `dnd5e:item:light-hammer` | `/models/synty/weapons/light-hammer.glb` | `81985e1e9416ee6804699a94a99ef22b71288f181f26d7c2dc9366dc0227d008` |
| `dnd5e:item:mace` | `/models/synty/weapons/mace.glb` | `86de1cdd4a46a64c81fba1abb3253dd74fe95a6f30470daa2788859623d4735a` |
| `dnd5e:item:sickle` | `/models/synty/weapons/sickle.glb` | `cf5722eefe57e3199b0d45d86acde3abf62fe020892e3a78f25ec33ab6a45df2` |
| `dnd5e:item:spear` | `/models/synty/weapons/spear.glb` | `4eb1ac71190816254ea0df4ca4f1d471a6de5f1fd33be63f0cb0d88a467b24be` |
| `dnd5e:item:sling` | `/models/synty/weapons/sling.glb` | `a139762c8de7ff22f5fb56d75cfb32e356cbe0fc903c990df46881599e363645` |
| `dnd5e:item:dart` | `/models/synty/weapons/dart.glb` | `b9b506018e91cc351c77f70297f7c9e6ebc573e41b098396c94cf7669d900367` |

Licensed GLB files remain ignored runtime inputs and are not committed here.

## Concept evidence

[`simple-weapon-four-class-contact-sheet.png`](simple-weapon-four-class-contact-sheet.png)
contains Fighter, Barbarian, Monk, and Rogue × all six additions in Idle / Full
orbit: 24 isolated Chromium observations.

[`simple-weapon-fighter-walk-contact-sheet.png`](simple-weapon-fighter-walk-contact-sheet.png)
contains Fighter × all six additions in Walk / Full orbit: six isolated
Chromium observations.

Every Concept observation resolved the exact `dnd5e:item:*` ref, reported
attachment status `attached`, loaded the exact GLB with HTTP 200 and matching
SHA-256, and had zero console errors, page errors, or request failures. This is
visual fixture compatibility only; it does not assert owned inventory for any
class.

## Authoritative owner sequence

[`authoritative-dart-fighter-contact-sheet.png`](authoritative-dart-fighter-contact-sheet.png)
records the normal web UI sequence for the dedicated `weapon-gallery` identity.
The owner is displayed as Weapon Gallery, Human Fighter. Character/lobby/session
identifiers are intentionally redacted and not published.

- The normal web character list returned exactly one Weapon Gallery character.
  The server-owned inventory contained 22 weapon refs with no duplicates, plus
  non-weapon gear; no separate HTTP-status claim is made for that list result.
- Initial `GetCharacterData` HTTP 200 showed equipped slots `{}`; presented AC
  `12` (`10 + 2 DEX`); main-hand damage empty.
- The owner equipment popover exposed an enabled carried Dart row, visibly shown
  in the first authoritative contact-sheet tile.
- `EquipItem` HTTP 200 returned complete `CharacterData`; the UI/renderer showed
  `main_hand: dnd5e:item:dart`, main-hand damage `1d4 piercing damage`, and the
  Dart GLB loaded with HTTP 200 and the exact SHA-256.
- A fresh browser context restored Dart from `GetCharacterData` HTTP 200.
- `UnequipItem` HTTP 200 returned unarmed `{}`.
- A fresh browser context restored unarmed from `GetCharacterData` HTTP 200.
- Restoration was exact: the observed initial state was already unarmed, and a
  final fresh context verified equipped `{}`, AC `12`, and empty main-hand damage.

All relevant owner RPCs/assets were HTTP 200. Four `StreamLobby` requests were
closed with expected context-teardown aborts and are recorded separately in
`receipt.json`; unexpected console errors, page errors, and request failures were
all zero.

## Contact-sheet integrity

| Sheet | Bytes | Dimensions | SHA-256 |
| --- | ---: | --- | --- |
| `simple-weapon-four-class-contact-sheet.png` | 322388 | 2226 × 1180 | `ee1e00116529e9b7704a6790c791b25e60ca08f29625b26c185af5f666533b83` |
| `simple-weapon-fighter-walk-contact-sheet.png` | 102945 | 2226 × 343 | `2e98c1fe412e2ad44f032fb42bd179157fd0a3474f3afb71e20dd344ca42eed4` |
| `authoritative-dart-fighter-contact-sheet.png` | 872965 | 1114 × 1862 | `6a559eff8f1587f6ca265fb28a0fdfa12a145b53a9bd30a59510273f38e2dd8f` |

`receipt.json` also binds PNG magic, Pillow media format, and decoded RGB hashes.

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
receipt = json.loads(Path('docs/evidence/861-simple-weapon-consumer/receipt.json').read_text())
png_magic = bytes.fromhex('89504e470d0a1a0a')
assert receipt['integrity']['requiredMagicHex'] == png_magic.hex()
for sheet in receipt['sheets']:
    path = Path(sheet['path'])
    data = path.read_bytes()
    assert path.suffix == '.png'
    assert sheet['mediaType'] == 'image/png'
    assert data[:8] == png_magic == bytes.fromhex(sheet['magicHex'])
    assert len(data) == sheet['byteSize']
    assert hashlib.sha256(data).hexdigest() == sheet['sha256']
    with Image.open(path) as image:
        assert image.format == sheet['pillowFormat'] == 'PNG'
        assert list(image.size) == sheet['dimensions']
        assert not image.info and not sheet['volatileMetadataPresent']
        assert hashlib.sha256(image.convert('RGB').tobytes()).hexdigest() == sheet['decodedRgbSha256']
auth = receipt['authoritativeRoute']
assert auth['initialOwnerState']['equipped'] == auth['finalOwnerState']['equipped'] == {}
assert auth['initialOwnerState']['presentedArmorClass'] == auth['finalOwnerState']['presentedArmorClass'] == 12
assert auth['exactRestorationFacts']['slotsEqual'] is True
assert auth['exactRestorationFacts']['presentedArmorClassEqual'] is True
assert auth['errorTotals'] == {'unexpectedConsoleErrors': 0, 'pageErrors': 0, 'unexpectedRequestFailures': 0}
assert receipt['conceptEvidence']['counts'] == {'idle': 24, 'fighterWalk': 6, 'observations': 30, 'consoleErrors': 0, 'pageErrors': 0, 'requestFailures': 0}
print('web#861 public evidence integrity: pass')
PY
```

## Scope

Acting-owner main-hand presentation only. Peer equipment, invented class
inventory for Concept fixtures, combat/projectile behavior, second-hand contact,
and finger posing remain outside this evidence.
