# Art Asset Integration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate new art assets (coordinate data, shader effects, floor/wall builders) from delivery tars into the rpg-dnd5e-web project.

**Architecture:** The project has a mature React Three Fiber rendering pipeline with OBJ model assembly, custom shaders (AdvancedCharacterShader.ts v3.0), and hex grid components (InstancedHexTiles, HexWall). This plan adds: (1) coordinate reference data, (2) four new shader effects to the existing TS shader, and (3) FloorBuilder/WallBuilder utilities as new TS modules in `src/rendering/`.

**Tech Stack:** React Three Fiber, Three.js, TypeScript, GLSL shaders

---

## File Map

| Action | File                                                | Responsibility                                      |
| ------ | --------------------------------------------------- | --------------------------------------------------- |
| Create | `public/models/characters/coords/*.json` (23 files) | Blender coordinate reference data                   |
| Modify | `src/shaders/AdvancedCharacterShader.ts`            | Add auto-shading, ghost, fire, selection effects    |
| Create | `src/rendering/FloorBuilder.ts`                     | Instanced hex floor generation with API adapters    |
| Create | `src/rendering/WallBuilder.ts`                      | Procedural wall/pillar generation with API adapters |

---

### Task 1: Extract coordinate JSON files

**Issue:** #333

**Files:**

- Create: `public/models/characters/coords/` (26 JSON files from tar)

These are Blender-exported coordinate files (position, rotation, scale) for each attachment part. They serve as the source-of-truth reference data — the values are already consumed via hardcoded configs in `src/config/attachmentModels.ts` (hair, weapons, shields) and `src/config/characterModels.ts` (body parts).

- [ ] **Step 1: Extract coordinate files from tar**

```bash
cd /home/kirk/personal/rpg-dnd5e-web
mkdir -p public/models/characters/coords
tar xf /home/kirk/personal/2026-01-20-dnd5e-art.tar \
  --strip-components=2 \
  -C public/models/characters/coords \
  2026-01-20-dnd5e-art/coords/
```

- [ ] **Step 2: Verify all 23 files extracted**

```bash
ls public/models/characters/coords/ | wc -l
# Expected: 23
ls public/models/characters/coords/
```

- [ ] **Step 3: Commit**

```bash
git add public/models/characters/coords/
git commit -m "feat(assets): add coordinate reference data for character assembly (#333)"
```

---

### Task 2: Upgrade AdvancedCharacterShader with new effects

**Issue:** #334

**Files:**

- Modify: `src/shaders/AdvancedCharacterShader.ts`

The existing shader (v3.0) has color swapping, emissive glow, hit flash, and transparency. The new version adds four effects: auto-shading, ghost mode, fire aura, and selection aura. The JS source is at `2026-01-20-dnd5e-art.tar:AdvancedCharacterShader.js` (v2.4, 845 lines).

**Strategy:** Port the new features into the existing TypeScript file. Keep the existing marker color convention (which matches). Add the new uniforms, GLSL code, options interface fields, palettes, and helper functions.

- [ ] **Step 1: Add new fields to AdvancedCharacterShaderOptions interface**

Add after `primaryGlow`:

```typescript
  /** Auto-shading intensity via HSL lightness shift (0.0=off, 0.15=normal, default: 0.0) */
  shadingVariance?: number;
  /** Ghost effect intensity (0.0=solid, 1.0=full ghost, default: 0.0) */
  ghostAmount?: number;
  /** Ghost tint color (default: pale cyan 0x88CCFF) */
  ghostColor?: number | THREE.Color;
  /** Ghost rim glow sharpness (1.0=soft, 4.0=sharp, default: 2.0) */
  ghostRimPower?: number;
  /** Fire aura intensity (0.0=off, 1.0=full blaze, default: 0.0) */
  fireAmount?: number;
  /** Fire animation speed multiplier (default: 1.0) */
  fireSpeed?: number;
  /** Inner fire color near surface (default: 0xFF4400) */
  fireColorInner?: number | THREE.Color;
  /** Outer fire color at edges (default: 0xFFDD00) */
  fireColorOuter?: number | THREE.Color;
  /** Selection aura state (0.0=not selected, 1.0=selected, default: 0.0) */
  selected?: number;
  /** Selection aura glow color (default: white) */
  selectionColor?: number | THREE.Color;
  /** Selection pulse speed (default: 2.0) */
  selectionSpeed?: number;
  /** Selection glow brightness (default: 0.5) */
  selectionIntensity?: number;
```

