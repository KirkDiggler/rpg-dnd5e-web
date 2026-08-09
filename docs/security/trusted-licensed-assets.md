# Trusted licensed-assets exact-head gate

`trusted-licensed-assets.yml` is a bootstrap, not a usable PR workflow until its
commit is released normally from `dev` to the repository's default `main`. GitHub
accepts `workflow_dispatch` only for a workflow present on the default branch.
The helper proves `github.ref`, `github.workflow_ref`, `github.workflow_sha`, and
`github.sha` all identify that released `main` definition before it trusts an
input.

## Release and dispatch sequence

1. squash the bootstrap feature PR into `dev` through normal review;
2. release `dev` to `main` with the required real merge commit;
3. synchronize released `main` back into `dev` under the long-lived-branch rules;
4. from `main`, dispatch with a PR number and its full, then-live 40-character
   head SHA.

The graph is deliberately split:

```text
trusted-preflight (no Environment/provider/secret)
  -> licensed (licensed-assets Environment; dependency/image prep before stage)
       -> trusted provider verification and credential/provider deletion
       -> docker --network none PR lifecycle/full CI/perf
       -> trusted-base, allowlisted, offline Docker proof
       -> unconditional local cleanup
  -> final-status (fresh live tuple equality, scalar JSON only, old-SHA status)
```

A pushed replacement head makes the final tuple comparison fail. The workflow
can then write only a failure to the already validated expected old SHA; it never
writes success to the new SHA.

## Environment contract

The job names the protected Environment `licensed-assets`. Its required state is:

- Kirk (`KirkDiggler`) is the required reviewer;
- administrator bypass is disabled;
- the only provider credential is the Environment secret
  `RPG_GAME_ASSETS_READ_TOKEN`;
- the legacy repository/organization secret `ASSETS_READ_TOKEN` is never read;
- no repository/organization secret named `RPG_GAME_ASSETS_READ_TOKEN` exists.

The helper rejects a missing canonical secret and never falls back to a broad
one. GitHub's `${{ secrets.NAME }}` expression does not expose which scope won
when administrators create the _same name_ at multiple scopes. Therefore the
last bullet is an externally inspectable Environment/repository configuration
invariant, not something runner code can cryptographically infer. Dispatch must
fail closed operationally until an administrator verifies that invariant. The
workflow does not create or change a secret.

A fine-grained PAT cannot be proven server-revoked by a hosted runner. This gate
proves that the credential, askpass file, authenticated configuration, process
environment, and private checkout are unavailable before PR code. Kirk must
manually revoke/delete the temporary credential after the run; evidence must not
claim server-side revocation.

## Untrusted execution and Docker proof

The exact PR and live base are fetched into quarantine with hooks and submodules
disabled. Trusted parsing rejects forks, bots/Dependabot, drafts, closed/wrong-base
PRs, special tree entries, changed licensed formats/paths, and any SHA mismatch.
Nothing from quarantine runs before provider removal.

Images, an `npm ci --ignore-scripts` dependency tree, and an asset-free Docker
cache proof are prepared before licensed bytes exist. After staging, every
PR-controlled lifecycle, test, build, and performance command runs nonroot in a
read-only-root container with `--network none`, all capabilities dropped,
`no-new-privileges`, no proxy/control environment, no host socket, a disposable
writable source, and the asset tree as a nested read-only mount. Stdout/stderr is
captured only under private runner scratch, scanned by trusted code, never printed
or uploaded, and deleted.

The Docker proof first requires PR `Dockerfile` and `.dockerignore` bytes to be
exactly the live trusted base. Trusted code creates a fresh context containing
only fixed root build inputs plus `src/` and `public/`; it rejects symlinks,
hardlinks, special files, `ADD`, and remote-source forms. Licensed files are added
only to this allowlisted context.

The current trusted-base Dockerfile cannot be executed with licensed context on a
GitHub-hosted Docker daemon without weakening the boundary: its builder runs both
`npm ci` and `npm run build` as container root, while `docker build` exposes
`--network=none` and `--pull=false` but no equivalents for `docker run --cap-drop
ALL --security-opt no-new-privileges`. A warm cache would also require executing
PR code before provider access, which would invalidate the trusted preflight.
Consequently the executable helper **fails closed after constructing and checking
the context and before invoking Docker**. This gate cannot green until a separately
reviewed trusted-base/container-build design can prove nonroot, dropped
capabilities, no-new-privileges, offline cache completeness, and no pre-provider PR
execution on the hosted runner. It does not fall back to an online build, run the
PR Dockerfile, or claim a Docker pass. No Actions cache is read or written after
staging.

## Evidence and residual limits

Only `licensed-assets-evidence.json` may be uploaded. The trusted publisher
requires its exact v1 key set, bounded scalar values, full SHA/digest formats,
one regular non-hardlinked JSON file below 4 KiB, and rejects archives, image
magic, URLs, token/secret shapes, long blob strings, extra fields, and false
gates. Provider checkout, stage, `dist`, private logs, build contexts, images,
and labeled volumes are deleted before upload. Screenshots and PR-authored
reports are never artifacts.

Kirk's exact-head Builder/Game visual review stays local. The only public visual
evidence is Kirk's externally signed scalar pass on the feature PR; no pixels
leave the local review.

No design on a shared hosted runner can eliminate low-bandwidth covert channels
through pass/fail or duration. This workflow bounds outputs and timings and
prevents byte/log/network escape, but records that residual honestly rather than
claiming noninterference.

## Tests

Run the repository-native helper suite and reversible sandbox mutations:

```sh
python3 -m unittest discover -s scripts/tests -p 'test_*.py'
scripts/tests/run_trusted_sandbox_integration.sh
```

The suite mutates every live trust field, the final race, provider lock/digests
and tool identities, missing/broad-only secrets, residue, special/licensed tree
entries, Dockerfile/ADD/context symlinks, artifact smuggling, functional/hash/perf
oracles, and specifically kills a source mutant that removes live API head
comparison. The Docker integration executes DNS, public TCP, GitHub HTTPS,
Docker-host, proxy, socket, nonroot, read-only-stage, stdout-capture, and
post-staging package-lifecycle probes, then reversibly removes each pivotal
boundary and requires the unsafe mutation to fail.
