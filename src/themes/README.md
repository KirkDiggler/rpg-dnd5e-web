# Theme CSS does not live here

The runtime theme stylesheets live in **`public/themes/`** — git-tracked,
loaded at runtime by `src/hooks/useTheme.ts` as `/themes/<name>.css?v=<build>`.
That directory is the single source of truth.

This directory once held a copy of those files. It diverged silently, and a
Dockerfile step copied the stale versions over the real ones at image build,
shipping an unstyled combat HUD to production on every deploy (web#563 — it
bit twice before the root cause was found). The copies and the copy step are
gone. Do not reintroduce either: edit `public/themes/*.css` directly.
