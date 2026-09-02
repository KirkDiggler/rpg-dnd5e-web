# Off-Hand Attachment Concept Contract

Development-only production-backed proof for owner off-hand presentation.

- States: Empty, Shield only, Longsword + Shield, Shortsword + Dagger,
  Glaive main, Trident main, Scimitar main, and Dual Scimitars.
- Uses production exact-ref main/off-hand resolvers and `ClassCharacterModel`.
- Uses exact provider merge
  `rpg-game-assets@00cbd7cdcc338edaa249e3707492341fe1c4a416`.
- Supports class, race, Idle/Walk, close/orbit/play, and six-facing inspection.
- Townfolk and modular rigs select one `Hand_L` socket each.
- No transform controls, gameplay rules, API calls, storage mutation, or peer projection.
- Scimitar is the sixth reviewed off-hand ref; Glaive, Trident, and
  unknown/unreviewed off-hand refs remain empty.
- Dual Scimitars supplies the same exact `dnd5e:item:scimitar` ref independently
  to both semantic slots.
- Browser evidence records exact HTTP/hash success and separates expected stream teardown aborts from unexpected failures.
