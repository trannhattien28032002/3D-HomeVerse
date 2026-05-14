Camera System Analysis for Architectural Floorplanner

---
1. Are TopDown / Left / Right Presets Sufficient?

No — and the gap is significant. Here's why each preset fails at scale perception:

TopDown: Projects the scene as a flat diagram. Wall height is completely invisible. There are zero depth cues. The brain reads this as "a drawing of a floor plan," not "a room." Scale perception is 0%.

Left / Right: Side orthographic-like views. Wall height is visible but room depth is invisible — you see a wall silhouette, not a space. No furniture
 footprint is legible. Scale perception is partial.

What's missing: The view that carries ~80% of architecturalst yet — the 3/4 perspective view. That's the only anglewhere floor plan + wall height + depth + furniture are simultaneously visible. Without it, no amount of lighting or grid tuning will make rooms feel real.

---
2. What Professional Floorplanner Apps Actually Use

┌────────────────────┬─────────────────────────────────────────────────────────────────────────────┬───────────────┬───────────────────┐
│        App         │                               Primary 3D View                               │   Secondary   │   First-Person    │
├────────────────────┼─────────────────────────────────────────────────────────────────────────────┼───────────────┼───────────────────┤
│ RoomSketcher       │ 3/4 perspective, ~35° elevation                                             │ None          │ Yes               │
├────────────────────┼────────────────────────────────────────────────┼───────────────┼───────────────────┤
│ Planner5D          │ 3/4 perspective, ~40° elevation                                             │ Ortho plan    │ VR                │
├────────────────────┼────────────────────────────────────────────────┼───────────────┼───────────────────┤
│ Sweet Home 3D      │ Configurable perspective, default ~60° FOV at eye level looking across room │ Top-down edit │ Yes               │
├────────────────────┼────────────────────────────────────────────────┼───────────────┼───────────────────┤
│ IKEA Space Planner │ 3/4 perspective                                                             │ 2D plan       │ No                │
├────────────────────┼─────────────────────────────────────────────────────────────────────────────┼───────────────┼───────────────────┤
│ SketchUp           │ Perspective, ~35° FOV                          │ Ortho views   │ Walk tool         │
├────────────────────┼─────────────────────────────────────────────────────────────────────────────┼───────────────┼───────────────────┤
│ HomeByMe           │ 3/4 perspective, ~30° elevation                                             │ 2D flat       │ Full first-person │
└────────────────────┴─────────────────────────────────────────────────────────────────────────────┴───────────────┴───────────────────┘

The pattern across all of them: the default view is never tographic. The default is always some form of 3/4 perspectivethat simultaneously shows floor + walls + ceiling.

The second common view is a proper eye-level first-person that immediately communicates ceiling height relative to a standing human.

---
3. Recommended Settings Per View Mode

View A: Plan (editing)

Purpose:    Match the 2D plan exactly — used for wall drawing, not scale perception
Camera pos: (0, 25, 0.001)   — almost directly above, tiny Z to avoid gimbal lock
Target:     (0, 0, 0)
FOV:        45°  — or switch to OrthographicCamera for true parallel projection
The tiny Z offset is critical. lookAt(0,0,0) from exactly ( — Three.js doesn't know which way is "forward" and thecamera can flip unpredictably.

View B: 3/4 Perspective (the missing view — highest priority)

Purpose:    Communicate architectural scale; the "money sho
Camera pos: (10, 10, 14)  — roughly 35° elevation, from one corner
Target:     (0, 1.2, 0)   — NOT (0, 0, 0), see explanation below
FOV:        45°
This is the single most impactful change possible. The targat 3.2m/2 ≈ 1.6m, or a fraction below) keeps walls vertically centered in the viewport rather than ceiling-heavy.

View C: Eye-Level / Walkthrough

Purpose:    The strongest scale anchor possible — human body reference
Camera pos: (0, 1.6, 8)   — eye height 1.6m, looking inward
Target:     (0, 1.6, 0)   — horizontal gaze, same Y
FOV:        65–70°         — wide FOV because you're inside the space
At eye level with FOV 65°, a 2.4m ceiling feels like a real overhead, it feels like nothing. This is the hardest-hitting scale demonstration available.

View D: Isometric (optional, for tech users)

Camera pos: (15, 15, 15) or (-15, 15, 15) for opposite corner
Target:     (0, 0, 0)
FOV:        1°            — effectively orthographic using a PerspectiveCamera
Isometric with tiny FOV approximates orthographic projection without switching camera types, which avoids needing to maintain two separate camera
objects.

---
4. How Wall Height Affects Perceived Scale

Wall height is the most powerful single variable for architectural scale, by a large margin. Here's the perceptual mechanism:

