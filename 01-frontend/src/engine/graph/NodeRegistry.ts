export type NodeData = {
    id: number;
    x: number;
    z: number;
    connectedWallIds: Set<number>;
};

export class NodeRegistry {
    private nodes = new Map<number, NodeData>();
    private nextId = 1;
    readonly nodeCaps = new Map<number, { x: number; z: number }[]>();

    createNode(x: number, z: number): number {
        const id = this.nextId++;
        this.nodes.set(id, { id, x, z, connectedWallIds: new Set() });
        return id;
    }

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

    move(id: number, x: number, z: number): void {
        const node = this.nodes.get(id);
        if (!node) return;
        node.x = x;
        node.z = z;
    }

    connectWall(nodeId: number, wallId: number): void {
        this.nodes.get(nodeId)?.connectedWallIds.add(wallId);
    }

    disconnectWall(nodeId: number, wallId: number): void {
        this.nodes.get(nodeId)?.connectedWallIds.delete(wallId);
    }

    deleteNode(id: number): void {
        this.nodes.delete(id);
    }

    nextAvailableNodeId(): number {
        return this.nextId;
    }

    all(): IterableIterator<NodeData> {
        return this.nodes.values();
    }

    snapshot(): { id: number; x: number; z: number; connectedWallIds: number[] }[] {
        return Array.from(this.nodes.values()).map(n => ({
            id: n.id,
            x: n.x,
            z: n.z,
            connectedWallIds: Array.from(n.connectedWallIds),
        }));
    }
}
