# Character Customization Concept Contract

This is durable **non-production Concept evidence** for rpg-dnd5e-web#877. It
records what the fixture-first browser lab proved and the exact merged Concept
provider publication it consumed; it does not add or request a production
character field, persistence path, API, proto, or toolkit behavior.

Reproducible development route:
`/?concept=character-customization`.

## Verdict

The post-rebase Chrome 151 browser gate passed against bytes synchronized from
provider PR #109's exact merge `4c208fad5a950d2103d763a9c8aac96d3bb342b1`
(reviewed feature head `6c567b5939ba308a3a35b2d4e5354111e30e9f44`).
The pure binder accepts the real `SkeletonUtils.clone()` representation only
when multiple Skeleton wrapper objects preserve the same exact ordered body
Bone objects, compatible inverses, and compatible mesh bind matrices.

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

The lab uses the ignored web prefix
`/models/synty/concepts/character-customization/` and pins URL, byte size, and
SHA-256 in `characterCustomizationAssets.ts`. The merged provider manifest is
`d1d8a815c0241986c6f5367a6de82340722a5bae08d2c62307224d42b1ff7c10`;
the complete inventory file/tree are
`b2ef0d7a975de9aa69c9531138f88a48a6e1fc5c1dfbb716b22627d9c3b91222` /
`c29bd470169026d07bf00fc6d30180a80e29b723f56b19b81adff89b468d00af`.
The synchronized manifest was byte-identical to that merge, and zero files
under `public/models/synty/` are tracked here.

The fresh matrix recorded 28 deliberate scripted checkpoints covering Hair
04/08/16, Facial Hair 01/02/03, both `none` states, default aliases, and a Hair
08 + Facial Hair 03 alternate pair. It separately proved the two required walk
pairs: Hair 08 + default Facial Hair 02, and default Hair 04 + Facial Hair 03.
Both rows reported exact current refs/URLs, `Walk_Forward`, four attached slots,
63 mapped bones, zero source armatures, and exact controlled/reference material
values. It also covered `Idle_Relaxed`, close, a real dragged orbit, tactical
play, rapid changes, and the canonical `dnd5e:item:warhammer` witness at
`/models/synty/weapons/warhammer.glb` on `Hand_R`. A real browser fetched and
hashed all seven customization GLBs; every response was HTTP 200 with the exact
provider size/hash.

The scripted matrix count is not the Concept verdict counter. The latter
accumulates every distinct positive committed frame, including valid
intermediary frames while controls settle, and reached 45. The receipt and
publication test independently pin 28 scripted checkpoints, 45 accumulated
Concept observations, and that distinction.

The exact receipt and compact tracked screenshots are under
`docs/evidence/877-character-customization-concept/`. This publication is a
Concept provider surface, not a promise that these URLs are a production
provider or CDN contract.

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

The fresh publication run recorded zero unexpected app-console errors, page
errors, request failures, or HTTP error responses. Chrome emitted only its
acknowledged WebGL `ReadPixels` performance notices. App-level startup reads
outside the Concept received valid empty gRPC-web fixture responses, so this is
not gameplay/API evidence.

`docs/evidence/877-character-customization-concept/receipt.json` binds the
provider merge/feature head, manifest/inventory, all seven outputs, shared
rig/inverse-bind/socket facts, provider GLB preservation, browser summary, and
the hashes of 13 representative tracked screenshots. The publication test has
an independent exact filename/hash/size/dimension table and semantically checks
both the active Git ignore and zero tracked Synty files. The receipt contains no
private source path or timestamp-dependent hash input.

## Not a production contract or Platform ask

The experiment proves that exact-skeleton rebinding and isolated runtime surface
treatment work for this measured Dwarf/body/accessory set. It does not decide:

- where race/body/scalp/facial-hair refs live in production character data;
- whether color and PBR treatment are persisted, provider-owned, or derived;
- the production allowlist, defaults, validation, or migration behavior;
- whether the Concept provider surface becomes a production CDN/manifest or
  asset-budget contract; or
- how a live character editor saves, authorizes, or broadcasts changes.

Those require separate product/provider/Platform decisions. The Concept adds no
production caller or writer.
