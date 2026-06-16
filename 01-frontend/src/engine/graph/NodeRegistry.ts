import { v4 as uuidv4 } from "uuid";
/**
 * NodeRegistry — topology graph của HomeVerse.
 *
 * Lưu trữ tất cả node (điểm cuối tường) và mối quan hệ của chúng với wall.
 * Đây là SOURCE OF TRUTH cho vị trí không gian — ECS components (Transform, WallAABB)
 * được tính toán dẫn xuất từ đây, không phải ngược lại.
 *
 * Mối quan hệ:
 *   Node ←→ Wall: nhiều-nhiều qua connectedWallIds
 *   Một wall luôn có đúng 2 node (startNodeId, endNodeId)
 *   Một node có thể nối với 0..N walls
 *
 * nodeCaps: được WallGeometrySystem ghi sau khi tính miter —
 *           SnapshotSystem đọc để emit cap polygons cho PlanView2D.
 */
export type NodeData = {
    id: string;
    x: number; // world-space metres
    z: number; // world-space metres
    connectedWallIds: Set<string>;
};

export class NodeRegistry {
    private nodes = new Map<string, NodeData>();
    /** Cap polygons tại junction ≥ 3 tường — ghi bởi WallGeometrySystem, đọc bởi SnapshotSystem. Key = nodeId (uuid). */
    readonly nodeCaps = new Map<string, { x: number; z: number }[]>();

    /** Tạo node mới với ID uuid — dùng khi user click vào vùng trống. */
    createNode(x: number, z: number): string {
        const id = uuidv4();
        this.nodes.set(id, { id, x, z, connectedWallIds: new Set() });
        return id;
    }

    /**
     * Tạo node với ID cụ thể nếu chưa tồn tại (idempotent).
     * Dùng bởi ENSURE_NODE command và deserializeScene để restore topology.
     * ID là uuid bền vững — không cần đồng bộ counter nào.
     */
    ensureNode(id: string, x: number, z: number): NodeData {
        if (!this.nodes.has(id)) {
            this.nodes.set(id, { id, x, z, connectedWallIds: new Set() });
        }
        return this.nodes.get(id)!;
    }

    get(id: string): NodeData | undefined {
        return this.nodes.get(id);
    }

    getOrThrow(id: string): NodeData {
        const n = this.nodes.get(id);
        if (!n) throw new Error(`NodeRegistry: node ${id} not found`);
        return n;
    }

    /** Cập nhật vị trí node — dispatcher gọi sau MOVE_NODE command. */
    move(id: string, x: number, z: number): void {
        const node = this.nodes.get(id);
        if (!node) return;
        node.x = x;
        node.z = z;
    }

    /** Thêm wallId vào connectedWallIds của node — gọi sau ADD_WALL. */
    connectWall(nodeId: string, wallId: string): void {
        this.nodes.get(nodeId)?.connectedWallIds.add(wallId);
    }

    /** Gỡ wallId khỏi connectedWallIds — gọi sau REMOVE_WALL hoặc SPLIT_WALL. */
    disconnectWall(nodeId: string, wallId: string): void {
        this.nodes.get(nodeId)?.connectedWallIds.delete(wallId);
    }

    /** Xóa node — chỉ gọi sau khi node không còn kết nối với wall nào. */
    deleteNode(id: string): void {
        this.nodes.delete(id);
    }

    /** Sinh một nodeId uuid mới — UI gọi để có ID trước khi dispatch ENSURE_NODE/SPLIT_WALL. */
    newNodeId(): string {
        return uuidv4();
    }

    all(): IterableIterator<NodeData> {
        return this.nodes.values();
    }

    /** Serialize tất cả node sang plain object — dùng bởi serializeScene(). */
    snapshot(): { id: string; x: number; z: number; connectedWallIds: string[] }[] {
        return Array.from(this.nodes.values()).map(n => ({
            id: n.id,
            x: n.x,
            z: n.z,
            connectedWallIds: Array.from(n.connectedWallIds),
        }));
    }
}
