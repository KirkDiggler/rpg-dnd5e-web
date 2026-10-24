# Character and NPC thumbnails

`PortraitProvider` turns supplied roster appearances into reusable PNG data URLs.
Mount one above the character-card and turn-strip consumers. It does not fetch a
roster, authorize a viewer, mutate a character, or execute game commands.

```tsx
import { PortraitProvider, usePortrait } from '@/portraits';

// roster.members is the existing observer-disclosed PublicMemberInfo[].
<PortraitProvider
  scopeKey={JSON.stringify([
    authenticatedPlayerId,
    sessionId,
    observerMemberId,
  ])}
  members={roster.members}
>
  <CharacterCard />
  <TurnStrip />
</PortraitProvider>;

function Portrait({ memberId, name }: { memberId: string; name: string }) {
  const result = usePortrait(memberId);
  if (result.status !== 'ready') {
    return (
      <span>
        {name} · {result.status}
      </span>
    );
  }
  return (
    <img src={result.image} alt={`${name} portrait`} width={64} height={64} />
  );
}
```

The consuming image component must also handle `onError` with a named fallback.
`PortraitProviderConcept` demonstrates a decode-error fallback without persisting
that failure across a different image. The provider does not prescribe HUD markup,
crop, sizing, tooltips or CSS.

## Result contract

`usePortrait(memberId)` returns:

- `loading`: `key`, with no old image.
- `ready`: `key` and `image` (a PNG data URL suitable for an ordinary `<img>`).
- `unavailable`: `message`; no supplied member, ambiguous duplicate member ID,
  missing mapping, unsupported kind, or invalid/incompatible appearance input.
- `error`: `key` and `message`; rendering, attachment, WebGL or capture failure.

An empty scope refuses all captures. The scope is a cache boundary, **not an
authorization mechanism**. Supply only appearance information already disclosed
to this viewer. Do not feed private live sheets into remembered-NPC portraits.
Replace roster messages immutably when their confirmed appearances change.

## Source and identity

An explicit `appearanceRef` resolves exactly through the NPC appearance catalog,
including its forward axis and standing-model hash. An unknown explicit ref never
falls back to the monster's rules identity. A fixed appearance without a compatible
customization profile cannot silently ignore supplied hair or outfit customization.

Without an explicit ref, players use the existing race/class model resolver and
its generated customization profile. Hair, defaults, colors, roughness and outfit
dyes use the same presentation resolvers and `ClassCharacterModel` as gameplay.
Invalid customization refuses the portrait rather than showing a default as exact.
Monsters/world NPCs without an explicit ref adapt the roster's full `monsterRef`
(e.g. `dnd5e:monsters:skeleton`) through the shared `refId` parser before calling
the existing monster-model resolver. Missing, malformed or unmapped identity
remains unavailable. No display name selects an asset.

The capture key includes the recipe version, resolved model, forward rotation,
resolved customization and available published content identity. Generated player
profiles include the customization provider's manifest hashes. Fixed NPC appearances
include their exact model hash. Legacy models without published hashes are URL-keyed
**within this mount only**; no hot-replacement or persistent content-cache guarantee
is inferred for them. Bump `PORTRAIT_RECIPE` when capture presentation changes.

## Lifetime and rendering

The provider captures once per distinct desired key using a serial queue and one
mounted capture surface at a time. A new source resets the whole capture subtree,
including its renderer; it does not reuse a WebGL context across distinct portraits. Identical appearances share the completed image regardless
of member name/ID. It retains results only while their keys remain in the supplied
roster. Removing a member, changing its appearance or changing scope immediately
stops exposing its old portrait. Late completions cannot supply a different key.
Changing scope remounts the cache, even if the new roster uses identical keys.

A customized capture waits for every requested accessory and outfit treatment to
report successful attachment. Body loading remains under the shared capture
Suspense boundary. Rejected attachments fail the request; the shared 20-second
request timeout bounds assets that never finish. WebGL root failure settles the
remaining pending queue instead of retrying a broken surface for every member.
Existing shared-thumbnail consumers default to `ready=true`; portrait capture opts
into the readiness gate. The canvas unmounts once all requested keys settle.

Images are mount-local, not uploaded or saved on the character. A fresh mount or
scope regenerates them. Failed keys remain failed while present; remounting the
provider (or removing and later restoring that key) retries. This is not a durable
portrait service or a cache across game sessions.

The current recipe produces 128×128 standing-body thumbnails at a three-quarter
portrait angle, toward the viewer and slightly screen-right, with an asset-corrected
portrait-only rotation and the shared renderer’s framing and
lighting. It leaves in-game facing unchanged. It does not include equipped-item attachments,
map lighting, combat pose, wounds or a target-dependent presentation. A head-and-
shoulders crop or a different resolution is a presentation change, not new rules
or a new character RPC.

## Isolated preview

Run the web dev server with synchronized private assets and open
`?concept=portrait-provider`. It uses generated protobuf fixtures and the production
provider, renders customized human/dwarf characters and fixed/legacy creatures,
and offers fixture appearance/scope changes. It makes no gameplay calls. Source
models and captured image bytes must not be committed to this public repository.
