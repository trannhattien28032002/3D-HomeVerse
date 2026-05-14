Rendering Pipeline Review

Architecture: Two Independent Pipelines

ENGINE (Three.js, ~60fps loop)
  requestAnimationFrame
  └─ world.update(dt)
       ├─ [1] OrbitControlSystem   — camera movement + preset transitions
       ├─ [2] GizmoSystem          — 3D transform handles


Rendering Pipeline Review

Architecture: Two Independent Pipelines

ENGINE (Three.js, ~60fps loop)
  requestAnimationFrame
  └─ world.update(dt)
       ├─ [1] OrbitControlSystem   — camera movement + preset transitions
       ├─ [2] GizmoSystem          — 3D transform handles
       ├─ [3] PlacementAssistSystem
       ├─ [4] CannonCollisionSystem
       ├─ [5] LightSystem          — ambient + directional updates
       ├─ [6] WallGeometrySystem   — miter computation + ExtrudeGeometry rebuild
       ├─ [7] RoomSystem           — closed polygon detecti
       ├─ [8] DimensionSystem      — wall lengths + corner angles (2D only)
       ├─ [9] RenderSystem         — Transform → mesh.positr()
       └─ [10] SnapshotSystem      — hash diff → emit "snapshot" event

UI (Konva, event-driven)
  "snapshot" event → useFloorPlanStore → React re-render →

---
3D Geometry Pipeline

Wall mesh generation (the most complex part):

1. WallFactory creates an initial BoxGeometry placeholder on wall creation
2. WallGeometrySystem runs each frame and recomputes miter geometry:
  - For each wall endpoint, collects all connected walls
  - Computes left/right boundary intersection between adjacent walls
  - Applies MITER_LIMIT threshold — beyond that, falls back to a bevel
  - Handles parallel walls (180°) and 3+ way junctions spec
  - Outputs 4-point WallPolygon per wall + an N-gon cap polygon at junction nodes
3. Geometry is disposed and rebuilt as THREE.ExtrudeGeometry when polygon changes
4. RenderSystem positions wall meshes — X/Z come from the g from Transform

Cap geometry (junction fills at nodes where 3+ walls meet): also ExtrudeGeometry, cached via capMeta to skip rebuilds.

Room floors: THREE.ShapeGeometry (flat, not extruded), Y = -0.01, DoubleSide material.

---
Material & Mesh Lifecycle

┌──────────────────┬─────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│      System      │                                                   Pattern                                                   │
├──────────────────┼────────────────────────────────────────────────────────────────────────────────┤
│ MaterialRegistry │ Signature-based pool — {color, metalness, roughness, side} → single shared MeshStandardMaterial             │
├──────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ MeshRegistry     │ Central ownership — register(key, meshscene + disposes geometry (not material) │
├──────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Geometry         │ Disposed and reallocated on every topology change                                                           │
├──────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Material         │ Never per-mesh disposed — released onl                                         │
└──────────────────┴─────────────────────────────────────────────────────────────────────────────────────────────────────────────┘

---
2D Konva Layer Order

[bottom] Room fills (interactive in select mode)
         Room area labels (text + rounded rect bg)
         Wall outlines (non-interactive strokes)
         Wall fills + tool interaction handlers
         Dimension annotations (non-interactive)
         Angle arc annotations
         Active tool overlay (preview lines, ghost nodes)
[top]    Axes

Scale compensation (stageScale) is applied to stroke widths stay readable at all zoom levels.

---
Scene Setup

- Renderer: WebGLRenderer, antialiasing on, SRGB, ACES Filmic tonemapping, shadow maps enabled
- Environment: HDR via EXRLoader → PMREM (/hdri/studio.exr)ment and background
- Lighting: Ambient (0.5) + Directional (0.9) at (10, 18, 10), 2048×2048 shadow map
- Camera: 45° FOV PerspectiveCamera; 3 presets — plan (top-down), perspective (3/4), eye-level (1.65m)

---
Issues Found

Correctness:

1. WallPolygon removed on any node move — forces full miterhaven't changed; no dirty-flag granularity
2. capMeta can diverge — cap metadata stores pixel-space polygon but geometry is in local coords; unexpected node moves can create a mismatch
3. RoomDetection.findRooms() is full scan every frame — scaeven when only one node moved; no incremental update

Visual:

4. No custom UV mapping on walls — ExtrudeGeometry generates default UVs; wall textures (when added) will stretch unpredictably
5. Annotation scaling inconsistency — stroke width uses raw stageScale; text uses max(ANNOTATION_SCALE_MIN, stageScale), causing different behavior at very low zoom
6. No post-processing — no EffectComposer, no FXAA/bloom/AO

Performance:

7. No instancing — each wall is a separate THREE.Mesh with s this multiplies draw calls linearly
8. Geometry fully reallocated on every change — dispose() + new ExtrudeGeometry(...) on every node move instead of updating vertex positions in-place
9. No frustum culling — all meshes submitted to renderer regardless of whether they're in camera view
10. Room detection runs every frame — even when topology is

---
Performance Headroom

Current draw call budget is fine for a single room (~50–80 calls). The architecture will start to strain around 200+ walls. The highest-impact fixes
in order:

┌──────────┬────────────────────────────────────────────────────────────────────────────────┐
│ Priority │                                   Fix                                   │              Impact               │
├──────────┼────────────────────────────────────────────────────────────────────────────────┤
│ High     │ Dirty-flag per wall — skip WallGeometrySystem work when nothing changed │ CPU, geometry allocs              │
├──────────┼─────────────────────────────────────────────────────────────────────────┼───────────────────────────────────┤
│ High     │ Incremental room detection — only re-run when PU per frame                     │
├──────────┼─────────────────────────────────────────────────────────────────────────┼───────────────────────────────────┤
│ Medium   │ THREE.InstancedMesh for walls sharing the same material                 │ GPU draw calls                    │
├──────────┼────────────────────────────────────────────────────────────────────────────────┤
│ Medium   │ Update vertex buffer in-place instead of dispose+reallocate             │ GC pressure                       │
├──────────┼─────────────────────────────────────────────────────────────────────────┼───────────────────────────────────┤
│ Low      │ Frustum culling                               PU submission                    │
├──────────┼─────────────────────────────────────────────────────────────────────────┼───────────────────────────────────┤
│ Low      │ Custom UV mapping                             exture quality (future-proofing) │