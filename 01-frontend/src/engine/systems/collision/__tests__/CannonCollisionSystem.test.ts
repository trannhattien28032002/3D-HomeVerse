/**
 * CannonCollisionSystem — test hành vi thật của wrapper vật lý quanh cannon-es.
 *
 * Dựng World thật + component thật (Transform/ColliderAABB/StaticBody/FurnitureTag),
 * KHÔNG mock ECS/cannon-es. `ColliderAABB.width/height/depth` là NỬA-kích-thước
 * (xem JSDoc component + `cannonBodyFactory.createStaticBody` dùng thẳng làm
 * halfExtents của `CANNON.Box`) — box "1×1×1" full-size ⇒ ColliderAABB(0.5,0.5,0.5).
 */
import { describe, it, expect, beforeEach } from "vitest";

import { World } from "src/engine/ecs/World";
import { Transform } from "src/engine/components/core/Transform";
import { ColliderAABB } from "src/engine/components/physics/ColliderAABB";
import { StaticBody } from "src/engine/components/physics/StaticBody";
import { DynamicBody } from "src/engine/components/physics/DynamicBody";
import { FurnitureTag } from "src/engine/components/furniture/FurnitureTag";
import { CannonCollisionSystem } from "src/engine/systems/collision/CannonCollisionSystem";

/** Thêm một entity "hộp" half-extent 0.5 (full size 1×1×1) tại (x,y,z). */
function addBox(
    world: World,
    x: number,
    y: number,
    z: number,
    opts: { static?: boolean; furniture?: boolean; dynamic?: boolean } = {},
): string {
    const e = world.createEntity();
    world.addComponent(e, new Transform(x, y, z));
    world.addComponent(e, new ColliderAABB(0.5, 0.5, 0.5));
    if (opts.static !== false) world.addComponent(e, new StaticBody());
    if (opts.furniture) world.addComponent(e, new FurnitureTag("test-model"));
    if (opts.dynamic) world.addComponent(e, new DynamicBody());
    return e;
}

describe("CannonCollisionSystem", () => {
    let world: World;
    let system: CannonCollisionSystem;

    beforeEach(() => {
        world = new World();
        system = new CannonCollisionSystem();
        world.addSystem(system);
    });

    describe("phát hiện overlap qua wouldCollide", () => {
        it("2 body chồng nhau → true", () => {
            addBox(world, 0, 0, 0); // vật cản tĩnh, half-extent 0.5
            const probe = addBox(world, 5, 0, 0); // entity dùng để test (Transform/Collider cần có)
            system.update(world, 0);

            // Tổng half-extent hai bên ~1.0 (trừ PROBE_SHRINK nhỏ) → khoảng cách 0.3 chắc chắn chồng.
            expect(system.wouldCollide(world, probe, 0, 0, 0.3)).toBe(true);
        });

        it("2 body không chồng → false", () => {
            addBox(world, 0, 0, 0);
            const probe = addBox(world, 5, 0, 0);
            system.update(world, 0);

            // Khoảng cách 2m >> tổng half-extent ~1m → không chồng.
            expect(system.wouldCollide(world, probe, 0, 0, 2)).toBe(false);
        });

        it("bỏ qua chính body của entity đang test (self-exclusion)", () => {
            const self = addBox(world, 0, 0, 0);
            system.update(world, 0);

            // Test tại đúng vị trí hiện tại của chính entity — không được tự va chính mình.
            expect(system.wouldCollide(world, self, 0, 0, 0)).toBe(false);
        });
    });

    describe("wouldCollideFurniture — di chuyển 1 entity vào vị trí chồng entity khác", () => {
        it("vị trí chồng lấn furniture khác → true", () => {
            addBox(world, 0, 0, 0, { static: true, furniture: true }); // vật cản cố định
            const moving = addBox(world, 5, 0, 0, { static: true, furniture: true }); // entity đang "kéo"
            system.update(world, 0);

            expect(system.wouldCollideFurniture(world, moving, 0, 0.3)).toBe(true);
        });

        it("vị trí trống → false", () => {
            addBox(world, 0, 0, 0, { static: true, furniture: true });
            const moving = addBox(world, 5, 0, 0, { static: true, furniture: true });
            system.update(world, 0);

            expect(system.wouldCollideFurniture(world, moving, 10, 10)).toBe(false);
        });

        it("khác độ cao Y (chồng chỉ ở top-down) không tính, vì hàm bỏ qua trục Y của target — vẫn overlap theo X/Z", () => {
            // wouldCollideFurniture chỉ nhận targetX/targetZ, giữ nguyên Y hiện tại của entity đang kéo —
            // đúng chủ đích cho preview 2D Plan View (mất trục Y).
            addBox(world, 0, 5, 0, { static: true, furniture: true }); // vật cản ở cao độ khác hẳn
            const moving = addBox(world, 5, 0, 0, { static: true, furniture: true });
            system.update(world, 0);

            // moving.y=0 nhưng probe test dùng t.y của moving (0), vật cản ở y=5 (half 0.5) không chồng theo Y.
            expect(system.wouldCollideFurniture(world, moving, 0, 0)).toBe(false);
        });

        it("bỏ qua tường (StaticBody không có FurnitureTag) — chỉ so với furniture khác", () => {
            addBox(world, 0, 0, 0, { static: true, furniture: false }); // "tường" — static nhưng không phải furniture
            const moving = addBox(world, 5, 0, 0, { static: true, furniture: true });
            system.update(world, 0);

            expect(system.wouldCollideFurniture(world, moving, 0, 0.3)).toBe(false);
        });
    });

    describe("update() sweep CCD cho DynamicBody", () => {
        it("kéo entity dynamic vào vật cản tĩnh → bị clamp lại trước khi chạm", () => {
            addBox(world, 3, 0, 0, { static: true, furniture: false }); // vật cản tại x=3
            const mover = addBox(world, 0, 0, 0, { static: false, dynamic: true });
            system.update(world, 0); // build static/dynamic entries, safePos = (0,0,0)

            const t = world.getComponent(mover, Transform)!;
            t.x = 3; // thử "dạy" thẳng vào giữa vật cản
            world.markDirty();
            system.update(world, 0);

            // Bị chặn lại trước khi chạm — không được tới x=3, và không vượt quá vị trí ban đầu quá xa.
            expect(t.x).toBeLessThan(3);
            expect(t.x).toBeGreaterThanOrEqual(0);
        });

        it("kéo entity dynamic vào chỗ trống → di chuyển tới đích, không bị clamp", () => {
            addBox(world, 3, 0, 0, { static: true, furniture: false });
            const mover = addBox(world, 0, 0, 0, { static: false, dynamic: true });
            system.update(world, 0);

            const t = world.getComponent(mover, Transform)!;
            t.x = -3; // đi ngược hướng, tránh xa vật cản
            world.markDirty();
            system.update(world, 0);

            expect(t.x).toBeCloseTo(-3);
        });
    });

    describe("dispose()", () => {
        it("dọn sạch mọi body khỏi physicsWorld (kể cả probe)", () => {
            addBox(world, 0, 0, 0);
            addBox(world, 2, 0, 0);
            system.update(world, 0);

            expect(system.physicsWorld.bodies.length).toBeGreaterThan(0);

            system.dispose();

            expect(system.physicsWorld.bodies.length).toBe(0);
        });

        it("wouldCollideCustom trả về false sau dispose (không còn body nào để va)", () => {
            addBox(world, 0, 0, 0);
            system.update(world, 0);
            system.dispose();

            expect(system.wouldCollideCustom(0, 0, 0, 1, 1, 1, 0, 0, 0, 1)).toBe(false);
        });
    });
});
