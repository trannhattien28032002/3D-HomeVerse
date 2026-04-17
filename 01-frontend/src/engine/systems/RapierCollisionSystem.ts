import RAPIER from "@dimforge/rapier3d-compat";
import { System } from "../ecs/System";
import { World } from "../ecs/World";
import { Query } from "../ecs/Query";

import { Transform } from "../components/Transform";
import { ColliderAABB } from "../components/ColliderAABB";
import { StaticBody } from "../components/StaticBody";
import { DynamicBody } from "../components/DynamicBody";

export class RapierCollisionSystem extends System {
    public physicsWorld: RAPIER.World | null = null;
    public characterController: RAPIER.KinematicCharacterController | null = null;
    private initialized = false;

    private entityToBody = new Map<number, RAPIER.RigidBody>();
    private entityToCollider = new Map<number, RAPIER.Collider>();
    private isDynamic = new Map<number, boolean>();

    constructor() {
        super();
        
        // Cú lừa WebAssembly: Đợi load xong mới tạo World để không bị crash "Cannot read properties"
        RAPIER.init().then(() => {
            const gravity = { x: 0.0, y: 0.0, z: 0.0 };
            this.physicsWorld = new RAPIER.World(gravity);
            this.characterController = this.physicsWorld.createCharacterController(0.01);
            this.initialized = true;
        });
    }

    update(world: World): void {
        if (!this.initialized || !this.physicsWorld || !this.characterController) return;

        const dynamicEntities = Query.entitiesWith(
            world,
            Transform,
            ColliderAABB,
            DynamicBody
        );

        const staticEntities = Query.entitiesWith(
            world,
            Transform,
            ColliderAABB,
            StaticBody
        );

        const currentPhysicsEntities = new Set([...dynamicEntities, ...staticEntities]);

        // 1. Dọn dẹp body cũ nếu một Entity đã bị xóa hoặc mất component ColliderAABB
        for (const entityId of this.entityToBody.keys()) {
            if (!currentPhysicsEntities.has(entityId)) {
                this.physicsWorld!.removeRigidBody(this.entityToBody.get(entityId)!);
                this.entityToBody.delete(entityId);
                this.entityToCollider.delete(entityId);
                this.isDynamic.delete(entityId);
            }
        }

        // 2. Chấm dứt sớm nếu không có vật thể nào đang di chuyển để tiết kiệm CPU (Giống AABB)
        if (dynamicEntities.length === 0) {
            // Vẫn cần sync Static Entities lần đầu để nạp vào Physics World
            for (const id of staticEntities) {
                this.syncEntity(world, id, false);
            }
            return;
        }

        // 3. Đồng bộ hóa Tường tĩnh
        for (const id of staticEntities) {
            this.syncEntity(world, id, false);
        }

        // 4. Đồng bộ hóa Tường động (Đang bị con trỏ kéo)
        // Chúng ta ghi nhớ vị trí ban đầu Rapier của nó, thay đổi target thành Transform do chuột kéo
        const dragMovements = new Map<number, RAPIER.Vector3>();

        for (const id of dynamicEntities) {
            this.syncEntity(world, id, true);

            const body = this.entityToBody.get(id);
            const collider = this.entityToCollider.get(id);
            const transform = world.getComponent(id, Transform)!;

            if (body && collider) {
                const currentPos = body.translation();
                // Vector yêu cầu nhảy tới vị trí chuột (chưa lọc qua tường)
                const targetPos = { x: transform.x, y: transform.y, z: transform.z };
                
                const movementDirection = new RAPIER.Vector3(
                    targetPos.x - currentPos.x,
                    targetPos.y - currentPos.y,
                    targetPos.z - currentPos.z
                );

                // Giao việc trượt/va chạm cho Character Controller xử lý
                this.characterController.computeColliderMovement(
                    collider,
                    movementDirection,
                    RAPIER.QueryFilterFlags.EXCLUDE_DYNAMIC // Chỉ cản bởi tường tĩnh
                );

                const correctedMovement = this.characterController.computedMovement();
                
                // Set the next Kinematic position after filtering out wall collisions
                body.setNextKinematicTranslation({
                    x: currentPos.x + correctedMovement.x,
                    y: currentPos.y + correctedMovement.y,
                    z: currentPos.z + correctedMovement.z
                });
            }
        }

        // 5. Giải quyết va chạm vật lý (Step Time)
        this.physicsWorld!.step();

        // 6. Nạp kết quả hợp lệ lên lại ECS Transform (Chuột ở trong tường thì Transform vẫn trượt dọc bên ngoài)
        for (const id of dynamicEntities) {
            const body = this.entityToBody.get(id);
            const transform = world.getComponent(id, Transform);
            
            if (body && transform) {
                const finalPos = body.translation();
                transform.x = finalPos.x;
                transform.y = finalPos.y;
                transform.z = finalPos.z;
            }
        }
    }

