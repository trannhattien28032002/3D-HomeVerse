import * as THREE from "three";

import { World } from "./ecs/World";

// Systems
import { RenderSystem } from "./systems/RenderSystem";
import { LightSystem } from "./systems/LightSystem";
import { GizmoSystem } from "./systems/GizmoSystem";
import { OrbitControlSystem } from "./systems/OrbitControlSystem";

import { Mesh } from "./components/Mesh";
import { Transform } from "./components/Transform";
import { WallSize } from "./components/WallSize";
import { ColliderAABB } from "./components/ColliderAABB";

// Game
import { createWall } from "./game/WallFactory";
import { createAmbientLight, createDirectionalLight } from "./game/LightFactory";
import { createGround } from "./game/GroundFactory";
import { AABBCollisionSystem } from "./systems/AABBCollisionSystem";
import { PlacementAssistSystem } from "./systems/PlacementAssistSystem";
import { RapierCollisionSystem } from "./systems/RapierCollisionSystem";

type EngineWall = {
    x: number;
    y: number;
    z: number;
    w: number;
    h: number;
    d: number;
    rotY?: number;
    wallId?: number;
};

type CreateEngineOptions = {
    walls?: EngineWall[];
};

export type EngineInstance = {
    world: World;
    api: any;
    wallEntityIds: number[];
    wallEntityByWallId: Map<number, number>;
    dispose: () => void;
};

export function createEngine(
    canvas: HTMLCanvasElement,
    options: CreateEngineOptions = {}
) {

    // =====================
    // THREE SETUP
    // =====================
    const scene = new THREE.Scene();

    scene.add(new THREE.AxesHelper(100));
    scene.add(new THREE.GridHelper(100, 100));

    const camera = new THREE.PerspectiveCamera(
        75,
        window.innerWidth / window.innerHeight,
        0.1,
        1000
    );

    camera.position.set(0, 2, 5);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true
    });

    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setClearColor(0x202030, 1);

    renderer.shadowMap.enabled = true;

    scene.fog = new THREE.Fog(0x202030, 10, 35);


    // =====================
    // ECS WORLD
    // =====================
    const world = new World();
    const orbit = new OrbitControlSystem(camera, renderer)

    // ORBITCONTROL
    world.addSystem(orbit)
    // GIZMO
    world.addSystem(new GizmoSystem(camera, scene, renderer, orbit.controls));
    // COLLISION
    const rapierSystem = new RapierCollisionSystem();
    world.addSystem(rapierSystem);
    // PLACEMENT ASSIST
    world.addSystem(new PlacementAssistSystem())
    // LIGHTING
    world.addSystem(new LightSystem(scene));
    // RENDER
    world.addSystem(new RenderSystem(renderer, scene, camera));


    // =====================
    // GAME OBJECTS
    // =====================
    createGround(world, scene);

    const sceneWalls = options.walls ?? [
        { x: 6, y: 0.5, z: 0, w: 1, h: 1, d: 10, rotY: 0 },
        { x: -6, y: 0.5, z: 0, w: 1, h: 1, d: 10, rotY: 0 },
        { x: 0, y: 0.5, z: -6, w: 10, h: 1, d: 1, rotY: 0 }
    ];

    const wallEntityIds: number[] = [];
    const wallEntityByWallId = new Map<number, number>();

    sceneWalls.forEach((wall, idx) => {
        const entity = createWall(world, scene, wall);
        wallEntityIds.push(entity);
        const wallId = wall.wallId ?? idx + 1;
        wallEntityByWallId.set(wallId, entity);
    });

    createAmbientLight(world, { intensity: 0.35 });
    createDirectionalLight(world, {
        x: 6,
        y: 12,
        z: 6,
        intensity: 0.9
    });


    // =====================
    // RESIZE
    // =====================
    const onResize = () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();

        renderer.setSize(window.innerWidth, window.innerHeight);
    };

    window.addEventListener("resize", onResize);


    // =====================
    // LOOP
    // =====================
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


    // =====================
    // API CẦU NỐI 2D-3D
    // =====================
    const api = {
        addWall: (wd: EngineWall) => {
            const entity = createWall(world, scene, wd);
            wallEntityIds.push(entity);
            if (wd.wallId !== undefined) {
                wallEntityByWallId.set(wd.wallId, entity);
            }
            return entity;
        },
        updateWall: (wd: EngineWall) => {
            if (wd.wallId === undefined) return;
            const entity = wallEntityByWallId.get(wd.wallId);
            if (entity != null) {
                const t = world.getComponent(entity, Transform);
                const s = world.getComponent(entity, WallSize);
                const c = world.getComponent(entity, ColliderAABB);
                const m = world.getComponent(entity, Mesh);

                if (t) {
                    t.x = wd.x;
                    t.y = wd.y;
                    t.z = wd.z;
                    if (wd.rotY !== undefined) t.rotY = wd.rotY;
                }

                if (s && c && m) {
                    if (Math.abs(s.length - wd.w) > 0.001 || Math.abs(s.thickness - wd.d) > 0.001) {
                        s.length = wd.w;
                        s.thickness = wd.d;
                        s.height = wd.h;

                        c.width = wd.w / 2;
                        c.height = wd.h / 2;
                        c.depth = wd.d / 2;

                        // Rebuild lưới ThreeJS
                        m.mesh.geometry.dispose();
                        m.mesh.geometry = new THREE.BoxGeometry(wd.w, wd.h, wd.d);
                    }
                }
            }
        },
        clampMovement2D: (wallId: number, targetX: number, targetZ: number) => {
            const entity = wallEntityByWallId.get(wallId);
            if (entity != null) {
                // Ensure Rapier has initialized
                const result = rapierSystem.clampMovement(entity, targetX, 0.5, targetZ);
                if (result) {
                    return { x: result.x, z: result.z };
                }
            }
            return { x: targetX, z: targetZ }; // fallback if physics isn't ready
        }
    };

    const engineInstance = {
        world,
        api,
        wallEntityIds,
        wallEntityByWallId,
        dispose() {
            running = false;
            window.removeEventListener("resize", onResize);
            renderer.dispose();
            if ((window as any).gameEngine === engineInstance) {
                delete (window as any).gameEngine;
            }
        }
    };

    (window as any).gameEngine = engineInstance;
    return engineInstance;
}