- [ ] **Step 2: Add defaults for new fields**

Add to `DEFAULT_OPTIONS`:

```typescript
  shadingVariance: 0.0,
  ghostAmount: 0.0,
  ghostColor: 0x88ccff,
  ghostRimPower: 2.0,
  fireAmount: 0.0,
  fireSpeed: 1.0,
  fireColorInner: 0xff4400,
  fireColorOuter: 0xffdd00,
  selected: 0.0,
  selectionColor: 0xffffff,
  selectionSpeed: 2.0,
  selectionIntensity: 0.5,
```

- [ ] **Step 3: Add new uniforms to createAdvancedCharacterShader**

Add after the existing uniforms block (after `primaryGlow`):

```typescript
      // Auto-shading
      shadingVariance: { value: config.shadingVariance },

      // Ghost effect
      ghostAmount: { value: config.ghostAmount },
      ghostColor: { value: new THREE.Color(config.ghostColor) },
      ghostRimPower: { value: config.ghostRimPower },

      // Fire aura
      time: { value: 0.0 },
      fireAmount: { value: config.fireAmount },
      fireSpeed: { value: config.fireSpeed },
      fireColorInner: { value: new THREE.Color(config.fireColorInner) },
      fireColorOuter: { value: new THREE.Color(config.fireColorOuter) },

      // Selection aura
      selected: { value: config.selected },
      selectionColor: { value: new THREE.Color(config.selectionColor) },
      selectionSpeed: { value: config.selectionSpeed },
      selectionIntensity: { value: config.selectionIntensity },
```

- [ ] **Step 4: Update fragment shader GLSL**

Replace the entire `fragmentShader` string with the upgraded version from the JS source. Key additions:

- HSL conversion functions (`rgbToHsl`, `hueToRgb`, `hslToRgb`, `applyAutoShading`)
- New uniform declarations (`shadingVariance`, ghost uniforms, fire uniforms, selection uniforms)
- Auto-shading branch in lighting section
- Ghost effect block (Fresnel rim + desaturation)
- Fire aura block (multi-frequency flicker + rim glow)
- Selection aura block (pulsing rim glow)
- `finalOpacity` variable replacing direct `opacity` usage

The full GLSL is in the JS source file. Port it exactly, keeping the existing marker color convention (Qubicle markers, not pure colors).

- [ ] **Step 5: Add new color palettes**

Add to `ColorPalettes` after `HairColors`:

```typescript
  GhostColors: {
    classic: 0x88ccff,
    spooky: 0x44ff88,
    wraith: 0xaa88ff,
    banshee: 0xffffff,
    shadow: 0x6688aa,
    fire: 0xff8844,
    void: 0x220033,
  },

  FireColors: {
    normal: { inner: 0xff4400, outer: 0xffdd00 },
    arcane: { inner: 0x0044ff, outer: 0x44ddff },
    fel: { inner: 0x00ff44, outer: 0xaaff00 },
    void: { inner: 0x8800ff, outer: 0xff44ff },
    holy: { inner: 0xffdd44, outer: 0xffffff },
    frost: { inner: 0x0088ff, outer: 0xaaffff },
    shadow: { inner: 0x440066, outer: 0x8844aa },
    infernal: { inner: 0xff0000, outer: 0xff4400 },
  },

  SelectionColors: {
    white: 0xffffff,
    gold: 0xffdd44,
    blue: 0x44aaff,
    red: 0xff4444,
    green: 0x44ff44,
    purple: 0xaa44ff,
    cyan: 0x44ffff,
  },
```

