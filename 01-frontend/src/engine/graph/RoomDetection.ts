/**
 * RoomDetection — phát hiện phòng kín từ wall topology dùng thuật toán Half-Edge DCEL.
 *
 * Thuật toán Half-Edge (Doubly-Connected Edge List):
 *   1. Build Half-Edges: mỗi wall tạo 2 directed edge (A→B và B→A = twin)
 *   2. Link Twins: each edge trỏ tới twin ngược chiều
 *   3. Link Next: sắp xếp edge radially tại mỗi node → "next" = edge rẽ trái nhất (CCW)
 *   4. Traverse Faces: follow next pointer cho đến khi loop đóng
 *   5. Filter: giữ face có signed area âm (CW trong XZ space = interior room)
 *              Bỏ face có diện tích < 0.1 m² (artifact nhỏ)
 *
 * Tại sao CW = interior:
 *   Trong không gian XZ (Z tăng xuống dưới màn hình), signed area âm = winding CW
 *   = face nằm bên trong vòng tường → là phòng thực sự.
 *   Face dương = outer boundary (vòng bao ngoài) → bị lọc ra.
 *
 * Fixes áp dụng so với DCEL chuẩn:
 *   1. Skip duplicate directed edges tại build time
 *   2. Per-loop closure detection bằng Set<HalfEdge> thay vì boolean flag
 *   3. Safety cap maxIter = halfEdges.size ngăn infinite loop trên graph lỗi
 */
import { World } from "src/engine/ecs/World";
import { WallNodes } from "src/engine/components/WallNodes";
import { WallTag } from "src/engine/components/WallTag";
import { Query } from "src/engine/ecs/Query";
import { NodeRegistry } from "src/engine/graph/NodeRegistry";

/** Directed edge trong planar graph — mỗi wall sinh ra 2 HalfEdge (twin). */
export interface HalfEdge {
    source: number; // Node ID điểm đầu
    target: number; // Node ID điểm cuối
    wallId: number;
    angle: number;  // Góc hướng từ source đến target (radians)
    next: HalfEdge | null; // Edge kế tiếp trong face loop (rẽ trái nhất)
    twin: HalfEdge | null; // Edge ngược chiều (cùng wall, hướng ngược)
    visited: boolean;
}

export interface RoomPolygon {
    nodes: number[];                     // Node ID theo thứ tự (ordered perimeter)
    points: { x: number; z: number }[]; // Tọa độ world-space
    area: number;                        // Diện tích m² (absolute value)
}

export class RoomDetection {
    /**
     * Tìm tất cả phòng kín trong wall graph.
     * @param world ECS World — để lấy WallTag + WallNodes components
     * @param nodeRegistry — nguồn vị trí node
     * @returns Mảng RoomPolygon đã lọc (chỉ interior, diện tích ≥ 0.1 m²)
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
