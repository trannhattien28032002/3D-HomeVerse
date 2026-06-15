/**
 * SelectionHighlight — đồng bộ OutlinePass.selectedObjects theo selection trong 3D.
 *
 * Lắng nghe 3 event chọn của engine (loại trừ lẫn nhau) và tô viền vật đang chọn,
 * MÀU theo loại để người dùng biết đang chọn gì:
 *   - đồ vật (object): vàng hổ phách
 *   - tường   (wall):  xanh dương
 *   - sàn     (room):  xanh lá
 *
 * Phân giải id → THREE.Object3D:
 *   - object: Model3D.root (GLB) nếu có, else Mesh.mesh
 *   - wall:   wallEntityByWallId → Mesh.mesh
 *   - room:   RoomGeometry.key khớp → meshRegistry.get(`room-${e}`)
 *
 * Re-resolve trên mỗi `snapshot` để bỏ viền khi vật bị xoá / phòng biến mất do đổi
 * topology (mesh dispose → lookup trả rỗng → selectedObjects = []).
 */
import * as THREE from "three";
import type { OutlinePass } from "three/addons/postprocessing/OutlinePass.js";
import type { World } from "src/engine/ecs/World";
import type { EngineEvents } from "src/engine/events/EngineEvents";
import type { MeshRegistry } from "src/engine/rendering/MeshRegistry";
import { Query } from "src/engine/ecs/Query";
import { Model3D } from "src/engine/components/render/Model3D";
import { Mesh } from "src/engine/components/render/Mesh";
import { RoomGeometry } from "src/engine/components/room/RoomGeometry";

type Selection =
    | { kind: "object"; id: string }
    | { kind: "wall"; id: string }
    | { kind: "room"; id: string }
    | null;

const EDGE_COLOR: Record<"object" | "wall" | "room", THREE.Color> = {
    object: new THREE.Color(0xf8b400),
    wall: new THREE.Color(0x4a90d9),
    room: new THREE.Color(0x3fbf6f),
};

export class SelectionHighlight {
    private current: Selection = null;
    private offs: Array<() => void> = [];
    private readonly outlinePass: OutlinePass;
    private readonly world: World;
    private readonly wallEntityByWallId: Map<string, string>;
    private readonly meshRegistry: MeshRegistry;

    constructor(
        outlinePass: OutlinePass,
        world: World,
        wallEntityByWallId: Map<string, string>,
        meshRegistry: MeshRegistry,
        events: EngineEvents,
    ) {
        this.outlinePass = outlinePass;
        this.world = world;
        this.wallEntityByWallId = wallEntityByWallId;
        this.meshRegistry = meshRegistry;

        this.offs.push(events.on("entitySelected", ({ entityId }) => {
            this.current = entityId ? { kind: "object", id: entityId } : null;
            this.refresh();
        }));
        this.offs.push(events.on("wallSelected", ({ wallId }) => {
            this.current = wallId ? { kind: "wall", id: wallId } : null;
            this.refresh();
        }));
        this.offs.push(events.on("floorSelected", ({ roomKey }) => {
            this.current = roomKey ? { kind: "room", id: roomKey } : null;
            this.refresh();
        }));
        // Mesh tường/sàn swap geometry nhưng giữ instance; phòng bị xoá → mesh dispose.
        // Re-resolve mỗi snapshot để viền tự biến mất khi vật không còn.
        this.offs.push(events.on("snapshot", () => this.refresh()));
    }

    /** Phân giải selection hiện tại thành danh sách Object3D để outline (rỗng nếu không còn). */
    private resolve(): THREE.Object3D[] {
        const sel = this.current;
        if (!sel) return [];

        if (sel.kind === "object") {
            const model = this.world.getComponent(sel.id, Model3D);
            if (model) return [model.root];
            const mesh = this.world.getComponent(sel.id, Mesh);
            return mesh ? [mesh.mesh] : [];
        }

        if (sel.kind === "wall") {
            const entity = this.wallEntityByWallId.get(sel.id);
            if (!entity) return [];
            const mesh = this.world.getComponent(entity, Mesh);
            return mesh ? [mesh.mesh] : [];
        }

        // room: tra entity có RoomGeometry.key khớp roomKey → mesh sàn.
        for (const e of Query.entitiesWith(this.world, RoomGeometry)) {
            const geo = this.world.getComponent(e, RoomGeometry);
            if (geo?.key !== sel.id) continue;
            const mesh = this.meshRegistry.get(`room-${e}`);
            return mesh ? [mesh] : [];
        }
        return [];
    }

    private refresh(): void {
        const objs = this.resolve();
        this.outlinePass.selectedObjects = objs;
        if (this.current && objs.length > 0) {
            const c = EDGE_COLOR[this.current.kind];
            this.outlinePass.visibleEdgeColor.copy(c);
            this.outlinePass.hiddenEdgeColor.copy(c).multiplyScalar(0.35);
        }
    }

    dispose(): void {
        for (const off of this.offs) off();
        this.offs = [];
        this.outlinePass.selectedObjects = [];
    }
}
