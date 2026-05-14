Architecture Analysis: Angle Dimensions

The Short Summary

Your ECS already has everything needed. WallGeometrySystem already sorts walls around each node by angle to compute miters. DimensionSystem already feeds a snapshot pipeline to Konva. Angle dimensions are a natural extension of both — not a new subsystem.

---
1. Recommended Architecture

The right cut is:

DimensionSystem.ts          ← extend here: e
     ↓
ECSSnapshot (EngineEvents)  ← add angleDimensions field
     ↓
useFloorPlanStore           ← convert to AngleDimension2D[] (pixel space)
     ↓
PlanView2D dimension layer  ← render arcs + labels

Do not create a parallel system or a separate AngleDimensionSystem. The existing DimensionSystem already queries WallTag + WallNodes and emits into the snapshot. Extend it.

Do not compute angles inside the React components or in useFloorPlanStore. The formula belongs in the engine — the store should only do world-to-pixel conversion, matching what it does for lengths today.

The one judgment call: you could pull wall-angle data from WallGeometrySystem (which already computes per-node wall angles for miter joints). That would avoid duplicate work. The tradeoff is coupling two systems. Given that DimensionSystem is short and the geometry is simple, recompute independently in DimensionSystem — it's < 10 lines per
corner and keeps the systems decoupled.

---
2. Geometry Calculations

For a node C where wall A (from node A) and wall B (to node B) meet:

// Direction vectors pointing AWAY from the
const v1 = normalize({ x: A.x - C.x, z: A.z - C.z }); // along wall A, outward
const v2 = normalize({ x: B.x - C.x, z: B.z - C.z }); // along wall B, outward

// Interior angle (always [0°, 180°])
const dot = v1.x * v2.x + v1.z * v2.z;
const angleDeg = Math.acos(Math.max(-1, Math.min(1, dot))) * (180 / Math.PI);

// Arc start angle (from +X, for Konva Arc rotation)
const startAngle = Math.atan2(v1.z, v1.x) *

// Bisector direction for label placement
const bisector = normalize({ x: v1.x + v2.x, z: v1.z + v2.z });

Two edge cases to handle upfront:

1. Nearly parallel walls (angleDeg < 5° or > 175°): skip rendering — the arc is invisible or degenerate.
2. Nodes with 3+ walls: NodeRegistry.connectedWallIds gives you the set. Sort walls by atan2(dz, dx) from the node,
then compute angles between adjacent pairs. eometrySystem — same algorithm.

Konva coordinate flip: world Z maps to scree space becomes atan2(v.y, v.x) in pixelspace, but since Y is flipped (positive is down), you need atan2(-v.y, v.x) to get the correct screen angle. Get this
wrong and arcs will mirror. Test with a know

---
3. Rendering Strategy in Konva

Use Konva's built-in Arc shape. It takes rotation (start angle from +X, clockwise) and angle (sweep, clockwise). Both
in degrees.

// Arc (filled sector, low opacity)
<Arc
  x={corner.x} y={corner.y}
  innerRadius={0} outerRadius={ARC_RADIUS}
  rotation={startAngleDeg}
  angle={sweepAngleDeg}
  fill="rgba(100, 149, 237, 0.12)"
  stroke="#6495ed" strokeWidth={1}
  listening={false}
/>

// Label at bisector offset
<Text
  x={corner.x + bisector.x * (ARC_RADIUS + 12)}
  y={corner.y + bisector.y * (ARC_RADIUS + 12)}
  text={`${Math.round(angle)}°`}
  offsetX={labelWidth / 2}
  fontSize={11}
  fill="#334"
  listening={false}
/>

Layer placement: Put angle dimensions on theimensions — a dedicated non-interactivedimension layer. listening={false} on all dimension shapes is mandatory; hit-testing on arcs is expensive and unnecessary.

ARC_RADIUS should be a constant in screen pixels (e.g. 28px), not scaled to world units. Angle arcs are visual indicators, not measurements.

---
4. Dimension System Structure

Add to EngineEvents.ts:

interface AngleDimensionSnapshot {
  nodeId: number;
  wallId1: number;
  wallId2: number;
  angle: number;       // degrees, interior
  startAngle: number;  // degrees from +X (world space), for arc
  sweepAngle: number;  // degrees, same as angle for simple corners
  cornerX: number;     // world space
  cornerZ: number;
  bisectorX: number;   // unit vector, world
  bisectorZ: number;
}

