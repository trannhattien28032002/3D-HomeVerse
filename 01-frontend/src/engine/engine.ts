import * as THREE from "three";

import { World } from "./ecs/World";
import { EngineEvents } from "./events/EngineEvents";
import type { EngineCommand } from "./commands/EngineCommands";

// Systems
import { RenderSystem } from "./systems/RenderSystem";
import { LightSystem } from "./systems/LightSystem";
import { GizmoSystem } from "./systems/GizmoSystem";
import { OrbitControlSystem } from "./systems/OrbitControlSystem";
import { PlacementAssistSystem } from "./systems/PlacementAssistSystem";
// RapierCollisionSystem đã được thay thế bởi OBBCollisionSystem (thuần Three.js, không cần WASM)
import { SnapshotSystem } from "./systems/SnapshotSystem";

// Components
import { Mesh } from "./components/Mesh";
import { Transform } from "./components/Transform";
import { WallSize } from "./components/WallSize";
import { ColliderAABB } from "./components/ColliderAABB";
import { StaticBody } from "./components/StaticBody";
import { DynamicBody } from "./components/DynamicBody";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

// Game factories
import { createWall } from "./game/WallFactory";
import { createAmbientLight, createDirectionalLight } from "./game/LightFactory";
import { createGround } from "./game/GroundFactory";
import { CannonCollisionSystem } from "./systems/CannonCollisionSystem";

// ============================================================
// Public API types
// ============================================================

export type EngineApi = {
    events: EngineEvents;
    /**
     * Gửi command vào ECS. Fire-and-forget — ECS xử lý synchronously,
     * SnapshotSystem sẽ emit ra kết quả cuối frame.
     */
    dispatch: (command: EngineCommand) => void;
    /**
     * Synchronous query: "tường có thể đến vị trí này không?"
     * Trả về vị trí đã được CannonCollisionSystem clamp (stop-on-contact).
     * Dùng trong Konva dragBoundFunc (phải synchronous).
     */
    clampMovement2D: (wallId: number, targetX: number, targetZ: number) => { x: number; z: number };
    
    /**
     * Synchronous query: "tường xoay/phóng to ở vị trí này có va chạm không?"
     * Dùng trong Konva boundBoxFunc để từ chối xoay/kéo giãn xuyên tường.
     */
    wouldCollide2D: (wallId: number, targetX: number, targetZ: number, width: number, depth: number, rotY: number) => boolean;
};

export type EngineInstance = {
    world: World;
    api: EngineApi;
    wallEntityByWallId: Map<number, number>;
    dispose: () => void;
};

// Global type — accessible từ bất kỳ file nào
declare global {
    interface Window {
        gameEngine?: EngineInstance;
    }
}

// ============================================================
// Default walls (world-space, explicit wallId)
// Phải khớp với DEFAULT_WALLS_NEXT_ID trong useUIStore
// ============================================================

type WallDef = {
    wallId: number;
    x: number; y: number; z: number;
    w: number; h: number; d: number;
    rotY: number;
};

const DEFAULT_WALLS: WallDef[] = [
    { wallId: 1, x: 6, y: 0.5, z: 0, w: 1, h: 1, d: 10, rotY: 0 },
    { wallId: 2, x: -6, y: 0.5, z: 0, w: 1, h: 1, d: 10, rotY: 0 },
    { wallId: 3, x: 0, y: 0.5, z: -6, w: 10, h: 1, d: 1, rotY: 0 },
];

// ============================================================
// createEngine
// ============================================================

