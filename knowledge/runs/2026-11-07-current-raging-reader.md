# 2026-11-07 — read composed Raging without cached bonuses

## Shipped

- Identify Raging by its canonical ref/current data, read runtime progress, and leave bindings opaque. The badge renders the server description rather than duplicating Rage rules or deriving a bonus — [reader](../../src/types/conditionData.ts).
- Reject non-object JSON and malformed current Raging before other duck-typed readers can misclassify it; preserve the other condition reader tests — [reader tests](../../src/types/conditionData.test.ts).

## Decided

- Action-dependent numerical benefits belong to server effect rows, not the condition badge; fixed-item and class bindings both render without client arithmetic — [badge tests](../../src/components/features/ConditionBadge.test.tsx).
- This remains a draft: generated source-ID SDK adoption awaits proto#422 publication, and the isolated native stack has not been booted or walked — [S12](https://github.com/KirkDiggler/rpg-project/issues/884).

## Found

- Ten focused assertions failed against the old reader/badge; all 52 focused cases and type checking pass after the changes — [badge](../../src/components/features/ConditionBadge.tsx).
- Full npm run ci-check passed in 569.24 seconds: format/lint/types/build plus 760 test files passed, one existing file skipped; 9,921 tests passed and six existing tests skipped. The initial 300-second attempt was incomplete, not a pass — [gate](../../scripts/ci-check.sh).
- npm ci reported 22 dependency advisories (one low, twelve moderate, nine high); full tests emitted Browserslist/jsdom warnings. No dependency changes, skip additions or audit auto-fixes were made — [lockfile](../../package-lock.json).

## Mistaken

- The first full-gate command budget was too small for this checkout's suite; the successful rerun kept every gate and took a measured 569.24 seconds rather than narrowing the test set — [gate](../../scripts/ci-check.sh).

— cross-team agent, on behalf of KirkDiggler
