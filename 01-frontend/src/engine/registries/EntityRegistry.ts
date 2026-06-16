import type { World } from "src/engine/ecs/World";
import type { MeshRegistry } from "src/engine/registries/MeshRegistry";
import type { ModelRegistry } from "src/engine/registries/ModelRegistry";
import { FurnitureTag } from "src/engine/components/furniture/FurnitureTag";
import { WallTag } from "src/engine/components/wall/WallTag";
import { Mesh } from "src/engine/components/render/Mesh";
import { releaseSurfaceMaterial } from "src/engine/rendering/surfaceMaterial";

export class EntityRegistry {
    private readonly world: World;
    private readonly meshRegistry: MeshRegistry;
    private readonly modelRegistry: ModelRegistry;

    constructor(world: World, meshRegistry: MeshRegistry, modelRegistry: ModelRegistry) {
        this.world = world;
        this.meshRegistry = meshRegistry;
        this.modelRegistry = modelRegistry;
    }

    disposeEntity(id: string): void {
        if (this.world.hasComponent(id, FurnitureTag)) {
            this.modelRegistry.dispose(id);
            if (this.world.hasComponent(id, Mesh)) {
                this.meshRegistry.dispose(`furniture-${id}`);
            }
        } else if (this.world.hasComponent(id, WallTag)) {
            // Release surface-material của thân tường trước khi gỡ mesh — nếu không, material
            // do người dùng sơn sẽ kẹt trong cache khi xoá tường (refcount không về 0). (C2)
            const meshComp = this.world.getComponent(id, Mesh);
            if (meshComp) releaseSurfaceMaterial(meshComp.mesh.material);
            this.meshRegistry.dispose(`wall-${id}`);
        }
        this.world.destroyEntity(id);
    }
}
