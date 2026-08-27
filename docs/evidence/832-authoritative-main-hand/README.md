# #832 authoritative main-hand presentation

Status: **ready for review**.

The production session route now projects the acting player's owner-private
`CharacterData.equipped.main_hand` through one exact-ref catalog into the
existing `ClassCharacterModel` attachment seam. The catalog contains the 12
weapons promoted by `rpg-game-assets#71`; fighter, barbarian, monk, and rogue
all use the accepted `townfolk-main-hand-v1` socket. There is no class × weapon
transform table and no item-specific runtime correction.

## Provider boundary

- Provider commit: `d30372848df81b387f821f14129aced27ec709d4`
- Provider manifest: `harness/models/synty/weapons/manifest.json`
- Manifest SHA-256:
  `88531fb84ca7d346212fbd43abf8ea65fa1bcecaecd9159c37e23c94f4676634`
- Browser paths: `/models/synty/weapons/<weapon>.glb`

`receipt.json` binds every exact `dnd5e:item:*` ref to its provider path and
SHA-256, and also records the four exact class GLB hashes. Attack-shaped refs,
unknown refs, and refs beyond this current roster remain unmapped and render
unarmed rather than selecting a visual approximation.

## Four-class review

`current-roster-four-class-contact-sheet.png` shows the full 4 × 12 idle
matrix through the production resolver and exact synced provider bytes.
`fighter-gwf-contact-sheet.png` adds idle/walk review for greatsword, greataxe,
greatclub, and quarterstaff on the fighter. All 52 browser captures reported
attachment status `attached`, with zero console/page errors and zero request
failures.

The matrix is visual fixture evidence, not fabricated equipment authority. It
answers whether the current class rigs and provider assets remain compatible
through the shared renderer. The live route below is the separate authority
proof.

The focused fighter sheet verifies rigid right-hand attachment only. It does
not claim completed second-hand contact, finger posing, or a dedicated Great
Weapon Fighting animation; those remain explicitly outside this slice.

## Authoritative live-route sequence

`authoritative-session-contact-sheet.png` records the real session route
against the local API stack from a production build served in development
mode:

1. `GetCharacterData` restores `dnd5e:item:longsword`; the exact provider GLB
   loads with HTTP 200 and is visible.
2. `UnequipItem` returns the complete replacement `CharacterData`; the model
   becomes unarmed immediately without another owner read.
3. A fresh browser context recovers the authenticated player's character from
   the retained lobby's first authoritative snapshot, calls `GetCharacterData`,
   and remains unarmed.
4. `EquipItem` returns the complete replacement `CharacterData`; the longsword
   appears immediately.
5. A second fresh browser context recovers the seat and restores the longsword.

All 11 relevant owner/asset responses were HTTP 200. Browser console/page
errors and unexpected request failures were zero. Each fresh context closes
its short-lived lobby seat-recovery stream immediately after the first
snapshot, producing one expected `ERR_ABORTED`; no session request failed in a
captured stage. The local character's final authoritative state was restored
to Longsword.

## Reconnect finding

The first live attempt exposed an existing running-encounter resume gap:
`GetMyActiveLobby` returned both encounter and retained lobby IDs, but the web
entered `SessionEncounterView` without recovering the selected character ID.
The API already exposed the missing authority in `StreamLobby`'s first
snapshot (`player_id -> character_id`). `useLobbyCharacterId` now consumes
exactly that snapshot before entering the resumed session; no local-storage
identity guess and no proto/API change were added.
A missing seat, missing snapshot, or stream failure keeps the app out of the
running session and surfaces “Unable to resume the running encounter” instead
of falling through to `SessionEncounterView` without a character.

## Verification commands

```sh
npm run assets:sync
npm run test:run
npm run ci-check
npm run build -- --mode development
```

The asset sync used an explicit checkout of the provider commit above. The
licensed GLBs remain gitignored and are not committed to this public repo.

## Scope

Acting-player presentation only. Public peer equipment, off-hand/shields,
two-hand contact, finger posing, projectiles, combat/bow animations, and
weapons outside the current 12-item provider roster remain separate work.
