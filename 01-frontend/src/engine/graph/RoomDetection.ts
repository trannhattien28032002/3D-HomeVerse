import { World } from "src/engine/ecs/World";
import { WallNodes } from "src/engine/components/WallNodes";
import { WallTag } from "src/engine/components/WallTag";
import { Query } from "src/engine/ecs/Query";
import { NodeRegistry } from "src/engine/graph/NodeRegistry";

// Represents a directed edge in the planar graph
export interface HalfEdge {
    source: number; // Node ID
    target: number; // Node ID
    wallId: number;
    angle: number;  // Angle from source to target
    next: HalfEdge | null; // Next half-edge in the face loop
    twin: HalfEdge | null; // The reverse half-edge
    visited: boolean;
}

export interface RoomPolygon {
    nodes: number[]; // Ordered list of node IDs forming the room perimeter
    points: { x: number; z: number }[]; // World coordinates of the corners
    area: number; // Absolute square area of the room
}

export class RoomDetection {
    /**
     * Extracts all valid interior rooms (closed polygons) from the wall graph.
     * Uses a Half-Edge (DCEL) traversal algorithm.
     *
     * Fixes applied vs original:
     * 1. Duplicate edges (same source→target from overlapping walls) are skipped
     *    at build time — only the first-seen edge is kept in the DCEL.
     * 2. Face traversal uses a per-loop Set<HalfEdge> for closure detection,
     *    plus a global visited Set so edges used in one face are not re-entered
     *    by another face.  The original `visited: boolean` flag caused valid
     *    faces to be silently dropped when the DCEL was dense.
     * 3. A safety iteration cap (maxIter = halfEdges.size) prevents infinite
     *    loops on malformed graphs.
     */
    static findRooms(world: World, nodeRegistry: NodeRegistry): RoomPolygon[] {
        const halfEdges    = new Map<string, HalfEdge>();
        const outgoingEdges = new Map<number, HalfEdge[]>();

        // Pre-map wallId → { start, end } node IDs
        const wallToNodes = new Map<number, { start: number; end: number }>();
        for (const e of Query.entitiesWith(world, WallTag, WallNodes)) {
            const tag = world.getComponent(e, WallTag)!;
            const wn  = world.getComponent(e, WallNodes)!;
            wallToNodes.set(tag.wallId, { start: wn.startNodeId, end: wn.endNodeId });
        }

        // ── Step 1: Build Half-Edges ───────────────────────────────────────────
        for (const node of nodeRegistry.all()) {
            if (!outgoingEdges.has(node.id)) outgoingEdges.set(node.id, []);

            for (const wallId of node.connectedWallIds) {
                const wn = wallToNodes.get(wallId);
                if (!wn) continue;

                const targetId   = wn.start === node.id ? wn.end : wn.start;
                const targetNode = nodeRegistry.get(targetId);
                if (!targetNode) continue;

                const key = `${node.id}-${targetId}`;

                // FIX 1: skip duplicate directed edges (overlapping walls share nodes)
                if (halfEdges.has(key)) continue;

                const dx = targetNode.x - node.x;
                const dz = targetNode.z - node.z;

                const he: HalfEdge = {
                    source:  node.id,
                    target:  targetId,
                    wallId,
                    angle:   Math.atan2(dz, dx),
                    next:    null,
                    twin:    null,
                    visited: false,
                };

                halfEdges.set(key, he);
                outgoingEdges.get(node.id)!.push(he);
            }
        }

        // ── Step 2: Link Twins ─────────────────────────────────────────────────
        for (const he of halfEdges.values()) {
            he.twin = halfEdges.get(`${he.target}-${he.source}`) ?? null;
        }

        // ── Step 3: Sort Radially and Link "Next" ──────────────────────────────
        for (const [, edges] of outgoingEdges) {
            edges.sort((a, b) => a.angle - b.angle);

            for (let i = 0; i < edges.length; i++) {
                const incoming = edges[i].twin;
                if (!incoming) continue;
                // Sharpest left turn = next CCW edge from the twin's source
                incoming.next = edges[(i + 1) % edges.length];
            }
        }

        // ── Step 4: Traverse Faces ─────────────────────────────────────────────
        // FIX 2: global visited prevents re-entering edges already assigned to a face.
        //        Per-loop closure detection uses a Set<HalfEdge> so it is independent
        //        of globalVisited and cannot be confused by other faces.
        const globalVisited = new Set<HalfEdge>();
        const maxIter       = halfEdges.size + 2; // safety cap
        const faces: RoomPolygon[] = [];

        for (const startEdge of halfEdges.values()) {
            if (globalVisited.has(startEdge) || !startEdge.next) continue;

            const loopNodes:  number[]                   = [];
            const loopPoints: { x: number; z: number }[] = [];
            const loopSet     = new Set<HalfEdge>();
            let   current     = startEdge;
            let   isClosed    = false;
            let   iter        = 0;

            while (iter++ < maxIter) {
                if (loopSet.has(current)) {
                    isClosed = current === startEdge;
                    break;
                }

                loopSet.add(current);
                globalVisited.add(current);

                loopNodes.push(current.source);
                const n = nodeRegistry.get(current.source);
                if (!n) break;
                loopPoints.push({ x: n.x, z: n.z });

                if (!current.next) break;
                current = current.next;
            }

            if (!isClosed || loopNodes.length < 3) continue;

            // Shoelace signed area (negative = CCW in Z-down = interior room)
            let signedArea = 0;
            for (let i = 0; i < loopPoints.length; i++) {
                const p1 = loopPoints[i];
                const p2 = loopPoints[(i + 1) % loopPoints.length];
                signedArea += p1.x * p2.z - p2.x * p1.z;
            }
            signedArea /= 2;

            faces.push({ nodes: loopNodes, points: loopPoints, area: signedArea });
        }

        // ── Step 5: Filter ─────────────────────────────────────────────────────
        // Interior rooms → negative signed area (CW in XZ/Z-down space).
        // Outer boundary → positive. Dangling / degenerate → ~0.
        // Sliver threshold: ignore artifacts smaller than 0.1 m² (≈ 316mm × 316mm).
        const MIN_ROOM_AREA_M2 = 0.1;
        return faces
            .filter(f => f.area < -MIN_ROOM_AREA_M2)
            .map(f => ({ ...f, area: Math.abs(f.area) }));
    }
}