- [ ] **Step 6: Add new helper functions**

Add after existing helpers:

```typescript
export function setShadingVariance(
  shader: THREE.ShaderMaterial,
  variance: number
): void {
  shader.uniforms.shadingVariance.value = Math.max(
    0.0,
    Math.min(0.5, variance)
  );
}

export function setGhostMode(
  shader: THREE.ShaderMaterial,
  amount: number,
  color?: number | THREE.Color
): void {
  shader.uniforms.ghostAmount.value = Math.max(0.0, Math.min(1.0, amount));
  if (color !== undefined) {
    if (color instanceof THREE.Color) {
      shader.uniforms.ghostColor.value.copy(color);
    } else {
      shader.uniforms.ghostColor.value.set(color);
    }
  }
}

export function fadeToGhost(
  shader: THREE.ShaderMaterial,
  toGhost = true,
  duration = 1000
): void {
  const startAmount = shader.uniforms.ghostAmount.value as number;
  const targetAmount = toGhost ? 1.0 : 0.0;
  const startTime = Date.now();

  function animate(): void {
    const elapsed = Date.now() - startTime;
    const progress = Math.min(elapsed / duration, 1.0);
    const eased =
      progress < 0.5
        ? 2 * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 2) / 2;
    shader.uniforms.ghostAmount.value =
      startAmount + (targetAmount - startAmount) * eased;
    if (progress < 1.0) {
      requestAnimationFrame(animate);
    }
  }

  animate();
}

export function updateShaderTime(
  shader: THREE.ShaderMaterial,
  deltaTime: number
): void {
  shader.uniforms.time.value += deltaTime;
}

export interface FireModeOptions {
  speed?: number;
  innerColor?: number | THREE.Color;
  outerColor?: number | THREE.Color;
}

export function setFireMode(
  shader: THREE.ShaderMaterial,
  amount: number,
  options: FireModeOptions = {}
): void {
  shader.uniforms.fireAmount.value = Math.max(0.0, Math.min(1.0, amount));
  if (options.speed !== undefined) {
    shader.uniforms.fireSpeed.value = options.speed;
  }
  if (options.innerColor !== undefined) {
    if (options.innerColor instanceof THREE.Color) {
      shader.uniforms.fireColorInner.value.copy(options.innerColor);
    } else {
      shader.uniforms.fireColorInner.value.set(options.innerColor);
    }
  }
  if (options.outerColor !== undefined) {
    if (options.outerColor instanceof THREE.Color) {
      shader.uniforms.fireColorOuter.value.copy(options.outerColor);
    } else {
      shader.uniforms.fireColorOuter.value.set(options.outerColor);
    }
  }
}

export interface SelectionOptions {
  color?: number | THREE.Color;
  intensity?: number;
  speed?: number;
}

export function setSelected(
  shader: THREE.ShaderMaterial,
  isSelected: boolean,
  options: SelectionOptions = {}
): void {
  shader.uniforms.selected.value = isSelected ? 1.0 : 0.0;
  if (options.color !== undefined) {
    if (options.color instanceof THREE.Color) {
      shader.uniforms.selectionColor.value.copy(options.color);
    } else {
      shader.uniforms.selectionColor.value.set(options.color);
    }
  }
  if (options.intensity !== undefined) {
    shader.uniforms.selectionIntensity.value = options.intensity;
  }
  if (options.speed !== undefined) {
    shader.uniforms.selectionSpeed.value = options.speed;
  }
}

export function startShaderAnimation(shader: THREE.ShaderMaterial): () => void {
  let lastTime = Date.now();
  let animationId: number | null = null;

  function animate(): void {
    const now = Date.now();
    const deltaTime = (now - lastTime) / 1000;
    lastTime = now;
    shader.uniforms.time.value += deltaTime;
    animationId = requestAnimationFrame(animate);
  }

  animate();

  return () => {
    if (animationId !== null) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }
  };
}
```

