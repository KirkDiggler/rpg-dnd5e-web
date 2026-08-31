# Character Customization Concept Contract

This is durable **non-production Concept evidence** for rpg-dnd5e-web#877. It
records what the fixture-first browser lab proved; it does not add or request a
production character field, provider manifest, persistence path, API, proto, or
toolkit behavior.

Reproducible development route:
`/?concept=character-customization`.

## Verdict

The local Chrome 151 browser gate passed on 2026-09-01 after commit `f5c4ea9`
made the pure binder accept the real `SkeletonUtils.clone()` representation:
multiple Skeleton wrapper objects are equivalent only when they preserve the
same exact ordered body Bone objects, compatible inverses, and compatible mesh
bind matrices.

The controlled and reference Dwarf bodies rendered simultaneously. Every
scalp and facial-hair candidate visibly mounted, animated with its body, and
responded independently to `none`. Exact terminal diagnostics showed:

- controlled scalp and facial hair both `attached`, with the same 63 ordered
  body Bone names and UUIDs and the same body root Bone UUID;
- reference scalp and facial hair attached to a second, internally coherent
  63-Bone body identity;
- controlled and reference root identities remained distinct;
- mounted source accessory armatures: `0`;
- no missing mapped bones; and
- four nonempty, pairwise instance-owned material UUIDs across the two active
  controlled and two reference accessories, with controlled/reference UUID
  sets disjoint.

The positive reference-twin isolation witness is now derived only after a
committed renderer frame reads those runtime materials back. In the final
nondefault witness, both controlled materials actually reported `#C02626`,
roughness `0.25`, and metalness `1`, while both reference materials still
reported the immutable hair defaults `#5A3825`, roughness `0.72`, and metalness
`0`. Requested props alone cannot earn this witness.

The Concept's coverage verdict completed at scalp `5/5`, facial hair `5/5`,
motions `2/2`, views `3/3`, presets `4/4`, simultaneous alternate pair `yes`,
and reference isolation `yes`.

## Proven fixture contract

The Concept consumes only this local fixture shape:

```ts
interface CharacterCustomizationFixture {
  scalp: 'default' | 'none' | string;
  facialHair: 'default' | 'none' | string;
  treatment: RuntimeSurfaceTreatment;
  motion: 'idle' | 'walk';
  view: 'close' | 'orbit' | 'play';
  showWeaponWitness: boolean;
}
```

Style resolution is exact and slot-specific. `default` resolves to Hair 04 for
scalp and Facial Hair 02 for facial hair. `none` mounts nothing for that slot.
An unknown ref remains visibly `unmapped`; it never silently falls back to a
default.

Both active controlled slots receive the same treatment value. The browser
matrix visibly exercised black (`#111111`), blond (`#D8B36A`), and red
(`#C02626`) treatments; arbitrary roughness/metalness values; and the pinned
hair, cloth-like, leather-like, and metal-like presets. Every attached status
reported the actual cloned material UUID, base color, roughness, and metalness.
The browser matrix required those controlled actuals to match the current
fixture and the reference actuals to remain the immutable brown-hair defaults.

## Provider-backed evidence

The lab uses the local ignored prefix
`/models/synty/concepts/character-customization/` and pins URL, byte size, and
SHA-256 in `characterCustomizationAssets.ts`. A real browser fetched and hashed
the body and all six selectable accessory GLBs; all seven returned HTTP 200 and
matched those exact pins.

The successful matrix covered Hair 04/08/16, Facial Hair 01/02/03, both `none`
states, default aliases, and a Hair 08 + Facial Hair 03 alternate pair. It also
covered `Idle_Relaxed`, `Walk_Forward`, close, dragged orbit, tactical play,
rapid changes, and the optional canonical main-hand attachment witness.

These files are local provider candidates and remain gitignored. This contract
does not publish them or promise that the URLs are a production provider
surface.

## Evidence gate

An observation earns coverage only when the status identities match the current
slot, style ref, and URL; the reference statuses match their immutable defaults;
every active accessory reports mapped body Bone identities and nonempty runtime
material evidence; all actual surface values match the current controlled or
reference treatment; source armature count is zero; and the R3F renderer frame
advances after readiness. URL success alone cannot produce an observation.

Reference isolation receives separate positive credit only for a committed,
nondefault controlled treatment with disjoint controlled/reference material
UUIDs and unchanged reference actuals. Missing material evidence, shared UUIDs,
controlled-value mismatches, or a mutated reference are refused. The visible
inspector applies the same identity fence synchronously, including the optional
weapon ref/URL/bone, so rapid changes show awaiting/loading evidence rather than
facts retained from a previous selection.

The successful run recorded zero page errors, request failures, or HTTP error
responses. Chrome emitted only its acknowledged WebGL `ReadPixels` performance
notices; those are not application failures.

Ignored local evidence is under
`evidence/task-6-character-customization/resume/`, including per-state canvas
screenshots, the complete full-page verdict, exact status/fixture observations,
network/console events, and seven browser hash receipts in `matrix.json`.

## Not a production contract or Platform ask

The experiment proves that exact-skeleton rebinding and isolated runtime surface
treatment work for this measured Dwarf/body/accessory set. It does not decide:

- where race/body/scalp/facial-hair refs live in production character data;
- whether color and PBR treatment are persisted, provider-owned, or derived;
- the production allowlist, defaults, validation, or migration behavior;
- provider publication, CDN/manifest paths, or asset budgets; or
- how a live character editor saves, authorizes, or broadcasts changes.

Those require separate product/provider/Platform decisions. The Concept adds no
production caller or writer.
