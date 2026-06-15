/**
 * RoomSystem — phát hiện và render sàn phòng từ wall topology.
 *
 * Chạy mỗi frame. Dùng hash-based change detection: chỉ chạy RoomDetection
 * khi node positions hoặc connections thay đổi.
 *
 * Pipeline:
 *   1. Hash tất cả node (id + x/z + connectedWallIds)
 *   2. Nếu hash đổi → gọi RoomDetection.findRooms() (Half-Edge DCEL)
 *   3. Tạo/cập nhật RoomGeometry component cho mỗi phòng được phát hiện
 *   4. Xóa entity của phòng không còn tồn tại
 *   5. Rebuild Three.js ShapeGeometry cho floor mesh (y = -0.01 để nằm dưới tường)
 *
 * Key: phòng được identify bằng sorted node ID list (order-independent).
 *      Key này stable dù wall topology bị rebuild.
 *
 * Output:
 *   - RoomGeometry components trong World (cho SnapshotSystem đọc)
 *   - Floor mesh trong Three.js scene (màu #e2e8f0)
 */
import * as THREE from "three";
import { System } from "src/engine/ecs/System";
import { World } from "src/engine/ecs/World";
import { NodeRegistry } from "src/engine/graph/NodeRegistry";
import { RoomDetection } from "src/engine/graph/RoomDetection";
import { RoomGeometry } from "src/engine/components/room/RoomGeometry";
import { MeshRegistry } from "src/engine/rendering/MeshRegistry";
import { MaterialRegistry } from "src/engine/rendering/MaterialRegistry";
import { MaterialLibrary } from "src/engine/rendering/MaterialLibrary";
import { buildSurfaceMaterial, releaseSurfaceMaterial } from "src/engine/rendering/surfaceMaterial";
import { FLOOR_DEFAULT_MATERIAL } from "src/engine/rendering/surfaceDefaults";


export class RoomSystem extends System {
    private nodeReg: NodeRegistry;
    private scene: THREE.Scene | null;
    private meshRegistry: MeshRegistry | null;
    private materialRegistry: MaterialRegistry | null;
    /** Catalog PBR — để áp material sàn do người dùng chọn. */
    private materialLibrary: MaterialLibrary | null;
    /** Material sàn theo roomKey (shared với dispatcher) — re-apply khi dựng lại mesh. */
    private floorMaterials: Map<string, string> | null;

    /** Hash của frame trước — so sánh để bỏ qua frame không có thay đổi topology. */
    private lastHash: string = "";
    /**
     * revision-guard: world.revision của lần update() vừa chạy — pre-filter rẻ TRƯỚC khi build chuỗi
     * hash node mỗi frame. Mọi thay đổi ảnh hưởng hash (node move → markDirty, add/remove
     * wall → add/removeComponent) đều bump revision, nên revision không đổi ⇒ hash không
     * đổi ⇒ skip an toàn. Lưu SAU mutation của system (createEntity/destroyEntity bump). (M1)
     */
    private _lastRevision = -1;
    /** Map từ room key (sorted node IDs) → ECS entity ID. */
    private roomEntities = new Map<string, string>();

    constructor(
        nodeReg: NodeRegistry,
        scene?: THREE.Scene,
        meshRegistry?: MeshRegistry,
        materialRegistry?: MaterialRegistry,
        materialLibrary?: MaterialLibrary,
        floorMaterials?: Map<string, string>,
    ) {
        super();
        this.nodeReg = nodeReg;
        this.scene = scene ?? null;
        this.meshRegistry = meshRegistry ?? null;
        this.materialRegistry = materialRegistry ?? null;
        this.materialLibrary = materialLibrary ?? null;
        this.floorMaterials = floorMaterials ?? null;
    }

    update(world: World): void {
        // Pre-filter idle frame: bỏ qua cả việc build chuỗi hash khi không có gì đổi. (M1)
        if (world.revision === this._lastRevision) return;

        let hash = "";
        for (const node of this.nodeReg.all()) {
            hash += `${node.id}:${node.x.toFixed(2)}:${node.z.toFixed(2)}|${Array.from(node.connectedWallIds).join(',')};`;
        }

        if (hash === this.lastHash) {
            this._lastRevision = world.revision;
            return;
        }
        this.lastHash = hash;

        const detectedRooms = RoomDetection.findRooms(world, this.nodeReg);
        const currentKeys = new Set<string>();

        for (const room of detectedRooms) {
            const sortedNodes = [...room.nodes].sort();
            const key = sortedNodes.join(",");
            currentKeys.add(key);

            let entity = this.roomEntities.get(key);

            if (entity === undefined) {
                entity = world.createEntity();
                this.roomEntities.set(key, entity);
                world.addComponent(entity, new RoomGeometry(room.points, room.area, key));
            } else {
                const geo = world.getComponent(entity, RoomGeometry);
                if (geo) {
                    geo.points = room.points;
                    geo.area = room.area;
                    geo.key = key;
                    // Mutate component TẠI CHỖ không đi qua addComponent → tự bump revision
                    // để SnapshotSystem (chạy sau) chắc chắn thấy geometry sàn mới, không phụ
                    // thuộc ngầm vào việc node move đã bump revision trước đó. (M4)
                    world.markDirty();
                }
            }

            if (this.scene) {
                this.updateRoomMesh(entity, room.points, key);
            }
        }

        for (const [key, entity] of this.roomEntities.entries()) {
            if (!currentKeys.has(key)) {
                this.roomEntities.delete(key);
                world.destroyEntity(entity);

                if (this.scene && this.meshRegistry) {
                    // Release surface-material sàn trước khi gỡ mesh (refcount về 0 → dispose). (C2)
                    const mesh = this.meshRegistry.get(`room-${entity}`);
                    if (mesh) releaseSurfaceMaterial(mesh.material);
                    this.meshRegistry.dispose(`room-${entity}`);
                }
            }
        }

        // Lưu revision SAU mọi mutation của system (createEntity/destroyEntity đã bump). (M1)
        this._lastRevision = world.revision;
    }

    private updateRoomMesh(entity: string, points: { x: number; z: number }[], key: string) {
        if (!this.scene || !this.meshRegistry || !this.materialRegistry) return;

        const shape = new THREE.Shape();
        shape.moveTo(points[0].x, -points[0].z);
        for (let i = 1; i < points.length; i++) {
            shape.lineTo(points[i].x, -points[i].z);
        }

        const geo = new THREE.ShapeGeometry(shape);
        geo.rotateX(-Math.PI / 2);

        const meshKey = `room-${entity}`;
        const existing = this.meshRegistry.get(meshKey);

        if (!existing) {
            const mat = this.materialRegistry.get(FLOOR_DEFAULT_MATERIAL);
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.y = -0.01;
            mesh.receiveShadow = true;
            this.scene.add(mesh);
            this.meshRegistry.register(meshKey, mesh);
            // Re-apply material sàn người dùng đã chọn (sau khi dựng lại do đổi topology).
            this.applyFloorMaterial(mesh, key);
        } else {
            existing.geometry.dispose();
            existing.geometry = geo;
        }
    }

    /** Áp material sàn từ registry roomKey→materialId (nếu có). Async, fire-and-forget. */
    private applyFloorMaterial(mesh: THREE.Mesh, key: string): void {
        const materialId = this.floorMaterials?.get(key);
        if (!materialId || !this.materialLibrary) return;
        buildSurfaceMaterial(this.materialLibrary, materialId)
            .then((mat) => { if (mat) mesh.material = mat; })
            .catch((err) => console.error("applyFloorMaterial failed:", err));
    }
}
