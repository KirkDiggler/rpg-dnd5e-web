# Production Dwarf customization evidence (#883)

## Human verdict

Kirk completed the normal creation flow, reloaded the persisted draft, finalized the character, and entered the Reference Tomb session. His exact verdict was:

> “looks great, and loaded in game to verify it loads”

This is the final human creation/game-load gate for the Dwarf rollout.

## Actual normal-game readback

The managed local environment used web implementation `bb45804b1e2dcdfa53674e8e838c95c6e4a1e578` and API head `54de1761deea4fa99264330cf842105bea23dcd6`, which contains required customization merge `a795573fe160ca460f3a801d80220629dccd72d3`. Final review fixes at `b176f7fb09d817f399b11c6d3da09b7afceb6ede` restore generic-fallback state tints, harden invalid persisted-value display and sync preflight, derive supported classes from the catalog, and remove an unreachable accessory rollback; they do not change the accepted active Dwarf body, styles, or treatment readback.

After Kirk’s run, an independent browser readback observed:

- Dwarf Monk active body: `dwarf-monk-body.glb`;
- scalp: `modular-fantasy-hero:hair:07` / `Chr_Hair_07`;
- facial hair: `modular-fantasy-hero:facial-hair:11` / `Chr_FacialHair_Male_11`;
- both mounted meshes: 63 mapped bones;
- shared treatment: `#64A5CE`, roughness `0.72`, metalness `0`;
- no unexpected page, request, or console failure during the independent readback.

`kirk-game-close.png` is the actual normal session route after finalization. It is not a concept route or injected renderer state.

## Automated coverage

The session integration suite proves:

- owner `Appearance.hair` and peer roster `Customization.hair` enter the same resolver;
- no peer private character read occurs;
- all four supported Dwarf class bodies resolve through generated provider truth;
- absent, none, exact refs, color, roughness, invalid sibling isolation, and provider defaults;
- active modular body → exact immutable complete-body fallback → generic fallback;
- accessories are absent from complete-body/downed fallback paths;
- selected, ghost, remembered, movement, hand attachments, material identity, and staged replacement coexist.

The publication test hashes all 120 generated active/fallback/style/thumbnail artifacts and proves licensed synchronized bytes remain ignored and untracked. GLM 5.3 reviewed the whole PR, raised one Important and five Minor findings, accepted every fix/disposition, and returned **Ready — 0 Critical / 0 Important / 0 Minor**.

## Scope honesty

Kirk’s normal-game run was one Dwarf Monk, not an invented four-browser session. Four-class and owner/peer behavior are covered by provider evidence and runtime integration tests. This receipt does not claim browser observations that did not occur.
