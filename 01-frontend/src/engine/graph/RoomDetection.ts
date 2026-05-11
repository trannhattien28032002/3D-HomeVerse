import { World } from "../ecs/World";
import { WallNodes } from "../components/WallNodes";
import { WallTag } from "../components/WallTag";
import { Query } from "../ecs/Query";
import { NodeRegistry } from "./NodeRegistry";

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
     * @param world The ECS world to query WallNodes
     * @param nodeRegistry The registry containing all nodes and connectivity
     * @returns A list of detected rooms with their polygonal boundaries
     */
    static findRooms(world: World, nodeRegistry: NodeRegistry): RoomPolygon[] {
        const halfEdges = new Map<string, HalfEdge>();
        const outgoingEdges = new Map<number, HalfEdge[]>();

        // Pre-map wallId to nodes since wallId != entityId
        const wallToNodes = new Map<number, {start: number, end: number}>();
        for (const e of Query.entitiesWith(world, WallTag, WallNodes)) {
            const tag = world.getComponent(e, WallTag)!;
            const wn = world.getComponent(e, WallNodes)!;
            wallToNodes.set(tag.wallId, { start: wn.startNodeId, end: wn.endNodeId });
        }

        // 1. Build Half-Edges for each connected wall
        for (const node of nodeRegistry.all()) {
            outgoingEdges.set(node.id, []);
            
            for (const wallId of node.connectedWallIds) {
                const wn = wallToNodes.get(wallId);
                if (!wn) continue;
                
                const targetId = wn.start === node.id ? wn.end : wn.start;
                const targetNode = nodeRegistry.get(targetId);
                if (!targetNode) continue;

                // Calculate angle from source to target in XZ plane
                const dx = targetNode.x - node.x;
                const dz = targetNode.z - node.z;
                const angle = Math.atan2(dz, dx);

                const halfEdge: HalfEdge = {
                    source: node.id,
                    target: targetId,
                    wallId: wallId,
                    angle: angle,
                    next: null,
                    twin: null,
                    visited: false
                };

                const key = `${node.id}-${targetId}`;
                halfEdges.set(key, halfEdge);
                outgoingEdges.get(node.id)!.push(halfEdge);
            }
        }

        // 2. Link Twins (Reverse Edges)
        for (const he of halfEdges.values()) {
            const twinKey = `${he.target}-${he.source}`;
            he.twin = halfEdges.get(twinKey) || null;
        }

        // 3. Sort Outgoing Edges Radially and Link "Next"
        for (const [nodeId, edges] of outgoingEdges) {
            // Sort ascending by angle. In a Y-down (Z-down) coordinate system,
            // this effectively orders the edges clockwise visually.
            edges.sort((a, b) => a.angle - b.angle);

            // The "next" edge to take when arriving at this node via a half-edge
            // is the one immediately following the arriving edge's twin.
            for (let i = 0; i < edges.length; i++) {
                const currentOut = edges[i];
                const incoming = currentOut.twin;
                if (!incoming) continue;
                
                // Make the sharpest left turn possible to trace interior faces
                const nextIndex = (i + 1) % edges.length;
                incoming.next = edges[nextIndex];
            }
        }

        // 4. Traverse to Find Faces
        const faces: RoomPolygon[] = [];

        for (const he of halfEdges.values()) {
            if (he.visited || !he.next) continue;

            // Trace the loop
            const loopNodes: number[] = [];
            const loopPoints: { x: number; z: number }[] = [];
            let current = he;
            let isClosed = false;

            do {
                current.visited = true;
                loopNodes.push(current.source);
                const n = nodeRegistry.get(current.source)!;
                loopPoints.push({ x: n.x, z: n.z });
                
                current = current.next;
                if (current === he) {
                    isClosed = true;
                    break;
                }
            } while (current && !current.visited);

            // A valid polygon must have at least 3 distinct nodes
            if (isClosed && loopNodes.length >= 3) {
                // Calculate signed area using the Shoelace formula
                let signedArea = 0;
                for (let i = 0; i < loopPoints.length; i++) {
                    const p1 = loopPoints[i];
                    const p2 = loopPoints[(i + 1) % loopPoints.length];
                    signedArea += (p1.x * p2.z - p2.x * p1.z);
                }
                signedArea = signedArea / 2;

                faces.push({
                    nodes: loopNodes,
                    points: loopPoints,
                    area: signedArea
                });
            }
        }

        console.log(`[RoomDetection] Detected ${faces.length} raw faces.`);
        faces.forEach((f, i) => console.log(`  Face ${i}: area=${f.area}, nodes=${f.nodes.join(',')}`));

        // 5. Filter Invalid Faces
        // Based on our radial sorting and Z-down coordinate system, our traversal 
        // will always trace interior rooms in a Counter-Clockwise direction (Negative Signed Area)
        // and the single infinite outer boundary in a Clockwise direction (Positive Signed Area).
        // Dangling walls form degenerate loops with Area = 0.
        // Thus, keeping only faces with area < -0.01 perfectly isolates valid rooms.
        
        const validRooms = faces
            .filter(f => f.area < -0.01) // strict less than zero to filter out floating-point noise and zero-area dangling walls
            .map(f => ({
                ...f,
                area: Math.abs(f.area) // return absolute area for UI consumption
            }));

        return validRooms;
    }
}
