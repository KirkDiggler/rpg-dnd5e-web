/**
 * Editing the site's `intel:` records (rpg-dnd5e-web#1176, the v4 port of the
 * v2 intel panel web#933 / rpg-project#326).
 *
 * THE BUILDER IS A FORM BUILDER, AND THESE ARE ITS MECHANICS, NOT ITS
 * OPINIONS. Every function here moves bytes the toolkit already accepts: it
 * never resolves a `door` or `fact` target, never decides who may hold a
 * record, and never protects the author from a name it cannot resolve.
 * Renaming a record id changes the declaration and nothing else — if a
 * creature's `holds` still names the old id, the ENGINE refuses that by name,
 * and that sentence is the one to surface. Semantic authority is the server's,
 * not the form's (`sitePolicyEdits.ts`'s own law).
 *
 * A RECORD IS A SITE NOUN, NOT A SELECTION. It is declared at the document root
 * beside `factions`/`dispositions` and held BY creatures and props, so its
 * editor lives in the site scope rather than in a creature's panel — the same
 * reason a faction's shared table cannot be edited from one member (v2 R7).
 *
 * ABSENCE IS THE AUTHORED STATE "NONE". `intel` is present only when it carries
 * at least one record; removing the last one drops the key so the document
 * stays byte-identical to one that never had intel.
 */
import type { SiteIntelRecord, SiteIntelReveals, SiteScope } from './siteScope';

/** A fresh record id nobody has taken. */
export function nextIntelId(scope: SiteScope): string {
  const taken = new Set((scope.intel ?? []).map((record) => record.id));
  let n = (scope.intel?.length ?? 0) + 1;
  while (taken.has(`intel-${n}`)) n += 1;
  return `intel-${n}`;
}

/** Put a record list back on the scope, dropping the key when it empties.
 * ONE place the absence law lives, so no mutator can write `intel: []`. */
function withRecords(
  scope: SiteScope,
  records: SiteIntelRecord[]
): SiteScope {
  if (records.length === 0) {
    const { intel: _dropped, ...rest } = scope;
    return rest;
  }
  return { ...scope, intel: records };
}

/** A NEW record: a fresh id, revealing the first target the caller offers (a
 * door when the site has one, else a fact). There is no target to invent — the
 * author writes it — so the id starts empty and the form shows that. */
export function addIntelRecord(scope: SiteScope, reveals: SiteIntelReveals): SiteScope {
  return withRecords(scope, [
    ...(scope.intel ?? []),
    { id: nextIntelId(scope), reveals },
  ]);
}

/** Rename a record's id. REFERENCES ARE NOT REWRITTEN: a creature's `holds`
 * keeps the old name, and if it no longer resolves the engine says so — that
 * is the server's judgement, not the form's (`renameSiteFaction`'s law). */
export function renameIntelRecord(
  scope: SiteScope,
  from: string,
  to: string
): SiteScope {
  return withRecords(
    scope,
    (scope.intel ?? []).map((record) =>
      record.id === from ? { ...record, id: to } : record
    )
  );
}

/** Replace what a record reveals. Exactly one target, because a record that
 * claims to reveal two things is an author who has not decided. */
export function setIntelReveals(
  scope: SiteScope,
  id: string,
  reveals: SiteIntelReveals
): SiteScope {
  return withRecords(
    scope,
    (scope.intel ?? []).map((record) =>
      record.id === id ? { ...record, reveals } : record
    )
  );
}

/** Remove a record declaration. A creature that still holds it keeps the name
 * as written; the engine names the dangling one and its fix. */
export function removeIntelRecord(scope: SiteScope, id: string): SiteScope {
  return withRecords(
    scope,
    (scope.intel ?? []).filter((record) => record.id !== id)
  );
}

/** The record ids a site has declared, in authored order — what a creature's
 * `holds` picker offers. */
export function intelRecordIds(scope: SiteScope): string[] {
  return (scope.intel ?? []).map((record) => record.id);
}

/** Which creatures and props hold a record, read from the room's bindings —
 * the read-only "held by" the site panel shows. It reports what the document
 * says and never decides whether a holder is legal. */
export function intelHolders(
  bindings: Record<string, { holds?: string[] }> | undefined,
  recordId: string
): string[] {
  if (!bindings) return [];
  return Object.entries(bindings)
    .filter(([, binding]) => binding.holds?.includes(recordId))
    .map(([id]) => id);
}