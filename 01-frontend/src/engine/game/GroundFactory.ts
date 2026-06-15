/**
 * GroundFactory — tạo entity mặt sàn (mặt phẳng 100×100m).
 *
 * Sàn vừa là vật thể hiển thị (THREE.PlaneGeometry nhận bóng) vừa mang collider.
 * Lưu ý: nó có component Grounded nên CannonCollisionSystem LOẠI TRỪ khỏi test
 * chồng lấn — đồ đặt trên sàn không bị coi là "đang va chạm với sàn".
 */
import * as THREE from "three";
import { Transform } from "src/engine/components/core/Transform";
import { Mesh } from "src/engine/components/render/Mesh";
import { StaticBody } from "src/engine/components/physics/StaticBody";
import { ColliderAABB } from "src/engine/components/physics/ColliderAABB";
import { Grounded } from "src/engine/components/physics/Grounded";
import { World } from "src/engine/ecs/World";

export function createGround(world: World, scene: THREE.Scene) {
    const entity = world.createEntity();

    // Visual
    const geometry = new THREE.PlaneGeometry(100, 100);
    const material = new THREE.MeshStandardMaterial({ metalness: 0, roughness: 1 });
    const plane = new THREE.Mesh(geometry, material);
    plane.rotation.x = -Math.PI / 2;
    plane.receiveShadow = true;
    scene.add(plane);

    // ECS data
    world.addComponent(entity, new Transform(0, -0.01, 0));
    world.addComponent(entity, new Mesh(plane));
    world.addComponent(entity, new StaticBody());
    world.addComponent(entity, new Grounded());
    // ColliderAABB trong dự án này dùng half-extent.
    // Sàn rộng → half-extent 50×50; giữ rất mỏng theo trục Y.
    world.addComponent(entity, new ColliderAABB(50, 0.01, 50));

    return entity;
}
