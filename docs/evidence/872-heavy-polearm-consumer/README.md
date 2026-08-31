# #872 Heavy / Polearm consumer evidence

Status: **ready for review**.

This directory records public-safe evidence for Halberd, Maul, Morningstar,
Pike, and War Pick. The Concept matrix uses the production-backed
`?concept=weapon-attachment` route for visual fixture compatibility. The
separate owner sequence uses the normal live web UI as the dedicated
`weapon-gallery` owner and proves Halberd through server-owned equipment RPCs.

## Binding

- Web mapping HEAD: `e49b03e1b3021c862e963b7f53d9ddc82771b969`
- Provider: `KirkDiggler/rpg-game-assets`
- Provider commit: `a67f916880718a84b502b66b2b63683b03990f59`
- Manifest SHA-256: `cec88cd26d95568de01e6d1181184ced0eb4212c28d0cf1524b30c640fc449db`
- Authority fixture: `KirkDiggler/rpg-api#864` / PR #865, merged to API `dev` at `9254f85d66793dff276386cb240840b634c70f12`. The required merge order is satisfied and the repeatable gallery now owns all 27 promoted refs.
- Post-capture rebase: the mapping/tests patch was rebound unchanged onto web `dev@041816028f6ff6a9912a4cc14a47b1c90ef5115c`; the upstream world-die settlement fix does not change equipment resolution, attachment, Concept controls, or the captured owner RPC sequence.

| Ref | Browser path | SHA-256 |
| --- | --- | --- |
| `dnd5e:item:halberd` | `/models/synty/weapons/halberd.glb` | `2df50e7544c878f9c0653582618c0357ec23263a756403b243a38f69635ce1c5` |
| `dnd5e:item:maul` | `/models/synty/weapons/maul.glb` | `6d04849da463e31f6da3d05472edbabedff1efc95988b36baeff7a7b4648d9d9` |
| `dnd5e:item:morningstar` | `/models/synty/weapons/morningstar.glb` | `06bf092b6f993a52c4186e7ab728bdb777ccd545d4f29181f78c47bec0a33fa0` |
| `dnd5e:item:pike` | `/models/synty/weapons/pike.glb` | `d600b59121f346c84eba90a037c165634c04879bbebd82a3c49c229e006a223c` |
| `dnd5e:item:war-pick` | `/models/synty/weapons/war-pick.glb` | `a823309d77478dbcc3a83877c1c70dde5241c3768bae33716f8bc6e0b943867a` |

Licensed GLBs remain ignored runtime inputs and are not committed here.

## Concept evidence

[`heavy-polearm-four-class-contact-sheet.png`](heavy-polearm-four-class-contact-sheet.png)
contains Fighter, Barbarian, Monk, and Rogue × all five additions in Idle / Full
orbit: 20 isolated Chromium observations.

[`heavy-polearm-fighter-walk-contact-sheet.png`](heavy-polearm-fighter-walk-contact-sheet.png)
contains Fighter × all five additions in Walk / Full orbit: five isolated
Chromium observations.

Every observation resolved its exact ref, reported `attached`, loaded the exact
GLB with HTTP 200 and matching SHA-256, and had zero console errors, page errors,
or unexpected request failures. Each isolated context also closed one background
`StreamLobby` request with the established `net::ERR_ABORTED` teardown outcome;
these 25 expected stream aborts are recorded separately and are not hidden as
successful requests. Concept evidence proves visual fixture compatibility, not
owned class inventory.

## Authoritative owner sequence

[`authoritative-halberd-fighter-contact-sheet.png`](authoritative-halberd-fighter-contact-sheet.png)
records the normal web UI sequence for the dedicated Weapon Gallery Human
Fighter. Character, lobby, and session identifiers are redacted.

- The normal UI exposed exactly one Weapon Gallery character and 27 unique weapon rows; the first tile visibly shows the enabled carried Halberd row.
- Initial `GetCharacterData` showed equipped `{}`, AC `12` (`10 + 2 DEX`), HP `12/12`, speed `30 ft`, and empty main-hand damage.
- `EquipItem` HTTP 200 immediately rendered `main_hand: dnd5e:item:halberd`, `1d10 slashing damage`, and the exact Halberd GLB via HTTP 200.
- A fresh browser context restored Halberd from `GetCharacterData` HTTP 200.
- `UnequipItem` HTTP 200 immediately returned unarmed `{}`.
- A fresh context restored unarmed; no additional restoration mutation was needed because the observed initial state was already unarmed.
- A final fresh context verified exact initial/final parity for slots, AC, damage, HP, and speed.

The six closed authority contexts produced only expected `StreamLobby`
teardown aborts. Unexpected console errors, page errors, and request failures
were all zero.

## Contact-sheet integrity

| Sheet | Bytes | Dimensions | SHA-256 |
| --- | ---: | --- | --- |
| `heavy-polearm-four-class-contact-sheet.png` | 338067 | 1872 × 1160 | `abc0f353ef7b3844792e6e22f05ea963eef04bfd2375dc23fa8027c1d1b92be5` |
| `heavy-polearm-fighter-walk-contact-sheet.png` | 101729 | 1872 × 329 | `9a453ed0c08ab78264442bc058d3ccdddadfe2a01ad470b33c96fb0c76609d6a` |
| `authoritative-halberd-fighter-contact-sheet.png` | 837043 | 1128 × 1756 | `454571b6a3eebd49c4608a4216cf888c31bb0fa20e89a5f6854eb36a9e3a5c5e` |

`receipt.json` additionally binds PNG magic, Pillow format, dimensions, decoded
RGB hashes, empty metadata, provider bytes, observations, authority stages, and
exact restoration facts.

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
receipt = json.loads(Path('docs/evidence/872-heavy-polearm-consumer/receipt.json').read_text())
for sheet in receipt['sheets']:
    path = Path(sheet['path'])
    data = path.read_bytes()
    assert data[:8].hex() == sheet['magicHex'] == receipt['integrity']['requiredMagicHex']
    assert len(data) == sheet['byteSize']
    assert hashlib.sha256(data).hexdigest() == sheet['sha256']
    with Image.open(path) as image:
        image.load()
        assert image.format == sheet['pillowFormat'] == 'PNG'
        assert list(image.size) == sheet['dimensions']
        assert not image.info and not sheet['volatileMetadataPresent']
        assert hashlib.sha256(image.convert('RGB').tobytes()).hexdigest() == sheet['decodedRgbSha256']
auth = receipt['authoritativeRoute']
assert auth['initialOwnerState'] == auth['finalOwnerState']
assert auth['initialOwnerState']['equipped'] == {}
assert auth['exactRestorationFacts'] == {
    'slotsEqual': True,
    'presentedArmorClassEqual': True,
    'mainHandDamageEqual': True,
    'hitPointsEqual': True,
    'speedEqual': True,
}
assert auth['errorTotals'] == {
    'unexpectedConsoleErrors': 0,
    'pageErrors': 0,
    'unexpectedRequestFailures': 0,
}
assert receipt['conceptEvidence']['counts']['observations'] == 25
print('web#872 public evidence integrity: pass')
PY
```

## Scope

Acting-owner main-hand presentation only. Peer equipment, off-hand/two-hand
contact, finger posing, combat/projectile behavior, and weapons outside this
slice remain deferred.
