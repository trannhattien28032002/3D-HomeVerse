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
    id: number;
    x: number; // world-space metres
    z: number; // world-space metres
    connectedWallIds: Set<number>;
};

export class NodeRegistry {
    private nodes = new Map<number, NodeData>();
    private nextId = 1;
    /** Cap polygons tại junction ≥ 3 tường — ghi bởi WallGeometrySystem, đọc bởi SnapshotSystem. */
    readonly nodeCaps = new Map<number, { x: number; z: number }[]>();

    /** Tạo node mới với ID tự tăng — dùng khi user click vào vùng trống. */
    createNode(x: number, z: number): number {
        const id = this.nextId++;
        this.nodes.set(id, { id, x, z, connectedWallIds: new Set() });
        return id;
    }

    /**
     * Tạo node với ID cụ thể nếu chưa tồn tại (idempotent).
     * Dùng bởi ENSURE_NODE command và deserializeScene để restore topology.
     * Cập nhật nextId nếu id lớn hơn current nextId.
     */
    ensureNode(id: number, x: number, z: number): NodeData {
        if (!this.nodes.has(id)) {
            this.nodes.set(id, { id, x, z, connectedWallIds: new Set() });
            if (id >= this.nextId) this.nextId = id + 1;
        }
        return this.nodes.get(id)!;
    }

    get(id: number): NodeData | undefined {
        return this.nodes.get(id);
    }

    getOrThrow(id: number): NodeData {
        const n = this.nodes.get(id);
        if (!n) throw new Error(`NodeRegistry: node ${id} not found`);
        return n;
    }

    /** Cập nhật vị trí node — dispatcher gọi sau MOVE_NODE command. */
    move(id: number, x: number, z: number): void {
        const node = this.nodes.get(id);
        if (!node) return;
        node.x = x;
        node.z = z;
    }

    /** Thêm wallId vào connectedWallIds của node — gọi sau ADD_WALL. */
    connectWall(nodeId: number, wallId: number): void {
        this.nodes.get(nodeId)?.connectedWallIds.add(wallId);
    }

    /** Gỡ wallId khỏi connectedWallIds — gọi sau REMOVE_WALL hoặc SPLIT_WALL. */
    disconnectWall(nodeId: number, wallId: number): void {
        this.nodes.get(nodeId)?.connectedWallIds.delete(wallId);
    }

    /** Xóa node — chỉ gọi sau khi node không còn kết nối với wall nào. */
    deleteNode(id: number): void {
        this.nodes.delete(id);
    }

    /** ID kế tiếp có thể dùng — PlanView2D gọi để biết nodeId trước khi dispatch. */
    nextAvailableNodeId(): number {
        return this.nextId;
    }

    all(): IterableIterator<NodeData> {
        return this.nodes.values();
    }

    /** Serialize tất cả node sang plain object — dùng bởi serializeScene(). */
    snapshot(): { id: number; x: number; z: number; connectedWallIds: number[] }[] {
        return Array.from(this.nodes.values()).map(n => ({
            id: n.id,
            x: n.x,
            z: n.z,
            connectedWallIds: Array.from(n.connectedWallIds),
        }));
    }
}
