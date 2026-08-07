/**
 * YamlPane.test.tsx — render-layer coverage for the capability-probed
 * graduation unit's gating pieces (`SaveAndPlayButton`, `CompileBadgeStrip`,
 * `CapabilitiesLine`), all exported from `YamlPane.tsx` (now a shared
 * sub-component library, the edit-mode `YamlPane` component itself
 * retired 2026-08-07 — see `YamlPane.tsx`'s own doc comment) so
 * `creation/ProposedYamlPane.tsx` reuses the exact same components rather
 * than a second copy. Tests these directly against their own props
 * (`dungeonYaml.test.ts` already covers where `dropped`/`compiling`/
 * `v1CompilableBlockers` come from — `stripToV1Subset`), not wired
 * through a composition root, per this concept's "tests that survive
 * extraction" bar (CONTRACT.md). No jest-dom matchers — this repo's
 * vitest config has no such setup (`vite.config.ts`'s `test` block), so
 * assertions use plain DOM properties.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { DialectField, ServerCapabilities } from './capabilityProbe';
import { DIALECT_FIELDS } from './capabilityProbe';
import {
  CapabilitiesLine,
  CompileBadgeStrip,
  SaveAndPlayButton,
} from './YamlPane';

function allCapabilities(accepted: DialectField[]): ServerCapabilities {
  return Object.fromEntries(
    DIALECT_FIELDS.map((f) => [f, { accepted: accepted.includes(f) }])
  ) as ServerCapabilities;
}

describe('SaveAndPlayButton — capability-probed graduation gating', () => {
  it('disabled with a generic reason when the server is not live', () => {
    render(
      <SaveAndPlayButton
        serverState="unreachable"
        saveState="idle"
        v1Compilable={true}
        v1CompilableBlockers={[]}
        dialectDropped={[]}
        dialectCompiling={[]}
        onSaveAndPlay={vi.fn()}
      />
    );
    const btn = screen.getByRole('button', {
      name: 'Save & Play',
    }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.title).toMatch(/unreachable or authoring disabled/);
  });

  it('disabled with the SPECIFIC blocker reason when nothing is compilable — not a hardcoded "declare 2 rooms" message', () => {
    render(
      <SaveAndPlayButton
        serverState="live"
        saveState="idle"
        v1Compilable={false}
        v1CompilableBlockers={[
          'needs exactly one boss-archetype room with a declared boss (has none)',
        ]}
        dialectDropped={['canvas']}
        dialectCompiling={[]}
        onSaveAndPlay={vi.fn()}
      />
    );
    // dialectDropped is non-empty (canvas), so the label already reads
    // "Save the compilable subset" — disabled state and tooltip are what
    // this test is actually checking, not the label.
    const btn = screen.getByRole('button', {
      name: 'Save the compilable subset',
    }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.title).toContain(
      'needs exactly one boss-archetype room with a declared boss (has none)'
    );
    expect(btn.title).not.toMatch(/declare at least 2 rooms/);
  });

  it('falls back to the generic room-count message only when no specific blocker was supplied', () => {
    render(
      <SaveAndPlayButton
        serverState="live"
        saveState="idle"
        v1Compilable={false}
        v1CompilableBlockers={[]}
        dialectDropped={[]}
        dialectCompiling={[]}
        onSaveAndPlay={vi.fn()}
      />
    );
    const btn = screen.getByRole('button', {
      name: 'Save & Play',
    }) as HTMLButtonElement;
    expect(btn.title).toMatch(/declare at least 2 rooms/);
  });

  it('enabled, plain label, when the document is already pure v1', () => {
    render(
      <SaveAndPlayButton
        serverState="live"
        saveState="idle"
        v1Compilable={true}
        v1CompilableBlockers={[]}
        dialectDropped={[]}
        dialectCompiling={[]}
        onSaveAndPlay={vi.fn()}
      />
    );
    const btn = screen.getByRole('button', {
      name: 'Save & Play',
    }) as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });

  it('enabled with "Save the compilable subset" and an honest Dropped/Compiles tooltip when the doc mixes accepted and rejected dialect fields', () => {
    render(
      <SaveAndPlayButton
        serverState="live"
        saveState="idle"
        v1Compilable={true}
        v1CompilableBlockers={[]}
        dialectDropped={['1 hole']}
        dialectCompiling={['2 walls', 'start']}
        onSaveAndPlay={vi.fn()}
      />
    );
    const btn = screen.getByRole('button', {
      name: 'Save the compilable subset',
    }) as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
    expect(btn.title).toContain('Dropped: 1 hole');
    expect(btn.title).toContain('Compiles: 2 walls, start');
  });

  it('disabled and reads "Saving…" mid-save, regardless of compilability', () => {
    render(
      <SaveAndPlayButton
        serverState="live"
        saveState="saving"
        v1Compilable={true}
        v1CompilableBlockers={[]}
        dialectDropped={[]}
        dialectCompiling={[]}
        onSaveAndPlay={vi.fn()}
      />
    );
    const btn = screen.getByRole('button', {
      name: 'Saving…',
    }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('honors a caller-supplied label for the pure-v1 case (creation mode reuse)', () => {
    render(
      <SaveAndPlayButton
        serverState="live"
        saveState="idle"
        v1Compilable={true}
        v1CompilableBlockers={[]}
        dialectDropped={[]}
        dialectCompiling={[]}
        onSaveAndPlay={vi.fn()}
        labelWhenPure="Custom Label"
      />
    );
    expect(screen.getByRole('button', { name: 'Custom Label' })).not.toBeNull();
  });
});

describe('CompileBadgeStrip — dual compiling/dropped halves', () => {
  it('renders nothing for a pure-v1 document', () => {
    const { container } = render(
      <CompileBadgeStrip dropped={[]} compiling={[]} />
    );
    expect(container.innerHTML).toBe('');
  });

  it('shows both a confirming "Compiles on this server" line and an amber "Uses: ... not yet accepted" line when the doc has both', () => {
    const { container } = render(
      <CompileBadgeStrip dropped={['1 hole']} compiling={['2 walls']} />
    );
    expect(container.textContent).toContain('Compiles on this server: 2 walls');
    expect(container.textContent).toContain(
      'Uses: 1 hole — not yet accepted by this server'
    );
  });
});

describe('CapabilitiesLine — the "server capabilities" readout', () => {
  it('renders nothing outside live mode', () => {
    const { container } = render(
      <CapabilitiesLine
        serverState="gate-off"
        capabilities={null}
        onRefresh={vi.fn()}
      />
    );
    expect(container.innerHTML).toBe('');
  });

  it('reads "probing" while live but the probe has not completed yet', () => {
    const { container } = render(
      <CapabilitiesLine
        serverState="live"
        capabilities={null}
        onRefresh={vi.fn()}
      />
    );
    expect(container.textContent).toMatch(/probing server capabilities/);
  });

  it('shows the real accepted/total count once the probe completes', () => {
    const { container } = render(
      <CapabilitiesLine
        serverState="live"
        capabilities={allCapabilities(['walls', 'start'])}
        onRefresh={vi.fn()}
      />
    );
    expect(container.textContent).toContain(
      `server capabilities: accepts 2/${DIALECT_FIELDS.length} dialect fields`
    );
    expect(container.textContent).not.toContain('fully supported');
  });

  it('appends "v0.3 cut: fully supported" ONLY when the live probe accepted every dialect field (Kirk look-feedback, rpg-project#194) — derived from the probe, never hardcoded', () => {
    const { container } = render(
      <CapabilitiesLine
        serverState="live"
        capabilities={allCapabilities([...DIALECT_FIELDS])}
        onRefresh={vi.fn()}
      />
    );
    expect(container.textContent).toContain(
      `server capabilities: accepts ${DIALECT_FIELDS.length}/${DIALECT_FIELDS.length} dialect fields`
    );
    expect(container.textContent).toContain('v0.3 cut: fully supported');
  });

  it('un-claims "fully supported" the moment even ONE field is rejected — an older/rolled-back server', () => {
    const allButOne = DIALECT_FIELDS.slice(0, -1);
    const { container } = render(
      <CapabilitiesLine
        serverState="live"
        capabilities={allCapabilities(allButOne)}
        onRefresh={vi.fn()}
      />
    );
    expect(container.textContent).toContain(
      `server capabilities: accepts ${allButOne.length}/${DIALECT_FIELDS.length} dialect fields`
    );
    expect(container.textContent).not.toContain('fully supported');
  });
});