    public clampMovement(entityId: number, targetX: number, targetY: number, targetZ: number): { x: number, y: number, z: number } | null {
        if (!this.initialized || !this.physicsWorld || !this.characterController) return null;

        const body = this.entityToBody.get(entityId);
        const collider = this.entityToCollider.get(entityId);
        
        if (!body || !collider) return null;

        const currentPos = body.translation();
        const movementDirection = new RAPIER.Vector3(
            targetX - currentPos.x,
            targetY - currentPos.y,
            targetZ - currentPos.z
        );

        this.characterController.computeColliderMovement(
            collider,
            movementDirection,
            RAPIER.QueryFilterFlags.EXCLUDE_DYNAMIC // Chỉ cản bởi tường tĩnh
        );

        const correctedMovement = this.characterController.computedMovement();
        
        return {
            x: currentPos.x + correctedMovement.x,
            y: currentPos.y + correctedMovement.y,
            z: currentPos.z + correctedMovement.z
        };
    }

    private syncEntity(world: World, id: number, isDynamicState: boolean) {
        const t = world.getComponent(id, Transform)!;
        const c = world.getComponent(id, ColliderAABB)!;

        // Nếu trạng thái của vật thay đổi (VD: Cầm lên (Static->Dynamic) rồi Thả xuống (Dynamic->Static))
        if (this.entityToBody.has(id)) {
            const wasDynamic = this.isDynamic.get(id);
            if (wasDynamic !== isDynamicState) {
                this.physicsWorld!.removeRigidBody(this.entityToBody.get(id)!);
                this.entityToBody.delete(id);
                this.entityToCollider.delete(id);
            }
        }

        // Nếu chưa tồn tại trong Rapier World thì khởi tạo
        if (!this.entityToBody.has(id)) {
            // DynamicBody dùng KinematicPositionBased để trượt thủ công cực mượt bằng setNextKinematicTranslation
            // StaticBody dùng Fixed để làm vật cản chết đứng
            const rigidBodyDesc = isDynamicState 
                ? RAPIER.RigidBodyDesc.kinematicPositionBased()
                : RAPIER.RigidBodyDesc.fixed();
            
            // Tính toán Quaternion từ t.rotY (Euler Y)
            const q = { x: 0, y: Math.sin(t.rotY / 2), z: 0, w: Math.cos(t.rotY / 2) };
            rigidBodyDesc.setTranslation(t.x, t.y, t.z);
            rigidBodyDesc.setRotation(q);
            
            const body = this.physicsWorld!.createRigidBody(rigidBodyDesc);

            // ECS C.width/height/depth là nửa kích thước (Half Extents). Rapier cuboid cũng cần nửa kích thước!
            const colliderDesc = RAPIER.ColliderDesc.cuboid(c.width, c.height, c.depth);
            const collider = this.physicsWorld!.createCollider(colliderDesc, body);

            this.entityToBody.set(id, body);
            this.entityToCollider.set(id, collider);
            this.isDynamic.set(id, isDynamicState);
        } else {
            // Chức năng nâng cao: Nếu kéo thả cửa sổ 2D => thay đổi Transform nhưng bức tường là STATIC,
            // bắt buộc phải cập nhật cứng vị trí FixedBody để nó khớp với React store
            const body = this.entityToBody.get(id)!;
            const q = { x: 0, y: Math.sin(t.rotY / 2), z: 0, w: Math.cos(t.rotY / 2) };

            if (!isDynamicState) {
                body.setTranslation({ x: t.x, y: t.y, z: t.z }, true);
                body.setRotation(q, true);
            } else {
                // Với vật đang kéo bằng chuột, ta cập nhật góc xoay mượt mà qua Kinematic Target
                body.setNextKinematicRotation(q);
            }
        }
    }
}
