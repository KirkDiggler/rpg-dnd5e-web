---
name: running vitest
description: How to run the test suite and choose a per-file environment
updated: 2026-09-09
---

# Running Vitest

Run commands from the repository root.

## Run tests

Run the complete suite once:

```bash
npm run test:run
```

Run one file:

```bash
npm run test:run -- src/hooks/useEncounterState.test.ts
```

Watch a file while editing:

```bash
npm test -- src/hooks/useEncounterState.test.ts
```

Use a different reporter when diagnosing a failure:

```bash
npm run test:run -- --reporter=verbose
```

Vitest discovers `src/**/*.test.{ts,tsx}` and `scripts/**/*.test.ts` according
to `vite.config.ts`.

## When to run broader tests

Run a known related test file directly when editing. For example:

```bash
npm run test:run -- src/utils/money.test.ts
npm run test:run -- src/hooks/useEncounterState.test.ts
```

During an edit-test-edit loop, watch the narrow area instead:

```bash
npm test -- src/utils/money.test.ts
npm test -- src/hooks/useEncounterState.test.ts
```

Focused runs are iteration aids, not proof that the complete suite is correct.
Run broader checks when the change affects shared setup or configuration,
dependencies, external services, filesystem fixtures, or has unclear impact.
At the pull-request boundary, use `npm run ci-check`; it includes the full test
suite. Do not run a duplicate standalone full suite immediately before that gate.

## Test environments

The default environment is `jsdom`. Keep it for component rendering, DOM and
browser APIs, user interaction, React hooks that need a renderer, and any test
whose browser dependency is unclear.

A self-contained pure test can avoid jsdom startup with a file-level opt-in as
the first line:

```ts
// @vitest-environment node
```

Use the Node opt-in only after reviewing the test intent and its runtime imports.
Good candidates exercise deterministic parsing, transforms, state transitions,
geometry, or contract validation without rendering or reading browser globals.
Do not add the annotation merely because a test happens to pass once in Node.

When changing an environment annotation, run the file directly and then run the
complete suite. The suite must discover the same files and preserve every
existing test identity and status.

## Worker limits

Vitest chooses workers from the available machine resources. On a shared local
machine, cap workers deliberately rather than assuming the largest value is
best. For example:

```bash
nice -n 10 npm run test:run -- --maxWorkers=8
```

Choose a cap appropriate to the machine and other running work; this example is
a resource bound, not an optimal-concurrency promise.

## Adding tests

- Test pure functions directly with minimal fixtures.
- Build proto fixtures with `create()` from `@bufbuild/protobuf`.
- Use `renderHook` from Testing Library for hooks that require React context.
- Use React Testing Library for component behavior.
- Keep assertions focused on observable behavior rather than implementation
  details.

## Required pre-publication check

Before opening or updating a pull request, run one complete gate:

```bash
npm run ci-check
```

It checks formatting, lint, types, the production build, build-specific guards,
and the full test suite. Do not run a standalone full suite immediately before
it; the gate already includes one. Run the gate at the pull-request boundary,
not after every edit, commit, or push. All checks must pass, and pull-request CI
remains authoritative. Never bypass Git hooks with `--no-verify`.
