# Wave D Web Consumer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend owner-authoritative main-hand presentation from 12 to 16 exact provider refs and prove the four Wave D additions through the Concept and real Light Crossbow session route.

**Architecture:** Sync the exact merged private provider commit into the ignored local runtime tree, then append four display-only definitions to the existing exact-ref catalog. The existing resolver, shared socket, owner-only data flow, safe fallback, and Concept derive from that catalog; no new rendering seam or gameplay rule is introduced.

**Tech Stack:** React 19, TypeScript, Vitest/RTL, React Three Fiber/Three.js, Playwright browser evidence, Connect RPC local stack.

**Spec:** `https://github.com/KirkDiggler/rpg-dnd5e-web/issues/846`

## Global Constraints

- Provider commit is exactly `cf3bd0bd325d9440a6d28f1d39601845bdfbcdde`.
- Provider manifest SHA-256 is exactly `030ddd69117aed1b124f69320bc2def039d45eba0b7840644974108aaf117795`.
- Add exactly Light Crossbow, Longbow, Javelin, Rapier; keep Dart unmapped/unarmed.
- Use exact `dnd5e:item:*` refs and `/models/synty/weapons/<id>.glb` URLs.
- Reuse `townfolk-main-hand-v1`; no item-specific or class-specific transform.
- Acting-player owner equipment only; no peer equipment guess.
- Complete equip/unequip responses and authoritative reconnect identity remain unchanged.
- Missing/unknown/attack-shaped refs and missing assets fail safely without breaking the character or Canvas.
- Licensed GLBs remain ignored/uncommitted; public repo commits only code, hashes, docs, and review images.
- PR targets `dev`; one provider sync + one four-ref web PR.

---

### Task 1: Sync and map the exact 16-item provider catalog

**Files:**

- Modify: `src/components/hex-grid/mainHandWeapons.test.ts`
- Modify: `src/components/hex-grid/mainHandWeapons.ts`
- Modify: `docs/architecture/components/equipment.md`
- Ignored sync: `public/models/synty/**`

**Interfaces:**

- `CURRENT_MAIN_HAND_WEAPONS` remains the single production presentation lookup.
- Four appended definitions preserve current ordering and existing twelve object bytes/source order.
- `resolveMainHandPresentation` behavior is unchanged.

- [ ] **Step 1: Create an exact detached provider checkout and sync ignored assets**

Create `/tmp/rpg846-provider-cf3bd0b` detached at the provider commit. Run:

```bash
RPG_GAME_ASSETS_PATH=/tmp/rpg846-provider-cf3bd0b \
ASSETS_SYNC_SKIP_UPDATE=1 \
npm run assets:sync
```

Verify synced manifest SHA, all sixteen weapon files, and the four Wave D SHA-256 values. Confirm `git status --ignored` shows licensed runtime files ignored.

- [ ] **Step 2: Write failing catalog tests**

Append expected tuples for:

```text
light-crossbow / Light Crossbow
longbow / Longbow
javelin / Javelin
rapier / Rapier
```

Change exact length to 16. Change unknown-ref coverage to `dnd5e:item:dart`; keep attack-shaped rejection.

- [ ] **Step 3: Run focused test and confirm RED**

Run: `npm run test:run -- src/components/hex-grid/mainHandWeapons.test.ts`
Expected: four mappings/length fail and Rapier is still unmapped.

- [ ] **Step 4: Append four production definitions**

Use the exact refs/labels/URLs from the provider. Do not add provider transforms, rule properties, or fallback aliases. Update comments/docs from 12/#71 to 16/#78 and record provider commit/manifest digest.

- [ ] **Step 5: Run focused tests and typecheck**

Run:

```bash
npm run test:run -- src/components/hex-grid/mainHandWeapons.test.ts
npm run typecheck
```

Expected: pass.

- [ ] **Step 6: Commit Task 1**

```bash
git add src/components/hex-grid/mainHandWeapons.ts src/components/hex-grid/mainHandWeapons.test.ts docs/architecture/components/equipment.md
git commit -m "feat: map Wave D main-hand weapons"
```

### Task 2: Extend the production-backed Concept to 16 weapons

**Files:**

- Modify: `src/concepts/weapon-attachment/weaponAttachmentExperiment.ts`
- Modify: `src/concepts/weapon-attachment/weaponAttachmentExperiment.test.ts`
- Modify: `src/concepts/weapon-attachment/WeaponAttachmentConcept.test.tsx`
- Modify: `src/concepts/weapon-attachment/CONTRACT.md`

**Interfaces:**

- Concept fixtures continue deriving from `CURRENT_MAIN_HAND_WEAPONS`.
- Provider source inspector reads `rpg-game-assets#78 · 16-item provider manifest`.
- Complete equipment dimension is 17 states: unarmed + 16 weapons.

