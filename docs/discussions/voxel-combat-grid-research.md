# 3D Voxel Combat Grid - Research & Implementation Strategy

## Context

We're exploring adding a 3D tactical combat grid to rpg-dnd5e-web using voxel-based character models with an isometric view. This would provide a visual representation of encounters that's more engaging than a 2D grid while maintaining the tactical gameplay rpg-toolkit provides.

The goal is to render combat encounters on a 3D grid where:

- Character positions match the tactical grid from rpg-toolkit
- Voxel models represent characters/monsters
- Isometric view provides clear visibility of the battlefield
- Users can click to select squares and issue movement/action commands

## Research Findings

### Recommended Approach: react-three-fiber (R3F)

After researching available options, **react-three-fiber** appears to be the best fit for our React-based stack:

**Why R3F?**

- Native React integration (components, hooks, etc.)
- Built on Three.js - mature WebGL library
- Orthographic camera support for true isometric view
- Proven voxel rendering examples (e.g., [Tiny Room](https://github.com/AndyLow14/Tiny-Room))
- Strong ecosystem with @react-three/drei for helpers
- Performance optimizations (culling, instancing, buffer geometry)

**Technical Setup**:

- OrthographicCamera positioned at ~[100, 100, 100]
- Rotation: ~35.264° X-axis, 45° Y-axis for isometric projection
- Raycasting for grid interaction (click to select/move)

### Voxel Model Options

1. **MagicaVoxel (.vox files)**
   - Industry-standard voxel editor (free)
   - Import via `threejs-vox-loader` package
   - Can store materials, palettes, animations
   - Good for custom character models

2. **Procedural Voxels**
   - Generate programmatically in code
   - More flexible for dynamic content
   - Easier to prototype with
   - Could represent generic tokens initially

### Performance Considerations

For D&D 5e tactical combat:

- Typical grid: 20x20 or smaller (400 squares max)
- Characters/monsters: Usually < 10 entities
- Turn-based (no real-time rendering pressure)
- Voxel face culling keeps triangle count manageable
- Static models can be instanced for duplicates

**Expected performance**: Excellent, well within browser/Discord Activity constraints

### Integration Points with rpg-toolkit

The toolkit already provides the mechanical layer:

- Grid positioning and movement
- Line-of-sight calculations
- Area-of-effect geometry
- Combat state management

The 3D visualization layer would:

- **Read** encounter state from rpg-api
- **Display** entity positions on the grid
- **Capture** user interactions (clicks, drags)
- **Send** commands back through the API (move, attack, etc.)

Clean separation: toolkit handles mechanics, web handles visualization.

## Prototype Results ✅

**Status**: Phase 1 prototype completed and working!

**What we built**:

- ✅ Installed R3F, Three.js, and @react-three/drei
- ✅ Created `VoxelGrid` component with orthographic isometric camera
- ✅ Integrated 2D/3D view toggle in `BattleMapPanel`
- ✅ Basic raycasting for cell and entity selection
- ✅ Connected to live encounter data from rpg-api
- ✅ Movement range visualization (yellow cells)
- ✅ Hover states and entity selection
- ✅ Simple box geometry for entities with animation

**Key findings**:

- R3F integrates seamlessly with our React codebase
- Performance is excellent (no lag with full grid + entities)
- Camera controls (OrbitControls) work well for exploration
- Click handling and raycasting works out of the box
- ✅ **Updated to hex grid** to match 2D implementation

**Hex Grid Implementation** ✅:
Updated the 3D grid to use hexagonal geometry matching the 2D view:

- ✅ Pointy-top hexagon tiles using Three.js ExtrudeGeometry
- ✅ Cube coordinate conversion for accurate distance calculations
- ✅ `hexToWorld()` positioning matches `hexToPixel()` from 2D grid
- ✅ 5 feet per hex movement (matching rpg-toolkit)
- ✅ Camera centered on hex grid with proper target

The 3D hex grid now matches the 2D implementation exactly - same math, same layout, same movement calculations.

**Next validation**: Load actual voxel models (.vox files) to replace placeholder boxes

## Proposed Implementation Path

### Phase 1: Proof of Concept ✅ COMPLETE

- [x] Add R3F dependencies to project
- [x] Create basic orthographic isometric camera setup
- [x] Render simple grid (procedural cubes)
- [x] Implement raycasting for square selection
- [x] Display hover/selection states

**Goal**: Validate the tech stack and interaction model → **VALIDATED**

### Phase 2: Encounter Integration ✅ COMPLETE

- [x] Connect grid to encounter API state
- [x] Place character tokens based on position data
- [x] Handle token selection
- [x] Implement click-to-move (send movement commands)
- [x] Show available movement range

**Goal**: Prove integration with rpg-toolkit mechanics → **VALIDATED**

### Phase 3: Voxel Models 🚧 IN PROGRESS

- [ ] Install `threejs-vox-loader` for .vox file support
- [ ] Load test voxel model (player character)
- [ ] Replace box geometry with loaded voxel mesh
- [ ] Test with race/class/item models from artist
- [ ] Handle model scaling and positioning
- [ ] Add basic animations (idle, attack, hit) if supported

**Goal**: Visual polish and character personality

**Assets**: Have artist friend providing voxel models for:

- Races (different character types)
- Classes (visual distinction)
- Items (weapons, armor)
- Buildings (environment)

### Phase 4: Combat Actions

- [ ] Visual feedback for attacks (projectiles, effects)
- [ ] Area-of-effect visualization
- [ ] Health/status indicators above models
- [ ] Turn order indicators
- [ ] Animation sequences for combat

**Goal**: Full combat visualization

## Open Questions

### Answered ✅

1. **Grid representation**: Render full grid - performance is fine, provides better spatial awareness
2. **Camera controls**: Allow rotation/zoom with OrbitControls - users like exploration capability
3. **Fallback**: YES - maintain 2D grid with toggle button (implemented)
4. **Asset creation**: Artist friend providing models ✅

### Still Open

1. **Hex vs Square Grid**: Should 3D view match 2D hex grid geometry or use simpler square grid?
   - Current: Square grid (simpler math, easier visualization)
   - Alternative: Hex grid (matches 2D, better distance calc)
   - Decision needed before Phase 4

2. **Mobile support**: Touch interactions for Discord Activity on mobile?
   - OrbitControls work with touch
   - Need to test on actual mobile Discord client

3. **Accessibility**: How do we make 3D combat accessible to screen readers?
   - 2D fallback helps
   - Need ARIA labels on entities
   - Need keyboard navigation support

## Alternative Approaches Considered

**CSS-only voxel rendering**:

- Pros: No WebGL dependency, pure CSS
- Cons: Limited flexibility, harder interactions, less performant for complex scenes
- Decision: Not recommended for game mechanics

**Babylon.js**:

- Pros: Game-focused, built-in features
- Cons: Heavier bundle, less React-native integration
- Decision: R3F better fits our React stack

**Raw Three.js**:

- Pros: Full control, no abstraction overhead
- Cons: More boilerplate, managing React integration manually
- Decision: R3F provides better DX without significant cost

## Next Steps

Looking for feedback on:

1. Does this approach align with the project vision?
2. Any concerns about bundle size/performance for Discord Activity?
3. Should we prototype Phase 1 before committing to a milestone?
4. Interest in helping with voxel model creation?

Once we have consensus, I'll create a milestone with specific issues for each phase.

## References

- [Three.js Voxel Geometry Tutorial](https://threejsfundamentals.org/threejs/lessons/threejs-voxel-geometry.html)
- [Tiny Room - R3F Isometric Voxel Example](https://github.com/AndyLow14/Tiny-Room)
- [react-three-fiber Orthographic Camera Examples](https://r3f.docs.pmnd.rs/getting-started/examples)
- [MagicaVoxel](https://ephtracy.github.io/)
- [Rendering .vox Files](https://blog.coding.kiwi/rendering-vox-files/)
