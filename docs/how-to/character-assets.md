# Character assets: source to shader

How character art flows from source assets into the rendered model, and how
to add new pieces. The pipeline's law: every texture is a marker-color
template the shader recolors at runtime; every model is OBJ parts assembled
by code.

## Source-to-destination map

Source assets live in `rpg-project/assets/`. This is how they map here:

| Source                    | Destination                                 | Notes                  |
| ------------------------- | ------------------------------------------- | ---------------------- |
| `assets/models/body/`     | `public/models/characters/`                 | OBJ body parts         |
| `assets/models/heads/`    | `public/models/characters/`                 | Race head variants     |
| `assets/models/weapons/`  | `public/models/characters/`                 | Weapon OBJs            |
| `assets/textures/medium/` | `public/models/characters/textures/medium/` | Per-class textures     |
| `assets/textures/base/`   | `public/models/characters/textures/base/`   | Bare skin fallbacks    |
| `assets/coords/`          | Consumed by `src/config/characterModels.ts` | Position/rotation JSON |
| `assets/shaders/`         | Adapted into `src/shaders/*.ts`             | JS → TypeScript        |

## Key files

- `src/config/characterModels.ts` — model paths, part positions/rotations
  (Blender Z-up → Three.js Y-up conversion)
- `src/config/characterTextures.ts` — texture resolution with the fallback
  chain (class → base → solid color)
- `src/shaders/AdvancedCharacterShader.ts` — marker color detection + runtime
  swapping
- `src/shaders/OutlineShader.ts` — cel-shading outline effect
- `src/components/hex-grid/MediumHumanoid.tsx` — assembles the 12 OBJ parts
  with textures + shaders

## Texture marker colors

The shader detects these markers in the texture and replaces them at
runtime:

- `#FFFFFF` → Skin color
- `#F704FF` (Magenta) → Primary armor color
- `#E5FF02` (Yellow) → Secondary accent
- `#1EDFFF` (Cyan) → Tertiary details
- `#2BFF06` (Green) → Fine decorative elements

## Loading pattern

`useLoader(OBJLoader, path)` from React Three Fiber loads model parts.
Textures use `NearestFilter` + `NoColorSpace` — pixel-art fidelity and
accurate shader color detection.

## Adding new assets

1. Copy from `rpg-project/assets/` to `public/models/characters/`
2. Update `KNOWN_TEXTURES` in `src/config/characterTextures.ts`
3. Add coordinate configs to `src/config/characterModels.ts` if new model
   parts arrived