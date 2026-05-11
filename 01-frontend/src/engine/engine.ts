import * as THREE from "three";

import { World } from "./ecs/World";
import { EngineEvents } from "./events/EngineEvents";
import type { EngineCommand } from "./commands/EngineCommands";

import { RenderSystem } from "./systems/RenderSystem";
import { LightSystem } from "./systems/LightSystem";
import { GizmoSystem } from "./systems/GizmoSystem";
import { OrbitControlSystem } from "./systems/OrbitControlSystem";
import { PlacementAssistSystem } from "./systems/PlacementAssistSystem";
import { SnapshotSystem } from "./systems/SnapshotSystem";
import { WallGeometrySystem } from "./systems/WallGeometrySystem";
import { RoomSystem } from "./systems/RoomSystem";
import { CannonCollisionSystem } from "./systems/CannonCollisionSystem";

import { Mesh } from "./components/Mesh";
import { Transform } from "./components/Transform";
import { WallSize } from "./components/WallSize";
import { ColliderAABB } from "./components/ColliderAABB";
import { WallNodes } from "./components/WallNodes";
import { WallPolygon } from "./components/WallPolygon";

import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EXRLoader } from "three/addons/loaders/EXRLoader.js";

import { NodeRegistry } from "./graph/NodeRegistry";
import { createWall } from "./game/WallFactory";
import { createAmbientLight, createDirectionalLight } from "./game/LightFactory";
import { createGround } from "./game/GroundFactory";

export type EngineApi = {
    events: EngineEvents;
    dispatch: (command: EngineCommand) => void;
    clampNodeMove: (nodeId: number, newX: number, newZ: number) => { x: number; z: number };
    getNextIds: () => { nodeId: number; wallId: number };
};

export type EngineInstance = {
    world: World;
    api: EngineApi;
    nodes: NodeRegistry;
    wallEntityByWallId: Map<number, number>;
    dispose: () => void;
};

declare global {
    interface Window {
        gameEngine?: EngineInstance;
    }
}

type DefaultWallDef = {
    wallId: number;
    startNodeId: number; endNodeId: number;
    thickness: number;
};

const DEFAULT_NODE_DEFS = [
    { id: 1, x: 6, z: -5 },
    { id: 2, x: 6, z: 5 },
    { id: 3, x: -6, z: -5 },
    { id: 4, x: -6, z: 5 },
    { id: 6, x: -5, z: -6 },
    { id: 7, x: 5, z: -6 },
];

const DEFAULT_WALL_DEFS: DefaultWallDef[] = [
    { wallId: 1, startNodeId: 1, endNodeId: 2, thickness: 1 },
    { wallId: 2, startNodeId: 3, endNodeId: 4, thickness: 1 },
    { wallId: 3, startNodeId: 6, endNodeId: 7, thickness: 1 },
];
export const INITIAL_NEXT_NODE_ID = 20;
export const INITIAL_NEXT_WALL_ID = 10;

