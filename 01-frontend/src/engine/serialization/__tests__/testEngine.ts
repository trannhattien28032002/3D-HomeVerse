/**
 * testEngine — dựng một EngineInstance "headless" tối thiểu cho test round-trip
 * serialize/deserialize, không cần canvas/WebGL thật (khác `createEngine()` vốn
 * cần `HTMLCanvasElement` + renderer WebGL).
 *
 * Cùng chiến lược với `dispatcher.test.ts` (buildDeps): dùng THREE.Scene trần +
 * registry thật (MeshRegistry/MaterialRegistry/ModelRegistry/EntityRegistry —
 * không đụng GPU), chỉ stub các seam cần WebGL/network thật:
 *   - `gltfLoader.load()` trả về một ModelTemplate giả (Group + Box3 + Vector3)
 *     thay vì tải GLB thật qua network — đủ để `spawnFurnitureGLB`/`spawnWallItemGLB`
 *     chạy hết pipeline ECS (Transform, Model3D, FurnitureTag, WallMounted/WallOpening).
 *   - `collisionSystem` stub rỗng — PLACE_FURNITURE/PLACE_WALL_ITEM không dùng nó
 *     (chỉ MOVE/ROTATE_FURNITURE mới cần, không nằm trong phạm vi round-trip serialize).
 *   - `materialLibrary` stub rỗng — round-trip test không gán `materials` trên
 *     furniture/wall-item (áp material PBR cần KTX2 loader thật, ngoài phạm vi B1).
 */
import * as THREE from "three";

import { World } from "src/engine/ecs/World";
import { NodeRegistry } from "src/engine/graph/NodeRegistry";
import { MeshRegistry } from "src/engine/registries/MeshRegistry";
import { MaterialRegistry } from "src/engine/registries/MaterialRegistry";
import { EntityRegistry } from "src/engine/registries/EntityRegistry";
import { ModelRegistry } from "src/engine/registries/ModelRegistry";
import { EngineEvents } from "src/engine/events/EngineEvents";
import { createDispatcher } from "src/engine/commands/dispatcher";
import type { DispatcherDeps } from "src/engine/commands/dispatcherDeps";
import type { EngineInstance } from "src/engine/engineTypes";
import type { GLTFModelLoader, ModelTemplate } from "src/engine/rendering/GLTFModelLoader";

function fakeModelTemplate(): ModelTemplate {
    const scene = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
    scene.add(mesh);
    return {
        scene,
        bbox: new THREE.Box3().setFromObject(scene),
        size: new THREE.Vector3(1, 1, 1),
    };
}

/** GLTFModelLoader giả — trả template hợp lệ tối thiểu, không tải network thật. */
function fakeGltfLoader(): GLTFModelLoader {
    const load = async (): Promise<ModelTemplate> => fakeModelTemplate();
    return { load } as unknown as GLTFModelLoader;
}

/**
 * GLTFModelLoader giả có thể điều khiển thời điểm mỗi lần `load()` resolve — dùng
 * cho test C1 (generation guard) cần dàn dựng chính xác thứ tự interleave giữa hai
 * lần `deserializeScene` chạy chồng lấn, thay vì phụ thuộc may rủi vào lịch microtask
 * thật. `releaseNext()` resolve lần `load()` đang chờ SỚM NHẤT (FIFO).
 */
export function controllableGltfLoader(): { loader: GLTFModelLoader; releaseNext: () => void } {
    const pending: Array<() => void> = [];
    const load = (): Promise<ModelTemplate> =>
        new Promise<ModelTemplate>((resolve) => {
            pending.push(() => resolve(fakeModelTemplate()));
        });
    return {
        loader: { load } as unknown as GLTFModelLoader,
        releaseNext: () => {
            const next = pending.shift();
            if (next) next();
        },
    };
}

export type TestEngine = {
    engine: EngineInstance;
    world: World;
    nodeRegistry: NodeRegistry;
    wallEntityByWallId: Map<string, string>;
};

/**
 * Dựng EngineInstance headless dùng cho test. `engine.api.dispatch`/`dispatchAsync`
 * đủ để chạy `deserializeScene`; `engine.world`/`nodes`/`wallEntityByWallId`/
 * `floorMaterials`/`roomTypes` đủ để chạy `serializeScene` — đây là toàn bộ bề mặt
 * mà hai hàm này thực sự đụng tới (xem serialize.ts/deserialize.ts).
 *
 * `gltfLoader` optional — mặc định dùng `fakeGltfLoader()` (resolve ngay); truyền
 * `controllableGltfLoader().loader` khi cần dàn dựng thứ tự interleave chính xác.
 */
export function buildTestEngine(opts?: { gltfLoader?: GLTFModelLoader }): TestEngine {
    const world = new World();
    const scene = new THREE.Scene();
    const meshRegistry = new MeshRegistry(scene);
    const materialRegistry = new MaterialRegistry();
    const modelRegistry = new ModelRegistry(scene);
    const entityRegistry = new EntityRegistry(world, meshRegistry, modelRegistry);
    const nodeRegistry = new NodeRegistry();
    const wallEntityByWallId = new Map<string, string>();
    const floorMaterials = new Map<string, string>();
    const roomTypes = new Map<string, string>();

    const deps: DispatcherDeps = {
        world,
        scene,
        events: new EngineEvents(),
        nodeRegistry,
        wallEntityByWallId,
        meshRegistry,
        materialRegistry,
        entityRegistry,
        floorMaterials,
        roomTypes,
        gltfLoader: opts?.gltfLoader ?? fakeGltfLoader(),
        modelRegistry,
        // Stubs — không exercised bởi PLACE_FURNITURE/PLACE_WALL_ITEM/topology commands.
        materialLibrary: {} as never,
        collisionSystem: {
            removeStaticBody: () => {},
            removeBody: () => {},
        } as never,
    };

    const { dispatch, dispatchAsync } = createDispatcher(deps);

    const engine = {
        world,
        api: { dispatch, dispatchAsync } as unknown as EngineInstance["api"],
        xr: {} as never,
        nodes: nodeRegistry,
        wallEntityByWallId,
        materialLibrary: {} as never,
        floorMaterials,
        roomTypes,
        dispose: () => {},
    } as EngineInstance;

    return { engine, world, nodeRegistry, wallEntityByWallId };
}