export function createEngine(canvas: HTMLCanvasElement): EngineInstance {

    // ----------------------------------------------------------
    // THREE.js setup
    // ----------------------------------------------------------
    const scene = new THREE.Scene();
    scene.add(new THREE.AxesHelper(100));
    scene.add(new THREE.GridHelper(100, 100));
    // scene.fog = new THREE.Fog(0x202030, 10, 35);
    scene.fog = new THREE.Fog(0xf0f0f0, 10, 35);
    scene.background = new THREE.Color(0xf0f0f0);

    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 2, 5);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setClearColor(0x202030, 1);
    renderer.shadowMap.enabled = true;

    // ----------------------------------------------------------
    // ECS World + EventBus
    // ----------------------------------------------------------
    const world = new World();
    const events = new EngineEvents();

    // ----------------------------------------------------------
    // Systems (thứ tự quan trọng — SnapshotSystem phải CUỐI CÙNG)
    // ----------------------------------------------------------
    const orbit = new OrbitControlSystem(camera, renderer);
    world.addSystem(orbit);

    const gizmoSystem = new GizmoSystem(camera, scene, renderer, orbit.controls as OrbitControls, events);
    world.addSystem(gizmoSystem);

    world.addSystem(new PlacementAssistSystem());
    const collisionSystem = new CannonCollisionSystem();
    world.addSystem(collisionSystem);
    world.addSystem(new LightSystem(scene));
    world.addSystem(new RenderSystem(renderer, scene, camera));

    // Snapshot luôn chạy sau tất cả mutations
    world.addSystem(new SnapshotSystem(events));

    // ----------------------------------------------------------
    // Game objects
    // ----------------------------------------------------------
    createGround(world, scene);
    createAmbientLight(world, { intensity: 0.35 });
    createDirectionalLight(world, { x: 6, y: 12, z: 6, intensity: 0.9 });

    // Entity tracking
    const wallEntityByWallId = new Map<number, number>();

    // Default walls — ECS là source of truth, đây là initial state
    for (const def of DEFAULT_WALLS) {
        const entity = createWall(world, scene, def);
        wallEntityByWallId.set(def.wallId, entity);
    }

    // ----------------------------------------------------------
    // Resize handler
    // ----------------------------------------------------------
    const onResize = () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener("resize", onResize);

    // ----------------------------------------------------------
    // Game loop
    // ----------------------------------------------------------
    let lastTime = performance.now();
    let running = true;

    function loop() {
        if (!running) return;
        const now = performance.now();
        const deltaTime = (now - lastTime) / 1000;
        lastTime = now;
        world.update(deltaTime);
        requestAnimationFrame(loop);
    }
    loop();

    // ----------------------------------------------------------
    // Command dispatcher
    // ----------------------------------------------------------
    function dispatch(command: EngineCommand): void {
        switch (command.type) {

            case "ADD_WALL": {
                const entity = createWall(world, scene, {
                    wallId: command.wallId,
                    x: command.x,
                    y: 0.5,
                    z: command.z,
                    w: command.w,
                    h: 1,
                    d: command.d,
                    rotY: command.rotY,
                });
                wallEntityByWallId.set(command.wallId, entity);
                break;
            }

            case "MOVE_WALL": {
                const entity = wallEntityByWallId.get(command.wallId);
                if (entity == null) return;
                const t = world.getComponent(entity, Transform);
                if (t) { t.x = command.x; t.z = command.z; }
                break;
            }

            case "RESIZE_WALL": {
                const entity = wallEntityByWallId.get(command.wallId);
                if (entity == null) return;

                const t = world.getComponent(entity, Transform);
                const s = world.getComponent(entity, WallSize);
                const c = world.getComponent(entity, ColliderAABB);
                const m = world.getComponent(entity, Mesh);

                if (t) { t.x = command.x; t.z = command.z; t.rotY = command.rotY; }
                if (s) { s.length = command.w; s.thickness = command.d; }
                if (c) { c.width = command.w / 2; c.depth = command.d / 2; }
                if (m) {
                    m.mesh.geometry.dispose();
                    m.mesh.geometry = new THREE.BoxGeometry(command.w, s?.height ?? 1, command.d);
                }
                break;
            }

            case "REMOVE_WALL": {
                const entity = wallEntityByWallId.get(command.wallId);
                if (entity == null) return;

                const m = world.getComponent(entity, Mesh);
                if (m) {
                    scene.remove(m.mesh);
                    m.mesh.geometry.dispose();
                    if (Array.isArray(m.mesh.material)) {
                        m.mesh.material.forEach((mat) => mat.dispose());
                    } else {
                        m.mesh.material.dispose();
                    }
                }
                world.destroyEntity(entity);
                wallEntityByWallId.delete(command.wallId);
                break;
            }

            case "BEGIN_DRAG": {
                const entity = wallEntityByWallId.get(command.wallId);
                if (entity == null) return;
                if (world.hasComponent(entity, StaticBody)) world.removeComponent(entity, StaticBody);
                if (!world.hasComponent(entity, DynamicBody)) world.addComponent(entity, new DynamicBody());
                break;
            }

            case "END_DRAG": {
                const entity = wallEntityByWallId.get(command.wallId);
                if (entity == null) return;
                if (world.hasComponent(entity, DynamicBody)) world.removeComponent(entity, DynamicBody);
                if (!world.hasComponent(entity, StaticBody)) world.addComponent(entity, new StaticBody());
                break;
            }
        }
    }

    // ----------------------------------------------------------
    // Public API
    // ----------------------------------------------------------
    const api: EngineApi = {
        events,
        dispatch,
        clampMovement2D: (wallId, targetX, targetZ) => {
            const entity = wallEntityByWallId.get(wallId);
            if (entity != null) {
                const t = world.getComponent(entity, Transform);
                const currentY = t?.y ?? 0.5;
                const result = collisionSystem.clampMovement(world, entity, targetX, currentY, targetZ);
                if (result) return { x: result.x, z: result.z };
            }
            return { x: targetX, z: targetZ };
        },
        wouldCollide2D: (wallId, targetX, targetZ, width, depth, rotY) => {
            const entity = wallEntityByWallId.get(wallId);
            const y = entity ? (world.getComponent(entity, Transform)?.y ?? 0.5) : 0.5;
            return collisionSystem.wouldCollideCustom(targetX, y, targetZ, width, depth, rotY, entity ?? -1);
        },
    };

    // ----------------------------------------------------------
    // Engine instance + dispose
    // ----------------------------------------------------------
    const engineInstance: EngineInstance = {
        world,
        api,
        wallEntityByWallId,
        dispose() {
            running = false;
            window.removeEventListener("resize", onResize);
            orbit.controls.dispose();
            gizmoSystem.dispose();
            collisionSystem.dispose(); // giải phóng Cannon bodies

            scene.traverse((object) => {
                const mesh = object as THREE.Mesh;
                mesh.geometry?.dispose();
                const material = mesh.material;
                if (Array.isArray(material)) {
                    material.forEach((item) => item.dispose());
                } else {
                    material?.dispose();
                }
            });

            renderer.dispose();
            if (window.gameEngine === engineInstance) {
                delete window.gameEngine;
            }
        },
    };

    window.gameEngine = engineInstance;
    return engineInstance;
}
