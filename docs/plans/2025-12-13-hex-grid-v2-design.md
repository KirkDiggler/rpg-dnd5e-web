# HexGridV2 Design

**Date:** 2025-12-13
**Status:** Approved
**Goal:** Rebuild the 3D hex grid with solid, precise interactions

## Problem

The current VoxelGrid has several issues causing "clunky" interactions:

1. **Coordinate mismatch** - Converts cube → offset → world (should be cube → world directly)
2. **Imprecise hit detection** - Per-hex cylinder meshes with sizing issues
3. **Inconsistent scaling** - Different scale factors across components
4. **hexDistance() bug** - Called with offset coords but expects cube coords

## Solution

Build a new HexGridV2 component alongside the existing one with:

- Cube coordinates throughout (no offset conversion)
- Raycast to ground plane + math for hit detection
- Single hexSize parameter for all scaling
- Simple visuals for v1, polish later

## V1 Scope

**Included:**

- Click to select hex
- Hover highlighting
- Render entities at positions

**Excluded (v2):**

- Movement mode / valid move highlighting
- Path building
- Attack targeting
- Voxel models (use simple shapes)

## Component Structure

```
/src/components/hex-grid-v2/
  ├── HexGridV2.tsx        # Main component - canvas, camera, lighting
  ├── HexTile.tsx          # Single hex visual (flat hexagon)
  ├── HexEntity.tsx        # Entity at hex position (simple shape)
  ├── useHexInteraction.ts # Raycast + math for hover/selection
  └── hexMath.ts           # Pure functions for coordinate conversion
```

## Coordinate Systems

Two coordinate systems, kept separate:

1. **Cube coords** (x, y, z where x + y + z = 0) - Hex grid addressing from server
2. **World coords** (x, z on flat plane) - Three.js render positions

```typescript
interface CubeCoord {
  x: number;
  y: number;
  z: number;
}

interface WorldPos {
  x: number;
  z: number;
}
```

## hexMath.ts

Pure functions, no React, easy to unit test:

```typescript
// Convert hex address to render position
function cubeToWorld(cube: CubeCoord, hexSize: number): WorldPos {
  return {
    x: hexSize * Math.sqrt(3) * (cube.x + cube.z / 2),
    z: hexSize * 1.5 * cube.z,
  };
}

// Convert click position to hex address (axial rounding)
function worldToCube(world: WorldPos, hexSize: number): CubeCoord;

// Distance between two hexes
function hexDistance(a: CubeCoord, b: CubeCoord): number {
  return Math.max(
    Math.abs(a.x - b.x),
    Math.abs(a.y - b.y),
    Math.abs(a.z - b.z)
  );
}
```

## Hit Detection

The core improvement - raycast to plane, math determines hex:

```
1. Single invisible plane mesh at Y=0
2. On pointer move/click:
   - Raycast from camera through mouse position
   - Intersect with ground plane → world (x, z)
   - worldToCube(intersection, hexSize) → cube coord
   - That's the hovered/clicked hex
3. Validate hex is in grid bounds
4. Update state, call callbacks
```

**Why this works:**

- Single raycast to one plane (fast)
- Math determines hex (precise)
- No per-hex hit meshes to align

## Rendering (V1)

Simple visuals to prove the foundation:

**HexTile:**

- Flat hexagon shape
- Three colors: default (gray), hovered (light), selected (highlight)
- Solid colors, no fancy materials

**HexEntity:**

- Simple cylinder or sphere
- Color by type: player (blue), monster (red)
- Positioned at hex center with slight Y offset

**HexGridV2:**

- Orthographic camera looking down
- Ambient + one directional light
- Ground plane for hit detection (invisible)

## Props Interface

```typescript
interface HexGridV2Props {
  gridWidth: number;
  gridHeight: number;

  entities: Array<{
    entityId: string;
    name: string;
    position: { x: number; y: number; z: number };
    type: 'player' | 'monster';
  }>;

  selectedEntityId?: string;

  onHexClick?: (coord: { x: number; y: number; z: number }) => void;
  onHexHover?: (coord: { x: number; y: number; z: number } | null) => void;
  onEntityClick?: (entityId: string) => void;
}
```

Same shape as VoxelGrid so they're swappable.

## Integration

Add toggle in BattleMapPanel: "2D | 3D | 3D v2"

"3D v2" renders HexGridV2 instead of VoxelGrid.

## Implementation Order

1. hexMath.ts - Pure coordinate functions with tests
2. useHexInteraction.ts - Ground plane + raycast logic
3. HexTile.tsx - Single hex rendering
4. HexEntity.tsx - Entity rendering
5. HexGridV2.tsx - Compose everything
6. Integration - Add toggle to BattleMapPanel
