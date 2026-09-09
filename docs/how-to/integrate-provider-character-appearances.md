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
6. ordinary Web `assets:sync`, which consumes an automatically created clean detached provider worktree and writes the generated catalog;
7. Web commit/PR and its normal CI/review receipt.

Assets issue [rpg-game-assets#185](https://github.com/KirkDiggler/rpg-game-assets/issues/185) is the first fixture. Its current receipt is **prepared, unpublished, and unmerged**. It can prove the pure declaration projection, but it cannot authorize runtime sync or a Web publication claim.

After the provider is genuinely merged, use the publisher's `resolve` command to produce a new schema-v2 `publish-modular-customization-provider@2` merged receipt; never edit the prepared or publication JSON by hand. The receipt must retain the distinct prepared-receipt and published-receipt SHA-256 links emitted by publish/resolve, report current-provider compatibility ready, and report Web compatibility not yet ready. The Web wrapper takes an explicit existing Web issue number and defaults to a machine-readable dry-run plan. It finds the normal sibling `rpg-game-assets` repository by default; `--provider-repo` may instead identify any existing source worktree, which may be dirty or at another commit:

```bash
: "${WEB_ISSUE_NUMBER:?set this to an existing open Web issue on Project 19}"
npm run assets:expose-provider-appearances -- \
  --provider-receipt /path/to/merged-provider-receipt.json \
  --web-issue "$WEB_ISSUE_NUMBER"
```

That command verifies the corrected typed receipt and source-handoff binding, private provider repository identity, merged PR readback, baseline ancestry, preservation declarations, and every receipt-owned provider hash directly from the verified merge commit when that object is already local. Schema v2 must own exactly one `live-117-provider-metadata-overlay` at `evidence/117-all-race-hair/verification.json`; no other evidence or code path is accepted. Its record must name the provider baseline hash and the exact eleven-field allowlist under `providerMetadata.inventory`, `providerMetadata.meshStats`, and `providerMetadata.runtime`. The wrapper compares the merged JSON to the Git-baseline #117 receipt, rejects any historical-field change, and recomputes the declared inventory, mesh-stat, and customization-runtime bindings from the merged provider commit. Source export paths are provenance labels only and are never read or executed by Web.

It also verifies the Web issue is open on Project 19, the canonical UI/UX signature, the `origin/dev` base, and that the generic class tooling has landed. Dry-run performs no fetch, checkout/worktree creation, sync, write, branch, push, or PR mutation. If the merge object is absent, the plan reports that apply will fetch and validate it before creating either isolated worktree.

Only after reviewing that plan, opt into the ordinary sync and Web publication explicitly. Choose a fresh receipt path; existing output and branch/worktree/PR state is retained and reported rather than overwritten or silently retried:

```bash
npm run assets:expose-provider-appearances -- \
  --provider-receipt /path/to/merged-provider-receipt.json \
  --provider-repo /path/to/existing/rpg-game-assets-worktree \
  --web-issue "$WEB_ISSUE_NUMBER" \
  --worktree-root "/path/to/rpg-dnd5e-web/.worktrees/${WEB_ISSUE_NUMBER}-bard-provider-exposure" \
  --output /path/to/web-receipt.json \
  --apply
```

Apply fetches the receipt merge SHA only if needed, validates that fetched commit and the scoped #117 hash chain, creates a fresh detached private-provider worktree at that SHA without changing the source worktree's HEAD or dirty state, and verifies every owned hash there. It then creates the isolated numbered Web worktree from fresh `origin/dev`, installs with `npm ci --ignore-scripts`, explicitly runs the trusted repository Husky setup, verifies the configured pre-commit is executable, delegates exactly to `npm run assets:sync` with the pinned provider and update suppression, stages only the actual tracked `src/generated/characterCustomizationCatalog.ts` change, runs focused generator/resolver tests and the normal `ci-check`, then uses ordinary commit/push/PR operations against `dev`. The emitted Web receipt records all three provider receipt-chain hashes, the exact #117 overlay binding, the verified merged provider SHA and class/races, Web base/branch/head/PR readback, and normal generation/check results. Licensed GLB/BLEND/runtime bytes remain ignored and must never be staged.

The existing aggregate and outfit manifests declare class refs, profile bodies, profile-local or legacy fallback paths, outfit identities, recolor masks, and clothing mesh allowlists. The existing generator checks those declarations agree across all eight profiles, verifies paths and SHA-256 values, and derives counts. Adding the next class is provider data only; it does not require another generator or a hand-maintained Web class enum.

At runtime, a normal standing character prefers its race profile body and receives the existing `customizationProfileRef`. That activates the established hair/none, hair color, coat-primary, and trim-secondary controls. The old complete Bard mapping remains only a compatibility fallback until generated Bard profile data arrives. Downed Bards still skip profile customization and use the established visible `MediumHumanoid` fallback because no Bard downed URL is declared.

Run focused generator, resolver, renderer, customization, and session tests, then the required `npm run ci-check`. Finally observe hair, none, coat, and trim through the normal live route when WebGL and a live API are available. Unit tests are not visual proof.
