import * as THREE from "three";
import { Transform } from "../components/Transform";
import { Mesh } from "../components/Mesh";
import { StaticBody } from "../components/StaticBody";
import { ColliderAABB } from "../components/ColliderAABB";
import { Grounded } from "../components/Grounded";

export function createGround(world: any, scene: THREE.Scene) {
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
    // ColliderAABB in this project uses half-extents.
    // PlaneGeometry(50, 50) => half extents 25x25. Keep it very thin on Y.
    world.addComponent(entity, new ColliderAABB(50, 0.01, 50));

    return entity;
}