export function createEngine(canvas: HTMLCanvasElement): EngineInstance {

    const scene = new THREE.Scene();
    scene.add(new THREE.AxesHelper(100));
    scene.add(new THREE.GridHelper(100, 100));
    scene.fog = new THREE.Fog(0xf0f0f0, 20, 35);
    scene.background = new THREE.Color(0xf0f0f0);

    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 8, 10);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setClearColor(0x202030, 1);
    renderer.shadowMap.enabled = true;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;

    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();

    new EXRLoader()
        .setPath("/hdri")
        .load("/studio.exr", (texture) => {

            const envMap = pmrem.fromEquirectangular(texture).texture;

            scene.environment = envMap;
            scene.background = envMap;

            texture.dispose();
        });

    const nodeRegistry = new NodeRegistry();
    const world = new World();
    const events = new EngineEvents();
    const orbit = new OrbitControlSystem(camera, renderer, scene);
    world.addSystem(orbit);

    const gizmoSystem = new GizmoSystem(camera, scene, renderer, orbit.controls as OrbitControls, events);
    world.addSystem(gizmoSystem);

    world.addSystem(new PlacementAssistSystem());

    const collisionSystem = new CannonCollisionSystem();
    world.addSystem(collisionSystem);

    world.addSystem(new LightSystem(scene));
    world.addSystem(new WallGeometrySystem(nodeRegistry, scene));
    world.addSystem(new RoomSystem(nodeRegistry, scene));
    world.addSystem(new RenderSystem(renderer, scene, camera));
    world.addSystem(new SnapshotSystem(events, nodeRegistry));
    createAmbientLight(world, { intensity: 0.35 });
    createDirectionalLight(world, { x: 6, y: 12, z: 6, intensity: 0.9 });

    const wallEntityByWallId = new Map<number, number>();
    let maxWallId = INITIAL_NEXT_WALL_ID - 1;
    for (const nd of DEFAULT_NODE_DEFS) {
        nodeRegistry.ensureNode(nd.id, nd.x, nd.z);
    }

    for (const def of DEFAULT_WALL_DEFS) {
        const sn = nodeRegistry.getOrThrow(def.startNodeId);
        const en = nodeRegistry.getOrThrow(def.endNodeId);
        const dx = en.x - sn.x, dz = en.z - sn.z;
        const length = Math.hypot(dx, dz);
        const cx = (sn.x + en.x) / 2;
        const cz = (sn.z + en.z) / 2;

        const entity = createWall(world, scene, {
            wallId: def.wallId,
            startNodeId: def.startNodeId,
            endNodeId: def.endNodeId,
            cx, cy: 0.5, cz,
            length,
            height: 1,
            thickness: def.thickness,
        });

        nodeRegistry.connectWall(def.startNodeId, def.wallId);
        nodeRegistry.connectWall(def.endNodeId, def.wallId);
        wallEntityByWallId.set(def.wallId, entity);
    }

    const onResize = () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener("resize", onResize);

    let lastTime = performance.now();
    let running = true;

    function loop() {
        if (!running) return;
        const now = performance.now();
        const dt = (now - lastTime) / 1000;
        lastTime = now;
        world.update(dt);
        requestAnimationFrame(loop);
    }
    loop();

    function dispatch(command: EngineCommand): void {
        switch (command.type) {

            case "ENSURE_NODE": {
                nodeRegistry.ensureNode(command.nodeId, command.x, command.z);
                break;
            }

            case "MOVE_NODE": {
                nodeRegistry.move(command.nodeId, command.x, command.z);

                const node = nodeRegistry.get(command.nodeId);
                if (!node) break;

                for (const wallId of node.connectedWallIds) {
                    const entity = wallEntityByWallId.get(wallId);
                    if (entity == null) continue;
                    if (world.hasComponent(entity, WallPolygon)) {
                        world.removeComponent(entity, WallPolygon);
                    }
                    _recomputeWallAABB(world, entity, nodeRegistry);
                }
                break;
            }

            case "ADD_WALL": {
                const sn = nodeRegistry.get(command.startNodeId);
                const en = nodeRegistry.get(command.endNodeId);
                if (!sn || !en) {
                    console.warn(`ADD_WALL: node ${command.startNodeId} or ${command.endNodeId} not found`);
                    break;
                }

                const dx = en.x - sn.x, dz = en.z - sn.z;
                const length = Math.hypot(dx, dz);
                const cx = (sn.x + en.x) / 2;
                const cz = (sn.z + en.z) / 2;

                const entity = createWall(world, scene, {
                    wallId: command.wallId,
                    startNodeId: command.startNodeId,
                    endNodeId: command.endNodeId,
                    cx, cy: 0.5, cz,
                    length,
                    height: 1,
                    thickness: command.thickness,
                });

                nodeRegistry.connectWall(command.startNodeId, command.wallId);
                nodeRegistry.connectWall(command.endNodeId, command.wallId);
                wallEntityByWallId.set(command.wallId, entity);
                if (command.wallId > maxWallId) maxWallId = command.wallId;

                for (const nodeId of [command.startNodeId, command.endNodeId]) {
                    const nd = nodeRegistry.get(nodeId);
                    if (!nd) continue;
                    for (const wid of nd.connectedWallIds) {
                        if (wid === command.wallId) continue;
                        const ent = wallEntityByWallId.get(wid);
                        if (ent != null && world.hasComponent(ent, WallPolygon)) {
                            world.removeComponent(ent, WallPolygon);
                        }
                    }
                }
                break;
            }

            case "REMOVE_WALL": {
                const entity = wallEntityByWallId.get(command.wallId);
                if (entity == null) break;

                const wn = world.getComponent(entity, WallNodes);
                const affectedNodeIds: number[] = [];

                if (wn) {
                    nodeRegistry.disconnectWall(wn.startNodeId, command.wallId);
                    nodeRegistry.disconnectWall(wn.endNodeId, command.wallId);
                    affectedNodeIds.push(wn.startNodeId, wn.endNodeId);
                }

                const m = world.getComponent(entity, Mesh);
                if (m) {
                    scene.remove(m.mesh);
                    m.mesh.geometry.dispose();
                    const mat = m.mesh.material;
                    if (Array.isArray(mat)) mat.forEach(x => x.dispose());
                    else mat.dispose();
                }

                world.destroyEntity(entity);
                wallEntityByWallId.delete(command.wallId);

                for (const nodeId of affectedNodeIds) {
                    const nd = nodeRegistry.get(nodeId);
                    if (nd && nd.connectedWallIds.size === 0) {
                        nodeRegistry.deleteNode(nodeId);
                    }
                }
                break;
            }

            case "MERGE_NODE": {
                const { sourceNodeId, targetNodeId } = command;
                if (sourceNodeId === targetNodeId) break;

                const sourceNode = nodeRegistry.get(sourceNodeId);
                if (!sourceNode) break;

                const wallsToReroute = Array.from(sourceNode.connectedWallIds);
                for (const wallId of wallsToReroute) {
                    const ent = wallEntityByWallId.get(wallId);
                    if (ent == null) continue;

                    const wn = world.getComponent(ent, WallNodes);
                    if (!wn) continue;

                    if (wn.startNodeId === sourceNodeId) wn.startNodeId = targetNodeId;
                    if (wn.endNodeId === sourceNodeId) wn.endNodeId = targetNodeId;

                    nodeRegistry.disconnectWall(sourceNodeId, wallId);
                    nodeRegistry.connectWall(targetNodeId, wallId);

                    if (world.hasComponent(ent, WallPolygon)) {
                        world.removeComponent(ent, WallPolygon);
                    }
                    _recomputeWallAABB(world, ent, nodeRegistry);
                }

                const targetNode = nodeRegistry.get(targetNodeId);
                if (targetNode) {
                    for (const wallId of targetNode.connectedWallIds) {
                        const ent = wallEntityByWallId.get(wallId);
                        if (ent != null && world.hasComponent(ent, WallPolygon)) {
                            world.removeComponent(ent, WallPolygon);
                        }
                    }
                }

                nodeRegistry.deleteNode(sourceNodeId);
                break;
            }

            case "SPLIT_WALL": {
                const entity = wallEntityByWallId.get(command.originalWallId);
                if (entity == null) break;
                const wn = world.getComponent(entity, WallNodes);
                if (!wn) break;

                const startNodeId = wn.startNodeId;
                const endNodeId = wn.endNodeId;
                const thickness = wn.thickness;

                nodeRegistry.ensureNode(command.newNodeId, command.x, command.z);
                nodeRegistry.move(command.newNodeId, command.x, command.z);
                const newNode = nodeRegistry.get(command.newNodeId);
                if (newNode) {
                    for (const wallId of newNode.connectedWallIds) {
                        const ent = wallEntityByWallId.get(wallId);
                        if (ent != null && world.hasComponent(ent, WallPolygon)) {
                            world.removeComponent(ent, WallPolygon);
                        }
                        if (ent != null) _recomputeWallAABB(world, ent, nodeRegistry);
                    }
                }

                wn.endNodeId = command.newNodeId;
                nodeRegistry.disconnectWall(endNodeId, command.originalWallId);
                nodeRegistry.connectWall(command.newNodeId, command.originalWallId);

                if (world.hasComponent(entity, WallPolygon)) world.removeComponent(entity, WallPolygon);
                _recomputeWallAABB(world, entity, nodeRegistry);

                const endNode = nodeRegistry.get(endNodeId)!;
                const cx = (command.x + endNode.x) / 2;
                const cz = (command.z + endNode.z) / 2;
                const length = Math.hypot(endNode.x - command.x, endNode.z - command.z);

                const newEntity = createWall(world, scene, {
                    wallId: command.newWallId,
                    startNodeId: command.newNodeId,
                    endNodeId: endNodeId,
                    cx, cy: 0.5, cz,
                    length,
                    height: 1,
                    thickness: thickness,
                });

                nodeRegistry.connectWall(command.newNodeId, command.newWallId);
                nodeRegistry.connectWall(endNodeId, command.newWallId);
                wallEntityByWallId.set(command.newWallId, newEntity);
                if (command.newWallId > maxWallId) maxWallId = command.newWallId;

                if (endNode) {
                    for (const wallId of endNode.connectedWallIds) {
                        const ent = wallEntityByWallId.get(wallId);
                        if (ent != null && world.hasComponent(ent, WallPolygon)) {
                            world.removeComponent(ent, WallPolygon);
                        }
                    }
                }

                break;
            }

            case "RESOLVE_INTERSECTIONS": {
                break;
            }
        }
    }

    const api: EngineApi = {
        events,
        dispatch,
        clampNodeMove: (nodeId, newX, newZ) => {
            void nodeId;
            return { x: newX, z: newZ };
        },
        getNextIds: () => ({
            nodeId: nodeRegistry.nextAvailableNodeId(),
            wallId: maxWallId + 1,
        }),
    };

    const engineInstance: EngineInstance = {
        world,
        api,
        nodes: nodeRegistry,
        wallEntityByWallId,
        dispose() {
            running = false;
            window.removeEventListener("resize", onResize);
            orbit.controls.dispose();
            gizmoSystem.dispose();
            collisionSystem.dispose();

            scene.traverse((object) => {
                const mesh = object as THREE.Mesh;
                mesh.geometry?.dispose();
                const material = mesh.material;
                if (Array.isArray(material)) material.forEach(m => m.dispose());
                else material?.dispose();
            });

            renderer.dispose();
            if (window.gameEngine === engineInstance) delete window.gameEngine;
        },
    };

    window.gameEngine = engineInstance;
    return engineInstance;
}

function _recomputeWallAABB(world: World, entity: number, nodes: NodeRegistry): void {
    const wn = world.getComponent(entity, WallNodes);
    if (!wn) return;

    const sn = nodes.get(wn.startNodeId);
    const en = nodes.get(wn.endNodeId);
    if (!sn || !en) return;

    const dx = en.x - sn.x, dz = en.z - sn.z;
    const len = Math.hypot(dx, dz);
    const rotY = -Math.atan2(dz, dx);
    const cx = (sn.x + en.x) / 2;
    const cz = (sn.z + en.z) / 2;

    const t = world.getComponent(entity, Transform);
    const s = world.getComponent(entity, WallSize);
    const c = world.getComponent(entity, ColliderAABB);

    if (t) { t.x = cx; t.z = cz; t.rotY = rotY; }
    if (s) { s.length = len; }
    if (c) { c.width = len / 2; }
}