Add to ECSSnapshot:
angleDimensions: AngleDimensionSnapshot[];

Add to Dimension2D conversion in useFloorPlanStore:
interface AngleDimension2D {
  nodeId: number;
  cx: number; cy: number;          // corner
  angle: number;                    // degrees
  startAngleDeg: number;            // Konvaadjusted for Y-flip)
  sweepAngleDeg: number;
  bisectorX: number; bisectorY: number; // u
  label: string;                    // "90°"
}

This mirrors exactly how Dimension2D is structured for lengths — same conversion pattern, zero architectural surprise.

---
5. Interaction Flow

Displaying angles: Automatic — once DimensionSystem emits them, the snapshot pipeline carries them to Konva for free.

Angle snapping is the interesting part. It needs to slot into the existing snapToNodeOrGrid() in PlanView2D after
position snap, not replace it:

Current: node snap → wall snap → grid snap → raw position
Proposed: node snap → wall snap → grid snap

When placing the endpoint of a new wall (or dragging a node connected to one other wall):

1. Compute the current angle between the tentative wall and the reference wall
2. Find the nearest snap angle from [15, 30,80]
3. If within threshold (e.g. ±4°): constrain the endpoint to lie on the ray at exactly snapAngle from the reference
wall, preserving distance from the corner no
4. Show a snap highlight on the angle arc (e.g. change its fill color)

The constraint formula:
const currentDist = Math.hypot(p.x - corner.x, p.y - corner.y);
const snappedAngleRad = (referenceAngle + sn;
const snapped = {
  x: corner.x + Math.cos(snappedAngleRad) * currentDist,
  y: corner.y + Math.sin(snappedAngleRad) *
};

For dragging a node with 2+ connected walls: because all connected angles changesimultaneously. For v1, only snap when exactly 1 other wall is connected — skip angle snap for T/X junctions until you
 have a more sophisticated solver.

---
6. Performance Concerns

The engine loop: Angle computation at O(nodegligible — microseconds even with 200 walls.

The real risk is Konva re-renders. Your current architecture is already protected: useFloorPlanStore uses useMemo keyed on the snapshot, so Konva only re-renders when the snapshot changes. Angle arcs will participate in that same
memo — no extra cost.

What to watch: if you add listening={false} must), Konva skips hit-testing for thatentire subtree. Without it, arc hit-testing is O(arc segments) per mouse move.

The 3D view needs no angle rendering for v1. When you do add it, angles in Three.js should use EdgesGeometry or a
Line2 arc computed once and updated only on nimation frame.

---
7. Future Scaling Risks

Multi-wall junctions (T/X) are the largest risk. The current length dimension system sidesteps this — every wall has
exactly one length. Angle dimensions are perT-junctions give you 3 angles, X-junctionsgive you 4. The label layout will collide. Plan for a minimum-angle threshold (skip angles < 10°) and a "show on hover" mode before you have too many walls.

Interior vs. exterior angle ambiguity: For simple L-corners, the interior angle is unambiguous. Once you have rooms
detected via DCEL (which you already do in R to show the interior room angle, not theexterior. This means the dimension system will need to know room membership — RoomGeometry already has polygon winding
 you can consult.

Label collision with length dimensions: Angles at short walls or acute corners will overlap the existing length
labels. There's no fix for this without a lat time to add that is when it becomes a usercomplaint — don't design for it now.

The snap priority problem: As you add more snap types (grid, node, wall, angle, maybe future: parallel, equal-length), the cascade in snapToNodeOrGrid will grow. Watch for interactions: an angle snap that overrides a node snap is always
 wrong. The current fallthrough structure hat and extend it in the same pattern.

Coordinate system debt: WallGeometrySystem wiew2D works in screen XY space with a Y-axisflip. This conversion is currently buried in useFloorPlanStore. Angle arcs have a directional component (start angle,
sweep direction) that will expose any inconsrite a unit test for "90° world corner →correct arc rotation in screen space" before you ship, not after.

---
Recommended Sequence

1. Extend DimensionSystem.ts to emit angleDimensions — pure geometry, no UI changes.
2. Add angleDimensions to ECSSnapshot and the store conversion.
3. Render static arcs in PlanView2D on the d
4. Add angle snapping to snapToNodeOrGrid for the 2-wall case only.
5. Handle 3+ wall junctions.