- [ ] **Step 7: Update ColorType to include new types**

```typescript
export type ColorType =
  | 'skin'
  | 'primary'
  | 'secondary'
  | 'tertiary'
  | 'detail'
  | 'ghost'
  | 'selection';
```

- [ ] **Step 8: Run ci-check**

```bash
npm run ci-check
```

- [ ] **Step 9: Commit**

```bash
git add src/shaders/AdvancedCharacterShader.ts
git commit -m "feat(shader): add auto-shading, ghost, fire, and selection effects (#334)"
```

---

### Task 3: Add FloorBuilder utility

**Issue:** #335

**Files:**

- Create: `src/rendering/FloorBuilder.ts`

Convert `FloorBuilder.js` (900 lines) from the tar (`2026-01-21-dnd5e-art-walls-floors-shader.tar`) to TypeScript. This provides instanced hex floor rendering with per-tile color variance, elevation support, mixed terrain, and API adapters that consume rpg-api room data.

- [ ] **Step 1: Create rendering directory and extract JS source**

```bash
mkdir -p src/rendering
tar xf /home/kirk/personal/2026-01-21-dnd5e-art-walls-floors-shader.tar FloorBuilder.js -O > /tmp/FloorBuilder.js
```

- [ ] **Step 2: Create `src/rendering/FloorBuilder.ts`**

Convert the JS source to TypeScript:

- Add explicit type annotations to all function parameters and return types
- Add interfaces for options objects (FloorBuilderOptions, FloorOptions, ElevationTile, TerrainTile, etc.)
- Export the FloorColors preset object with `as const`
- Export hex math helpers (axialToWorld, worldToAxial, getHexesInRadius, getHexesInRect)
- Export API adapter functions (createFloorFromAPI, createRoomFromAPI)
- Export convenience functions (createHexFloor, createRectFloor)

- [ ] **Step 3: Run ci-check**

```bash
npm run ci-check
```

- [ ] **Step 4: Commit**

```bash
git add src/rendering/FloorBuilder.ts
git commit -m "feat(rendering): add FloorBuilder for instanced hex floor generation (#335)"
```

---

### Task 4: Add WallBuilder utility

**Issue:** #335

**Files:**

- Create: `src/rendering/WallBuilder.ts`

Convert `WallBuilder.js` (559 lines) from the tar to TypeScript. Provides procedural wall/pillar generation with auto-shading, selection effects, and API adapters for rpg-api wall data.

- [ ] **Step 1: Extract JS source**

```bash
tar xf /home/kirk/personal/2026-01-21-dnd5e-art-walls-floors-shader.tar WallBuilder.js -O > /tmp/WallBuilder.js
```

- [ ] **Step 2: Create `src/rendering/WallBuilder.ts`**

Convert the JS source to TypeScript:

- Add explicit type annotations to all function parameters and return types
- Add interfaces for options objects (WallBuilderOptions, WallOptions, HexWallOptions, etc.)
- Export WallColors preset object with `as const`
- Export API adapter functions (createWallsFromAPI, createRoomWallsFromAPI)
- Export convenience functions (createPillar, createWall, createWallSection)
- Import AdvancedCharacterShader dependency for auto-shading materials

- [ ] **Step 3: Run ci-check**

```bash
npm run ci-check
```

- [ ] **Step 4: Commit**

```bash
git add src/rendering/WallBuilder.ts
git commit -m "feat(rendering): add WallBuilder for procedural wall generation (#335)"
```

---

### Task 5: Final verification

- [ ] **Step 1: Run full ci-check**

```bash
npm run ci-check
```

- [ ] **Step 2: Verify all files are committed**

```bash
git status
git log --oneline -5
```
