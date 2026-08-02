/**
 * proposedYaml — serializes creation-mode state into the schema this
 * concept WISHES dungeonspec had. This is invented vocabulary, not real
 * dungeonspec — never sent anywhere, never validated server-side. It's
 * the actual contract-discovery deliverable for the P4+ wall/shape work
 * design.md deferred: writing the shape down coherently is what makes the
 * gap concrete. See CONTRACT.md's "Proposed schema from the creation
 * flow" section for the reasoning behind each choice below.
 */
import { HEX_FACING_LABELS } from '@/components/hex-grid/authorGridHelpers';
import type { CreationState } from './creationTypes';

function quote(s: string): string {
  return `"${s}"`;
}

export function serializeProposedSchema(state: CreationState): string {
  const lines: string[] = [];
  lines.push('# PROPOSED — not real dungeonspec. See CONTRACT.md.');
  lines.push('version: 2  # hypothetical: freeform canvas + drawn walls');
  lines.push('key: untitled-creation');
  lines.push('name: "Untitled Dungeon"');
  lines.push('canvas:');
  lines.push(`  width: ${state.grid.width}`);
  lines.push(`  height: ${state.grid.height}`);
  lines.push('');

  lines.push('# Edge-native, matching the real EncounterService.Space.walls');
  lines.push(
    '# wire shape (Wall{from,to,kind,id}) rather than inventing a new one —'
  );
  lines.push(
    '# see CONTRACT.md\'s "walls" finding for why this maps onto that type'
  );
  lines.push('# almost directly instead of needing a translation layer.');
  if (state.walls.size === 0) {
    lines.push('walls: []  # none drawn yet');
  } else {
    lines.push('walls:');
    for (const [key, kind] of state.walls) {
      const orientation = key[0];
      const [c, r] = key.slice(2).split(',').map(Number);
      const to = orientation === 'h' ? [c, r + 1] : [c + 1, r];
      lines.push(
        `  - { from: [${c}, ${r}], to: [${to[0]}, ${to[1]}], kind: ${kind} }`
      );
    }
  }
  lines.push('');

  lines.push(
    "# Cell-native floor openings — same shape as dungeonYaml.ts's real"
  );
  lines.push(
    '# holes: [number, number][] (edit mode already authors these; see'
  );
  lines.push('# TARGET-YAML.md\'s "Structural palette category" section).');
  if (state.holes.size === 0) {
    lines.push('holes: []  # none marked yet');
  } else {
    lines.push('holes:');
    for (const key of state.holes) {
      const [c, r] = key.split(',').map(Number);
      lines.push(`  - [${c}, ${r}]`);
    }
  }
  lines.push('');

  lines.push(
    '# Authored, not generator-chosen — a real tension with the compiled'
  );
  lines.push(
    '# FloorPlan.entrance field (see CONTRACT.md\'s "start/end" finding:'
  );
  lines.push(
    '# an explicit author-placed start needs to either replace or reconcile'
  );
  lines.push('# with the generator-chosen entrance for a linear room chain).');
  lines.push(
    state.start
      ? `start: [${state.start[0]}, ${state.start[1]}]`
      : 'start: null  # not placed'
  );
  lines.push(
    state.end
      ? `end: [${state.end[0]}, ${state.end[1]}]`
      : 'end: null  # not placed'
  );
  lines.push('');

  lines.push('place:');
  if (state.placements.length === 0) {
    lines.push('  []  # none placed yet');
  } else {
    for (const p of state.placements) {
      const facing =
        p.facing !== null ? `, facing: ${HEX_FACING_LABELS[p.facing]}` : '';
      lines.push(
        `  - { ref: ${quote(p.ref)}, at: [${p.at[0]}, ${p.at[1]}]${facing} }`
      );
    }
  }
  lines.push('');
  lines.push(
    '# "facing" reuses this codebase\'s existing 6-direction hex-facing'
  );
  lines.push(
    "# convention (authorGridHelpers.ts's HEX_FACING_LABELS) rather than a"
  );
  lines.push(
    '# rectangular 4/8-way compass — see CONTRACT.md\'s "facing" finding for'
  );
  lines.push('# the tension that creates on a non-hex canvas.');

  return lines.join('\n') + '\n';
}