- [ ] **Step 1: Write failing Concept expectations**

Add all four labels to the visible roster test, add all four attached observations to the coverage fixture, expect exact 17-state order, and update coverage text to `equipment 17/17`.

- [ ] **Step 2: Run focused tests and confirm RED**

Run:

```bash
npm run test:run -- \
  src/concepts/weapon-attachment/weaponAttachmentExperiment.test.ts \
  src/concepts/weapon-attachment/WeaponAttachmentConcept.test.tsx
```

Expected: source label/coverage/list assertions fail.

- [ ] **Step 3: Update production-backed Concept metadata and contract**

Use one cumulative #78 provider source label for all candidates. Update historical production-extension prose to distinguish the earlier 12-item #71 proof from the current 16-item #78 roster. Keep the provisional historical verdict intact.

- [ ] **Step 4: Run focused tests**

Run the same command; expect pass.

- [ ] **Step 5: Commit Task 2**

```bash
git add src/concepts/weapon-attachment
git commit -m "test: extend Wave D weapon Concept coverage"
```

### Task 3: Capture four-class and authoritative Light Crossbow evidence

**Files:**

- Create: `docs/evidence/846-wave-d-weapons/README.md`
- Create: `docs/evidence/846-wave-d-weapons/receipt.json`
- Create: `docs/evidence/846-wave-d-weapons/wave-d-four-class-contact-sheet.png`
- Create: `docs/evidence/846-wave-d-weapons/wave-d-fighter-walk-contact-sheet.png`
- Create: `docs/evidence/846-wave-d-weapons/authoritative-light-crossbow-contact-sheet.png`

**Interfaces:**

- Evidence records exact provider commit/manifest/four output hashes.
- Concept proof is visual compatibility, not invented inventory authority.
- Real route proves owner equipment only.

- [ ] **Step 1: Start the local stack and web branch**

Use the repository local-dev guide and a branch-specific port. Build/serve development mode. Verify the root route and `?concept=weapon-attachment` load with zero startup errors.

- [ ] **Step 2: Capture the 4 × 4 idle matrix**

For Fighter, Barbarian, Monk, Rogue × Light Crossbow, Longbow, Javelin, Rapier, load the production Concept deep link, require attachment status `attached`, HTTP 200 for exact GLB, and zero browser/page/request failures. Compose one readable 16-cell contact sheet.

- [ ] **Step 3: Capture focused Fighter walk cells**

Capture the four additions in Walk with a readable full-body/orbit framing and compose one sheet. Record no claim of combat animation or second-hand contact.

- [ ] **Step 4: Walk the real authoritative Light Crossbow sequence**

Using the sandbox Fighter:

1. equip owned `dnd5e:item:light-crossbow` and capture the complete RPC response presentation;
2. open a fresh browser context and verify reconnect restores Light Crossbow;
3. unequip and capture immediate unarmed presentation;
4. open another fresh context and verify unarmed restoration;
5. restore the exact observed initial owner state before finishing.

Require relevant owner/asset responses HTTP 200 and no unexpected console/page/request failures.

- [ ] **Step 5: Write receipt and README**

Hash all three sheets. Record provider identities, 16 Concept observations, four focused walk observations, authoritative RPC stages, restored final state, exact code HEAD, and scope limitations. No licensed bytes or private absolute paths.

- [ ] **Step 6: Commit Task 3**

```bash
git add docs/evidence/846-wave-d-weapons
git commit -m "docs: record Wave D weapon web evidence"
```

### Task 4: Final verification, review, and PR

**Files:**

- Modify only for real scoped findings.

- [ ] **Step 1: Run fresh exact-head CI**

Run `npm run ci-check`; record format, lint, typecheck, guards, build, and exact test count.

- [ ] **Step 2: Verify public/private boundary**

Confirm no GLB or ignored runtime asset is tracked, provider/evidence hashes close, Dart stays unmapped, and existing owner/reconnect tests remain green.

- [ ] **Step 3: Dispatch independent whole-branch review**

Review issue #846, exact provider mapping, owner-only flow, Concept evidence, authoritative route evidence, and license boundary. Fix Critical/Important findings in one wave and run one scoped re-review.

- [ ] **Step 4: Push and create PR to `dev`**

Title `feat: consume Wave D starter weapons`; close #846; link parent #302; include provider commit/manifest/output hashes, evidence, CI count, and Assets signature.

- [ ] **Step 5: Request one Copilot round**

Request once, evaluate all comments technically, reply/resolve every thread, rerun gates, and never re-request.

- [ ] **Step 6: Move #846 to In Review**

Update Project 19 after PR creation and verify by readback. Keep the worktree for feedback/merge.
