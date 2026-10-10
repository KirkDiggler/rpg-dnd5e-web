import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WORLD_BUILDING_CATALOG } from './catalog';
import { WorldBuildingPaletteCard } from './WorldBuildingPaletteCard';

const generated = WORLD_BUILDING_CATALOG.find(
  (entry) => entry.source === 'generated'
)!;

const actions = () => ({
  onDragStart: vi.fn(),
  onDragEnd: vi.fn(),
  onRepeat: vi.fn(),
});

describe('WorldBuildingPaletteCard', () => {
  it('skips an unchanged pending card body and renders its own result changes', () => {
    // A label getter observes actual body execution, not just DOM identity.
    // React's shallow prop comparison sees only the immutable entry reference.
    const readLabel = vi.fn(() => generated.label);
    const entry = Object.freeze({
      ...generated,
      get label() {
        return readLabel();
      },
    });
    const props = {
      entry,
      roomMode: true,
      repeatDisabled: false,
      ...actions(),
    };
    const mounted = render(<WorldBuildingPaletteCard {...props} />);
    expect(readLabel).toHaveBeenCalled();
    readLabel.mockClear();
    mounted.rerender(<WorldBuildingPaletteCard {...props} />);
    expect(readLabel).not.toHaveBeenCalled();
    expect(screen.getByText('Thumbnail loading')).not.toBeNull();

    const ready = {
      status: 'ready' as const,
      image: 'data:image/png;base64,own',
    };
    mounted.rerender(
      <WorldBuildingPaletteCard {...props} generatedThumbnail={ready} />
    );
    expect(readLabel).toHaveBeenCalled();
    expect(
      screen
        .getByLabelText(`Drag ${entry.label} into scene`)
        .querySelector('img')
        ?.getAttribute('src')
    ).toBe(ready.image);
    readLabel.mockClear();
    mounted.rerender(
      <WorldBuildingPaletteCard {...props} generatedThumbnail={ready} />
    );
    expect(readLabel).not.toHaveBeenCalled();
    mounted.rerender(
      <WorldBuildingPaletteCard
        {...props}
        generatedThumbnail={{ status: 'error', message: 'Unavailable' }}
      />
    );
    expect(readLabel).toHaveBeenCalled();
    expect(
      screen
        .getByLabelText(`Drag ${entry.label} into scene`)
        .querySelector('img')
    ).toBeNull();
    expect(
      screen.getByText('Thumbnail unavailable: Unavailable')
    ).not.toBeNull();
  });

  it('uses current actions/mode/capacity and preserves exact drag and repeat events', () => {
    const old = actions();
    const current = actions();
    const props = { entry: generated, roomMode: true, repeatDisabled: false };
    const mounted = render(<WorldBuildingPaletteCard {...props} {...old} />);
    mounted.rerender(<WorldBuildingPaletteCard {...props} {...current} />);
    const transfer = {} as DataTransfer;
    const card = screen.getByLabelText(`Drag ${generated.label} into scene`);
    fireEvent.dragStart(card, { dataTransfer: transfer });
    fireEvent.dragEnd(card);
    fireEvent.click(
      screen.getByRole('button', { name: `Repeat ${generated.label}` })
    );
    expect(current.onDragStart).toHaveBeenCalledWith(generated.ref, transfer);
    expect(current.onDragEnd).toHaveBeenCalledOnce();
    expect(current.onRepeat).toHaveBeenCalledWith(generated.ref);
    expect(old.onDragStart).not.toHaveBeenCalled();
    expect(old.onDragEnd).not.toHaveBeenCalled();
    expect(old.onRepeat).not.toHaveBeenCalled();
    mounted.rerender(
      <WorldBuildingPaletteCard {...props} {...current} repeatDisabled />
    );
    fireEvent.click(
      screen.getByRole('button', { name: `Repeat ${generated.label}` })
    );
    expect(current.onRepeat).toHaveBeenCalledOnce();
    mounted.rerender(
      <WorldBuildingPaletteCard {...props} {...current} roomMode={false} />
    );
    expect(screen.queryByRole('button')).toBeNull();
  });
});
