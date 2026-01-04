# CLAUDE.md Restructure Notes

## Problem

- 4 scattered `🚨 CRITICAL` sections throughout the file
- Proto types rule is in parent CLAUDE.md, not here
- Repetitive, hard to scan

## Proposed Structure

Replace scattered CRITICAL sections with a single "Non-Negotiable Rules" section at the top:

```markdown
## Non-Negotiable Rules

These are NOT recommendations. Violating these wastes time and breaks things.

1. **Run `npm run ci-check` before every push**
2. **Never use `--no-verify`** on git commands
3. **Use proto types directly** - never create TypeScript interfaces that duplicate proto structures
4. **Regenerate lock file when updating protos** - `npm i --save github:KirkDiggler/rpg-api-protos#vX.X.X`
5. **Don't "fix" StrictMode double calls** - they're intentional in dev
```

## Benefits

- One place to look for "must follow" rules
- Scannable numbered list
- Removes repetitive emoji bloat
- Details/explanations stay in relevant sections below as context