The human brain has memorized the ceiling-to-floor ratio from a lifetime of being inside rooms. When a 3D scene shows a space, the brain immediately measures: "how many of me tall is that wall?" A wall that measures 2.4m on screen immediately reads as a standard apartment. A wall at 1.0m reads as
a dollhouse.

Your walls are currently at height: 3.2 in the dispatcher. us but believable (slightly commercial/luxury, which is finefor a floorplanner). The problem is that TopDown and Left/Right views never show this height. The wall height exists in the geometry but the camera
angle makes it invisible.

Critical geometry note: The wallY = size.height / 2 transfoers walls vertically — walls go from y=0 to y=3.2. The camera needs to look across this range to perceive it. The 3/4 view at target y=1.2 achieves this.

The horizon line rule: In any perspective view of a room, tscale from where the horizon line (eye level) falls relativeto the walls. If the camera is positioned such that horizon is at 1/3 from the bottom of the frame, the composition reads as "looking down from above the room" — correct. If the horizon is at 50% (eye level at y=1.6), it reads as "standing inside the room" — most powerful.

---
5. How Grid Density Affects Perception

Grid density (now fixed to 0.5m/cell) affects scale perception primarily in the plan view and the 3/4 view — not in eye-level view where the grid perspective lines converge and provide their own depth cue.

The perceptual mechanism: the brain scans the grid and calibrates object sizes against it. With 0.5m/cell, a 2m sofa takes 4 cells and reads as "large object." With 1m/cell (the old setting), the same sofa takes 2 cells and reads as "small accessory."

One additional effect: grid line density communicates camera altitude. A dense grid that fills the viewport signals "we are close to the ground." A sparse grid signals "we are far above." This reinforces the 3/4 view's height perception without any extra geometry.



1. Add the 3/4 perspective view — this single change does more than all other improvements combined. It makes wall height, floor plan, and room depth simultaneously visible.
2. Set target.y = 1.2 in the 3/4 view — looking at (0, 0, 0) from above shows mostly ceiling and skews the composition upward. Looking at mid-wall height centers the spatial experience in frame.
3. Add smooth camera transitions — professional floorplanners LERP/animate between view presets rather than teleporting. The motion itself
communicates spatial relationships ("we're now looking from0ms ease-out makes the camera feel dramatically moreprofessional.
4. Add the eye-level view — the most powerful scale test. If a user can switch to eye-level and the room looks believably sized, all other views feel
 more credible by association.
5. Consider the OrbitControls target y — currently set to (0, 0, 0) on initialization. For the 3/4 view this means orbit rotation pivots around the
floor plane rather than the middle of the walls, which feeloor. Setting target to (0, 1.0, 0) makes orbiting feel likerotating around the room's center of mass.
6. Floor material contrast — the floor from RoomSystem is color: 0xe2e8f0 (near-white). If walls are also near-white (0xcccccc), there's no tonal
separation and rooms read as one flat surface. A warm floor) creates spatial depth from color alone.

---
7. Diagnosing the Root Cause

Primary: Camera presets (missing the 3/4 view)
The TopDown/Left/Right set has no view that shows all three spatial dimensions simultaneously. Every professional tool leads with 3/4 perspective.
This is the gap.

Secondary: Viewport composition (where the camera looks)
lookAt(0, 0, 0) positions the focal point at the floor. The camera sees mostly ceiling and top of walls. The visual center of the frame is the wrong place. lookAt(0, 1.2, 0) corrects this.

Tertiary: No smooth transition between views
Teleporting to TopDown removes all spatial context from the previous view. The user loses track of where they were in the room. Smooth transitions
preserve orientation.

Not the primary issue:
- Wall height: 3.2m is fine
- Grid density: 0.5m/cell is now correct
- Lighting: ambient 0.5 + directional 0.9 + HDRI is reasonable
- Shadow coverage: now 50×50m which is correct
- FOV: now 45° which is correct

---
Summary

┌──────────────────────────────────┬───────────┬───────────
│               Fix                │  Impact   │ Complexity │
├──────────────────────────────────┼───────────┼────────────┤
│ Add 3/4 perspective preset       │ Very high │ Low        │
├──────────────────────────────────┼───────────┼────────────┤
│ Set target.y = 1.2 in 3/4 view   │ High      │ Trivial    │
├──────────────────────────────────┼───────────┼────────────┤
│ Add eye-level preset             │ High      │ Low
├──────────────────────────────────┼───────────┼────────────┤
│ Smooth camera transitions (lerp) │ Medium    │ Medium     │
├──────────────────────────────────┼───────────┼───────────
│ Floor/wall material contrast     │ Medium    │ Low        │
├──────────────────────────────────┼───────────┼────────────┤
│ Isometric preset                 │ Low       │ Low
└──────────────────────────────────┴───────────┴────────────┘

The "3/4 perspective" preset is the entire missing piece. Everything else on the list is incremental improvement on top of it.