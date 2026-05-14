import * as THREE from "three";

import { World } from "src/engine/ecs/World";
import { NodeRegistry } from "src/engine/graph/NodeRegistry";
import type { EngineCommand } from "src/engine/commands/EngineCommands";

import { createWall } from "src/engine/game/WallFactory";
import { Mesh } from "src/engine/components/Mesh";
import { WallNodes } from "src/engine/components/WallNodes";
import { WallSize } from "src/engine/components/WallSize";
import { WallPolygon } from "src/engine/components/WallPolygon";
import { recomputeWallAABB } from "src/engine/utils/wallHelpers";
import { MeshRegistry } from "src/engine/rendering/MeshRegistry";
import { MaterialRegistry } from "src/engine/rendering/MaterialRegistry";

export type DispatcherDeps = {
    world: World;
    scene: THREE.Scene;
    nodeRegistry: NodeRegistry;
    wallEntityByWallId: Map<number, number>;
    /** Mutable ref so SPLIT_WALL / ADD_WALL can increment and RESOLVE_INTERSECTIONS can read the updated value. */
    maxWallIdRef: { value: number };
    meshRegistry: MeshRegistry;
    materialRegistry: MaterialRegistry;
};

export function createDispatcher(deps: DispatcherDeps): (command: EngineCommand) => void {
    const { world, scene, nodeRegistry, wallEntityByWallId, maxWallIdRef, meshRegistry, materialRegistry } = deps;

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
                    recomputeWallAABB(world, entity, nodeRegistry);
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

                const pairAlreadyExists = [...sn.connectedWallIds].some(wid => {
                    const ent = wallEntityByWallId.get(wid);
                    if (ent == null) return false;
                    const wn = world.getComponent(ent, WallNodes);
                    if (!wn) return false;
                    return (
                        (wn.startNodeId === command.startNodeId && wn.endNodeId === command.endNodeId) ||
                        (wn.startNodeId === command.endNodeId   && wn.endNodeId === command.startNodeId)
                    );
                });
                if (pairAlreadyExists) {
                    console.warn(`ADD_WALL: wall between node ${command.startNodeId} and ${command.endNodeId} already exists — skipped.`);
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
                    cx, cy: 1.6, cz,
                    length,
                    height: 3.2,
                    thickness: command.thickness,
                }, meshRegistry, materialRegistry);

                nodeRegistry.connectWall(command.startNodeId, command.wallId);
                nodeRegistry.connectWall(command.endNodeId, command.wallId);
                wallEntityByWallId.set(command.wallId, entity);
                if (command.wallId > maxWallIdRef.value) maxWallIdRef.value = command.wallId;

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

                if (world.hasComponent(entity, Mesh)) {
                    meshRegistry.dispose(`wall-${entity}`);
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

                for (const wallId of Array.from(sourceNode.connectedWallIds)) {
                    const ent = wallEntityByWallId.get(wallId);
                    if (ent == null) continue;

                    const wn = world.getComponent(ent, WallNodes);
                    if (!wn) continue;

                    if (wn.startNodeId === sourceNodeId) wn.startNodeId = targetNodeId;
                    if (wn.endNodeId   === sourceNodeId) wn.endNodeId   = targetNodeId;

                    nodeRegistry.disconnectWall(sourceNodeId, wallId);

                    if (wn.startNodeId === wn.endNodeId) {
                        nodeRegistry.disconnectWall(wn.startNodeId, wallId);
                        meshRegistry.dispose(`wall-${ent}`);
                        world.destroyEntity(ent);
                        wallEntityByWallId.delete(wallId);
                        continue;
                    }

                    const otherNodeId = wn.startNodeId === targetNodeId ? wn.endNodeId : wn.startNodeId;
                    const targetNode2 = nodeRegistry.get(targetNodeId);
                    const isDuplicate = targetNode2 && [...targetNode2.connectedWallIds].some(existingWid => {
                        if (existingWid === wallId) return false;
                        const existingEnt = wallEntityByWallId.get(existingWid);
                        if (existingEnt == null) return false;
                        const ewn = world.getComponent(existingEnt, WallNodes);
                        if (!ewn) return false;
                        return (
                            (ewn.startNodeId === targetNodeId && ewn.endNodeId === otherNodeId) ||
                            (ewn.startNodeId === otherNodeId  && ewn.endNodeId === targetNodeId)
                        );
                    });

                    if (isDuplicate) {
                        nodeRegistry.disconnectWall(otherNodeId, wallId);
                        meshRegistry.dispose(`wall-${ent}`);
                        world.destroyEntity(ent);
                        wallEntityByWallId.delete(wallId);
                        continue;
                    }

                    nodeRegistry.connectWall(targetNodeId, wallId);
                    if (world.hasComponent(ent, WallPolygon)) world.removeComponent(ent, WallPolygon);
                    recomputeWallAABB(world, ent, nodeRegistry);
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

                const { startNodeId, endNodeId, thickness } = wn;

                nodeRegistry.ensureNode(command.newNodeId, command.x, command.z);
                nodeRegistry.move(command.newNodeId, command.x, command.z);

                const newNode = nodeRegistry.get(command.newNodeId);
                if (newNode) {
                    for (const wallId of newNode.connectedWallIds) {
                        const ent = wallEntityByWallId.get(wallId);
                        if (ent != null) {
                            if (world.hasComponent(ent, WallPolygon)) world.removeComponent(ent, WallPolygon);
                            recomputeWallAABB(world, ent, nodeRegistry);
                        }
                    }
                }

                wn.endNodeId = command.newNodeId;
                nodeRegistry.disconnectWall(endNodeId, command.originalWallId);
                nodeRegistry.connectWall(command.newNodeId, command.originalWallId);

                if (world.hasComponent(entity, WallPolygon)) world.removeComponent(entity, WallPolygon);
                recomputeWallAABB(world, entity, nodeRegistry);

                const endNode = nodeRegistry.get(endNodeId)!;
                const cx = (command.x + endNode.x) / 2;
                const cz = (command.z + endNode.z) / 2;
                const length = Math.hypot(endNode.x - command.x, endNode.z - command.z);

                const newEntity = createWall(world, scene, {
                    wallId: command.newWallId,
                    startNodeId: command.newNodeId,
                    endNodeId,
                    cx, cy: 1.6, cz,
                    length,
                    height: 3.2,
                    thickness,
                }, meshRegistry, materialRegistry);

                nodeRegistry.connectWall(command.newNodeId, command.newWallId);
                nodeRegistry.connectWall(endNodeId, command.newWallId);
                wallEntityByWallId.set(command.newWallId, newEntity);
                if (command.newWallId > maxWallIdRef.value) maxWallIdRef.value = command.newWallId;

                for (const wallId of endNode.connectedWallIds) {
                    const ent = wallEntityByWallId.get(wallId);
                    if (ent != null && world.hasComponent(ent, WallPolygon)) {
                        world.removeComponent(ent, WallPolygon);
                    }
                }

                // Suppress TS unused-vars: startNodeId is intentionally unused after destructuring
                void startNodeId;
                break;
            }

            case "UPDATE_WALL": {
                const entity = wallEntityByWallId.get(command.wallId);
                if (entity == null) break;
                const wn = world.getComponent(entity, WallNodes);
                const size = world.getComponent(entity, WallSize);
                if (wn && command.thickness !== undefined) wn.thickness = command.thickness;
                if (size) {
                    if (command.thickness !== undefined) size.thickness = command.thickness;
                    if (command.height !== undefined) size.height = command.height;
                }
                // Remove polygon so WallGeometrySystem does a full rebuild (needed for height changes
                // where the XZ polygon is unchanged but the mesh height must update).
                if (world.hasComponent(entity, WallPolygon)) world.removeComponent(entity, WallPolygon);
                break;
            }

            case "RESOLVE_INTERSECTIONS": {
                const newEnt = wallEntityByWallId.get(command.wallId);
                if (newEnt == null) break;
                const newWn = world.getComponent(newEnt, WallNodes);
                if (!newWn) break;

                const sn = nodeRegistry.get(newWn.startNodeId);
                const en = nodeRegistry.get(newWn.endNodeId);
                if (!sn || !en) break;

                const EPS = 1e-4;
                type IXPoint = { t: number; existingWallId: number; x: number; z: number };
                const intersections: IXPoint[] = [];

                const ux = en.x - sn.x, uz = en.z - sn.z;

                for (const [wid, ent] of wallEntityByWallId) {
                    if (wid === command.wallId) continue;
                    const wn = world.getComponent(ent, WallNodes);
                    if (!wn) continue;

                    const sharesNode =
                        wn.startNodeId === newWn.startNodeId ||
                        wn.endNodeId   === newWn.startNodeId ||
                        wn.startNodeId === newWn.endNodeId   ||
                        wn.endNodeId   === newWn.endNodeId;
                    if (sharesNode) continue;

                    const p1 = nodeRegistry.get(wn.startNodeId);
                    const p2 = nodeRegistry.get(wn.endNodeId);
                    if (!p1 || !p2) continue;

                    const vx = p2.x - p1.x, vz = p2.z - p1.z;
                    const wx = sn.x - p1.x, wz = sn.z - p1.z;

                    const denom = ux * vz - uz * vx;
                    if (Math.abs(denom) < 1e-8) continue;

                    const t = (vx * wz - vz * wx) / denom;
                    const s = (ux * wz - uz * wx) / denom;

                    if (t > EPS && t < 1 - EPS && s > EPS && s < 1 - EPS) {
                        intersections.push({ t, existingWallId: wid, x: sn.x + t * ux, z: sn.z + t * uz });
                    }
                }

                if (intersections.length === 0) break;

                intersections.sort((a, b) => a.t - b.t);

                let currentWallId = command.wallId;

                for (const ix of intersections) {
                    const newNodeId = nodeRegistry.createNode(ix.x, ix.z);

                    dispatch({ type: "SPLIT_WALL", originalWallId: ix.existingWallId, newWallId: maxWallIdRef.value + 1, newNodeId, x: ix.x, z: ix.z });
                    dispatch({ type: "SPLIT_WALL", originalWallId: currentWallId,      newWallId: maxWallIdRef.value + 1, newNodeId, x: ix.x, z: ix.z });

                    currentWallId = maxWallIdRef.value;
                }
                break;
            }
        }
    }

    return dispatch;
}
