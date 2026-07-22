import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { D20Die } from './D20Die';

describe('D20Die', () => {
  it('renders a recognizable faceted-polygon silhouette, not a generic dice glyph', () => {
    render(<D20Die revealed={false} tumbling={false} />);
    // An unmistakable polygon outline (the die's outer silhouette) —
    // exactly one closed shape, not a generic 🎲 emoji/text glyph.
    expect(screen.getByTestId('d20-silhouette')).toBeTruthy();
    expect(screen.queryByText('🎲')).toBeNull();
  });

  it('renders visible triangular facet lines across the silhouette (Kirk iteration 1: "recognizable faceted d20")', () => {
    render(<D20Die revealed={false} tumbling={false} />);
    // Facet lines from center to each outer vertex read as a faceted
    // gem/die, not a flat polygon — there must be several of them, not
    // just a decorative one-off line.
    const facets = screen.getAllByTestId('d20-facet');
    expect(facets.length).toBeGreaterThanOrEqual(4);
  });

  it('uses currentColor (theme-driven), not a hardcoded color, for the silhouette stroke', () => {
    render(<D20Die revealed={false} tumbling={false} />);
    const silhouette = screen.getByTestId('d20-silhouette');
    expect(silhouette.getAttribute('stroke')).toBe('currentColor');
  });

  it('scales responsively via viewBox rather than a fixed pixel size', () => {
    render(<D20Die revealed={false} tumbling={false} />);
    const svg = screen.getByTestId('d20-die');
    expect(svg.getAttribute('viewBox')).toBeTruthy();
    // No hardcoded width/height attribute forcing a fixed pixel size —
    // sizing is delegated to CSS (clamp()) so it scales with its
    // container/viewport, matching design.md §8's responsive-scaling bar.
    expect(svg.hasAttribute('width')).toBe(false);
    expect(svg.hasAttribute('height')).toBe(false);
  });

  it('shows a hidden-result "?" face, never the authoritative roll, when revealed is false (armed/throw)', () => {
    render(<D20Die revealed={false} tumbling={false} face={20} />);
    const face = screen.getByTestId('d20-face');
    expect(face.textContent).toBe('?');
    expect(face.textContent).not.toContain('20');
  });

  it('shows the authoritative landed face once revealed is true', () => {
    render(<D20Die revealed tumbling={false} face={17} />);
    const face = screen.getByTestId('d20-face');
    expect(face.textContent).toBe('17');
  });

  it('shows the authoritative landed face immediately for a persisted Instant result (revealed=true, tumbling=false)', () => {
    render(<D20Die revealed tumbling={false} face={1} />);
    expect(screen.getByTestId('d20-face').textContent).toBe('1');
    // SVG elements' `.className` is an SVGAnimatedString, not a plain
    // string — read the `class` attribute directly instead.
    expect(screen.getByTestId('d20-die').getAttribute('class')).not.toContain(
      'd20-die--tumbling'
    );
  });

  it('adds the tumbling class only while tumbling is true and not reducedMotion', () => {
    render(<D20Die revealed={false} tumbling face={9} />);
    expect(screen.getByTestId('d20-die').getAttribute('class')).toContain(
      'd20-die--tumbling'
    );
  });

  it('never leaks the authoritative face while tumbling — still shows "?" during the throw', () => {
    render(<D20Die revealed={false} tumbling face={9} />);
    expect(screen.getByTestId('d20-face').textContent).toBe('?');
  });

  it('suppresses the tumbling class under reducedMotion even when tumbling is true (settled instead)', () => {
    render(<D20Die revealed={false} tumbling reducedMotion face={9} />);
    const el = screen.getByTestId('d20-die');
    const cls = el.getAttribute('class');
    expect(cls).not.toContain('d20-die--tumbling');
    expect(cls).toContain('d20-die--settled');
  });

  it('is decorative for assistive tech (aria-hidden) — the verdict remains the single announced signal', () => {
    render(<D20Die revealed tumbling={false} face={14} />);
    expect(screen.getByTestId('d20-die').getAttribute('aria-hidden')).toBe(
      'true'
    );
  });

  it('the same authoritative face renders identically regardless of when it is revealed — tap timing never changes the outcome', () => {
    const { rerender } = render(<D20Die revealed={false} tumbling face={11} />);
    expect(screen.getByTestId('d20-face').textContent).toBe('?');
    rerender(<D20Die revealed tumbling={false} face={11} />);
    expect(screen.getByTestId('d20-face').textContent).toBe('11');
  });
});
