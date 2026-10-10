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
  it('keeps image load/error state inside the image without rerendering the card', () => {
    const readLabel = vi.fn(() => generated.label);
    const entry = Object.freeze({
      ...generated,
      thumbnail: '/provider.png?v=one',
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
    const card = screen.getByLabelText(`Drag ${generated.label} into scene`);
    const image = card.querySelector('img')!;
    expect(image.getAttribute('src')).toBe(entry.thumbnail);
    readLabel.mockClear();
    mounted.rerender(<WorldBuildingPaletteCard {...props} />);
    fireEvent.load(image);
    expect(readLabel).not.toHaveBeenCalled();
    expect(image.getAttribute('data-thumbnail-state')).toBe('ready');
    fireEvent.error(image);
    expect(readLabel).not.toHaveBeenCalled();
    expect(card.querySelector('img')).toBeNull();
    expect(
      screen.getByLabelText(`Preview unavailable for ${generated.label}`)
    ).not.toBeNull();
    fireEvent.click(
      screen.getByRole('button', { name: `Repeat ${generated.label}` })
    );
    expect(props.onRepeat).toHaveBeenCalledWith(generated.ref);
    const replacement = { ...entry, thumbnail: '/provider.png?v=two' };
    mounted.rerender(
      <WorldBuildingPaletteCard {...props} entry={replacement} />
    );
    expect(card.querySelector('img')?.getAttribute('src')).toBe(
      replacement.thumbnail
    );
  });

  it('names an absent provider preview without hiding or disabling the asset', () => {
    const callbacks = actions();
    render(
      <WorldBuildingPaletteCard
        entry={{ ...generated, thumbnail: undefined }}
        roomMode
        repeatDisabled={false}
        {...callbacks}
      />
    );
    expect(
      screen.getByLabelText(`Preview unavailable for ${generated.label}`)
    ).not.toBeNull();
    expect(
      screen
        .getByLabelText(`Drag ${generated.label} into scene`)
        .querySelector('canvas')
    ).toBeNull();
    fireEvent.click(
      screen.getByRole('button', { name: `Repeat ${generated.label}` })
    );
    expect(callbacks.onRepeat).toHaveBeenCalledWith(generated.ref);
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
