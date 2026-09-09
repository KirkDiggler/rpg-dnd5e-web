---
name: integrating provider character appearances
description: Worked example for provider-declared player classes
updated: 2026-09-09
---

# Integrating provider character appearances

## Worked example: Bard through the generic class path

The compatibility sequence is **tooling before data**. First land a Web generator that accepts a consistent provider-declared class set. Then publish the provider data. Only after the provider receipt names a real merged commit may the ordinary Web sync consume it. This avoids either a hand-edited catalog or a Web commit that pretends unpublished bytes are available.

The receipt chain is:

1. one parts/class recipe;
2. provider build manifest;
3. automatic export manifest;
4. prepared provider receipt;
5. published receipt tied to the private provider PR's verified merge SHA;
6. ordinary Web `assets:sync`, which validates the clean provider checkout and writes the generated catalog;
7. Web commit/PR and its normal CI/review receipt.

Assets issue [rpg-game-assets#185](https://github.com/KirkDiggler/rpg-game-assets/issues/185) is the first fixture. Its current receipt is **prepared, unpublished, and unmerged**. It can prove the pure declaration projection, but it cannot authorize runtime sync or a Web publication claim.

After the provider is genuinely merged, check out its verified merge commit cleanly and run the existing command (the same command for a human or an agent):

```bash
RPG_GAME_ASSETS_PATH=/path/to/clean/rpg-game-assets \
ASSETS_SYNC_SKIP_UPDATE=1 \
npm run assets:sync
```

The existing aggregate and outfit manifests declare class refs, profile bodies, profile-local or legacy fallback paths, outfit identities, recolor masks, and clothing mesh allowlists. The existing generator checks those declarations agree across all eight profiles, verifies paths and SHA-256 values, and derives counts. Adding the next class is provider data only; it does not require another generator or a hand-maintained Web class enum.

At runtime, a normal standing character prefers its race profile body and receives the existing `customizationProfileRef`. That activates the established hair/none, hair color, coat-primary, and trim-secondary controls. The old complete Bard mapping remains only a compatibility fallback until generated Bard profile data arrives. Downed Bards still skip profile customization and use the established visible `MediumHumanoid` fallback because no Bard downed URL is declared.

Run focused generator, resolver, renderer, customization, and session tests, then the required `npm run ci-check`. Finally observe hair, none, coat, and trim through the normal live route when WebGL and a live API are available. Unit tests are not visual proof.
