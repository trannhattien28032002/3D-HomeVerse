import * as THREE from "three";

import { Transform } from "../components/Transform";
import { Mesh } from "../components/Mesh";
import { ColliderAABB } from "../components/ColliderAABB";
import { StaticBody } from "../components/StaticBody";

// 🔥 mới thêm
import { WallSize } from "../components/WallSize";
import { WallTag } from "../components/WallTag";
import { Selectable } from "../components/Selectable";
import { Draggable } from "../components/Draggable";
import { SnapToGrid } from "../components/SnapToGrid";
import { AutoAlign } from "../components/AutoAlign";
import { World } from "../ecs/World";

type CreateWallOptions = {
    wallId?: number;
    x?: number;
    y?: number;
    z?: number;
    rotY?: number;
    w?: number;
    h?: number;
    d?: number;
    color?: number;
};

export function createWall(
    world: World,
    scene: THREE.Scene,
    {
        wallId,
        x = 0,
        y = 0.5,
        z = -5,
        rotY = 0,
        w = 6,
        h = 1,
        d = 1,
        color = 0xcccccc
    }: CreateWallOptions = {}
) {
    const entity = world.createEntity();

    // 🎨 Visual
    const geometry = new THREE.BoxGeometry(w, h, d);

    const material = new THREE.MeshStandardMaterial({
        color,
        metalness: 0,
        roughness: 0.9
    });

    const box = new THREE.Mesh(geometry, material);

    box.position.set(x, y, z);
    box.rotation.y = rotY;
    box.castShadow = true;
    box.receiveShadow = true;

    scene.add(box);
    world.addComponent(entity, new Transform(x, y, z, rotY));
    world.addComponent(entity, new Mesh(box));
    world.addComponent(entity, new StaticBody());
    world.addComponent(entity, new ColliderAABB(w / 2, h / 2, d / 2));
    world.addComponent(entity, new WallSize({
        length: w,
        height: h,
        thickness: d
    }));
    if (wallId !== undefined) {
        world.addComponent(entity, new WallTag(wallId));
    }
    world.addComponent(entity, new Selectable());
    world.addComponent(entity, new Draggable({ lockY: true }));
    world.addComponent(entity, new SnapToGrid({ enabled: true, size: 0.1, axes: "xz" }));
    world.addComponent(entity, new AutoAlign({ enabled: true, axes: "xz", tolerance: 0.2 }));

    return entity;
}
