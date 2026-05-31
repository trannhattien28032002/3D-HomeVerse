/**
 * EntityRegistry — orchestrator giải phóng side-state khi entity bị huỷ.
 *
 * Vấn đề (REFACTOR-PLAN.md Đợt 2): dispatcher đang phải nhớ giải phóng cả 2
 * registry (MeshRegistry + ModelRegistry) ở mỗi nơi destroy entity, với
 * convention key khác nhau (`wall-${id}`, `furniture-${id}`). Thêm 1 registry
 * mới (ví dụ NavMesh, IK rig) sẽ buộc audit toàn bộ dispatcher.
 *
 * Giải pháp: dispatcher gọi {@link EntityRegistry.disposeEntity}(id) duy nhất.
 * EntityRegistry biết entity là wall hay furniture (qua ECS tag) và chọn
 * convention key đúng để dispose. World.destroyEntity cũng được gọi luôn.
 *
 * Cannon GC tự động — `CannonCollisionSystem.gcStatic/gcDynamic` chạy mỗi
 * frame và xoá body khi Query không còn trả về entity đó. Không cần wire vào.
 *
 * Phạm vi Đợt 2: chỉ `DELETE_FURNITURE` được refactor sang dùng registry này.
 * Wall disposal (3 chỗ trong dispatcher.ts ở MERGE_NODE/REMOVE_WALL) sẽ được
 * migrate ở Đợt 3 khi handlers được tách ra file riêng.
 */
import type { World } from "src/engine/ecs/World";
import type { MeshRegistry } from "src/engine/rendering/MeshRegistry";
import type { ModelRegistry } from "src/engine/rendering/ModelRegistry";
import { FurnitureTag } from "src/engine/components/FurnitureTag";
import { WallTag } from "src/engine/components/WallTag";
import { Mesh } from "src/engine/components/Mesh";

export class EntityRegistry {
    private readonly world: World;
    private readonly meshRegistry: MeshRegistry;
    private readonly modelRegistry: ModelRegistry;

    constructor(world: World, meshRegistry: MeshRegistry, modelRegistry: ModelRegistry) {
        this.world = world;
        this.meshRegistry = meshRegistry;
        this.modelRegistry = modelRegistry;
    }

    /**
     * Giải phóng tất cả side-state của entity và destroy entity khỏi ECS.
     *
     * - Furniture (có {@link FurnitureTag}):
     *     - `ModelRegistry.dispose(id)` — gỡ GLB root khỏi scene
     *     - `MeshRegistry.dispose("furniture-${id}")` — gỡ legacy BoxGeometry (nếu có)
     * - Wall (có {@link WallTag}):
     *     - `MeshRegistry.dispose("wall-${id}")` — gỡ extruded wall mesh
     * - Khác: chỉ destroy entity (no side-state).
     *
     * Cannon body GC tự động ở frame tiếp theo (xem CannonCollisionSystem.gcStatic).
     *
     * Idempotent — gọi 2 lần trên cùng id sẽ no-op lần sau (entity đã destroy).
     */
    disposeEntity(id: number): void {
        if (this.world.hasComponent(id, FurnitureTag)) {
            this.modelRegistry.dispose(id);
            if (this.world.hasComponent(id, Mesh)) {
                this.meshRegistry.dispose(`furniture-${id}`);
            }
        } else if (this.world.hasComponent(id, WallTag)) {
            this.meshRegistry.dispose(`wall-${id}`);
        }
        this.world.destroyEntity(id);
    }
}
